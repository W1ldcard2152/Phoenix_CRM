const Vehicle = require('../models/Vehicle');
const Technician = require('../models/Technician');
const VehicleCheckIn = require('../models/VehicleCheckIn');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const escapeRegex = require('../utils/escapeRegex');
const { parseLocalDate, todayInTz } = require('../utils/dateUtils');
const cacheService = require('../services/cacheService');

/**
 * Technician-facing vehicle scan. Technicians never see customers, so these
 * endpoints return vehicles without their owner, accept only the fields a scan
 * produces, and send a vehicle that isn't on file to the office as a check-in.
 */

// Always updatable from a scan: facts that legitimately change over a car's life.
const SCAN_FIELDS = ['licensePlate', 'licensePlateState', 'registrationExpiration', 'inspectionExpiration', 'buildDate', 'paintCode', 'tireSize'];
// Identity facts: a technician's scan may fill them in, never overwrite them.
const FILL_IF_BLANK = ['vin', 'year', 'make', 'model'];

const MAX_MILEAGE = 1999999;
const isMileage = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_MILEAGE;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isBlankValue = (v) => v === undefined || v === null || v === '' || String(v).toUpperCase() === 'N/A';

/** What a technician may see of a vehicle: the car, not its owner. */
const techView = (v) => ({
  _id: v._id,
  year: v.year,
  make: v.make,
  model: v.model,
  vin: v.vin,
  licensePlate: v.licensePlate,
  licensePlateState: v.licensePlateState,
  registrationExpiration: v.registrationExpiration,
  inspectionExpiration: v.inspectionExpiration,
  buildDate: v.buildDate,
  paintCode: v.paintCode,
  tireSize: v.tireSize,
  currentMileage: v.currentMileage,
  mileageHistory: (v.mileageHistory || []).map(r => ({ date: r.date, mileage: r.mileage }))
});

const vehicleSummary = (fields = {}) => [fields.year, fields.make, fields.model].filter(Boolean).join(' ');

/**
 * Keep only the known shape of a scan result before storing it. The client
 * relays the server's own scan response, but it's still client input.
 */
const sanitizeScan = (scan = {}) => {
  const vin = scan.vin || {};
  const fields = {};
  Object.entries(scan.fields || {}).forEach(([key, value]) => {
    if (!['year', 'make', 'model', 'licensePlate', 'licensePlateState', 'currentMileage', ...SCAN_FIELDS].includes(key)) return;
    if (typeof value === 'number' && Number.isFinite(value)) fields[key] = value;
    else if (typeof value === 'string') fields[key] = value.trim().slice(0, 60);
  });
  return {
    vin: {
      value: str(vin.value, 20) || null,
      status: str(vin.status, 20) || 'none',
      candidates: (Array.isArray(vin.candidates) ? vin.candidates : []).slice(0, 5).map(c => str(c, 20)).filter(Boolean),
      readings: (Array.isArray(vin.readings) ? vin.readings : []).slice(0, 3).map(r => ({
        label: str(r?.label, 40),
        asRead: str(r?.asRead, 30),
        normalized: str(r?.normalized, 20),
        valid: !!r?.valid
      }))
    },
    fields,
    mileageRecords: (Array.isArray(scan.mileageRecords) ? scan.mileageRecords : []).slice(0, 5)
      .filter(r => isMileage(r?.mileage))
      .map(r => ({
        date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : null,
        mileage: r.mileage,
        source: str(r.source, 60),
        notes: str(r.notes, 200),
        estimated: !!r.estimated
      })),
    warnings: (Array.isArray(scan.warnings) ? scan.warnings : []).slice(0, 20).map(w => ({
      field: str(w?.field, 40),
      level: ['error', 'warning', 'info'].includes(w?.level) ? w.level : 'info',
      message: str(w?.message, 300)
    })),
    found: {
      registration: !!scan.found?.registration,
      inspection: !!scan.found?.inspection,
      odometer: !!scan.found?.odometer,
      doorJamb: !!scan.found?.doorJamb
    },
    notes: str(scan.notes, 500) || null
  };
};

const findByVin = (vin) => Vehicle.findOne({ vin: { $regex: new RegExp(`^${escapeRegex(vin)}$`, 'i') } });

/**
 * GET /api/vehicles/scan-lookup?vin=… or ?plate=…&state=…
 * A plate only counts when it matches exactly one vehicle.
 */
exports.scanLookup = catchAsync(async (req, res, next) => {
  const vin = str(req.query.vin, 20).toUpperCase();
  const plate = str(req.query.plate, 12).toUpperCase().replace(/[\s-]/g, '');
  const state = str(req.query.state, 2).toUpperCase();

  let vehicle = null;
  if (vin) {
    vehicle = await findByVin(vin);
  } else if (plate) {
    // Stored plates may carry a dash or space ("ABC-1234"); match either way.
    const pattern = plate.split('').map(escapeRegex).join('[\\s-]?');
    const matches = (await Vehicle.find({ licensePlate: { $regex: new RegExp(`^${pattern}$`, 'i') } }))
      .filter(v => !state || !v.licensePlateState || v.licensePlateState === state);
    if (matches.length === 1) vehicle = matches[0];
  } else {
    return next(new AppError('Provide a VIN or a plate', 400));
  }

  res.status(200).json({
    status: 'success',
    data: vehicle ? { exists: true, vehicle: techView(vehicle) } : { exists: false }
  });
});

/**
 * POST /api/vehicles/:id/scan-update
 * Apply a scan to a vehicle on file. Body: the scanned fields at top level (so
 * convertDates handles the expiry dates), plus
 *   mileageRecords: [{ date: 'YYYY-MM-DD', mileage, source, notes }]  (e.g. inspection sticker)
 *   reading: { mileage, fromPhoto }                                    (today's odometer)
 */
exports.scanUpdate = catchAsync(async (req, res, next) => {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }

  const updated = [];
  SCAN_FIELDS.forEach(field => {
    const value = req.body[field];
    if (isBlankValue(value)) return;
    vehicle[field] = value;
    updated.push(field);
  });
  FILL_IF_BLANK.forEach(field => {
    const value = req.body[field];
    if (isBlankValue(value) || !isBlankValue(vehicle[field])) return;
    vehicle[field] = value;
    updated.push(field);
  });

  const readings = [];
  (Array.isArray(req.body.mileageRecords) ? req.body.mileageRecords : []).slice(0, 5).forEach(r => {
    const mileage = Number(r?.mileage);
    if (!isMileage(mileage) || !/^\d{4}-\d{2}-\d{2}$/.test(r?.date || '')) return;
    readings.push({ date: parseLocalDate(r.date), mileage, source: str(r.source, 60), notes: str(r.notes, 200) });
  });
  const reading = req.body.reading;
  if (reading && reading.mileage !== undefined && reading.mileage !== null && reading.mileage !== '') {
    const mileage = Number(reading.mileage);
    if (!isMileage(mileage)) {
      return next(new AppError('Mileage must be a whole number', 400));
    }
    readings.push({
      date: todayInTz(),
      mileage,
      source: reading.fromPhoto ? 'Odometer photo' : 'Technician check-in',
      notes: `Checked in by ${req.user.name}`
    });
  }
  readings.forEach(r => vehicle.addMileageRecord(r.mileage, r.date, r.notes, r.source));

  await vehicle.save(); // pre-save dedupes mileage history and syncs currentMileage
  cacheService.invalidateAllVehicles();

  res.status(200).json({
    status: 'success',
    data: { vehicle: techView(vehicle), updated, readings: readings.length }
  });
});

/**
 * POST /api/vehicles/check-ins
 * A scanned vehicle that isn't on file → the office. Body: { scan, vin, mileage, fromPhoto, note }
 */
exports.createCheckIn = catchAsync(async (req, res, next) => {
  const scan = sanitizeScan(req.body.scan);
  const vin = str(req.body.vin, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Someone may have added it since the technician's lookup.
  if (vin) {
    const existing = await findByVin(vin);
    if (existing) {
      return res.status(409).json({
        status: 'fail',
        message: 'This vehicle is already on file.',
        data: { vehicle: techView(existing) }
      });
    }
  }

  let mileage;
  if (req.body.mileage !== undefined && req.body.mileage !== null && req.body.mileage !== '') {
    mileage = Number(req.body.mileage);
    if (!isMileage(mileage)) {
      return next(new AppError('Mileage must be a whole number', 400));
    }
  }

  const technician = req.user.technician
    ? await Technician.findById(req.user.technician).select('serviceWriter').populate('serviceWriter', 'name')
    : null;

  const checkIn = await VehicleCheckIn.create({
    scan,
    vin: vin || undefined,
    vehicleSummary: vehicleSummary(scan.fields),
    mileage,
    mileageFromPhoto: !!req.body.fromPhoto && mileage !== undefined,
    note: str(req.body.note, 500),
    technician: req.user.technician || undefined,
    submittedBy: req.user._id,
    submittedByName: req.user.name,
    assignedTo: technician?.serviceWriter?._id
  });

  res.status(201).json({
    status: 'success',
    data: {
      checkIn: { _id: checkIn._id, assignedToName: technician?.serviceWriter?.name || null }
    }
  });
});

/** GET /api/vehicles/check-ins?status=open (office) */
exports.listCheckIns = catchAsync(async (req, res, next) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const checkIns = await VehicleCheckIn.find({ status })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('assignedTo', 'name');

  res.status(200).json({
    status: 'success',
    results: checkIns.length,
    data: { checkIns }
  });
});

/** GET /api/vehicles/check-ins/:id (office) */
exports.getCheckIn = catchAsync(async (req, res, next) => {
  const checkIn = await VehicleCheckIn.findById(req.params.id).populate('assignedTo', 'name');
  if (!checkIn) {
    return next(new AppError('No check-in found with that ID', 404));
  }
  res.status(200).json({ status: 'success', data: { checkIn } });
});

/**
 * PATCH /api/vehicles/check-ins/:id (office)
 * Body: { status: 'resolved', vehicle } once the vehicle exists, or { status: 'dismissed' }.
 */
exports.resolveCheckIn = catchAsync(async (req, res, next) => {
  const { status, vehicle: vehicleId } = req.body;
  if (!['resolved', 'dismissed'].includes(status)) {
    return next(new AppError("Status must be 'resolved' or 'dismissed'", 400));
  }

  const checkIn = await VehicleCheckIn.findById(req.params.id);
  if (!checkIn) {
    return next(new AppError('No check-in found with that ID', 404));
  }
  if (checkIn.status !== 'open') {
    return next(new AppError('This check-in has already been handled', 409));
  }
  if (status === 'resolved') {
    if (!vehicleId || !(await Vehicle.exists({ _id: vehicleId }))) {
      return next(new AppError('Resolving a check-in needs the vehicle it became', 400));
    }
    checkIn.vehicle = vehicleId;
  }

  checkIn.status = status;
  checkIn.resolvedBy = req.user._id;
  checkIn.resolvedAt = new Date();
  await checkIn.save();

  res.status(200).json({ status: 'success', data: { checkIn } });
});

exports.sanitizeScan = sanitizeScan;
exports.techView = techView;
