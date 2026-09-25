import React, { useEffect, useRef, useState } from 'react';
import moment from 'moment';
import Button from '../common/Button';
import Card from '../common/Card';
import vehicleScanService from '../../services/vehicleScanService';

/**
 * Photo-based vehicle entry: up to three photos (registration/stickers, odometer,
 * door jamb) → the server reads them → the user reviews every value before any
 * of it touches the form. Nothing is applied silently: each value is a checkbox,
 * and anything the server flagged as doubtful starts unchecked.
 *
 * Props:
 *   currentValues — the form's values, to show what a scan would replace
 *   onApply({ fields, mileageRecords }) — the values the user accepted
 */

const SLOTS = [
  { key: 'registration', title: 'Registration & inspection', hint: 'Windshield stickers, or the registration card', icon: 'fa-id-card' },
  { key: 'odometer', title: 'Odometer', hint: 'Instrument cluster showing total mileage', icon: 'fa-tachometer-alt' },
  { key: 'doorJamb', title: 'Door jamb label', hint: 'Build date, tire size, paint code', icon: 'fa-tag' }
];

const FIELD_ORDER = [
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

const LEVEL_STYLES = {
  error: 'text-red-700',
  warning: 'text-amber-700',
  info: 'text-gray-600'
};
const LEVEL_ICONS = {
  error: 'fa-exclamation-circle',
  warning: 'fa-exclamation-triangle',
  info: 'fa-info-circle'
};

const isBlank = (v) => v === undefined || v === null || v === '' || String(v).toUpperCase() === 'N/A';

const displayValue = (field, value) => {
  if (isBlank(value)) return '—';
  if (field === 'registrationExpiration' || field === 'inspectionExpiration') {
    return moment(String(value).slice(0, 10), 'YYYY-MM-DD').format('MM/DD/YYYY');
  }
  if (field === 'buildDate') return moment(value, 'YYYY-MM').format('MM/YYYY');
  if (field === 'currentMileage') return `${Number(value).toLocaleString()} mi`;
  return String(value);
};

const sameValue = (field, a, b) => {
  if (isBlank(a) || isBlank(b)) return false;
  if (field === 'registrationExpiration' || field === 'inspectionExpiration') {
    return String(a).slice(0, 10) === String(b).slice(0, 10);
  }
  return String(a).toUpperCase() === String(b).toUpperCase();
};

const isTouchDevice = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

const Warning = ({ warning }) => (
  <p className={`text-xs mt-1 ${LEVEL_STYLES[warning.level] || LEVEL_STYLES.info}`}>
    <i className={`fas ${LEVEL_ICONS[warning.level] || LEVEL_ICONS.info} mr-1`}></i>
    {warning.message}
  </p>
);

const PhotoSlot = ({ slot, file, preview, onPick, onClear, disabled, touch }) => {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const pick = (e) => {
    const picked = e.target.files?.[0];
    if (picked) onPick(slot.key, picked);
    e.target.value = '';
  };

  return (
    <div className={`border rounded-lg p-3 flex gap-3 items-center ${file ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
      <div className="w-16 h-16 flex-shrink-0 rounded bg-gray-100 overflow-hidden flex items-center justify-center">
        {preview
          ? <img src={preview} alt={slot.title} className="w-full h-full object-cover" />
          : <i className={`fas ${slot.icon} text-2xl text-gray-400`}></i>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {file && <i className="fas fa-check-circle text-green-600 mr-1"></i>}
          {slot.title}
        </p>
        <p className="text-xs text-gray-500">{slot.hint}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {touch && (
            <Button type="button" size="sm" variant={file ? 'light' : 'primary'} disabled={disabled} onClick={() => cameraRef.current?.click()}>
              <i className="fas fa-camera mr-1"></i>{file ? 'Retake' : 'Take photo'}
            </Button>
          )}
          <Button type="button" size="sm" variant="light" disabled={disabled} onClick={() => libraryRef.current?.click()}>
            <i className="fas fa-image mr-1"></i>{touch ? 'Library' : (file ? 'Replace' : 'Choose photo')}
          </Button>
          {file && (
            <button type="button" className="text-xs text-gray-500 hover:text-red-600" disabled={disabled} onClick={() => onClear(slot.key)}>
              Remove
            </button>
          )}
        </div>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
};

const VehicleScanner = ({ currentValues = {}, onApply }) => {
  const [photos, setPhotos] = useState({});
  const [previews, setPreviews] = useState({});
  const [phase, setPhase] = useState('capture'); // capture | scanning | review | applied
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [checked, setChecked] = useState({});
  const [vinChoice, setVinChoice] = useState(null);
  const [records, setRecords] = useState([]);
  const [appliedCount, setAppliedCount] = useState(0);
  const touch = isTouchDevice();

  // Release preview object URLs when they're replaced or the scanner unmounts.
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  useEffect(() => () => Object.values(previewsRef.current).forEach(url => URL.revokeObjectURL(url)), []);

  const setPhoto = (key, file) => {
    setPhotos(prev => ({ ...prev, [key]: file }));
    setPreviews(prev => {
      if (prev[key]) URL.revokeObjectURL(prev[key]);
      return { ...prev, [key]: file ? URL.createObjectURL(file) : undefined };
    });
    setError(null);
  };

  const photoCount = Object.values(photos).filter(Boolean).length;

  const scan = async () => {
    setPhase('scanning');
    setError(null);
    try {
      const data = await vehicleScanService.scan(photos);
      prepareReview(data);
      setResult(data);
      setPhase('review');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not read the photos. Check your connection and try again.');
      setPhase('capture');
    }
  };

  const prepareReview = (data) => {
    const errorFields = new Set(data.warnings.filter(w => w.level === 'error').map(w => w.field));
    const initial = {};

    Object.entries(data.fields).forEach(([field, value]) => {
      const current = currentValues[field];
      let include = !errorFields.has(field);
      if (include && !isBlank(current) && !sameValue(field, current, value) && FIXED_FIELDS.has(field)) include = false;
      if (field === 'currentMileage' && !isBlank(current) && Number(value) < Number(current)) include = false;
      initial[field] = include;
    });

    // VIN: only a check-digit-verified reading (or a pre-1981 one) is pre-selected.
    const { vin } = data;
    const vinSafe = vin.status === 'verified' || vin.status === 'nonstandard';
    const currentVin = currentValues.vin;
    // With several possibilities the user must pick one; a lone as-read VIN is
    // shown (unchecked) so it can still be accepted after checking the vehicle.
    const vinDefault = vin.status === 'conflict' || (vin.status === 'unverified' && vin.candidates.length > 0)
      ? null
      : vin.value;
    setVinChoice(vinDefault);
    initial.vin = vinSafe && !!vin.value && (isBlank(currentVin) || sameValue('vin', currentVin, vin.value));

    const history = currentValues.mileageHistory || [];
    setRecords(data.mileageRecords.map(r => ({
      ...r,
      include: !!r.date && !history.some(h => Number(h.mileage) === Number(r.mileage))
    })));
    setChecked(initial);
  };

  const vinOptions = () => {
    if (!result) return [];
    const { vin } = result;
    const opts = [];
    vin.candidates.forEach(c => opts.push({ value: c, label: vin.status === 'conflict' ? vin.readings.filter(r => r.normalized === c).map(r => r.label).join(', ') : 'passes check digit' }));
    if (vin.status === 'unverified') {
      vin.readings.forEach(r => {
        if (!opts.some(o => o.value === r.normalized)) opts.push({ value: r.normalized, label: `as read (${r.label}) — fails check digit` });
      });
    }
    return opts;
  };

  const apply = () => {
    const fields = {};
    Object.entries(result.fields).forEach(([field, value]) => {
      if (checked[field]) fields[field] = value;
    });
    if (checked.vin && vinChoice) fields.vin = vinChoice;
    const mileageRecords = records
      .filter(r => r.include && r.date)
      .map(({ date, mileage, source, notes }) => ({ date, mileage, source, notes }));
    onApply?.({ fields, mileageRecords });
    setAppliedCount(Object.keys(fields).length + mileageRecords.length);
    setPhase('applied');
  };

  const reset = () => {
    Object.keys(photos).forEach(key => setPhoto(key, null));
    setResult(null);
    setError(null);
    setPhase('capture');
  };

  // ── Capture ──────────────────────────────────────────────────────────────
  const renderCapture = () => (
    <div className="space-y-3">
      <p className="text-sm text-gray-700">
        Photograph whatever you have — each photo is optional. The scan reads the VIN, plate, expiry dates,
        mileage, build date, tire size and paint code, and you review everything before it's filled in.
      </p>
      {SLOTS.map(slot => (
        <PhotoSlot
          key={slot.key}
          slot={slot}
          file={photos[slot.key]}
          preview={previews[slot.key]}
          onPick={setPhoto}
          onClear={(key) => setPhoto(key, null)}
          disabled={phase === 'scanning'}
          touch={touch}
        />
      ))}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="primary" onClick={scan} disabled={photoCount === 0 || phase === 'scanning'}>
          {phase === 'scanning'
            ? <><i className="fas fa-spinner fa-spin mr-2"></i>Reading photos…</>
            : <><i className="fas fa-magic mr-2"></i>Read {photoCount === 1 ? '1 photo' : `${photoCount} photos`}</>}
        </Button>
      </div>
    </div>
  );

  // ── Review ───────────────────────────────────────────────────────────────
  const renderReview = () => {
    const warningsFor = (field) => result.warnings.filter(w => w.field === field);
    const rowFields = new Set([...Object.keys(result.fields), 'vin', 'mileageHistory']);
    const general = result.warnings.filter(w => !rowFields.has(w.field));
    const options = vinOptions();
    const showVin = result.vin.status !== 'none';
    const rows = FIELD_ORDER.filter(([field]) => field === 'vin' ? showVin : result.fields[field] !== undefined);

    return (
      <div className="space-y-3">
        {(general.length > 0 || result.notes) && (
          <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
            {general.map((w, i) => <Warning key={i} warning={w} />)}
            {result.notes && <Warning warning={{ level: 'info', message: `Scanner note: ${result.notes}` }} />}
          </div>
        )}

        {rows.length === 0 && records.length === 0 && (
          <p className="text-sm text-gray-600">Nothing usable was found in these photos.</p>
        )}

        {rows.length > 0 && (
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white">
            {rows.map(([field, label]) => {
              const isVin = field === 'vin';
              const value = isVin ? vinChoice : result.fields[field];
              const current = currentValues[field];
              const replaces = !isBlank(current) && !isBlank(value) && !sameValue(field, current, value);
              return (
                <div key={field} className="px-3 py-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={!!checked[field] && !isBlank(value)}
                      disabled={isBlank(value)}
                      onChange={(e) => setChecked(prev => ({ ...prev, [field]: e.target.checked }))}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-gray-500">{label}</span>
                      <span className={`block text-sm font-medium text-gray-900 break-all ${isVin ? 'font-mono' : ''}`}>
                        {displayValue(field, value)}
                      </span>
                      {replaces && (
                        <span className="block text-xs text-gray-500">Replaces {displayValue(field, current)}</span>
                      )}
                    </span>
                  </label>
                  {isVin && options.length > 1 && (
                    <div className="ml-7 mt-1 space-y-1">
                      {options.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="vinChoice"
                            checked={vinChoice === opt.value}
                            onChange={() => { setVinChoice(opt.value); setChecked(prev => ({ ...prev, vin: true })); }}
                          />
                          <span className="font-mono">{opt.value}</span>
                          <span className="text-xs text-gray-500">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="ml-7">
                    {warningsFor(field).map((w, i) => <Warning key={i} warning={w} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {records.length > 0 && (
          <div className="border border-gray-200 rounded-lg bg-white px-3 py-2">
            <p className="text-xs text-gray-500 mb-1">Add to mileage history</p>
            {records.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 py-1">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={r.include && !!r.date}
                  disabled={!r.date}
                  onChange={(e) => setRecords(prev => prev.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))}
                />
                <input
                  type="date"
                  value={r.date || ''}
                  onChange={(e) => setRecords(prev => prev.map((x, j) => j === i ? { ...x, date: e.target.value, include: !!e.target.value } : x))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <span className="text-sm font-medium text-gray-900">{Number(r.mileage).toLocaleString()} mi</span>
                <span className="text-xs text-gray-500 basis-full sm:basis-auto">{r.notes}</span>
              </div>
            ))}
            {warningsFor('mileageHistory').map((w, i) => <Warning key={i} warning={w} />)}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="light" onClick={reset}>Start over</Button>
          <Button type="button" variant="primary" onClick={apply}>
            <i className="fas fa-check mr-2"></i>Fill in selected
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-blue-50 border-blue-200">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            <i className="fas fa-camera mr-2 text-blue-600"></i>Scan Vehicle
          </h3>
          {phase === 'review' && <span className="text-xs text-gray-500">Review before filling in</span>}
        </div>

        {(phase === 'capture' || phase === 'scanning') && renderCapture()}
        {phase === 'review' && result && renderReview()}
        {phase === 'applied' && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-green-700">
              <i className="fas fa-check-circle mr-1"></i>
              Filled in {appliedCount} {appliedCount === 1 ? 'value' : 'values'}. Check the form, then save.
            </p>
            <Button type="button" size="sm" variant="light" onClick={reset}>Scan again</Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default VehicleScanner;
