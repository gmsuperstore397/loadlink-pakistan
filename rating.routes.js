const express = require('express');
const router = express.Router();
const { createRating, getRatingsForUser, getDriverTrustScoreHandler } = require('./rating.controller');
const { authenticateUser } = require('./auth');

router.post('/', authenticateUser, createRating);
router.get('/trust/:userId', authenticateUser, getDriverTrustScoreHandler);
router.get('/:userId', authenticateUser, getRatingsForUser);

module.exports = router;
