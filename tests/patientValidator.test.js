const { validatePatient } = require('../src/validators/patientValidator');

describe('validatePatient', () => {
  test('accepts a valid patient, trimming text and lower-casing the email', () => {
    const result = validatePatient({ fullName: '  Ama Mensah ', email: 'AMA@Mail.com', phone: '0244-111-222' });
    expect(result.errors).toEqual([]);
    expect(result.value).toEqual({ fullName: 'Ama Mensah', email: 'ama@mail.com', phone: '0244-111-222' });
  });

  test('reports every missing field on create (PUT/POST)', () => {
    const fields = validatePatient({}).errors.map((e) => e.field);
    expect(fields).toEqual(['fullName', 'email', 'phone']);
  });

  test('rejects a malformed email and a whitespace-only name', () => {
    const { errors } = validatePatient({ fullName: '   ', email: 'not-an-email', phone: '0244111222' });
    expect(errors).toEqual([
      { field: 'fullName', message: 'fullName cannot be empty' },
      { field: 'email', message: 'email must be a valid email address' },
    ]);
  });

  test('partial mode (PATCH) accepts one field but not an empty body or a non-object', () => {
    expect(validatePatient({ phone: '+233 24 111 2222' }, { partial: true }).errors).toEqual([]);
    expect(validatePatient({}, { partial: true }).errors[0].field).toBe('body');
    expect(validatePatient([], { partial: true }).errors[0].field).toBe('body');
  });
});
