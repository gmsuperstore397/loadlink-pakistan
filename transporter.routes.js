const express = require('express');
const router = express.Router();
const { registerTransporter, getTransporter } = require('./transporter.controller');
const { registerDriverRules } = require('./auth.validator');
const validate = require('./validate');
const { authenticateUser } = require('./auth');
const upload = require('./upload');

router.post(
  '/register',
  upload.fields([
    { name: 'cnicDoc', maxCount: 1 },
    { name: 'licenseDoc', maxCount: 1 },
    { name: 'vehicleDoc', maxCount: 1 },
  ]),
  registerDriverRules,
  validate,
  registerTransporter,
);
router.get('/:id', authenticateUser, getTransporter);

module.exports = router;
