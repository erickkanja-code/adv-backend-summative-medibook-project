// Every clinic business value is defined here exactly once.
// Code elsewhere imports these names instead of repeating the numbers.

const REFUND_POLICY = Object.freeze({
  // Notice strictly greater than this many hours earns a full refund.
  FULL_REFUND_ABOVE_HOURS: 48,
  // Notice of at least this many hours (up to and including 48) earns a partial refund.
  PARTIAL_REFUND_FROM_HOURS: 24,
  FULL_REFUND_PERCENT: 100,
  PARTIAL_REFUND_PERCENT: 50,
  NO_REFUND_PERCENT: 0,
});

module.exports = Object.freeze({
  SLOT_DURATION_MINUTES: 30,
  OPENING_HOUR: 9, // first slot starts at 09:00
  CLOSING_HOUR: 17, // last slot must END by 17:00, so it starts at 16:30
  MAX_APPOINTMENTS_PER_DAY: 12,
  BUSY_DAY_THRESHOLD_PERCENT: 80,
  STATISTICS_WINDOW_DAYS: 7,
  REFUND_POLICY,
  APPOINTMENT_STATUS: Object.freeze({ BOOKED: 'BOOKED', CANCELLED: 'CANCELLED' }),
});
