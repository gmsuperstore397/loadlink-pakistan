const express = require('express');
const router = express.Router();
const { listReturnLoads, smartReturnLoads, smartReturnLoadsForTrip, smartReturnRouteForTrip } = require('./returnLoad.controller');
const { authenticateUser } = require('./auth');

router.get('/smart', authenticateUser, smartReturnLoads);
router.get('/smart/trip/:tripId', authenticateUser, smartReturnLoadsForTrip);
router.get('/smart/route/:tripId', authenticateUser, smartReturnRouteForTrip);
router.get('/', authenticateUser, listReturnLoads);

module.exports = router;
