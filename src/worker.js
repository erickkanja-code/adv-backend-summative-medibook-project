// Background worker - runs as its own process, separate from the web server.
const { Worker } = require('bullmq');
const db = require('./models/db');
const { QUEUE_NAMES, closeQueues } = require('./queues');
const { redisOptions } = require('./queues/connection');
const { ensureLogDirectory } = require('./utils/auditLogger');
const { processSlotFreed, recoverInterruptedPromotions } = require('./workers/waitlistProcessor');
const { processNotification } = require('./workers/notificationProcessor');

function createWorker(queueName, processor, concurrency) {
  const worker = new Worker(queueName, processor, {
    connection: redisOptions('worker'),
    concurrency,
    autorun: false,
  });
  worker.on('completed', (job, result) => console.log(`[worker:${queueName}] job ${job.id} done`, result));
  worker.on('failed', (job, err) =>
    console.error(`[worker:${queueName}] job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`));
  worker.on('error', (err) => console.error(`[worker:${queueName}] ${err.message}`));
  return worker;
}

async function main() {
  await ensureLogDirectory().catch((err) => console.warn(`[worker] could not create log directory: ${err.message}`));
  await recoverInterruptedPromotions().catch((err) => console.warn(`[worker] recovery skipped: ${err.message}`));

  const workers = [
    // Concurrency 1: promotions are handled one at a time, so two jobs never
    // compete for the same waitlist entries.
    createWorker(QUEUE_NAMES.WAITLIST, processSlotFreed, 1),
    createWorker(QUEUE_NAMES.NOTIFICATIONS, processNotification, 5),
  ];
  workers.forEach((worker) => worker.run());
  console.log('[worker] listening for waitlist and notification jobs');

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received, finishing current jobs`);
    await Promise.allSettled(workers.map((worker) => worker.close()));
    await Promise.allSettled([closeQueues(), db.close()]);
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[worker] failed to start', err);
  process.exit(1);
});
