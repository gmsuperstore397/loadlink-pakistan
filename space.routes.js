const express = require('express');
const router = express.Router();
const c = require('./space.controller');
const { authenticateUser, requireRole } = require('./auth');

router.get('/listings', authenticateUser, c.listSpaceListings);
router.get('/requests', authenticateUser, c.listSpaceRequests);
router.get('/requests/:id/matches', authenticateUser, requireRole('CUSTOMER'), c.matchListings);
router.get('/bookings/my', authenticateUser, c.mySpaceBookings);
router.get('/bookings/:id', authenticateUser, c.getSpaceBooking);
router.post('/listings', authenticateUser, requireRole('DRIVER'), c.createSpaceListing);
router.post('/requests', authenticateUser, requireRole('CUSTOMER'), c.createSpaceRequest);
router.post('/bookings', authenticateUser, requireRole('CUSTOMER'), c.createSpaceBooking);
router.patch('/bookings/:id/accept', authenticateUser, requireRole('DRIVER'), c.acceptSpaceBooking);
router.patch('/bookings/:id/reject', authenticateUser, requireRole('DRIVER'), c.rejectSpaceBooking);

module.exports = router;