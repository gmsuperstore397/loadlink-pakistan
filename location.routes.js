const express = require('express');
const router = express.Router();
const { reverseGeocode, geocode } = require('./location.controller');
const { authenticateUser } = require('./auth');

router.post('/reverse-geocode', authenticateUser, reverseGeocode);
router.post('/geocode', authenticateUser, geocode);

module.exports = router;
