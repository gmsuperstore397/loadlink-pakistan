const express = require('express');
const router = express.Router();
const { register, login, logout, me, forgotPassword, resetPassword, verifyOtp, resendOtp } = require('./auth.controller');
const { registerCustomerRules, loginRules } = require('./auth.validator');
const validate = require('./validate');
const { authenticateUser } = require('./auth');
const { registerLimiter, loginLimiter, verifyOtpLimiter, resendOtpLimiter, forgotPasswordLimiter, resetPasswordLimiter } = require('./auth.rateLimit');

router.post('/register', registerLimiter, registerCustomerRules, validate, register);
router.post('/login', loginLimiter, loginRules, validate, login);
router.post('/verify-otp', verifyOtpLimiter, verifyOtp);
router.post('/resend-otp', resendOtpLimiter, resendOtp);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);
router.post('/logout', authenticateUser, logout);
router.get('/me', authenticateUser, me);

module.exports = router;
