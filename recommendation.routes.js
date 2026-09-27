const express = require('express');
const router = express.Router();
const { recommendVehicleHandler } = require('../controllers/recommendation.controller');
const { authenticateUser } = require('../middleware/auth');

router.post('/vehicle', authenticateUser, recommendVehicleHandler);

module.exports = router;
