const express = require('express');
const router = express.Router();
const { authenticateUser } = require('./auth');
const { subscribe, unsubscribe } = require('./push.controller');
router.post('/subscribe', authenticateUser, subscribe);
router.post('/unsubscribe', authenticateUser, unsubscribe);
module.exports = router;
