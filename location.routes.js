const express = require('express');
const router = express.Router();
const { reverseGeocode } = require('../controllers/location.controller');
const { authenticateUser } = require('../middleware/auth');

router.post('/reverse-geocode', authenticateUser, reverseGeocode);

module.exports = router;
