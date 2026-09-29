const express = require('express');
const router = express.Router();
const {
  dashboard, listUsers, managerAuditTimeline, pendingTransporters, verifyTransporter, rejectTransporter, suspendUser, listAuditLogs, paymentSummary, expiringDocuments, listManagers, createManager, updateManager, MANAGER_PERMISSIONS, listCustomers, listDrivers, listLoads, listBookings, listPayments, listTrips, reports, unlockLocation, listDisputes, updateDispute, updateCustomer, updateLoad, updateBooking, updatePayment, setCustomerAccountStatus, setDriverAccountStatus,
} = require('./admin.controller');
const { authenticateUser, requireRole, requirePermission } = require('./auth');
const { analytics } = require('./analytics.controller');

router.use(authenticateUser, requireRole('ADMIN', 'MANAGER'));

router.get('/permissions', requireRole('ADMIN'), (req, res) => res.json({ success: true, message: 'Manager permissions', data: { permissions: MANAGER_PERMISSIONS } }));
router.get('/managers', requireRole('ADMIN'), listManagers);
router.post('/managers', requireRole('ADMIN'), createManager);
router.patch('/managers/:id', requireRole('ADMIN'), updateManager);

router.get('/dashboard', requirePermission('dashboard.view'), dashboard);
router.get('/customers', requirePermission('customers.view'), listCustomers);
router.patch('/customers/:id', requirePermission('customers.edit'), updateCustomer);
router.patch('/customers/:id/status', requirePermission('customers.edit'), setCustomerAccountStatus);
router.get('/drivers', requirePermission('drivers.view'), listDrivers);
router.patch('/drivers/:id/status', requirePermission('drivers.verify'), setDriverAccountStatus);
router.get('/loads', requirePermission('loads.view'), listLoads);
router.patch('/loads/:id', requirePermission('loads.edit'), updateLoad);
router.get('/bookings', requirePermission('bookings.view'), listBookings);
router.patch('/bookings/:id', requirePermission('deals.approve'), updateBooking);
router.get('/trips', requirePermission('trips.view'), listTrips);
router.get('/reports', requirePermission('reports.view'), reports);
router.get('/analytics', requirePermission('reports.view'), analytics);
router.get('/disputes', requirePermission('disputes.view'), listDisputes);
router.patch('/disputes/:id', requirePermission('disputes.resolve'), updateDispute);
router.get('/payments', requirePermission('payments.verify'), listPayments);
router.patch('/payments/:id', requirePermission('payments.verify'), updatePayment);
router.patch('/space-bookings/:id/unlock-location', requirePermission('location.unlock'), unlockLocation);
router.get('/payments/summary', requirePermission('payments.verify'), paymentSummary);
router.get('/audit-logs', requirePermission('reports.view'), listAuditLogs);
router.get('/manager-audit', requirePermission('reports.view'), managerAuditTimeline);
router.get('/documents/expiring', requirePermission('drivers.documents'), expiringDocuments);
router.get('/users', requirePermission('customers.view'), listUsers);
router.get('/transporters/pending', requirePermission('drivers.view'), pendingTransporters);
router.patch('/transporters/:id/verify', requirePermission('drivers.verify'), verifyTransporter);
router.patch('/transporters/:id/reject', requirePermission('drivers.verify'), rejectTransporter);
router.patch('/users/:id/suspend', requirePermission('customers.edit'), suspendUser);

module.exports = router;
