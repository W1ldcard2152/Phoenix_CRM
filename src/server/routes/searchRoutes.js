const express = require('express');
const searchController = require('../controllers/searchController');
const router = express.Router();

// Global search endpoint
router.get('/global', searchController.globalSearch);

module.exports = router;