const express = require('express');
const router = express.Router();
const {
  listTrips, getTrip, getLiveTrip, updateLocation, updateTripStatus, streamTrip,
} = require('./trip.controller');
const { authenticateUser, requireRole } = require('./auth');

router.get('/', authenticateUser, listTrips);
router.get('/:id', authenticateUser, getTrip);
router.get('/:id/live', authenticateUser, getLiveTrip);
router.get('/:id/stream', authenticateUser, streamTrip);
router.patch('/:id/location', authenticateUser, requireRole('DRIVER'), updateLocation);
router.patch('/:id/status', authenticateUser, requireRole('DRIVER'), updateTripStatus);

module.exports = router;
