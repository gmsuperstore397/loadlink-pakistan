const express = require('express');
const router = express.Router();
const { listReturnLoads } = require('./returnLoad.controller');
const { authenticateUser } = require('./auth');

router.get('/', authenticateUser, listReturnLoads);

module.exports = router;
