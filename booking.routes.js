const express = require('express');
const router = express.Router();
const {
  createBooking, myBookings, getBooking, acceptBooking, rejectBooking, cancelBooking,
} = require('../controllers/booking.controller');
const { createBookingRules } = require('../validators/booking.validator');
const validate = require('../middleware/validate');
const { authenticateUser, requireRole } = require('../middleware/auth');

router.post('/', authenticateUser, requireRole('CUSTOMER'), createBookingRules, validate, createBooking);
router.get('/my', authenticateUser, myBookings);
router.get('/:id', authenticateUser, getBooking);
router.patch('/:id/accept', authenticateUser, requireRole('DRIVER'), acceptBooking);
router.patch('/:id/reject', authenticateUser, requireRole('DRIVER'), rejectBooking);
router.patch('/:id/cancel', authenticateUser, requireRole('CUSTOMER'), cancelBooking);

module.exports = router;
