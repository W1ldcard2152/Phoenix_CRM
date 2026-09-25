/**
 * VIN check digit + vehicle-scan interpretation. Pure — no AI, no network.
 */
const {
  normalizeVin, vinCheckDigit, isValidVin, lookalikeCorrections, modelYearsFromVin
} = require('../../utils/vinUtils');
const { resolveVin, interpretScan } = require('../../utils/vehicleScanInterpreter');

const GOOD_VIN = '1GKDT13S672104751'; // 2007 GMC, check digit 6
const S_AS_5 = '1GKDT135672104751';   // position 8 misread S → 5
const OTHER_VIN = '1HGCM82633A004352'; // a different, valid VIN

const TODAY = '2026-09-24';

const nothing = { found: false };
const scan = (overrides = {}) => ({
  registration: nothing, inspection: nothing, odometer: nothing, doorJamb: nothing, notes: null,
  ...overrides
});
const nyRegistration = (extra = {}) => ({
  found: true, documentType: 'windshield_sticker', state: 'NY', vin: GOOD_VIN,
  plateNumber: 'MDF3054', documentNumber: 'JM831415', plateClass: 'PAS',
  year: 2007, make: 'GMC', makeAsPrinted: 'GMC', bodyType: 'SUBN',
  expirationMonth: 3, expirationDay: 3, expirationYear: 2028,
  ...extra
});
const nyInspection = (extra = {}) => ({
  found: true, state: 'NY', vin: GOOD_VIN, mileage: 125767, expirationMonth: 3, expirationYear: 2027,
  ...extra
});
const decodedGmc = { year: 2007, make: 'GMC', model: 'Envoy' };

const run = (raw, decoded = decodedGmc, today = TODAY) =>
  interpretScan(raw, { vin: resolveVin(raw), decoded, today });

describe('vinUtils', () => {
  it('computes the position-9 check digit', () => {
    expect(vinCheckDigit(GOOD_VIN)).toBe('6');
    expect(isValidVin(GOOD_VIN)).toBe(true);
    expect(isValidVin(OTHER_VIN)).toBe(true);
  });

  it('rejects a single-character misread', () => {
    expect(isValidVin(S_AS_5)).toBe(false);
  });

  it('maps I/O/Q (never legal) to the digits they are misreads of', () => {
    expect(normalizeVin('1gkdt13s672I04751')).toBe(GOOD_VIN);
    expect(normalizeVin(' 1GKDT13S67210475 1 ')).toBe(GOOD_VIN);
  });

  it('finds the one lookalike fix that passes the check digit', () => {
    expect(lookalikeCorrections(S_AS_5)).toEqual([GOOD_VIN]);
    expect(lookalikeCorrections(GOOD_VIN)).toEqual([]);
  });

  it('decodes position 10 to the possible model years', () => {
    expect(modelYearsFromVin(GOOD_VIN, 2027)).toEqual([2007]);
    expect(modelYearsFromVin('WBA8E9C58BK123456', 2027)).toEqual([2011, 1981]);
  });
});

describe('resolveVin', () => {
  it('verifies when the readings pass and agree', () => {
    const vin = resolveVin(scan({ registration: nyRegistration(), inspection: nyInspection() }));
    expect(vin.status).toBe('verified');
    expect(vin.value).toBe(GOOD_VIN);
  });

  it('trusts the passing reading when another document was misread', () => {
    const vin = resolveVin(scan({ registration: nyRegistration({ vin: S_AS_5 }), inspection: nyInspection() }));
    expect(vin.status).toBe('verified');
    expect(vin.value).toBe(GOOD_VIN);
  });

  it('corrects a lone misread only as a suggestion', () => {
    const vin = resolveVin(scan({ registration: nyRegistration({ vin: S_AS_5 }) }));
    expect(vin.status).toBe('corrected');
    expect(vin.value).toBe(GOOD_VIN);
  });

  it('flags two different valid VINs as a conflict', () => {
    const vin = resolveVin(scan({ registration: nyRegistration(), inspection: nyInspection({ vin: OTHER_VIN }) }));
    expect(vin.status).toBe('conflict');
    expect(vin.value).toBeNull();
    expect(vin.candidates).toEqual([GOOD_VIN, OTHER_VIN]);
  });

  it('leaves an uncorrectable VIN unverified', () => {
    const vin = resolveVin(scan({ registration: nyRegistration({ vin: '1GKDT13S67210475' }) }));
    expect(vin.status).toBe('unverified');
  });

  it('skips the check digit for pre-1981 vehicles', () => {
    const vin = resolveVin(scan({ registration: nyRegistration({ year: 1972, vin: '124379N6O1234' }) }));
    expect(vin.status).toBe('nonstandard');
    expect(vin.value).toBe('124379N6O1234');
  });

  it('reports none when no VIN is visible', () => {
    expect(resolveVin(scan()).status).toBe('none');
  });
});

describe('interpretScan', () => {
  it('reads the NY windshield stickers end to end', () => {
    const result = run(scan({ registration: nyRegistration(), inspection: nyInspection() }));
    expect(result.fields).toEqual({
      year: 2007,
      make: 'GMC',
      model: 'Envoy',
      licensePlate: 'MDF3054',
      licensePlateState: 'NY',
      registrationExpiration: '2028-03-03',
      inspectionExpiration: '2027-03-31'
    });
    expect(result.mileageRecords).toEqual([{
      date: '2026-03-31',
      mileage: 125767,
      source: 'Inspection sticker',
      notes: 'Estimated mileage at date of last inspection (NY sticker exp 03/2027)',
      estimated: true
    }]);
    expect(result.warnings).toEqual([]);
  });

  it('dates the inspection to the last day of the month, 12 months before expiry', () => {
    const result = run(scan({ inspection: nyInspection({ expirationMonth: 3, expirationYear: 2028 }) }), null, '2027-06-01');
    expect(result.mileageRecords[0].date).toBe('2027-03-31');
    const feb = run(scan({ inspection: nyInspection({ expirationMonth: 2, expirationYear: 2025 }) }), null);
    expect(feb.mileageRecords[0].date).toBe('2024-02-29');
  });

  it('leaves the inspection date blank for a state whose validity is unknown', () => {
    const result = run(scan({ inspection: nyInspection({ state: 'PA' }) }), null);
    expect(result.fields.inspectionExpiration).toBe('2027-03-31');
    expect(result.mileageRecords[0].date).toBeNull();
    expect(result.warnings.some(w => w.field === 'mileageHistory')).toBe(true);
  });

  it('never takes the document number as the plate', () => {
    const result = run(scan({ registration: nyRegistration({ plateNumber: 'JM831415' }) }));
    expect(result.fields.licensePlate).toBeUndefined();
    expect(result.warnings).toContainEqual(expect.objectContaining({ field: 'licensePlate', level: 'error' }));
  });

  it('normalizes plate spacing and dashes', () => {
    const result = run(scan({ registration: nyRegistration({ plateNumber: 'mdf-3054' }) }));
    expect(result.fields.licensePlate).toBe('MDF3054');
  });

  it('escalates a corrected VIN', () => {
    const result = run(scan({ registration: nyRegistration({ vin: S_AS_5 }) }));
    expect(result.vin.status).toBe('corrected');
    const warning = result.warnings.find(w => w.field === 'vin');
    expect(warning.level).toBe('error');
    expect(warning.message).toContain('character 8: 5 → S');
  });

  it('warns when the VIN decodes to a different vehicle than the registration says', () => {
    const result = run(scan({ registration: nyRegistration() }), { year: 2011, make: 'Chevrolet', model: 'Tahoe' });
    expect(result.warnings).toContainEqual(expect.objectContaining({ field: 'vin', level: 'warning' }));
  });

  it('treats DMV make spellings as the same make', () => {
    const result = run(
      scan({ registration: nyRegistration({ make: 'Mercedes-Benz' }) }),
      { year: 2007, make: 'Mercedes Benz', model: 'E350' }
    );
    expect(result.warnings).toEqual([]);
  });

  it('falls back to the registration year/make when NHTSA is unavailable', () => {
    const result = run(scan({ registration: nyRegistration() }), null);
    expect(result.fields).toMatchObject({ year: 2007, make: 'GMC' });
    expect(result.fields.model).toBeUndefined();
    expect(result.warnings).toContainEqual(expect.objectContaining({ field: 'model', level: 'info' }));
  });

  it('adds today’s odometer reading and flags one lower than the inspection', () => {
    const result = run(scan({ inspection: nyInspection(), odometer: { found: true, reading: 120000, unit: 'mi' } }), null);
    expect(result.fields.currentMileage).toBe(120000);
    expect(result.mileageRecords).toContainEqual(expect.objectContaining({ date: TODAY, mileage: 120000, source: 'Odometer photo' }));
    expect(result.warnings).toContainEqual(expect.objectContaining({ field: 'currentMileage', level: 'warning' }));
  });

  it('converts a kilometer odometer to miles', () => {
    const result = run(scan({ odometer: { found: true, reading: 100000, unit: 'km' } }), null);
    expect(result.fields.currentMileage).toBe(62137);
  });

  it('reads the door jamb label', () => {
    const result = run(scan({
      registration: nyRegistration(),
      doorJamb: { found: true, vin: GOOD_VIN, manufactureMonth: 8, manufactureYear: 2006, paintCode: ' 41u ', tireSizeFront: 'P245/65R17', tireSizeRear: 'P245/65R17' }
    }));
    expect(result.fields).toMatchObject({ buildDate: '2006-08', paintCode: '41U', tireSize: 'P245/65R17' });
    expect(result.warnings).toEqual([]);
  });

  it('shows staggered tire sizes and flags an implausible build date', () => {
    const result = run(scan({
      registration: nyRegistration(),
      doorJamb: { found: true, vin: null, manufactureMonth: 5, manufactureYear: 2012, tireSizeFront: '245/40R18', tireSizeRear: '275/35R18' }
    }));
    expect(result.fields.tireSize).toBe('F: 245/40R18 / R: 275/35R18');
    expect(result.warnings).toContainEqual(expect.objectContaining({ field: 'buildDate' }));
  });

  it('notes an expired registration and inspection', () => {
    const result = run(scan({ registration: nyRegistration(), inspection: nyInspection() }), decodedGmc, '2028-06-01');
    expect(result.warnings.map(w => w.field)).toEqual(expect.arrayContaining(['registrationExpiration', 'inspectionExpiration']));
  });
});
