const { fail } = require('../utils/apiResponse');

// Central error handler. Every route funnels here via asyncHandler / next(err).
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);

  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Something went wrong';
  const errors = err.errors || [];

  // Prisma known error codes worth translating into clean API errors.
  if (err.code === 'P2002') {
    return fail(res, 409, 'A record with this value already exists', [
      { field: err.meta?.target, message: 'Must be unique' },
    ]);
  }
  if (err.code === 'P2025') {
    return fail(res, 404, 'Record not found', []);
  }

  return fail(res, statusCode, message, errors);
}

function notFound(req, res) {
  return fail(res, 404, `Route not found: ${req.method} ${req.originalUrl}`, []);
}

module.exports = { errorHandler, notFound };
