// Lightweight error class carrying an HTTP status code, caught by the central error handler.
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
module.exports = ApiError;
