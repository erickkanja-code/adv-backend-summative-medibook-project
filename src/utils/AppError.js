// An error that carries an HTTP status and a machine-readable code.
// Throw it anywhere; the central error handler turns it into a JSON response.
class AppError extends Error {
  constructor(status, message, { code = 'ERROR', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, message, { code: 'VALIDATION_ERROR', details });
  }

  static notFound(message, code = 'NOT_FOUND') {
    return new AppError(404, message, { code });
  }

  static conflict(message, code = 'CONFLICT', details) {
    return new AppError(409, message, { code, details });
  }

  static unprocessable(message, code = 'UNPROCESSABLE', details) {
    return new AppError(422, message, { code, details });
  }
}

module.exports = AppError;
