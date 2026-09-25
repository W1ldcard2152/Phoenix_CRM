import { formatDateForInput } from '../../../utils/formatters';
import { vinOptions } from './useScanReview';

/** Helpers shared by the office Scan Vehicle page and the technician scan. */

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export const normalizePlate = (p) => String(p || '').toUpperCase().replace(/[\s-]/g, '');

export const vehicleName = (v) => [v?.year, v?.make, v?.model].filter(Boolean).join(' ');

// The scan result minus what a mileage prompt handles: the odometer reading
// becomes the prompt's starting value instead of a review checkbox.
export const forReview = (data) => {
  const { currentMileage, ...fields } = data.fields;
  return {
    ...data,
    fields,
    mileageRecords: data.mileageRecords.filter(r => r.source !== 'Odometer photo')
  };
};

// Values on file, in the shapes the scan uses, so a review can compare them.
export const valuesOnFile = (vehicle) => ({
  vin: vehicle.vin,
  year: vehicle.year,
  make: vehicle.make,
  model: vehicle.model,
  licensePlate: vehicle.licensePlate,
  licensePlateState: vehicle.licensePlateState,
  registrationExpiration: formatDateForInput(vehicle.registrationExpiration),
  inspectionExpiration: formatDateForInput(vehicle.inspectionExpiration),
  buildDate: vehicle.buildDate,
  paintCode: vehicle.paintCode,
  tireSize: vehicle.tireSize,
  mileageHistory: vehicle.mileageHistory || []
});

// VIN options for a confirm step: the scanner's candidates plus every reading
// as printed, so the user can always accept what's on the sticker.
export const confirmOptions = (data) => {
  const opts = data.vin.status === 'corrected'
    ? [{ value: data.vin.value, label: 'suggested fix — passes check digit' }]
    : vinOptions(data.vin);
  data.vin.readings.forEach(r => {
    if (!opts.some(o => o.value === r.normalized)) {
      opts.push({ value: r.normalized, label: `as read (${r.label})${r.valid ? '' : ' — fails check digit'}` });
    }
  });
  return opts;
};

/**
 * Merge a follow-up scan (odometer / door jamb) into the first one. The first
 * scan wins where both read the same field; the follow-up adds what only it
 * can see. Its VIN (door jamb) is used only when the first scan had none.
 */
export const mergeScans = (first, second) => {
  const warnings = [...first.warnings];
  second.warnings.forEach(w => {
    if (!warnings.some(x => x.message === w.message)) warnings.push(w);
  });
  return {
    vin: first.vin.status === 'none' ? second.vin : first.vin,
    fields: { ...second.fields, ...first.fields, ...(second.fields.currentMileage !== undefined ? { currentMileage: second.fields.currentMileage } : {}) },
    mileageRecords: [...first.mileageRecords, ...second.mileageRecords],
    warnings,
    found: Object.fromEntries(Object.keys(first.found).map(k => [k, first.found[k] || second.found[k]])),
    notes: [first.notes, second.notes].filter(Boolean).join(' ') || null
  };
};
