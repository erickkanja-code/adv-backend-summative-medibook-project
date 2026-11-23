const { getProducerConnection } = require('./connection');

/**
 * Waitlist = one Redis list per doctor per day (FIFO: RPUSH to join, pop from the left).
 *
 *   medibook:waitlist:<doctorId>:<YYYY-MM-DD>              patients waiting, oldest first
 *   medibook:waitlist:<doctorId>:<YYYY-MM-DD>:processing   entries the worker is trying to book
 *
 * The worker never "pops and hopes": LMOVE atomically moves an entry into the
 * processing list, and it is only removed after the booking is committed.
 * If anything fails, restore() moves it back to the FRONT of the waitlist, so a
 * patient is always in Redis or in the appointments table - never lost from both.
 */
const PREFIX = 'medibook:waitlist';
const PROCESSING_SUFFIX = ':processing';

const redis = () => getProducerConnection();
const waitlistKey = (doctorId, date) => `${PREFIX}:${doctorId}:${date}`;
const processingKey = (doctorId, date) => `${waitlistKey(doctorId, date)}${PROCESSING_SUFFIX}`;

// Adds a patient to the back of the list; returns their 1-based position.
async function join(entry) {
  return redis().rpush(waitlistKey(entry.doctorId, entry.date), JSON.stringify(entry));
}

async function list(doctorId, date) {
  const raw = await redis().lrange(waitlistKey(doctorId, date), 0, -1);
  return raw.map((item, index) => ({ position: index + 1, ...JSON.parse(item) }));
}

async function isWaiting(doctorId, date, patientId) {
  const [waiting, processing] = await Promise.all([
    redis().lrange(waitlistKey(doctorId, date), 0, -1),
    redis().lrange(processingKey(doctorId, date), 0, -1),
  ]);
  return [...waiting, ...processing].some((item) => JSON.parse(item).patientId === patientId);
}

// Atomically moves the first waiting patient into the processing list; null if empty.
async function claimNext(doctorId, date) {
  return redis().lmove(waitlistKey(doctorId, date), processingKey(doctorId, date), 'LEFT', 'RIGHT');
}

// Removes an entry from processing once it is finished (booked or dropped).
async function release(doctorId, date, rawEntry) {
  return redis().lrem(processingKey(doctorId, date), 1, rawEntry);
}

// Moves everything still in processing back to the front, preserving the original order.
async function restore(doctorId, date) {
  let moved = 0;
  while (await redis().lmove(processingKey(doctorId, date), waitlistKey(doctorId, date), 'RIGHT', 'LEFT')) {
    moved += 1;
  }
  return moved;
}

// After a crash: restore every processing list that was left behind.
async function restoreAllInterrupted() {
  let restored = 0;
  const stream = redis().scanStream({ match: `${PREFIX}:*${PROCESSING_SUFFIX}`, count: 100 });
  for await (const keys of stream) {
    for (const key of keys) {
      const [doctorId, date] = key.slice(PREFIX.length + 1, -PROCESSING_SUFFIX.length).split(':');
      restored += await restore(doctorId, date);
    }
  }
  return restored;
}

module.exports = { join, list, isWaiting, claimNext, release, restore, restoreAllInterrupted };
