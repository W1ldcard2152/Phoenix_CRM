const express = require('express');
const { scanUpload, scanVehicle } = require('../controllers/registrationController');
const authController = require('../controllers/authController');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authController.protect);

/**
 * POST /api/registration/scan
 * Scan vehicle photos to extract registration, inspection, odometer and door-jamb data.
 *
 * @body {File} [registration] - registration card or windshield stickers
 * @body {File} [odometer]     - instrument cluster
 * @body {File} [doorJamb]     - door-jamb certification / tire label
 * @returns {Object} { vin, fields, mileageRecords, warnings, found, notes }
 */
router.post('/scan', authController.restrictTo('admin', 'management', 'service-writer', 'technician'), scanUpload, scanVehicle);

module.exports = router;
