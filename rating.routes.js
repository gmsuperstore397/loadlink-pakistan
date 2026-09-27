const express = require('express');
const router = express.Router();
const { createRating, getRatingsForUser } = require('./rating.controller');
const { authenticateUser } = require('./auth');

router.post('/', authenticateUser, createRating);
router.get('/:userId', authenticateUser, getRatingsForUser);

module.exports = router;
