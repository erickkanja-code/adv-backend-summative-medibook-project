const {
  SLOT_DURATION_MINUTES,
  OPENING_HOUR,
  CLOSING_HOUR,
} = require('../config/businessRules');
const { DATE_TIME_PATTERN, parseLocalDateTime, formatDate, formatDateTime } = require('../utils/dateTime');

const pad = (n) => String(n).padStart(2, '0');
const toClock = (totalMinutes) => `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;

const FIRST_SLOT_MINUTES = OPENING_HOUR * 60;
const LAST_SLOT_MINUTES = CLOSING_HOUR * 60 - SLOT_DURATION_MINUTES;

function fail(status, code, message) {
  return { ok: false, status, code, message };
}

/**
 * Pure slot check used for every booking (API and waitlist worker).
 * `now` is injected so tests can use fixed dates.
 *   400 -> the value is malformed (not a date/time we can read)
 *   422 -> a real date/time that breaks a booking rule
 * Returns { ok: true, value: { datetime, date } } or { ok: false, status, code, message }.
 */
function validateAppointmentSlot(input, now = new Date()) {
  if (typeof input !== 'string' || !DATE_TIME_PATTERN.test(input.trim())) {
    return fail(400, 'INVALID_DATETIME_FORMAT', 'datetime must be a string formatted YYYY-MM-DD HH:mm (e.g. 2027-03-15 09:30)');
  }
  const slot = parseLocalDateTime(input);
  if (!slot) {
    return fail(400, 'INVALID_DATETIME', 'datetime is not a real calendar date/time');
  }
  if (slot.getSeconds() !== 0 || slot.getMinutes() % SLOT_DURATION_MINUTES !== 0) {
    return fail(422, 'NOT_ON_SLOT_BOUNDARY', `Appointments start on ${SLOT_DURATION_MINUTES}-minute boundaries (e.g. 09:00 or 09:30)`);
  }
  const startMinutes = slot.getHours() * 60 + slot.getMinutes();
  if (startMinutes < FIRST_SLOT_MINUTES || startMinutes > LAST_SLOT_MINUTES) {
    return fail(
      422,
      'OUTSIDE_WORKING_HOURS',
      `Working hours are ${toClock(FIRST_SLOT_MINUTES)}-${toClock(CLOSING_HOUR * 60)}; ` +
        `the first slot starts at ${toClock(FIRST_SLOT_MINUTES)} and the last at ${toClock(LAST_SLOT_MINUTES)}`,
    );
  }
  if (slot.getTime() <= now.getTime()) {
    return fail(422, 'NOT_IN_FUTURE', 'Appointments can only be booked in the future');
  }
  return { ok: true, value: { datetime: formatDateTime(slot), date: formatDate(slot) } };
}

module.exports = { validateAppointmentSlot };
