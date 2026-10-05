const express = require('express');
const upload = require('./upload');
const router = express.Router();
const {
  listTrips, getTrip, getLiveTrip, setTracking, updateLocation, updateTripStatus, streamTrip, submitDeliveryProof, getDeliveryProof,
} = require('./trip.controller');
const { authenticateUser, requireRole } = require('./auth');
const { uploadCommissionSlip } = require('./commission.controller');

router.get('/', authenticateUser, listTrips);
router.get('/:id', authenticateUser, getTrip);
router.get('/:id/live', authenticateUser, getLiveTrip);
router.get('/:id/stream', authenticateUser, streamTrip);
router.get('/:id/proof', authenticateUser, getDeliveryProof);
router.post('/:id/proof', authenticateUser, requireRole('DRIVER'), upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'signature', maxCount: 1 }]), submitDeliveryProof);
router.post('/:id/commission-slip', authenticateUser, requireRole('DRIVER'), upload.single('slip'), uploadCommissionSlip);
router.patch('/:id/tracking', authenticateUser, requireRole('DRIVER'), setTracking);
router.patch('/:id/location', authenticateUser, requireRole('DRIVER'), updateLocation);
router.patch('/:id/status', authenticateUser, requireRole('DRIVER'), updateTripStatus);

module.exports = router;
