const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const aiService = require('../services/aiService');

/**
 * Extract product details from a URL using Gemini AI
 */
exports.extractFromUrl = catchAsync(async (req, res, next) => {
  const { url } = req.body;

  if (!url) {
    return next(new AppError('URL is required', 400));
  }

  try {
    new URL(url);
  } catch {
    return next(new AppError('Invalid URL format', 400));
  }

  const extracted = await aiService.extractFromUrl(url);

  res.status(200).json({
    status: 'success',
    data: extracted
  });
});
