const express = require('express');
const router = express.Router();
const { authenticateUser, requireRole } = require('./auth');
const { createDispute, listMyDisputes, getDispute } = require('./dispute.controller');

router.post('/', authenticateUser, requireRole('CUSTOMER', 'DRIVER'), createDispute);
router.get('/mine', authenticateUser, listMyDisputes);
router.get('/:id', authenticateUser, getDispute);

module.exports = router;
