const fetch = require('node-fetch');

/**
 * NHTSA vPIC VIN decode, shared by the VIN decode route and the vehicle scanner.
 * Resolves { year, make, model, vehicleType, bodyClass } — any field may be null.
 * Throws on a network / HTTP failure.
 */
const decodeVin = async (vin) => {
  const cleanVin = String(vin).toUpperCase().trim();
  const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${cleanVin}?format=json`, { timeout: 10000 });

  if (!response.ok) {
    throw new Error(`NHTSA API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const vehicleData = { year: null, make: null, model: null, vehicleType: null, bodyClass: null };

  (data.Results || []).forEach(item => {
    const value = item.Value && item.Value !== 'null' ? item.Value : null;
    switch (item.Variable) {
      case 'Model Year':
        vehicleData.year = value ? parseInt(value) : null;
        break;
      case 'Make':
        vehicleData.make = value ? formatMake(value) : null;
        break;
      case 'Model':
        vehicleData.model = value ? formatModel(value) : null;
        break;
      case 'Vehicle Type':
        vehicleData.vehicleType = value ? formatText(value) : null;
        break;
      case 'Body Class':
        vehicleData.bodyClass = value ? formatText(value) : null;
        break;
    }
  });

  return vehicleData;
};

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


module.exports = { decodeVin };
