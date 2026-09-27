const express = require('express');
const router = express.Router();
const { reverseGeocode } = require('./location.controller');
const { authenticateUser } = require('./auth');

router.post('/reverse-geocode', authenticateUser, reverseGeocode);

module.exports = router;
