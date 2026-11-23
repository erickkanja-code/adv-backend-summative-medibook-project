const AppError = require('../utils/AppError');

// Any request that matched no route ends up here.
function notFound(req, res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`, 'ROUTE_NOT_FOUND'));
}

module.exports = notFound;
