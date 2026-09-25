/**
 * Turns the AI's raw vehicle-scan readings (aiService.extractVehicleScan) into
 * values the vehicle form can use, plus warnings for anything implausible.
 * Pure — no I/O — so every rule here is unit-tested.
 *
 * Two stages because the NHTSA cross-check needs a VIN first:
 *   resolveVin(raw)                          → which VIN to trust
 *   interpretScan(raw, { vin, decoded, today }) → fields, mileage records, warnings
 */
const moment = require('moment');
const { normalizeVin, isValidVin, lookalikeCorrections, modelYearsFromVin } = require('./vinUtils');

// Months an inspection sticker is valid, by state. The sticker prints its
// expiry month, so the inspection happened this many months earlier. Add a
// state here only once its sticker is known to print mileage and expiry.
const INSPECTION_VALIDITY_MONTHS = { NY: 12 };

const VIN_SOURCES = [
  ['registration', 'registration'],
  ['inspection', 'inspection sticker'],
  ['doorJamb', 'door jamb label']
];

const MAX_PLATE_LENGTH = 8; // longest US plate

const KM_TO_MI = 0.621371;

const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

const warn = (warnings, field, level, message) => warnings.push({ field, level, message });

/** 'YYYY-MM-DD' for a month/day/year, using the month's last day when day is missing. */
const toDateString = (year, month, day) => {
  if (!isInt(year, 1900, 2200) || !isInt(month, 1, 12)) return null;
  const m = moment({ year, month: month - 1, day: 1 });
  if (day === null || day === undefined) return m.endOf('month').format('YYYY-MM-DD');
  if (!isInt(day, 1, m.daysInMonth())) return null;
  return m.date(day).format('YYYY-MM-DD');
};

const monthLabel = (year, month) => moment({ year, month: month - 1, day: 1 }).format('MM/YYYY');

// Loose make comparison: "Mercedes-Benz" vs "MERCEDES BENZ", "Land Rover" vs "LANDROVER".
const sameMake = (a, b) => {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
};

/**
 * Decide which VIN to trust across the documents that print one.
 *
 * status:
 *   verified   — at least one reading passes the check digit, and all passing readings agree
 *   corrected  — no reading passes, but exactly one single-character lookalike fix does
 *   conflict   — two different readings both pass: they are different vehicles' VINs
 *   unverified — nothing passes and no unique fix exists
 *   nonstandard — pre-1981 vehicle; its VIN has no check digit
 *   none       — no VIN visible
 *
 * Only `verified` is safe to apply without a person looking at it.
 */
const resolveVin = (raw = {}) => {
  const readings = VIN_SOURCES
    .filter(([key]) => raw[key]?.found && raw[key]?.vin)
    .map(([key, label]) => {
      const normalized = normalizeVin(raw[key].vin);
      return { source: key, label, asRead: raw[key].vin, normalized, valid: isValidVin(normalized) };
    });

  if (readings.length === 0) {
    return { value: null, status: 'none', candidates: [], readings };
  }

  const registrationYear = raw.registration?.year;
  if (isInt(registrationYear, 1900, 1980)) {
    // Pre-1981 VINs predate the I/O/Q rule, so don't apply normalizeVin's mapping.
    const asPrinted = String(readings[0].asRead).toUpperCase().replace(/\s/g, '');
    return { value: asPrinted, status: 'nonstandard', candidates: [], readings };
  }

  const validVins = [...new Set(readings.filter(r => r.valid).map(r => r.normalized))];

  if (validVins.length === 1) {
    return { value: validVins[0], status: 'verified', candidates: validVins, readings };
  }
  if (validVins.length > 1) {
    return { value: null, status: 'conflict', candidates: validVins, readings };
  }

  // Nothing passes: look for one-character lookalike fixes. When the registration
  // prints a model year, drop fixes whose position-10 year code contradicts it.
  let fixes = [...new Set(readings.flatMap(r => lookalikeCorrections(r.normalized)))];
  if (isInt(registrationYear, 1981, 2200)) {
    const yearMatches = fixes.filter(v => modelYearsFromVin(v, registrationYear + 1).includes(registrationYear));
    if (yearMatches.length > 0) fixes = yearMatches;
  }

  if (fixes.length === 1) {
    return { value: fixes[0], status: 'corrected', candidates: fixes, readings };
  }
  return { value: readings[0].normalized, status: 'unverified', candidates: fixes, readings };
};

const describeVinFix = (from, to) => {
  const i = [...to].findIndex((c, idx) => c !== from[idx]);
  return i === -1 ? '' : ` (character ${i + 1}: ${from[i]} → ${to[i]})`;
};

const vinWarnings = (vin, raw, decoded, warnings) => {
  const reading = vin.readings[0];
  switch (vin.status) {
    case 'verified':
      vin.readings
        .filter(r => r.normalized !== vin.value)
        .forEach(r => warn(warnings, 'vin', 'info',
          `The ${r.label} VIN read as ${r.asRead}, which fails the VIN check digit; the ${vin.readings.find(x => x.normalized === vin.value).label} reading passes and was used.`));
      break;
    case 'corrected': {
      const source = vin.readings.find(r => lookalikeCorrections(r.normalized).includes(vin.value)) || reading;
      warn(warnings, 'vin', 'error',
        `The VIN read as ${source.asRead}, which fails the VIN check digit. ${vin.value} is the only one-character fix that passes${describeVinFix(source.normalized, vin.value)}. Check it against the vehicle before using it.`);
      break;
    }
    case 'conflict':
      warn(warnings, 'vin', 'error',
        `The documents show different VINs: ${vin.readings.map(r => `${r.normalized} (${r.label})`).join(', ')}. Check the VIN on the vehicle.`);
      break;
    case 'unverified':
      warn(warnings, 'vin', 'error', vin.candidates.length > 1
        ? `The VIN read as ${reading.asRead} fails the VIN check digit, and more than one single-character fix passes. Check the VIN on the vehicle.`
        : `The VIN read as ${reading.asRead} fails the VIN check digit — at least one character is misread. Check the VIN on the vehicle.`);
      break;
    case 'nonstandard':
      warn(warnings, 'vin', 'info', 'Pre-1981 VIN — it has no check digit, so it could not be verified.');
      break;
    default:
      break;
  }

  // A VIN that passes can still be the wrong vehicle's, or be misread in a way the
  // check digit misses. The registration's printed year/make is an independent check.
  const reg = raw.registration || {};
  if (vin.value && (vin.status === 'verified' || vin.status === 'corrected')) {
    if (decoded && (decoded.year || decoded.make)) {
      const yearOff = isInt(reg.year, 1900, 2200) && decoded.year && decoded.year !== reg.year;
      const makeOff = reg.make && decoded.make && !sameMake(reg.make, decoded.make);
      if (yearOff || makeOff) {
        warn(warnings, 'vin', 'warning',
          `The registration says ${[reg.year, reg.make].filter(Boolean).join(' ')}, but this VIN decodes to ${[decoded.year, decoded.make, decoded.model].filter(Boolean).join(' ')}. A VIN character may be misread.`);
      }
    } else if (isInt(reg.year, 1981, 2200) && !modelYearsFromVin(vin.value, reg.year + 1).includes(reg.year)) {
      warn(warnings, 'vin', 'warning',
        `The VIN's model-year character (${vin.value[9]}) doesn't match the registration's ${reg.year}. A VIN character may be misread.`);
    }
  }
};

/**
 * @param {Object} raw     - aiService.extractVehicleScan output
 * @param {Object} opts
 * @param {Object} opts.vin     - resolveVin(raw)
 * @param {Object} [opts.decoded] - NHTSA decode of opts.vin.value, or null if it failed / wasn't attempted
 * @param {String} opts.today   - 'YYYY-MM-DD' in the business timezone
 */
const interpretScan = (raw = {}, { vin, decoded = null, today }) => {
  const warnings = [];
  const fields = {};
  const mileageRecords = [];
  const reg = raw.registration?.found ? raw.registration : {};
  const insp = raw.inspection?.found ? raw.inspection : {};
  const odo = raw.odometer?.found ? raw.odometer : {};
  const jamb = raw.doorJamb?.found ? raw.doorJamb : {};

  vinWarnings(vin, raw, decoded, warnings);

  // Year / make / model: NHTSA's decode is canonical; the registration is the fallback.
  if (decoded && decoded.year && decoded.make) {
    fields.year = decoded.year;
    fields.make = decoded.make;
    if (decoded.model) fields.model = decoded.model;
  } else if (isInt(reg.year, 1900, 2200) || reg.make) {
    if (isInt(reg.year, 1900, 2200)) fields.year = reg.year;
    if (reg.make) fields.make = reg.make;
    warn(warnings, 'model', 'info', vin.value
      ? 'The VIN could not be decoded, so year and make come from the registration. Enter the model.'
      : 'Year and make come from the registration. Enter the model.');
  }

  // Plate
  if (reg.plateNumber) {
    const plate = String(reg.plateNumber).toUpperCase().replace(/[\s-]/g, '');
    const docNumber = String(reg.documentNumber || '').toUpperCase().replace(/[\s-]/g, '');
    if (plate === docNumber) {
      warn(warnings, 'licensePlate', 'error', `${plate} is the registration's document number, not the plate. Enter the plate manually.`);
    } else if (plate.length < 2 || plate.length > MAX_PLATE_LENGTH) {
      warn(warnings, 'licensePlate', 'error', `${plate} doesn't look like a license plate. Enter the plate manually.`);
    } else {
      fields.licensePlate = plate;
    }
  }
  const state = String(reg.state || insp.state || '').toUpperCase().trim();
  if (/^[A-Z]{2}$/.test(state)) fields.licensePlateState = state;

  // Registration expiry
  if (reg.expirationMonth || reg.expirationYear) {
    const date = toDateString(reg.expirationYear, reg.expirationMonth, reg.expirationDay);
    if (date) {
      fields.registrationExpiration = date;
      if (date < today) warn(warnings, 'registrationExpiration', 'info', `The registration expired on ${moment(date).format('MM/DD/YYYY')}.`);
    }
  }

  // Inspection sticker: expiry + an estimated historical mileage reading
  const inspState = String(insp.state || state || '').toUpperCase().trim();
  if (insp.expirationMonth || insp.expirationYear) {
    const expiry = toDateString(insp.expirationYear, insp.expirationMonth, null);
    if (expiry) {
      fields.inspectionExpiration = expiry;
      if (expiry < today) warn(warnings, 'inspectionExpiration', 'info', `The inspection expired at the end of ${moment(expiry).format('MMMM YYYY')}.`);
    }
  }
  if (isInt(insp.mileage, 1, 1999999)) {
    const validity = INSPECTION_VALIDITY_MONTHS[inspState];
    const label = `${inspState ? `${inspState} ` : ''}sticker${fields.inspectionExpiration ? ` exp ${monthLabel(insp.expirationYear, insp.expirationMonth)}` : ''}`;
    let date = null;
    if (validity && fields.inspectionExpiration) {
      date = moment(fields.inspectionExpiration).subtract(validity, 'months').endOf('month').format('YYYY-MM-DD');
      if (date > today) {
        warn(warnings, 'mileageHistory', 'warning', 'The inspection date worked out from the sticker is in the future. Enter the date of the inspection.');
        date = null;
      }
    } else {
      warn(warnings, 'mileageHistory', 'info', `Found ${insp.mileage.toLocaleString('en-US')} mi on the inspection sticker. Enter the date of that inspection to add it to the mileage history.`);
    }
    mileageRecords.push({
      date,
      mileage: insp.mileage,
      source: 'Inspection sticker',
      notes: `Estimated mileage at date of last inspection (${label})`,
      estimated: true
    });
  }

  // Odometer photo: today's reading
  if (isInt(odo.reading, 1, 1999999)) {
    let miles = odo.reading;
    let notes = 'Odometer photo';
    if (odo.unit === 'km') {
      miles = Math.round(odo.reading * KM_TO_MI);
      notes = `Odometer photo: ${odo.reading.toLocaleString('en-US')} km, converted to miles`;
      warn(warnings, 'currentMileage', 'warning', `The odometer reads in kilometers (${odo.reading.toLocaleString('en-US')} km). It was converted to ${miles.toLocaleString('en-US')} mi.`);
    }
    fields.currentMileage = miles;
    mileageRecords.push({ date: today, mileage: miles, source: 'Odometer photo', notes, estimated: false });

    if (isInt(insp.mileage, 1, 1999999) && miles < insp.mileage) {
      warn(warnings, 'currentMileage', 'warning',
        `The odometer (${miles.toLocaleString('en-US')} mi) reads lower than the inspection sticker (${insp.mileage.toLocaleString('en-US')} mi). One of them is probably misread.`);
    }
  }

  // Door jamb label
  if (isInt(jamb.manufactureMonth, 1, 12) && isInt(jamb.manufactureYear, 1900, 2200)) {
    fields.buildDate = `${jamb.manufactureYear}-${String(jamb.manufactureMonth).padStart(2, '0')}`;
    const modelYear = fields.year;
    if (modelYear && (jamb.manufactureYear > modelYear || jamb.manufactureYear < modelYear - 2)) {
      warn(warnings, 'buildDate', 'warning', `A ${modelYear} model year built in ${monthLabel(jamb.manufactureYear, jamb.manufactureMonth)} is unusual. Check the date on the door jamb label.`);
    }
  }
  if (jamb.paintCode && String(jamb.paintCode).trim()) {
    fields.paintCode = String(jamb.paintCode).toUpperCase().trim();
  }
  const front = String(jamb.tireSizeFront || '').toUpperCase().trim();
  const rear = String(jamb.tireSizeRear || '').toUpperCase().trim();
  if (front) fields.tireSize = rear && rear !== front ? `F: ${front} / R: ${rear}` : front;

  return {
    vin: {
      value: vin.value,
      status: vin.status,
      candidates: vin.candidates,
      readings: vin.readings.map(({ label, asRead, normalized, valid }) => ({ label, asRead, normalized, valid }))
    },
    fields,
    mileageRecords,
    warnings,
    found: {
      registration: !!raw.registration?.found,
      inspection: !!raw.inspection?.found,
      odometer: !!raw.odometer?.found,
      doorJamb: !!raw.doorJamb?.found
    },
    notes: raw.notes || null
  };
};

module.exports = { resolveVin, interpretScan, INSPECTION_VALIDITY_MONTHS };
