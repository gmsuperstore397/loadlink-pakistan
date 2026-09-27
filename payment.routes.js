const express = require('express');
const router = express.Router();
const { authenticateUser, requireRole } = require('./auth');
const { createPayment, listPayments, markPaid, paymentWebhook } = require('./payment.controller');

router.post('/', authenticateUser, createPayment);
router.get('/', authenticateUser, listPayments);
router.patch('/:id/mark-paid', authenticateUser, requireRole('ADMIN'), markPaid);
router.post('/webhook', paymentWebhook);

module.exports = router;
