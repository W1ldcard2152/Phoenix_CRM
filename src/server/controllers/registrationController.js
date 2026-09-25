const multer = require('multer');
const moment = require('moment-timezone');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { makeFileFilter } = require('../utils/uploadFilters');
const { TIMEZONE } = require('../config/timezone');
const { extractVehicleScan } = require('../services/aiService');
const { decodeVin } = require('../services/vinDecodeService');
const { resolveVin, interpretScan } = require('../utils/vehicleScanInterpreter');

// Photo slots, in the order the model sees them.
const SLOTS = ['registration', 'odometer', 'doorJamb'];

// Formats Gemini accepts. HEIC/HEIF matter: an iPhone upload can arrive as either.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: SLOTS.length },
  fileFilter: makeFileFilter(ALLOWED_MIME_TYPES, 'JPEG, PNG, WebP or HEIC photos')
}).fields(SLOTS.map(name => ({ name, maxCount: 1 })));

// Multer's own errors (too large, unknown field) carry no status code — report them as 400s.
exports.scanUpload = (req, res, next) => upload(req, res, (err) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 10MB' : `Upload error: ${err.message}`;
    return next(new AppError(message, 400));
  }
  next(err);
});

/**
 * POST /api/registration/scan
 * Reads up to three vehicle photos (registration/stickers, odometer, door jamb)
 * and returns values for the vehicle form plus warnings for a person to review.
 * Nothing is saved here — the form applies what the user accepts.
 */
exports.scanVehicle = catchAsync(async (req, res, next) => {
  if (!process.env.GEMINI_API_KEY) {
    return next(new AppError('AI scanning is not configured on this server', 503));
  }

  const images = SLOTS
    .filter(slot => req.files?.[slot]?.[0])
    .map(slot => {
      const file = req.files[slot][0];
      return { slot, buffer: file.buffer, mimeType: file.mimetype };
    });

  if (images.length === 0) {
    return next(new AppError('Add at least one photo to scan', 400));
  }

  const raw = await extractVehicleScan(images);

  if (!['registration', 'inspection', 'odometer', 'doorJamb'].some(key => raw[key]?.found)) {
    return next(new AppError("Couldn't find a registration, inspection sticker, odometer or door jamb label in the photos. Try a closer, sharper photo.", 422));
  }

  const vin = resolveVin(raw);

  // NHTSA is a cross-check and a source of the model name, not a requirement:
  // if it's down, the scan still returns what the photos show.
  let decoded = null;
  if (vin.value && (vin.status === 'verified' || vin.status === 'corrected')) {
    try {
      decoded = await decodeVin(vin.value);
    } catch (err) {
      console.warn('Vehicle scan: NHTSA decode failed:', err.message);
    }
  }

  const result = interpretScan(raw, {
    vin,
    decoded,
    today: moment.tz(TIMEZONE).format('YYYY-MM-DD')
  });

  res.status(200).json({ status: 'success', data: result });
});
