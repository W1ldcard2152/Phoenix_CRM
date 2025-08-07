// VIN Decoder Service using NHTSA API
class VinService {
  constructor() {
    this.baseURL = 'https://vpic.nhtsa.dot.gov/api/vehicles';
  }

  // Validate VIN format (17 characters, alphanumeric, excluding I, O, Q)
  validateVIN(vin) {
    if (!vin || typeof vin !== 'string') {
      return { isValid: false, error: 'VIN is required' };
    }

    const cleanVin = vin.trim().toUpperCase();

    // Check length
    if (cleanVin.length !== 17) {
      return { isValid: false, error: 'VIN must be exactly 17 characters' };
    }

    // Check for invalid characters (I, O, Q are not allowed in VINs)
    if (/[IOQ]/.test(cleanVin)) {
      return { isValid: false, error: 'VIN cannot contain the letters I, O, or Q' };
    }

    // Check for valid characters (alphanumeric only)
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) {
      return { isValid: false, error: 'VIN can only contain letters and numbers (excluding I, O, Q)' };
    }

    return { isValid: true, vin: cleanVin };
  }

  // Decode VIN using backend API (which proxies to NHTSA)
  async decodeVIN(vin) {
    try {
      const validation = this.validateVIN(vin);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const cleanVin = validation.vin;
      const url = `/api/vin/decode/${cleanVin}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to decode VIN');
      }

      return result;

    } catch (error) {
      console.error('VIN decode error:', error);
      return {
        success: false,
        error: error.message || 'Failed to decode VIN'
      };
    }
  }

  // Format make name (usually already properly capitalized)
  formatMake(make) {
    if (!make) return null;
    
    // Special cases for common makes
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
    return specialCases[upperMake] || this.formatText(make);
  }

  // Format model name with proper capitalization
  formatModel(model) {
    if (!model) return null;

    // Convert to title case but handle special cases
    const formatted = this.formatText(model);

    // Special model name corrections
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

    // Check for exact matches first
    const upperModel = formatted.toUpperCase();
    for (const [key, value] of Object.entries(modelCorrections)) {
      if (upperModel === key.toUpperCase()) {
        return value;
      }
    }

    return formatted;
  }

  // Generic text formatting function
  formatText(text) {
    if (!text) return null;
    
    return text
      .toLowerCase()
      .split(' ')
      .map(word => {
        // Handle hyphenated words
        if (word.includes('-')) {
          return word.split('-').map(part => 
            part.charAt(0).toUpperCase() + part.slice(1)
          ).join('-');
        }
        
        // Handle words with numbers (like F150)
        if (/\d/.test(word)) {
          // Keep numbers and letters as-is for model codes
          return word.toUpperCase();
        }
        
        // Handle common abbreviations that should stay uppercase
        const upperWord = word.toUpperCase();
        if (['AWD', 'FWD', 'RWD', '4WD', '2WD', 'SRT', 'STI', 'WRX', 'GT', 'RS', 'SS', 'Z28', 'ZL1'].includes(upperWord)) {
          return upperWord;
        }
        
        // Regular title case
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ')
      .trim();
  }

  // Get basic vehicle info for display
  getVehicleDisplayName(vehicleData) {
    if (!vehicleData.year || !vehicleData.make || !vehicleData.model) {
      return 'Unknown Vehicle';
    }
    return `${vehicleData.year} ${vehicleData.make} ${vehicleData.model}`;
  }

  // Check if VIN looks valid (quick check without API call)
  isVINFormatValid(vin) {
    return this.validateVIN(vin).isValid;
  }
}

// Export singleton instance
const vinService = new VinService();
export default vinService;