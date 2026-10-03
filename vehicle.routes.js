const express = require('express');
const router = express.Router();
const {
  listVehicles, listMyVehicles, listAvailableVehicles, getVehicle, createVehicle, updateVehicle, listFleetVehicles, createFleetVehicle, updateFleetVehicle, listFleetDrivers,
} = require('./vehicle.controller');
const { createVehicleRules } = require('./vehicle.validator');
const validate = require('./validate');
const { authenticateUser, requireRole, requireDriver } = require('./auth');
const upload = require('./upload');

router.get('/fleet', authenticateUser, requireRole('FLEET_OWNER'), listFleetVehicles);
router.get('/fleet/drivers', authenticateUser, requireRole('FLEET_OWNER'), listFleetDrivers);
router.post('/fleet', authenticateUser, requireRole('FLEET_OWNER'), upload.single('vehicleDoc'), createFleetVehicle);
router.patch('/fleet/:id', authenticateUser, requireRole('FLEET_OWNER'), updateFleetVehicle);
router.get('/', authenticateUser, listVehicles);
router.get('/mine', authenticateUser, requireDriver, listMyVehicles);
router.get('/available', authenticateUser, listAvailableVehicles);
router.get('/:id', authenticateUser, getVehicle);
router.post('/', authenticateUser, requireDriver, upload.single('vehicleDoc'), createVehicleRules, validate, createVehicle);
router.patch('/:id', authenticateUser, requireDriver, updateVehicle);

module.exports = router;
