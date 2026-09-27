const express = require('express');
const router = express.Router();
const { recommendVehicleHandler } = require('./recommendation.controller');
const { authenticateUser } = require('./auth');

router.post('/vehicle', authenticateUser, recommendVehicleHandler);

module.exports = router;
