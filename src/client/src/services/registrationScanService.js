import api from './api';

const registrationScanService = {
  /**
   * Scan a registration image to extract vehicle information
   * @param {File} imageFile - The registration image file
   * @returns {Promise} API response with extracted data
   */
  scanRegistration: async (imageFile) => {
    try {
      const formData = new FormData();
      formData.append('registration', imageFile);

      const response = await api.post('/registration/scan', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Registration scan service error:', error);
      
      // Handle specific error cases
      if (error.response?.status === 400) {
        throw new Error(error.response.data.message || 'Invalid image file');
      } else if (error.response?.status === 413) {
        throw new Error('Image file too large. Please use a smaller image.');
      } else if (error.response?.status === 429) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      } else if (error.response?.status === 500) {
        throw new Error('Server error. Please try again later.');
      } else if (error.code === 'NETWORK_ERROR') {
        throw new Error('Network error. Please check your connection and try again.');
      }
      
      throw new Error('Failed to scan registration. Please try again.');
    }
  },

  /**
   * Validate that the uploaded file is a valid image
   * @param {File} file - The file to validate
   * @returns {Object} Validation result with isValid and error message
   */
  validateImageFile: (file) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (!file) {
      return { isValid: false, error: 'No file selected' };
    }

    if (!allowedTypes.includes(file.type)) {
      return { 
        isValid: false, 
        error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.' 
      };
    }

    if (file.size > maxSize) {
      return { 
        isValid: false, 
        error: 'File size too large. Please upload an image smaller than 10MB.' 
      };
    }

    return { isValid: true };
  },

  /**
   * Process extracted data and format it for form consumption
   * @param {Object} extractedData - Raw data from OpenAI
   * @returns {Object} Formatted data for vehicle form
   */
  formatExtractedData: (extractedData) => {
    if (!extractedData) return {};

    const formatted = {};

    // Clean and format VIN
    if (extractedData.vin) {
      formatted.vin = extractedData.vin.toString().toUpperCase().trim();
      
      // Validate VIN format (17 characters, alphanumeric except I, O, Q)
      const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
      if (!vinRegex.test(formatted.vin)) {
        formatted.vinWarning = 'VIN format may be incorrect. Please verify.';
      }
    }

    // Clean and format license plate
    if (extractedData.licensePlate) {
      formatted.licensePlate = extractedData.licensePlate.toString().toUpperCase().trim();
    }

    // Format year
    if (extractedData.year) {
      const year = parseInt(extractedData.year);
      const currentYear = new Date().getFullYear();
      
      if (year >= 1900 && year <= currentYear + 1) {
        formatted.year = year;
      }
    }

    // Format make and model
    if (extractedData.make) {
      formatted.make = extractedData.make.toString().trim();
    }

    if (extractedData.model) {
      formatted.model = extractedData.model.toString().trim();
    }

    // Include state if available
    if (extractedData.state) {
      formatted.state = extractedData.state.toString().toUpperCase().trim();
    }

    // Include confidence score
    if (extractedData.confidence) {
      formatted.confidence = parseFloat(extractedData.confidence);
    }

    return formatted;
  },

  /**
   * Check if the scanned data contains minimum required information
   * @param {Object} data - Extracted data
   * @returns {Object} Validation result
   */
  validateExtractedData: (data) => {
    if (!data || typeof data !== 'object') {
      return { isValid: false, error: 'No data extracted from image' };
    }

    // At least VIN or license plate should be present
    if (!data.vin && !data.licensePlate) {
      return { 
        isValid: false, 
        error: 'Could not find VIN or license plate in the image. Please ensure the registration is clearly visible.' 
      };
    }

    // Warn about low confidence
    if (data.confidence && data.confidence < 0.7) {
      return {
        isValid: true,
        warning: 'Low confidence in extracted data. Please verify the information before proceeding.'
      };
    }

    return { isValid: true };
  }
};

export default registrationScanService;