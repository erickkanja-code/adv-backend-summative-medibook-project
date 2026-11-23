const { appendAuditEntry } = require('../utils/auditLogger');

/**
 * Simulates sending the confirmation SMS/email by writing it to the audit log.
 * Uses the throwing logger on purpose: if the write fails, BullMQ retries the job.
 */
async function processNotification(job) {
  const { appointmentId, patientName, patientEmail, patientPhone, doctorName, room, datetime } = job.data;
  const message =
    `Hello ${patientName}, your appointment with ${doctorName} (room ${room}) ` +
    `is confirmed for ${datetime}. Reference #${appointmentId}.`;

  await appendAuditEntry('NOTIFICATION_SENT', {
    jobId: job.id,
    type: 'APPOINTMENT_CONFIRMATION',
    channels: ['SMS', 'EMAIL'],
    to: { phone: patientPhone, email: patientEmail },
    appointmentId,
    message,
  });
  return { sent: true };
}

module.exports = { processNotification };
