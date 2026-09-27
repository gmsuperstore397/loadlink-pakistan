const express = require('express');
const router = express.Router();
const {
  dashboard, listUsers, pendingTransporters, verifyTransporter, rejectTransporter, suspendUser,
} = require('./admin.controller');
const { authenticateUser, requireRole } = require('./auth');

router.use(authenticateUser, requireRole('ADMIN'));

router.get('/dashboard', dashboard);
router.get('/users', listUsers);
router.get('/transporters/pending', pendingTransporters);
router.patch('/transporters/:id/verify', verifyTransporter);
router.patch('/transporters/:id/reject', rejectTransporter);
router.patch('/users/:id/suspend', suspendUser);

module.exports = router;
