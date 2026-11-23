const { validateBody } = require('./common');

const MAX_FEE = 99999999.99; // DECIMAL(10,2) upper bound

const DOCTOR_RULES = Object.freeze({
  fullName: { type: 'string', min: 2, max: 100 },
  specialty: { type: 'string', min: 2, max: 100 },
  consultationFee: { type: 'money', max: MAX_FEE },
  room: {
    type: 'string',
    min: 1,
    max: 10,
    pattern: /^[A-Za-z0-9-]+$/,
    patternMessage: 'may contain only letters, digits and dashes (e.g. R-12)',
  },
});

function validateDoctor(body, options) {
  return validateBody(body, DOCTOR_RULES, options);
}

module.exports = { validateDoctor };
