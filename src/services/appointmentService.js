const db = require('../models/db');
const appointmentModel = require('../models/appointmentModel');
const patientModel = require('../models/patientModel');
const AppError = require('../utils/AppError');
const { MAX_APPOINTMENTS_PER_DAY, APPOINTMENT_STATUS, REFUND_POLICY } = require('../config/businessRules');
const { validateAppointmentSlot } = require('../validators/appointmentValidator');
const { calculateRefund } = require('../utils/refundCalculator');
const { formatDate, formatDateTime, parseLocalDateTime } = require('../utils/dateTime');
const { logAudit } = require('../utils/auditLogger');
const { enqueueConfirmation, enqueueSlotFreed } = require('../queues');

// Booking business logic lives in this service so that the HTTP controller and the
// waitlist worker apply exactly the same rules.

const REFUND_POLICY_TEXT =
  `more than ${REFUND_POLICY.FULL_REFUND_ABOVE_HOURS}h notice: ${REFUND_POLICY.FULL_REFUND_PERCENT}%; ` +
  `${REFUND_POLICY.PARTIAL_REFUND_FROM_HOURS}-${REFUND_POLICY.FULL_REFUND_ABOVE_HOURS}h (inclusive): ${REFUND_POLICY.PARTIAL_REFUND_PERCENT}%; ` +
  `less than ${REFUND_POLICY.PARTIAL_REFUND_FROM_HOURS}h: ${REFUND_POLICY.NO_REFUND_PERCENT}%`;

function waitlistOffer({ patientId, doctorId, datetime }) {
  return {
    waitlist: {
      offered: true,
      message: 'Join the waitlist and you will be booked automatically when a slot is freed for this doctor on this day.',
      method: 'POST',
      endpoint: '/api/waitlist',
      body: { patientId, doctorId, datetime },
    },
  };
}

function slotTakenError(request) {
  return AppError.conflict('This doctor is already booked at that date and time', 'SLOT_TAKEN', waitlistOffer(request));
}

function dayFullError(request) {
  return AppError.conflict(
    `This doctor already has the maximum of ${MAX_APPOINTMENTS_PER_DAY} appointments on that day`,
    'DAY_FULL',
    waitlistOffer(request),
  );
}

function patientBusyError() {
  return AppError.conflict('The patient already has another appointment at that date and time', 'PATIENT_SLOT_CONFLICT');
}

// Throws a 400/422 AppError when the slot breaks a timing rule; returns { datetime, date } otherwise.
function checkSlot(datetime, now) {
  const slot = validateAppointmentSlot(datetime, now);
  if (!slot.ok) {
    throw new AppError(slot.status, slot.message, { code: slot.code });
  }
  return slot.value;
}

/**
 * Books an appointment. Rules enforced:
 *  - future-only, working hours, 30-minute boundary (checkSlot)
 *  - one live appointment per doctor slot and per patient slot
 *  - at most MAX_APPOINTMENTS_PER_DAY per doctor per day
 * Concurrency: the doctor row is locked (SELECT ... FOR UPDATE) at the start of
 * the transaction, so simultaneous bookings for the same doctor run one at a time.
 * READ COMMITTED lets each check see appointments committed by the previous holder
 * of the lock. The UNIQUE keys on (doctor_id, active_slot) / (patient_id, active_slot)
 * are the final safety net.
 */
async function bookAppointment({ patientId, doctorId, datetime, source = 'api' }, now = new Date()) {
  const slot = checkSlot(datetime, now);
  const request = { patientId, doctorId, datetime: slot.datetime };

  let appointmentId;
  try {
    appointmentId = await db.withTransaction(
      async (conn) => {
        const doctor = await appointmentModel.lockDoctorForBooking(doctorId, conn);
        if (!doctor) throw AppError.notFound(`Doctor ${doctorId} not found`, 'DOCTOR_NOT_FOUND');

        const patient = await patientModel.findById(patientId, conn);
        if (!patient) throw AppError.notFound(`Patient ${patientId} not found`, 'PATIENT_NOT_FOUND');

        if (await appointmentModel.isSlotTaken(doctorId, slot.datetime, conn)) throw slotTakenError(request);
        if (await appointmentModel.patientHasAppointmentAt(patientId, slot.datetime, conn)) throw patientBusyError();

        const bookedThatDay = await appointmentModel.countBookedForDoctorOnDate(doctorId, slot.date, conn);
        if (bookedThatDay >= MAX_APPOINTMENTS_PER_DAY) throw dayFullError(request);

        return appointmentModel.create(
          {
            patientId,
            doctorId,
            datetime: slot.datetime,
            amountPaid: doctor.consultationFee, // fee snapshot, decided by the server
            bookedOn: formatDateTime(now),
          },
          conn,
        );
      },
      { isolationLevel: 'READ COMMITTED' },
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw err.constraint === 'uq_patient_active_slot' ? patientBusyError() : slotTakenError(request);
    }
    throw err;
  }

  // Side effects only after the commit; neither can fail the booking.
  const appointment = await appointmentModel.findById(appointmentId);
  await logAudit('APPOINTMENT_BOOKED', {
    appointmentId,
    patientId,
    doctorId,
    datetime: appointment.apptDatetime,
    amountPaid: appointment.amountPaid,
    source,
  });
  await enqueueConfirmation(appointment);
  return appointment;
}

/**
 * Cancels an appointment and records its refund in the same transaction.
 * The row is kept (status CANCELLED + refund) for refund history; its active_slot
 * becomes NULL, which frees the slot for another booking.
 */
async function cancelAppointment(appointmentId, now = new Date()) {
  const { appointment, refund } = await db.withTransaction(async (conn) => {
    const current = await appointmentModel.findByIdForUpdate(appointmentId, conn);
    if (!current) {
      throw AppError.notFound(`Appointment ${appointmentId} not found`, 'APPOINTMENT_NOT_FOUND');
    }
    if (current.status === APPOINTMENT_STATUS.CANCELLED) {
      throw AppError.conflict('This appointment is already cancelled', 'ALREADY_CANCELLED');
    }
    const appointmentTime = parseLocalDateTime(current.apptDatetime);
    if (appointmentTime.getTime() <= now.getTime()) {
      throw AppError.unprocessable('Appointments that have already started or passed cannot be cancelled', 'APPOINTMENT_IN_PAST');
    }

    const refundResult = calculateRefund({ amountPaid: current.amountPaid, appointmentTime, cancelledAt: now });
    const updated = await appointmentModel.markCancelled(
      appointmentId,
      { cancelledAt: formatDateTime(now), refundAmount: refundResult.amount },
      conn,
    );
    if (!updated) {
      throw AppError.conflict('This appointment is already cancelled', 'ALREADY_CANCELLED');
    }
    return { appointment: current, refund: refundResult };
  });

  const cancelled = await appointmentModel.findById(appointmentId);
  await logAudit('APPOINTMENT_CANCELLED', {
    appointmentId,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    datetime: appointment.apptDatetime,
    amountPaid: appointment.amountPaid,
    refundPercent: refund.percent,
    refundAmount: refund.amount,
    hoursNotice: refund.hoursNotice,
  });
  // Notify the waitlist: the worker will try to give this slot to the next patient.
  await enqueueSlotFreed({
    doctorId: appointment.doctorId,
    datetime: appointment.apptDatetime,
    date: formatDate(parseLocalDateTime(appointment.apptDatetime)),
  });

  return { appointment: cancelled, refund: { ...refund, policy: REFUND_POLICY_TEXT } };
}

module.exports = { bookAppointment, cancelAppointment, checkSlot };
