const express = require('express');
const router = express.Router();
const {
  listVehicles, listAvailableVehicles, getVehicle, createVehicle, updateVehicle,
} = require('../controllers/vehicle.controller');
const { createVehicleRules } = require('../validators/vehicle.validator');
const validate = require('../middleware/validate');
const { authenticateUser, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', authenticateUser, listVehicles);
router.get('/available', authenticateUser, listAvailableVehicles);
router.get('/:id', authenticateUser, getVehicle);
router.post('/', authenticateUser, requireRole('DRIVER'), upload.single('vehicleDoc'), createVehicleRules, validate, createVehicle);
router.patch('/:id', authenticateUser, requireRole('DRIVER'), updateVehicle);

module.exports = router;
