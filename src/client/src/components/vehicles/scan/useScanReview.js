import { useState } from 'react';
import moment from 'moment';

/**
 * Review state for a vehicle-scan result: which values the user accepts, which
 * VIN they chose, and which mileage records to add. Shared by the form scanner
 * (VehicleScanner) and the Scan Vehicle page.
 */

export const FIELD_ORDER = [
  ['vin', 'VIN'],
  ['year', 'Year'],
  ['make', 'Make'],
  ['model', 'Model'],
  ['licensePlate', 'License plate'],
  ['licensePlateState', 'Plate state'],
  ['currentMileage', 'Current mileage'],
  ['registrationExpiration', 'Registration expires'],
  ['inspectionExpiration', 'Inspection expires'],
  ['buildDate', 'Build date'],
  ['paintCode', 'Paint code'],
  ['tireSize', 'Tire size']
];

// Facts about the vehicle itself. When a scan disagrees with a value already on
// file, the saved value is more likely right, so the replacement starts unchecked.
const FIXED_FIELDS = new Set(['vin', 'year', 'make', 'model', 'buildDate', 'paintCode']);

export const isBlank = (v) => v === undefined || v === null || v === '' || String(v).toUpperCase() === 'N/A';

export const displayValue = (field, value) => {
  if (isBlank(value)) return '—';
  if (field === 'registrationExpiration' || field === 'inspectionExpiration') {
    return moment(String(value).slice(0, 10), 'YYYY-MM-DD').format('MM/DD/YYYY');
  }
  if (field === 'buildDate') return moment(value, 'YYYY-MM').format('MM/YYYY');
  if (field === 'currentMileage') return `${Number(value).toLocaleString()} mi`;
  return String(value);
};

export const sameValue = (field, a, b) => {
  if (isBlank(a) || isBlank(b)) return false;
  if (field === 'registrationExpiration' || field === 'inspectionExpiration') {
    return String(a).slice(0, 10) === String(b).slice(0, 10);
  }
  return String(a).toUpperCase() === String(b).toUpperCase();
};

/** VINs the user can pick between when the scan couldn't settle on one. */
export const vinOptions = (vin) => {
  const opts = vin.candidates.map(c => ({
    value: c,
    label: vin.status === 'conflict'
      ? vin.readings.filter(r => r.normalized === c).map(r => r.label).join(', ')
      : 'passes check digit'
  }));
  if (vin.status === 'unverified') {
    vin.readings.forEach(r => {
      if (!opts.some(o => o.value === r.normalized)) {
        opts.push({ value: r.normalized, label: `as read (${r.label}) — fails check digit` });
      }
    });
  }
  return opts;
};

const buildReview = (result, currentValues) => {
  const errorFields = new Set(result.warnings.filter(w => w.level === 'error').map(w => w.field));
  const checked = {};

  Object.entries(result.fields).forEach(([field, value]) => {
    const current = currentValues[field];
    let include = !errorFields.has(field);
    if (include && !isBlank(current) && !sameValue(field, current, value) && FIXED_FIELDS.has(field)) include = false;
    if (field === 'currentMileage' && !isBlank(current) && Number(value) < Number(current)) include = false;
    checked[field] = include;
  });

  // VIN: only a check-digit-verified reading (or a pre-1981 one) is pre-selected.
  // With several possibilities the user must pick one; a lone as-read VIN is
  // shown (unchecked) so it can still be accepted after checking the vehicle.
  const { vin } = result;
  const vinSafe = vin.status === 'verified' || vin.status === 'nonstandard';
  const vinChoice = vin.status === 'conflict' || (vin.status === 'unverified' && vin.candidates.length > 0)
    ? null
    : vin.value;
  checked.vin = vinSafe && !!vin.value && (isBlank(currentValues.vin) || sameValue('vin', currentValues.vin, vin.value));

  const history = currentValues.mileageHistory || [];
  const records = result.mileageRecords.map(r => ({
    ...r,
    include: !!r.date && !history.some(h => Number(h.mileage) === Number(r.mileage))
  }));

  return { result, checked, vinChoice, records };
};

export const useScanReview = (result, currentValues = {}) => {
  const [state, setState] = useState(null);

  // Reset whenever a new scan result arrives (derived state, set during render).
  if (result && state?.result !== result) {
    setState(buildReview(result, currentValues));
  }
  const current = state && state.result === result ? state : null;

  const update = (key) => (valueOrFn) => setState(prev => ({
    ...prev,
    [key]: typeof valueOrFn === 'function' ? valueOrFn(prev[key]) : valueOrFn
  }));

  return {
    ready: !!current,
    checked: current?.checked || {},
    vinChoice: current?.vinChoice ?? null,
    records: current?.records || [],
    setChecked: update('checked'),
    setVinChoice: update('vinChoice'),
    setRecords: update('records'),
    /** The accepted values, minus any fields in `exclude`. */
    collect: (exclude = []) => {
      if (!current) return { fields: {}, mileageRecords: [] };
      const fields = {};
      Object.entries(result.fields).forEach(([field, value]) => {
        if (current.checked[field] && !exclude.includes(field)) fields[field] = value;
      });
      if (current.checked.vin && current.vinChoice && !exclude.includes('vin')) fields.vin = current.vinChoice;
      const mileageRecords = current.records
        .filter(r => r.include && r.date)
        .map(({ date, mileage, source, notes }) => ({ date, mileage, source, notes }));
      return { fields, mileageRecords };
    }
  };
};
