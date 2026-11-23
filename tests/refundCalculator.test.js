const { calculateRefund, getRefundPercent } = require('../src/utils/refundCalculator');

// Fixed appointment time - tests never depend on the real clock.
const APPOINTMENT_TIME = new Date(2027, 2, 15, 10, 0, 0); // 15 March 2027, 10:00
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

function cancelledHoursBefore(hours, extraMinutes = 0) {
  return new Date(APPOINTMENT_TIME.getTime() - hours * MS_PER_HOUR - extraMinutes * MS_PER_MINUTE);
}

function refundFor(cancelledAt, amountPaid = 150) {
  return calculateRefund({ amountPaid, appointmentTime: APPOINTMENT_TIME, cancelledAt });
}

describe('calculateRefund - tiers', () => {
  test('more than 48 hours notice gives a 100% refund', () => {
    expect(refundFor(cancelledHoursBefore(72))).toEqual({ percent: 100, amount: 150, hoursNotice: 72 });
  });

  test('between 24 and 48 hours notice gives a 50% refund', () => {
    expect(refundFor(cancelledHoursBefore(30))).toEqual({ percent: 50, amount: 75, hoursNotice: 30 });
  });

  test('less than 24 hours notice gives no refund', () => {
    expect(refundFor(cancelledHoursBefore(5))).toEqual({ percent: 0, amount: 0, hoursNotice: 5 });
  });
});

describe('calculateRefund - boundaries (policy: 24h and 48h both belong to the 50% tier)', () => {
  test('exactly 48 hours notice gives 50% (100% needs MORE than 48h)', () => {
    expect(refundFor(cancelledHoursBefore(48))).toMatchObject({ percent: 50, amount: 75 });
  });

  test('one minute more than 48 hours gives 100%', () => {
    expect(refundFor(cancelledHoursBefore(48, 1))).toMatchObject({ percent: 100, amount: 150 });
  });

  test('exactly 24 hours notice gives 50%', () => {
    expect(refundFor(cancelledHoursBefore(24))).toMatchObject({ percent: 50, amount: 75 });
  });

  test('one minute less than 24 hours gives 0%', () => {
    expect(refundFor(cancelledHoursBefore(23, 59))).toMatchObject({ percent: 0, amount: 0 });
  });
});

describe('calculateRefund - money and input handling', () => {
  test('rounds a half refund to whole cents', () => {
    expect(refundFor(cancelledHoursBefore(36), 99.99).amount).toBe(50);
    expect(refundFor(cancelledHoursBefore(36), 120.5).amount).toBe(60.25);
  });

  test('rejects invalid input instead of guessing', () => {
    expect(() => calculateRefund({ amountPaid: -1, appointmentTime: APPOINTMENT_TIME, cancelledAt: new Date() })).toThrow(TypeError);
    expect(() => calculateRefund({ amountPaid: 100, appointmentTime: new Date('nope'), cancelledAt: new Date() })).toThrow(TypeError);
  });

  test('getRefundPercent maps notice hours to the policy tiers', () => {
    expect([49, 48, 36, 24, 23.99, 0].map(getRefundPercent)).toEqual([100, 50, 50, 50, 0, 0]);
  });
});
