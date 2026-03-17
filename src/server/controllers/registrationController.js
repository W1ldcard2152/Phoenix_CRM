const multer = require('multer');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { getModel } = require('../services/aiService');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new AppError('Only image files are allowed', 400), false);
    }
  },
});

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY not found in environment variables. Registration scanning will not work.');
}

/**
 * Call Gemini Vision API to analyze registration image
 */
const analyzeRegistrationWithGemini = async (imageBuffer) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError('Gemini API key not configured', 500);
  }

  try {
    const base64Image = imageBuffer.toString('base64');
    const model = getModel();

    const prompt = `Please analyze this vehicle registration document and extract the following information in JSON format:

{
  "vin": "Vehicle Identification Number (17 characters if found)",
  "licensePlate": "License plate number",
  "licensePlateState": "State of registration (e.g., 'NY', 'CA', 'TX')",
  "confidence": "Your confidence level (0.0 to 1.0) in the accuracy of the extracted information"
}

Important instructions:
- If you cannot find a field, omit it from the response or set it to null
- VIN should be exactly 17 characters if found - be very careful with VIN recognition
- License plate should be the actual plate number without state prefix
- License plate state should be the 2-letter state abbreviation (e.g., 'NY', 'CA', 'TX')
- Confidence should reflect how clearly you can read the information
- Focus only on these essential fields - ignore make, model, year as they will be obtained from VIN decoding`;

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
        ]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 2000
      }
    });

    const response = result.response;
    const content = response.text();
    console.log('Gemini registration response:', content);

    if (!content || content.trim() === '') {
      const finishReason = response.candidates?.[0]?.finishReason;
      console.error('Gemini returned empty response. Finish reason:', finishReason);
      throw new AppError('AI returned an empty response. Please try a clearer image.', 422);
    }

    return JSON.parse(content);

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error('Gemini API call failed:', error);

    if (error.status === 429) {
      throw new AppError('Rate limit exceeded. Please try again later.', 429);
    }

    throw new AppError('Failed to analyze registration image', 500);
  }
};

/**
 * Validate and clean extracted data
 */
const validateExtractedData = (data) => {
  if (!data || typeof data !== 'object') {
    return { isValid: false, error: 'No data extracted from image' };
  }

  const cleaned = {};

  // Validate VIN
  if (data.vin) {
    const vinStr = data.vin.toString().toUpperCase().trim();
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;

    if (vinRegex.test(vinStr)) {
      cleaned.vin = vinStr;
    } else if (vinStr.length === 17) {
      // Include potentially invalid VINs but flag them
      cleaned.vin = vinStr;
      cleaned.vinWarning = 'VIN format may be incorrect';
    }
  }

  // Validate license plate
  if (data.licensePlate) {
    const plateStr = data.licensePlate.toString().toUpperCase().trim();
    if (plateStr.length >= 2 && plateStr.length <= 10) {
      cleaned.licensePlate = plateStr;
    }
  }

  // Include license plate state
  if (data.licensePlateState && data.licensePlateState.toString().trim()) {
    const state = data.licensePlateState.toString().toUpperCase().trim();
    if (state.length <= 2) {
      cleaned.licensePlateState = state;
    }
  }

  // Include confidence
  if (data.confidence) {
    const confidence = parseFloat(data.confidence);
    if (confidence >= 0 && confidence <= 1) {
      cleaned.confidence = confidence;
    }
  }

  // Check if we have minimum required data
  const hasRequiredData = cleaned.vin || cleaned.licensePlate;

  return {
    isValid: hasRequiredData,
    data: cleaned,
    error: hasRequiredData ? null : 'Could not extract VIN or license plate from image'
  };
};

/**
 * Handle registration image scanning
 */
const scanRegistration = catchAsync(async (req, res, next) => {
  console.log('Registration scan request received:', {
    hasFile: !!req.file,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    fileInfo: req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : null
  });

  // Check if file was uploaded
  if (!req.file) {
    console.error('No file in request:', req.body);
    return next(new AppError('No image file provided', 400));
  }

  // Validate file type
  if (!req.file.mimetype.startsWith('image/')) {
    console.error('Invalid file type:', req.file.mimetype);
    return next(new AppError('Only image files are allowed', 400));
  }

  // Check file size (mobile might send very large images)
  if (req.file.size > 10 * 1024 * 1024) {
    console.error('File too large:', req.file.size);
    return next(new AppError('Image file too large. Maximum size is 10MB.', 400));
  }

  try {
    console.log('Processing image with Gemini...');

    // Analyze the image with Gemini
    const extractedData = await analyzeRegistrationWithGemini(req.file.buffer);

    console.log('Gemini response:', extractedData);

    // Validate and clean the extracted data
    const validation = validateExtractedData(extractedData);

    console.log('Validation result:', validation);

    if (!validation.isValid) {
      return res.status(200).json({
        success: false,
        error: validation.error,
        data: null
      });
    }

    // Return successful result
    res.status(200).json({
      success: true,
      data: validation.data,
      message: 'Registration scanned successfully'
    });

  } catch (error) {
    console.error('Registration scanning error details:', {
      message: error.message,
      stack: error.stack,
      userAgent: req.headers['user-agent'],
      fileSize: req.file?.size,
      fileMimetype: req.file?.mimetype
    });

    if (error instanceof AppError) {
      return next(error);
    }

    return next(new AppError('Failed to process registration image', 500));
  }
});

module.exports = {
  upload,
  scanRegistration
};
