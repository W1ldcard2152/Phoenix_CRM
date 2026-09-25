const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { decodeVin } = require('../services/vinDecodeService');

// Protect all routes - require authentication
router.use(authController.protect);

// VIN decode route - proxy to NHTSA API (office staff only)
router.get('/decode/:vin', authController.restrictTo('admin', 'management', 'service-writer'), async (req, res) => {
  try {
    const { vin } = req.params;
    
    // Validate VIN format
    if (!vin || vin.length !== 17) {
      return res.status(400).json({
        success: false,
        error: 'VIN must be exactly 17 characters'
      });
    }
    
    // Check for invalid characters (I, O, Q are not allowed in VINs)
    if (/[IOQ]/.test(vin.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'VIN cannot contain the letters I, O, or Q'
      });
    }
    
    // Check for valid characters (alphanumeric only)
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'VIN can only contain letters and numbers (excluding I, O, Q)'
      });
    }

    const cleanVin = vin.toUpperCase().trim();
    const vehicleData = await decodeVin(cleanVin);

    // Validate that we got the essential fields
    if (!vehicleData.year || !vehicleData.make || !vehicleData.model) {
      const missing = [];
      if (!vehicleData.year) missing.push('year');
      if (!vehicleData.make) missing.push('make');
      if (!vehicleData.model) missing.push('model');
      
      return res.status(404).json({
        success: false,
        error: `Unable to decode VIN: missing ${missing.join(', ')} information`
      });
    }

    res.json({
      success: true,
      data: vehicleData,
      vin: cleanVin
    });

  } catch (error) {
    console.error('VIN decode error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to decode VIN'
    });
  }
});

module.exports = router;
