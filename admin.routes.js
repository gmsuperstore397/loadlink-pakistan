const express = require('express');
const router = express.Router();
const {
  dashboard, roleWorkspace, liveTrackingTrips, dispatchOptions, assignBooking, approveDeal, operationalTripUpdate, listVehicleVerification, verifyVehicle, rejectVehicle, listRoleAccounts, createRoleAccount, updateRoleAccount, listUsers, managerAuditTimeline, roleCatalog, pendingTransporters, verifyTransporter, rejectTransporter, suspendUser, listAuditLogs, paymentSummary, expiringDocuments, listManagers, createManager, updateManager, MANAGER_PERMISSIONS, listCustomers, listDrivers, listLoads, listBookings, listPayments, listTrips, reports, unlockLocation, listDisputes, updateDispute, updateCustomer, updateLoad, updateBooking, updatePayment, setCustomerAccountStatus, setDriverAccountStatus, listSOSAlerts, updateSOSAlert, listContactRequests, updateContactRequest,
} = require('./admin.controller');
const { authenticateUser, requireRole, requirePermission } = require('./auth');

const PORTAL_ROLES = ['ADMIN','MANAGER','FLEET_OWNER','DISPATCHER','FREIGHT_BROKER','FREIGHT_FORWARDER','CUSTOMS_AGENT','PORT_AGENT','WAREHOUSE_OPERATOR','FINANCE','OPERATIONS','SUPPORT'];
const { analytics } = require('./analytics.controller');

router.use(authenticateUser, requireRole(...PORTAL_ROLES));

router.get('/permissions', requireRole('ADMIN'), (req, res) => res.json({ success: true, message: 'Manager permissions', data: { permissions: MANAGER_PERMISSIONS } }));
router.get('/role-catalog', requireRole('ADMIN'), roleCatalog);
router.get('/role-accounts', requireRole('ADMIN'), listRoleAccounts);
router.post('/role-accounts', requireRole('ADMIN'), createRoleAccount);
router.patch('/role-accounts/:id', requireRole('ADMIN'), updateRoleAccount);
router.get('/managers', requireRole('ADMIN'), listManagers);
router.post('/managers', requireRole('ADMIN'), createManager);
router.patch('/managers/:id', requireRole('ADMIN'), updateManager);

router.get('/dashboard', requirePermission('dashboard.view'), dashboard);
router.get('/workspace', requirePermission('dashboard.view'), roleWorkspace);
router.get('/dispatch/options', requirePermission('dispatch.view'), dispatchOptions);
router.post('/dispatch/bookings/:id/assign', requirePermission('dispatch.assign'), assignBooking);
router.patch('/operations/bookings/:id/approve', requirePermission('deals.approve'), approveDeal);
router.patch('/operations/trips/:id', requirePermission('trips.edit'), operationalTripUpdate);
router.get('/live-trips', requirePermission('location.view'), liveTrackingTrips);
router.get('/customers', requirePermission('customers.view'), listCustomers);
router.patch('/customers/:id', requirePermission('customers.edit'), updateCustomer);
router.patch('/customers/:id/status', requirePermission('customers.edit'), setCustomerAccountStatus);
router.get('/drivers', requirePermission('drivers.view'), listDrivers);
router.get('/vehicles/verification', requirePermission('vehicles.view'), listVehicleVerification);
router.patch('/vehicles/:id/verify', requirePermission('vehicles.verify'), verifyVehicle);
router.patch('/vehicles/:id/reject', requirePermission('vehicles.verify'), rejectVehicle);
router.patch('/drivers/:id/status', requirePermission('drivers.verify'), setDriverAccountStatus);
router.get('/loads', requirePermission('loads.view'), listLoads);
router.get('/contact-requests', requirePermission('loads.view'), listContactRequests);
router.patch('/contact-requests/:id', requirePermission('loads.edit'), updateContactRequest);
router.patch('/loads/:id', requirePermission('loads.edit'), updateLoad);
router.get('/bookings', requirePermission('bookings.view'), listBookings);
router.patch('/bookings/:id', requirePermission('deals.approve'), updateBooking);
router.get('/trips', requirePermission('trips.view'), listTrips);
router.get('/reports', requirePermission('reports.view'), reports);
router.get('/analytics', requirePermission('reports.view'), analytics);
router.get('/disputes', requirePermission('disputes.view'), listDisputes);
router.get('/sos', requirePermission('sos.view'), listSOSAlerts);
router.patch('/sos/:id', requirePermission('sos.resolve'), updateSOSAlert);
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
