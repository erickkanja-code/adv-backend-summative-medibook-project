const AppError = require('../utils/AppError');

const MAX_UNSIGNED_INT = 4294967295; // INT UNSIGNED upper bound in MySQL
const ID_PATTERN = /^[1-9]\d*$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEmpty(value) {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

// Each checker returns { value } on success or { error } on failure.
const checkers = {
  id(raw, field) {
    const text = String(raw);
    if (typeof raw === 'boolean' || !ID_PATTERN.test(text) || Number(text) > MAX_UNSIGNED_INT) {
      return { error: `${field} must be a positive integer` };
    }
    return { value: Number(text) };
  },

  string(raw, field, rule) {
    if (typeof raw !== 'string') {
      return { error: `${field} must be a string` };
    }
    const text = raw.trim();
    if (rule.min && text.length < rule.min) {
      return { error: `${field} must be at least ${rule.min} characters` };
    }
    if (rule.max && text.length > rule.max) {
      return { error: `${field} must be at most ${rule.max} characters` };
    }
    if (rule.pattern && !rule.pattern.test(text)) {
      return { error: `${field} ${rule.patternMessage}` };
    }
    return { value: rule.transform ? rule.transform(text) : text };
  },

  money(raw, field, rule) {
    const valid =
      (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) ||
      (typeof raw === 'string' && MONEY_PATTERN.test(raw.trim()));
    const amount = Number(raw);
    if (!valid || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-9) {
      return { error: `${field} must be a non-negative amount with at most 2 decimal places` };
    }
    if (amount > rule.max) {
      return { error: `${field} must not exceed ${rule.max}` };
    }
    return { value: amount };
  },
};

/**
 * Validates `body` against a map of field rules.
 * rule = { type: 'id' | 'string' | 'money', min, max, pattern, patternMessage, transform }
 * In partial mode (PATCH) missing fields are allowed, but at least one must be given.
 * Returns { value, errors } where errors is a list of { field, message }.
 */
function validateBody(body, rules, { partial = false } = {}) {
  if (!isPlainObject(body)) {
    return { value: {}, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }
  const value = {};
  const errors = [];

  for (const [field, rule] of Object.entries(rules)) {
    const raw = body[field];
    if (raw === undefined) {
      if (!partial) errors.push({ field, message: `${field} is required` });
      continue;
    }
    if (isEmpty(raw)) {
      errors.push({ field, message: `${field} cannot be empty` });
      continue;
    }
    const result = checkers[rule.type](raw, field, rule);
    if (result.error) {
      errors.push({ field, message: result.error });
    } else {
      value[field] = result.value;
    }
  }

  if (partial && errors.length === 0 && Object.keys(value).length === 0) {
    errors.push({ field: 'body', message: `Provide at least one of: ${Object.keys(rules).join(', ')}` });
  }
  return { value, errors };
}

// Returns the validated value, or throws a 400 listing every problem found.
function assertValid({ value, errors }, message) {
  if (errors.length > 0) {
    throw AppError.badRequest(message, errors);
  }
  return value;
}

// Parses a single id (route parameter or query string value) or throws 400.
function parseId(raw, field = 'id') {
  const result = checkers.id(raw, field);
  if (result.error) {
    throw AppError.badRequest(result.error, [{ field, message: result.error }]);
  }
  return result.value;
}

module.exports = { validateBody, assertValid, parseId, isPlainObject };
