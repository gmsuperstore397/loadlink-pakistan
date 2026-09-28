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

router.get('/dashboard', requirePermission('dashboard.view'), dashboard);
router.get('/payments/summary', requirePermission('payments.verify'), paymentSummary);
router.get('/audit-logs', requirePermission('reports.view'), listAuditLogs);
router.get('/documents/expiring', requirePermission('drivers.documents'), expiringDocuments);
router.get('/users', requirePermission('customers.view'), listUsers);
router.get('/transporters/pending', requirePermission('drivers.view'), pendingTransporters);
router.patch('/transporters/:id/verify', requirePermission('drivers.verify'), verifyTransporter);
router.patch('/transporters/:id/reject', requirePermission('drivers.verify'), rejectTransporter);
router.patch('/users/:id/suspend', requirePermission('customers.edit'), suspendUser);

module.exports = router;
