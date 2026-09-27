const express = require('express');
const router = express.Router();
const { listReturnLoads } = require('../controllers/returnLoad.controller');
const { authenticateUser } = require('../middleware/auth');

router.get('/', authenticateUser, listReturnLoads);

module.exports = router;
