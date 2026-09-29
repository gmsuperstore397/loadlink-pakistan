const rateLimit = require('express-rate-limit');

const keyWithIdentifier = (req) => {
  const identifier = String(req.body?.email || req.body?.mobile || '').trim().toLowerCase();
  return identifier ? `${req.ip}:${identifier}` : req.ip;
};

const authRateLimit = (max, windowMs, message) => rateLimit({
  windowMs,
  max,
  keyGenerator: keyWithIdentifier,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { success: false, message, errors: [] },
});

module.exports = {
  registerLimiter: authRateLimit(10, 60 * 60 * 1000, 'Too many signup attempts. Please try again later.'),
  loginLimiter: authRateLimit(10, 15 * 60 * 1000, 'Too many login attempts. Please try again later.'),
  verifyOtpLimiter: authRateLimit(10, 15 * 60 * 1000, 'Too many OTP verification attempts. Please try again later.'),
  resendOtpLimiter: authRateLimit(5, 60 * 60 * 1000, 'Too many OTP resend requests. Please try again later.'),
  forgotPasswordLimiter: authRateLimit(5, 60 * 60 * 1000, 'Too many password reset requests. Please try again later.'),
  resetPasswordLimiter: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => `${req.ip}:${String(req.body?.token || '').slice(0, 32)}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many password reset attempts. Please try again later.', errors: [] },
  }),
};
