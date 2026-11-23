const appointmentService = require('../services/appointmentService');
const waitlistStore = require('../queues/waitlistStore');
const { logAudit } = require('../utils/auditLogger');
const { parseLocalDateTime } = require('../utils/dateTime');

// How each booking failure is handled for the patient being promoted:
const SKIP_PATIENT_KEEP_PLACE = new Set(['PATIENT_SLOT_CONFLICT']); // busy at that time: try the next patient, keep this one's place
const DROP_PATIENT = new Set(['PATIENT_NOT_FOUND']); // patient record deleted: nothing left to book
const SLOT_NO_LONGER_FREE = new Set(['SLOT_TAKEN', 'DAY_FULL', 'NOT_IN_FUTURE', 'DOCTOR_NOT_FOUND']); // stop, keep everyone

/**
 * Job 'slot-freed' { doctorId, datetime, date }: books the first waitlisted patient
 * into the freed slot.
 *
 * Patients are never lost: claimNext() MOVES an entry into a processing list; it is
 * removed only after the booking commits (or the patient no longer exists). The
 * finally block puts everything still in processing back at the FRONT of the
 * waitlist in the original order - including when an unexpected error is thrown,
 * which also makes BullMQ retry the job with backoff.
 */
async function processSlotFreed(job) {
  const { doctorId, datetime, date } = job.data;
  const slotTime = parseLocalDateTime(datetime);
  if (!slotTime || slotTime.getTime() <= Date.now()) {
    return { promoted: false, reason: 'the freed slot is no longer in the future' };
  }

  try {
    for (;;) {
      const rawEntry = await waitlistStore.claimNext(doctorId, date);
      if (!rawEntry) return { promoted: false, reason: 'nobody is waiting' };
      const entry = JSON.parse(rawEntry);

      try {
        const appointment = await appointmentService.bookAppointment({
          patientId: entry.patientId,
          doctorId,
          datetime,
          source: 'waitlist',
        });
        await waitlistStore.release(doctorId, date, rawEntry);
        await logAudit('WAITLIST_PROMOTED', {
          appointmentId: appointment.id,
          patientId: entry.patientId,
          doctorId,
          datetime: appointment.apptDatetime,
          joinedAt: entry.joinedAt,
        });
        return { promoted: true, appointmentId: appointment.id, patientId: entry.patientId };
      } catch (err) {
        if (DROP_PATIENT.has(err.code)) {
          await waitlistStore.release(doctorId, date, rawEntry);
          await logAudit('WAITLIST_ENTRY_DROPPED', { ...entry, reason: err.code });
        } else if (SLOT_NO_LONGER_FREE.has(err.code)) {
          return { promoted: false, reason: err.code };
        } else if (!SKIP_PATIENT_KEEP_PLACE.has(err.code)) {
          throw err; // database/Redis problem: entries restored below, job retried
        }
      }
    }
  } finally {
    await waitlistStore.restore(doctorId, date);
  }
}

// On worker start: return entries left in processing by a crash to their waitlist.
async function recoverInterruptedPromotions() {
  const restored = await waitlistStore.restoreAllInterrupted();
  if (restored > 0) {
    console.log(`[worker] restored ${restored} interrupted waitlist entr${restored === 1 ? 'y' : 'ies'}`);
  }
}

module.exports = { processSlotFreed, recoverInterruptedPromotions };
