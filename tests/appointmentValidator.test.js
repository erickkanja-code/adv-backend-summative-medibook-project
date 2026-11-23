const { validateAppointmentSlot } = require('../src/validators/appointmentValidator');

// Fixed "now" so results never depend on the day the tests run.
const NOW = new Date(2027, 2, 1, 12, 0, 0); // 1 March 2027, 12:00

const check = (input) => validateAppointmentSlot(input, NOW);

describe('validateAppointmentSlot - valid slots', () => {
  test('accepts 09:00, the first slot of the day', () => {
    expect(check('2027-03-15 09:00')).toEqual({
      ok: true,
      value: { datetime: '2027-03-15 09:00:00', date: '2027-03-15' },
    });
  });

  test('accepts 16:30, the last slot (it ends at 17:00), with ISO "T" separator and seconds', () => {
    expect(check('2027-03-15T16:30:00')).toMatchObject({ ok: true, value: { datetime: '2027-03-15 16:30:00' } });
  });
});

describe('validateAppointmentSlot - business-rule violations (422)', () => {
  test('rejects 17:00 exactly: the slot would end after closing time', () => {
    expect(check('2027-03-15 17:00')).toMatchObject({ ok: false, status: 422, code: 'OUTSIDE_WORKING_HOURS' });
  });

  test('rejects 08:30, before opening', () => {
    expect(check('2027-03-15 08:30')).toMatchObject({ ok: false, status: 422, code: 'OUTSIDE_WORKING_HOURS' });
  });

  test('rejects 09:15 and 09:00:30: not on a 30-minute boundary', () => {
    expect(check('2027-03-15 09:15')).toMatchObject({ ok: false, status: 422, code: 'NOT_ON_SLOT_BOUNDARY' });
    expect(check('2027-03-15 09:00:30')).toMatchObject({ ok: false, status: 422, code: 'NOT_ON_SLOT_BOUNDARY' });
  });

  test('rejects a slot in the past and a slot exactly at "now"', () => {
    expect(check('2027-02-26 10:00')).toMatchObject({ ok: false, status: 422, code: 'NOT_IN_FUTURE' });
    expect(check('2027-03-01 12:00')).toMatchObject({ ok: false, status: 422, code: 'NOT_IN_FUTURE' });
  });
});

describe('validateAppointmentSlot - malformed input (400)', () => {
  test.each([['next tuesday'], ['2027/03/15 09:00'], ['2027-03-15'], [''], [20270315], [null], [undefined]])(
    'rejects %p as badly formatted',
    (input) => {
      expect(check(input)).toMatchObject({ ok: false, status: 400, code: 'INVALID_DATETIME_FORMAT' });
    },
  );

  test('rejects impossible calendar values such as 30 February or 25:00', () => {
    expect(check('2027-02-30 10:00')).toMatchObject({ ok: false, status: 400, code: 'INVALID_DATETIME' });
    expect(check('2027-03-15 25:00')).toMatchObject({ ok: false, status: 400, code: 'INVALID_DATETIME' });
  });
});
