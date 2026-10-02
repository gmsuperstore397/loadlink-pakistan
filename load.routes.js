const express = require('express');
const router = express.Router();
const { createLoad, listLoads, listMyLoads, getLoad, updateLoad, deleteLoad, contactTeam } = require('./load.controller');
const { createLoadRules } = require('./load.validator');
const validate = require('./validate');
const { authenticateUser, requireRole } = require('./auth');

router.post('/', authenticateUser, requireRole('CUSTOMER'), createLoadRules, validate, createLoad);
router.get('/', authenticateUser, listLoads);
router.get('/mine', authenticateUser, requireRole('CUSTOMER'), listMyLoads);
router.post('/:id/contact-team', authenticateUser, requireRole('DRIVER'), contactTeam);
router.get('/:id', authenticateUser, getLoad);
router.patch('/:id', authenticateUser, requireRole('CUSTOMER'), updateLoad);
router.delete('/:id', authenticateUser, requireRole('CUSTOMER'), deleteLoad);

module.exports = router;
