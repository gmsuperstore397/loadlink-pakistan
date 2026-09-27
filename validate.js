const { validationResult } = require('express-validator');
const { fail } = require('./apiResponse');

// Runs after express-validator chains; short-circuits with a 422 on any failure.
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return fail(res, 422, 'Validation failed', errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    })));
  }
  next();
}

module.exports = validate;
