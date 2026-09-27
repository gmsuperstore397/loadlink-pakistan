const express = require('express');
const router = express.Router();
const { createRating, getRatingsForUser } = require('../controllers/rating.controller');
const { authenticateUser } = require('../middleware/auth');

router.post('/', authenticateUser, createRating);
router.get('/:userId', authenticateUser, getRatingsForUser);

module.exports = router;
