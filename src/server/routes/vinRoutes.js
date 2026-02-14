const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Protect all routes - require authentication
router.use(authController.protect);

// VIN decode route - proxy to NHTSA API
router.get('/decode/:vin', async (req, res) => {
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
    const nhtsa_url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${cleanVin}?format=json`;

    // Use node-fetch or axios to make the request
    const fetch = require('node-fetch');
    const response = await fetch(nhtsa_url);
    
    if (!response.ok) {
      throw new Error(`NHTSA API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.Results || data.Results.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No vehicle information found for this VIN'
      });
    }

    // Extract relevant fields from NHTSA response
    const results = data.Results;
    const vehicleData = {};

    // Map NHTSA fields to our vehicle data
    results.forEach(item => {
      switch (item.Variable) {
        case 'Model Year':
          vehicleData.year = item.Value && item.Value !== 'null' ? parseInt(item.Value) : null;
          break;
        case 'Make':
          vehicleData.make = item.Value && item.Value !== 'null' ? formatMake(item.Value) : null;
          break;
        case 'Model':
          vehicleData.model = item.Value && item.Value !== 'null' ? formatModel(item.Value) : null;
          break;
        case 'Vehicle Type':
          vehicleData.vehicleType = item.Value && item.Value !== 'null' ? formatText(item.Value) : null;
          break;
        case 'Body Class':
          vehicleData.bodyClass = item.Value && item.Value !== 'null' ? formatText(item.Value) : null;
          break;
      }
    });

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

// Helper functions for text formatting
function formatMake(make) {
  if (!make) return null;
  
  const specialCases = {
    'BMW': 'BMW',
    'GMC': 'GMC',
    'MINI': 'MINI',
    'KIA': 'Kia',
    'FIAT': 'Fiat',
    'JEEP': 'Jeep',
    'FORD': 'Ford',
    'CHEVROLET': 'Chevrolet',
    'TOYOTA': 'Toyota',
    'HONDA': 'Honda',
    'NISSAN': 'Nissan',
    'SUBARU': 'Subaru',
    'MAZDA': 'Mazda',
    'VOLKSWAGEN': 'Volkswagen',
    'AUDI': 'Audi',
    'MERCEDES-BENZ': 'Mercedes-Benz',
    'LEXUS': 'Lexus',
    'INFINITI': 'Infiniti',
    'ACURA': 'Acura',
    'CADILLAC': 'Cadillac',
    'LINCOLN': 'Lincoln',
    'BUICK': 'Buick',
    'CHRYSLER': 'Chrysler',
    'DODGE': 'Dodge',
    'RAM': 'Ram',
    'HYUNDAI': 'Hyundai',
    'GENESIS': 'Genesis',
    'VOLVO': 'Volvo',
    'JAGUAR': 'Jaguar',
    'LAND ROVER': 'Land Rover',
    'PORSCHE': 'Porsche',
    'TESLA': 'Tesla',
    'MITSUBISHI': 'Mitsubishi'
  };

  const upperMake = make.toUpperCase().trim();
  return specialCases[upperMake] || formatText(make);
}

function formatModel(model) {
  if (!model) return null;

  const formatted = formatText(model);
  
  const modelCorrections = {
    '1500': '1500',
    '2500': '2500',
    '3500': '3500',
    'F-150': 'F-150',
    'F-250': 'F-250',
    'F-350': 'F-350',
    'C-Class': 'C-Class',
    'E-Class': 'E-Class',
    'S-Class': 'S-Class',
    'X3': 'X3',
    'X5': 'X5',
    'Q5': 'Q5',
    'Q7': 'Q7',
    'RX': 'RX',
    'GX': 'GX',
    'MDX': 'MDX',
    'TLX': 'TLX',
    'CRV': 'CR-V',
    'HRV': 'HR-V',
    'RAV4': 'RAV4',
    'CX-5': 'CX-5',
    'CX-9': 'CX-9',
    'X-Trail': 'X-Trail'
  };

  const upperModel = formatted.toUpperCase();
  for (const [key, value] of Object.entries(modelCorrections)) {
    if (upperModel === key.toUpperCase()) {
      return value;
    }
  }

  return formatted;
}

function formatText(text) {
  if (!text) return null;
  
  return text
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.includes('-')) {
        return word.split('-').map(part => 
          part.charAt(0).toUpperCase() + part.slice(1)
        ).join('-');
      }
      
      if (/\d/.test(word)) {
        return word.toUpperCase();
      }
      
      const upperWord = word.toUpperCase();
      if (['AWD', 'FWD', 'RWD', '4WD', '2WD', 'SRT', 'STI', 'WRX', 'GT', 'RS', 'SS', 'Z28', 'ZL1'].includes(upperWord)) {
        return upperWord;
      }
      
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();
}

module.exports = router;