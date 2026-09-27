const { body } = require('express-validator');

const createLoadRules = [
  body('pickupAddress').trim().notEmpty().withMessage('Pickup location is required'),
  body('destinationAddress').trim().notEmpty().withMessage('Destination is required'),
  body('description').trim().notEmpty().withMessage('Load description is required')
    .isLength({ max: 500 }).withMessage('Description must be under 500 characters'),
  body('weightKg').isFloat({ gt: 0 }).withMessage('Approx. weight must be greater than 0'),
  body('preferredVehicle').optional({ values: 'falsy' }).trim(),
  body('pickupLatitude').optional({ values: 'falsy' }).isFloat(),
  body('pickupLongitude').optional({ values: 'falsy' }).isFloat(),
  body('destinationLatitude').optional({ values: 'falsy' }).isFloat(),
  body('destinationLongitude').optional({ values: 'falsy' }).isFloat(),
];

module.exports = { createLoadRules };
