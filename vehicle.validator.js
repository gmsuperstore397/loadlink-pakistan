const { body } = require('express-validator');

const createVehicleRules = [
  body('vehicleType').trim().notEmpty().withMessage('Vehicle type is required'),
  body('vehicleNumber').trim().notEmpty().withMessage('Vehicle number is required'),
  body('capacityKg').isFloat({ gt: 0 }).withMessage('Capacity must be greater than 0'),
  body('brand').optional().trim(),
  body('model').optional().trim(),
  body('year').optional().isInt(),
];

module.exports = { createVehicleRules };
