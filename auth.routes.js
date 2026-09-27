const express = require('express');
const router = express.Router();
const { register, login, logout, me } = require('../controllers/auth.controller');
const { registerCustomerRules, loginRules } = require('../validators/auth.validator');
const validate = require('../middleware/validate');
const { authenticateUser } = require('../middleware/auth');

router.post('/register', registerCustomerRules, validate, register);
router.post('/login', loginRules, validate, login);
router.post('/logout', authenticateUser, logout);
router.get('/me', authenticateUser, me);

module.exports = router;
