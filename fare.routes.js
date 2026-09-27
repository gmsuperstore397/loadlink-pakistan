const express = require('express');
const router = express.Router();
const { estimateFareHandler } = require('./fare.controller');
const { authenticateUser } = require('./auth');

router.post('/estimate', authenticateUser, estimateFareHandler);

module.exports = router;
