const express = require('express');
const router = express.Router();
const { registerTransporter, getTransporter } = require('../controllers/transporter.controller');
const { registerDriverRules } = require('../validators/auth.validator');
const validate = require('../middleware/validate');
const { authenticateUser } = require('../middleware/auth');
const upload = require('../middleware/upload');

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
