const AppError = require('../utils/AppError');

// Database errors that can reach the handler, translated into client-facing responses.
const MYSQL_ERRORS = {
  ER_DUP_ENTRY: [409, 'DUPLICATE', 'A record with the same unique value already exists.'],
  ER_ROW_IS_REFERENCED_2: [409, 'HAS_DEPENDENTS', 'This record is referenced by appointments and cannot be deleted.'],
  ER_NO_REFERENCED_ROW_2: [422, 'INVALID_REFERENCE', 'A referenced record does not exist.'],
  ER_CHECK_CONSTRAINT_VIOLATED: [422, 'CONSTRAINT_VIOLATION', 'The data breaks a database business rule.'],
};

// Infrastructure problems (MySQL or Redis down / misconfigured).
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
]);

function toErrorResponse(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  if (err.type === 'entity.parse.failed') {
    return { status: 400, code: 'INVALID_JSON', message: 'The request body is not valid JSON.' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' };
  }
  if (MYSQL_ERRORS[err.code]) {
    const [status, code, message] = MYSQL_ERRORS[err.code];
    return { status, code, message };
  }
  if (UNAVAILABLE_CODES.has(err.code) || err.name === 'MaxRetriesPerRequestError') {
    return { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'A backing service is unavailable. Please try again shortly.' };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };
}

// Central error-handling middleware: the only place that formats error responses.
// Express 5 forwards rejected promises from async handlers here automatically.
// The 4-argument signature is what marks this as error middleware for Express.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const { status, code, message, details } = toErrorResponse(err);
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }
  const body = { error: { status, code, message } };
  if (details !== undefined) {
    body.error.details = details;
  }
  return res.status(status).json(body);
}

module.exports = errorHandler;
