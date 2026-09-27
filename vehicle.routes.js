const express = require('express');
const router = express.Router();
const {
  listVehicles, listAvailableVehicles, getVehicle, createVehicle, updateVehicle,
} = require('./vehicle.controller');
const { createVehicleRules } = require('./vehicle.validator');
const validate = require('./validate');
const { authenticateUser, requireRole } = require('./auth');
const upload = require('./upload');

router.get('/', authenticateUser, listVehicles);
router.get('/available', authenticateUser, listAvailableVehicles);
router.get('/:id', authenticateUser, getVehicle);
router.post('/', authenticateUser, requireRole('DRIVER'), upload.single('vehicleDoc'), createVehicleRules, validate, createVehicle);
router.patch('/:id', authenticateUser, requireRole('DRIVER'), updateVehicle);

module.exports = router;
