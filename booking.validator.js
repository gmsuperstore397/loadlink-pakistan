const { body } = require('express-validator');

const createBookingRules = [
  body('loadId').trim().notEmpty().withMessage('loadId is required'),
  body('driverId').trim().notEmpty().withMessage('driverId is required'),
  body('vehicleId').trim().notEmpty().withMessage('vehicleId is required'),
];

module.exports = { createBookingRules };
