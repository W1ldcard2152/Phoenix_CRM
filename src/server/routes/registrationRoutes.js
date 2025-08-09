const express = require('express');
const { upload, scanRegistration } = require('../controllers/registrationController');
const authController = require('../controllers/authController');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authController.protect);

/**
 * POST /api/registration/scan
 * Scan a registration image to extract vehicle information
 * 
 * @body {File} registration - The registration image file
 * @returns {Object} Extracted vehicle data (VIN, license plate, etc.)
 */
router.post('/scan', upload.single('registration'), scanRegistration);

module.exports = router;