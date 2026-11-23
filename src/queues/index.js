const { Queue } = require('bullmq');
const { getProducerConnection, closeProducerConnection } = require('./connection');

const QUEUE_NAMES = Object.freeze({
  WAITLIST: 'waitlist-promotions',
  NOTIFICATIONS: 'notifications',
});

const JOB_NAMES = Object.freeze({
  SLOT_FREED: 'slot-freed',
  APPOINTMENT_CONFIRMATION: 'appointment-confirmation',
});

const ENQUEUE_TIMEOUT_MS = 3000;

const DEFAULT_JOB_OPTIONS = Object.freeze({
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
});

const queues = new Map();

function getQueue(name) {
  if (!queues.has(name)) {
    const queue = new Queue(name, { connection: getProducerConnection(), defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queue.on('error', (err) => console.error(`[queue:${name}] ${err.message}`));
    queues.set(name, queue);
  }
  return queues.get(name);
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Adding a job must never fail the user's request: the booking/cancellation is
// already committed in MySQL. Failures are logged and reported as `false`.
async function enqueueSafely(queueName, jobName, data) {
  try {
    await withTimeout(getQueue(queueName).add(jobName, data), ENQUEUE_TIMEOUT_MS);
    return true;
  } catch (err) {
    console.error(`[queue:${queueName}] could not enqueue ${jobName}: ${err.message}`);
    return false;
  }
}

// One confirmation job per confirmed appointment (SMS/email simulated by the worker).
function enqueueConfirmation(appointment) {
  return enqueueSafely(QUEUE_NAMES.NOTIFICATIONS, JOB_NAMES.APPOINTMENT_CONFIRMATION, {
    appointmentId: appointment.id,
    patientName: appointment.patientName,
    patientEmail: appointment.patientEmail,
    patientPhone: appointment.patientPhone,
    doctorName: appointment.doctorName,
    room: appointment.room,
    datetime: appointment.apptDatetime,
  });
}

// Tells the worker that a slot became free so it can promote the waitlist.
function enqueueSlotFreed({ doctorId, datetime, date }) {
  return enqueueSafely(QUEUE_NAMES.WAITLIST, JOB_NAMES.SLOT_FREED, { doctorId, datetime, date });
}

async function closeQueues() {
  await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
  queues.clear();
  await closeProducerConnection();
}

module.exports = { QUEUE_NAMES, JOB_NAMES, enqueueConfirmation, enqueueSlotFreed, closeQueues };
