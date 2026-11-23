const { REFUND_POLICY } = require('../config/businessRules');
const { hoursBetween } = require('./dateTime');

/**
 * Refund policy (documented in README):
 *   notice  > 48h           -> 100%
 *   24h <= notice <= 48h    ->  50%   (both boundaries belong to the middle tier)
 *   notice  < 24h           ->   0%
 */
function getRefundPercent(hoursNotice) {
  if (hoursNotice > REFUND_POLICY.FULL_REFUND_ABOVE_HOURS) return REFUND_POLICY.FULL_REFUND_PERCENT;
  if (hoursNotice >= REFUND_POLICY.PARTIAL_REFUND_FROM_HOURS) return REFUND_POLICY.PARTIAL_REFUND_PERCENT;
  return REFUND_POLICY.NO_REFUND_PERCENT;
}

/**
 * Pure function: no database, no clock. Everything it needs is passed in,
 * which is what makes it unit-testable with fixed dates.
 * Money is computed in whole cents to avoid floating-point drift.
 */
function calculateRefund({ amountPaid, appointmentTime, cancelledAt }) {
  if (typeof amountPaid !== 'number' || !Number.isFinite(amountPaid) || amountPaid < 0) {
    throw new TypeError('amountPaid must be a non-negative number');
  }
  if (!(appointmentTime instanceof Date) || Number.isNaN(appointmentTime.getTime())) {
    throw new TypeError('appointmentTime must be a valid Date');
  }
  if (!(cancelledAt instanceof Date) || Number.isNaN(cancelledAt.getTime())) {
    throw new TypeError('cancelledAt must be a valid Date');
  }

  const hoursNotice = hoursBetween(cancelledAt, appointmentTime);
  const percent = getRefundPercent(hoursNotice);
  const paidCents = Math.round(amountPaid * 100);
  const refundCents = Math.round((paidCents * percent) / 100);

  return {
    percent,
    amount: refundCents / 100,
    hoursNotice: Math.round(hoursNotice * 100) / 100,
  };
}

module.exports = { calculateRefund, getRefundPercent };
