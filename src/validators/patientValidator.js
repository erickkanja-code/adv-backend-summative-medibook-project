const { validateBody } = require('./common');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s()-]{5,18}$/;

const PATIENT_RULES = Object.freeze({
  fullName: { type: 'string', min: 2, max: 100 },
  email: {
    type: 'string',
    max: 255,
    pattern: EMAIL_PATTERN,
    patternMessage: 'must be a valid email address',
    transform: (text) => text.toLowerCase(),
  },
  phone: {
    type: 'string',
    min: 7,
    max: 20,
    pattern: PHONE_PATTERN,
    patternMessage: 'may contain only digits, spaces, parentheses, dashes and a leading +',
  },
});

function validatePatient(body, options) {
  return validateBody(body, PATIENT_RULES, options);
}

module.exports = { validatePatient };
