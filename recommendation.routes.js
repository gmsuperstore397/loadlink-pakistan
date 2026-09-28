const express = require('express');
const router = express.Router();
const { recommendVehicleHandler, smartLoadMatchesHandler } = require('./recommendation.controller');
const { authenticateUser } = require('./auth');

router.post('/vehicle', authenticateUser, recommendVehicleHandler);
router.get('/load/:loadId/matches', authenticateUser, smartLoadMatchesHandler);

module.exports = router;
