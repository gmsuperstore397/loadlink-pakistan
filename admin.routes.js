const express = require('express');
const router = express.Router();
const {
  dashboard, listUsers, pendingTransporters, verifyTransporter, rejectTransporter, suspendUser, listAuditLogs, paymentSummary, expiringDocuments, listManagers, createManager, updateManager, MANAGER_PERMISSIONS,
} = require('./admin.controller');
const { authenticateUser, requireRole, requirePermission } = require('./auth');

router.use(authenticateUser, requireRole('ADMIN', 'MANAGER'));

router.get('/permissions', requireRole('ADMIN'), (req, res) => res.json({ success: true, message: 'Manager permissions', data: { permissions: MANAGER_PERMISSIONS } }));
router.get('/managers', requireRole('ADMIN'), listManagers);
router.post('/managers', requireRole('ADMIN'), createManager);
router.patch('/managers/:id', requireRole('ADMIN'), updateManager);

router.get('/dashboard', dashboard);
router.get('/payments/summary', paymentSummary);
router.get('/audit-logs', listAuditLogs);
router.get('/documents/expiring', expiringDocuments);
router.get('/users', listUsers);
router.get('/transporters/pending', pendingTransporters);
router.patch('/transporters/:id/verify', verifyTransporter);
router.patch('/transporters/:id/reject', rejectTransporter);
router.patch('/users/:id/suspend', suspendUser);

module.exports = router;
