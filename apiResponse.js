// Standard API response helpers, per the project's response format contract.

function success(res, status, message, data = {}) {
  return res.status(status).json({ success: true, message, data });
}

function fail(res, status, message, errors = []) {
  return res.status(status).json({ success: false, message, errors });
}

module.exports = { success, fail };
