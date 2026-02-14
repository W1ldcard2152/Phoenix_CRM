const express = require('express');
const searchController = require('../controllers/searchController');
const authController = require('../controllers/authController');
const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Global search endpoint
router.get('/global', searchController.globalSearch);

module.exports = router;