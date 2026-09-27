const express = require('express');
const router = express.Router();
const { register, login, logout, me } = require('./auth.controller');
const { registerCustomerRules, loginRules } = require('./auth.validator');
const validate = require('./validate');
const { authenticateUser } = require('./auth');

router.post('/register', registerCustomerRules, validate, register);
router.post('/login', loginRules, validate, login);
router.post('/logout', authenticateUser, logout);
router.get('/me', authenticateUser, me);

module.exports = router;
