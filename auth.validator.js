const { body } = require('express-validator');

const registerCustomerRules = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('mobile').trim().isLength({ min: 10 }).withMessage('Valid mobile number is required'),
  body('email').trim().isEmail().withMessage('A valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('city').optional().trim(),
];

const loginRules = [
  body('mobile').optional({ values: 'falsy' }).trim(),
  body('email').optional({ values: 'falsy' }).isEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const registerDriverRules = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('mobile').trim().isLength({ min: 10 }).withMessage('Valid mobile number is required'),
  body('city').optional().trim(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('cnic').trim().notEmpty().withMessage('CNIC is required'),
  body('drivingLicense').trim().notEmpty().withMessage('Driving license number is required'),
  body('vehicleType').trim().notEmpty().withMessage('Vehicle type is required'),
  body('vehicleNumber').trim().notEmpty().withMessage('Vehicle number is required'),
  body('capacityKg').isFloat({ gt: 0 }).withMessage('Vehicle capacity must be greater than 0'),
];

module.exports = { registerCustomerRules, registerDriverRules, loginRules };
