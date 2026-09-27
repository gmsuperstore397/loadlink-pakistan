const express = require('express');
const router = express.Router();
const { estimateFareHandler } = require('../controllers/fare.controller');
const { authenticateUser } = require('../middleware/auth');

router.post('/estimate', authenticateUser, estimateFareHandler);

module.exports = router;
