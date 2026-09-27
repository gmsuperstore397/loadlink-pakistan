const express = require('express');
const router = express.Router();
const { register, login, logout, me, forgotPassword, resetPassword, verifyOtp, resendOtp } = require('./auth.controller');
const { registerCustomerRules, loginRules } = require('./auth.validator');
const validate = require('./validate');
const { authenticateUser } = require('./auth');

router.post('/register', registerCustomerRules, validate, register);
router.post('/login', loginRules, validate, login);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/logout', authenticateUser, logout);
router.get('/me', authenticateUser, me);

module.exports = router;
