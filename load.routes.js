const express = require('express');
const router = express.Router();
const { createLoad, listLoads, getLoad, updateLoad, deleteLoad } = require('../controllers/load.controller');
const { createLoadRules } = require('../validators/load.validator');
const validate = require('../middleware/validate');
const { authenticateUser, requireRole } = require('../middleware/auth');

router.post('/', authenticateUser, requireRole('CUSTOMER'), createLoadRules, validate, createLoad);
router.get('/', authenticateUser, listLoads);
router.get('/:id', authenticateUser, getLoad);
router.patch('/:id', authenticateUser, requireRole('CUSTOMER'), updateLoad);
router.delete('/:id', authenticateUser, requireRole('CUSTOMER'), deleteLoad);

module.exports = router;
