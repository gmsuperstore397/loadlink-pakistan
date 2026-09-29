const express = require('express');
const router = express.Router();
const { listReturnLoads, smartReturnLoads, smartReturnLoadsForTrip } = require('./returnLoad.controller');
const { authenticateUser } = require('./auth');

router.get('/smart', authenticateUser, smartReturnLoads);
router.get('/smart/trip/:tripId', authenticateUser, smartReturnLoadsForTrip);
router.get('/', authenticateUser, listReturnLoads);

module.exports = router;
