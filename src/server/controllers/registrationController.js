const multer = require('multer');
const fetch = require('node-fetch');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

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

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY not found in environment variables. Registration scanning will not work.');
}

/**
 * Call OpenAI Vision API to analyze registration image
 */
const analyzeRegistrationWithOpenAI = async (imageBuffer) => {
  if (!OPENAI_API_KEY) {
    throw new AppError('OpenAI API key not configured', 500);
  }

  try {
    const base64Image = imageBuffer.toString('base64');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Please analyze this vehicle registration document and extract the following information in JSON format:

{
  "vin": "Vehicle Identification Number (17 characters if found)",
  "licensePlate": "License plate number",
  "licensePlateState": "State of registration (e.g., 'NY', 'CA', 'TX')",
  "confidence": "Your confidence level (0.0 to 1.0) in the accuracy of the extracted information"
}

Important instructions:
- Only return valid JSON, no additional text or markdown
- If you cannot find a field, omit it from the response or set it to null
- VIN should be exactly 17 characters if found - be very careful with VIN recognition
- License plate should be the actual plate number without state prefix
- License plate state should be the 2-letter state abbreviation (e.g., 'NY', 'CA', 'TX')
- Confidence should reflect how clearly you can read the information
- Focus only on these essential fields - ignore make, model, year as they will be obtained from VIN decoding`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', errorData);
      
      if (response.status === 429) {
        throw new AppError('Rate limit exceeded. Please try again later.', 429);
      } else if (response.status === 401) {
        throw new AppError('OpenAI API authentication failed', 500);
      } else {
        throw new AppError('Failed to analyze image', 500);
      }
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new AppError('Invalid response from OpenAI', 500);
    }

    let content = data.choices[0].message.content;
    
    // Clean up content - remove markdown code blocks if present
    content = content.trim();
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Parse the JSON response
    let extractedData;
    try {
      extractedData = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', content);
      throw new AppError('Failed to parse extracted data', 500);
    }

    return extractedData;

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    console.error('OpenAI API call failed:', error);
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
  // Check if file was uploaded
  if (!req.file) {
    return next(new AppError('No image file provided', 400));
  }

  // Validate file type
  if (!req.file.mimetype.startsWith('image/')) {
    return next(new AppError('Only image files are allowed', 400));
  }

  try {
    // Analyze the image with OpenAI
    const extractedData = await analyzeRegistrationWithOpenAI(req.file.buffer);
    
    // Validate and clean the extracted data
    const validation = validateExtractedData(extractedData);
    
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
    console.error('Registration scanning error:', error);
    
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