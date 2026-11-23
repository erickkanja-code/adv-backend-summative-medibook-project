const AppError = require('../utils/AppError');
const { APPOINTMENT_STATUS } = require('../config/businessRules');
const { parseLocalDate } = require('../utils/dateTime');
const { parseId } = require('./common');

// Query strings can repeat a key (?a=1&a=2); only a single plain value is accepted.
function single(raw, field) {
  if (Array.isArray(raw) || (raw !== undefined && typeof raw !== 'string')) {
    throw AppError.badRequest(`${field} must be given once`, [{ field, message: `${field} must be given once` }]);
  }
  return raw;
}

function optionalId(raw, field) {
  const value = single(raw, field);
  return value === undefined ? undefined : parseId(value, field);
}

function optionalDate(raw, field) {
  const value = single(raw, field);
  if (value === undefined) return undefined;
  if (!parseLocalDate(value)) {
    const message = `${field} must be a real date formatted YYYY-MM-DD`;
    throw AppError.badRequest(message, [{ field, message }]);
  }
  return value;
}

function optionalStatus(raw, field) {
  const value = single(raw, field);
  if (value === undefined) return undefined;
  const status = value.toUpperCase();
  if (!Object.values(APPOINTMENT_STATUS).includes(status)) {
    const message = `${field} must be one of: ${Object.values(APPOINTMENT_STATUS).join(', ')}`;
    throw AppError.badRequest(message, [{ field, message }]);
  }
  return status;
}

function required(value, field) {
  if (value === undefined) {
    throw AppError.badRequest(`${field} query parameter is required`, [{ field, message: `${field} is required` }]);
  }
  return value;
}

module.exports = { optionalId, optionalDate, optionalStatus, required };
