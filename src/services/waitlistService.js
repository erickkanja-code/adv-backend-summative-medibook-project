const appointmentModel = require('../models/appointmentModel');
const patientModel = require('../models/patientModel');
const doctorModel = require('../models/doctorModel');
const waitlistStore = require('../queues/waitlistStore');
const AppError = require('../utils/AppError');
const { MAX_APPOINTMENTS_PER_DAY } = require('../config/businessRules');
const { logAudit } = require('../utils/auditLogger');
const { checkSlot } = require('./appointmentService');

/**
 * Puts a patient on the waitlist for a doctor's day. Only allowed when the
 * requested slot or the whole day is fully booked - otherwise they should book.
 * A waitlisted patient accepts the first slot freed with that doctor on that day.
 */
async function joinWaitlist({ patientId, doctorId, datetime }, now = new Date()) {
  const slot = checkSlot(datetime, now);

  const [patient, doctor] = await Promise.all([patientModel.findById(patientId), doctorModel.findById(doctorId)]);
  if (!patient) throw AppError.notFound(`Patient ${patientId} not found`, 'PATIENT_NOT_FOUND');
  if (!doctor) throw AppError.notFound(`Doctor ${doctorId} not found`, 'DOCTOR_NOT_FOUND');

  const [slotTaken, bookedThatDay] = await Promise.all([
    appointmentModel.isSlotTaken(doctorId, slot.datetime),
    appointmentModel.countBookedForDoctorOnDate(doctorId, slot.date),
  ]);
  if (!slotTaken && bookedThatDay < MAX_APPOINTMENTS_PER_DAY) {
    throw AppError.unprocessable(
      'That slot is still available - book it directly with POST /api/appointments',
      'SLOT_AVAILABLE',
    );
  }
  if (await waitlistStore.isWaiting(doctorId, slot.date, patientId)) {
    throw AppError.conflict('This patient is already on the waitlist for this doctor on that day', 'ALREADY_WAITLISTED');
  }

  const entry = {
    patientId,
    doctorId,
    date: slot.date,
    requestedDatetime: slot.datetime,
    joinedAt: now.toISOString(),
  };
  const position = await waitlistStore.join(entry);
  await logAudit('WAITLIST_JOINED', { ...entry, position });
  return { ...entry, position };
}

async function getWaitlist({ doctorId, date }) {
  return waitlistStore.list(doctorId, date);
}

module.exports = { joinWaitlist, getWaitlist };
