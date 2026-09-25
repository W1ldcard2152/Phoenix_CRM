import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import ScanCapture from '../../components/vehicles/scan/ScanCapture';
import ScanReview, { ScanWarning } from '../../components/vehicles/scan/ScanReview';
import VinConfirm from '../../components/vehicles/scan/VinConfirm';
import { useScanReview, displayValue } from '../../components/vehicles/scan/useScanReview';
import {
  VIN_PATTERN, vehicleName, forReview, valuesOnFile, confirmOptions, mergeScans
} from '../../components/vehicles/scan/scanHelpers';
import vehicleCheckInService from '../../services/vehicleCheckInService';

/**
 * Technician check-in: scan the registration from the lot.
 *
 *   On file     → update what the scan found, add the odometer reading, done.
 *   Not on file → add odometer + door jamb photos and send it to the office
 *                 (the technician's service writer) to match with an owner.
 *
 * Technicians never see customers: every lookup here returns the vehicle only.
 */

// What a technician's scan may change on a vehicle on file (mirrors the server).
const SCAN_FIELDS = ['licensePlate', 'licensePlateState', 'registrationExpiration', 'inspectionExpiration', 'buildDate', 'paintCode', 'tireSize'];
const FILL_IF_BLANK = ['vin', 'year', 'make', 'model'];

const SUMMARY_FIELDS = [
  ['licensePlate', 'Plate'],
  ['licensePlateState', 'State'],
  ['registrationExpiration', 'Registration expires'],
  ['inspectionExpiration', 'Inspection expires'],
  ['buildDate', 'Build date'],
  ['tireSize', 'Tires'],
  ['paintCode', 'Paint']
];

const inputCls = 'block w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-base sm:text-sm';

const isBlank = (v) => v === undefined || v === null || v === '' || String(v).toUpperCase() === 'N/A';

// Only the scanned values a technician may apply to this vehicle.
const forTechReview = (data, vehicle) => {
  const base = forReview(data);
  const fields = {};
  Object.entries(base.fields).forEach(([k, v]) => {
    if (SCAN_FIELDS.includes(k) || (FILL_IF_BLANK.includes(k) && isBlank(vehicle[k]))) fields[k] = v;
  });
  return { ...base, fields };
};

const TechnicianVehicleScan = () => {
  // capture → (looking) → confirmVin? → onFile | newVehicle → done
  const [phase, setPhase] = useState('capture');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [scan, setScan] = useState(null);
  const [vin, setVin] = useState('');
  const [vinPick, setVinPick] = useState('');
  const [vinTyped, setVinTyped] = useState('');
  const [vinMatches, setVinMatches] = useState({});

  const [vehicle, setVehicle] = useState(null);
  const [reviewResult, setReviewResult] = useState(null);
  const [currentValues, setCurrentValues] = useState({});
  const review = useScanReview(reviewResult, currentValues);

  const [followUpRead, setFollowUpRead] = useState(false); // odometer (+ door jamb) photo read
  const [followUpWarnings, setFollowUpWarnings] = useState([]);
  const [mileage, setMileage] = useState('');
  const [mileageFromPhoto, setMileageFromPhoto] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(null);

  const reset = () => {
    setPhase('capture');
    setError(null);
    setScan(null);
    setVin('');
    setVinPick('');
    setVinTyped('');
    setVinMatches({});
    setVehicle(null);
    setReviewResult(null);
    setCurrentValues({});
    setFollowUpRead(false);
    setFollowUpWarnings([]);
    setMileage('');
    setMileageFromPhoto(false);
    setNote('');
    setDone(null);
  };

  const takeMileage = (data) => {
    if (data.fields.currentMileage !== undefined) {
      setMileage(String(data.fields.currentMileage));
      setMileageFromPhoto(true);
    }
  };

  // ── Finding the vehicle ──────────────────────────────────────────────────
  const openOnFile = (found, data) => {
    setVehicle(found);
    setCurrentValues(valuesOnFile(found));
    setReviewResult(forTechReview(data, found));
    setScan(data);
    takeMileage(data);
    setPhase('onFile');
  };

  const openNotOnFile = (chosenVin, data) => {
    setVehicle(null);
    setVin(chosenVin || '');
    setScan(data);
    takeMileage(data);
    setPhase('newVehicle');
  };

  const lookup = async (params, chosenVin, data) => {
    setPhase('looking');
    setError(null);
    try {
      const result = await vehicleCheckInService.lookup(params);
      if (result.exists) openOnFile(result.vehicle, data);
      else if (params.vin) openNotOnFile(chosenVin, data);
      return result.exists;
    } catch {
      setError('Could not look the vehicle up. Check your connection and try again.');
      setPhase('confirmVin');
      return null;
    }
  };

  const handleResult = async (data) => {
    setScan(data);
    setError(null);
    const status = data.vin.status;

    if (status === 'verified' || status === 'nonstandard') {
      lookup({ vin: data.vin.value }, data.vin.value, data);
      return;
    }
    if (status === 'none' && data.fields.licensePlate) {
      const exists = await lookup({ plate: data.fields.licensePlate, state: data.fields.licensePlateState }, '', data);
      if (exists) return;
    }

    setPhase('looking');
    const options = confirmOptions(data);
    const matches = {};
    await Promise.all(options.map(async (opt) => {
      try {
        const result = await vehicleCheckInService.lookup({ vin: opt.value });
        if (result.exists) matches[opt.value] = `On file: ${vehicleName(result.vehicle)}`;
      } catch {
        // still selectable
      }
    }));
    setVinMatches(matches);
    const onFile = options.filter(o => matches[o.value]);
    setVinPick(onFile.length === 1 ? onFile[0].value : (status === 'corrected' ? data.vin.value : ''));
    setPhase('confirmVin');
  };

  const confirmVin = () => {
    const typed = vinTyped.trim().toUpperCase();
    const chosen = typed || vinPick;
    if (typed && !VIN_PATTERN.test(typed)) {
      setError('A VIN is 17 letters and numbers, without I, O or Q.');
      return;
    }
    if (!chosen) {
      setError('Pick a VIN, type one, or continue without one.');
      return;
    }
    lookup({ vin: chosen }, chosen, scan);
  };

  // Odometer (+ door jamb) photos, read after the vehicle is found.
  const handleFollowUp = async (data) => {
    setFollowUpRead(true);
    setFollowUpWarnings(data.warnings);
    takeMileage(data);
    setError(data.fields.currentMileage === undefined ? 'No odometer reading in the photos — type the mileage instead.' : null);

    if (phase === 'newVehicle') {
      const merged = mergeScans(scan, data);
      setScan(merged);
      // The door jamb may carry the VIN the registration didn't — and it may be on file.
      if (!vin && data.vin.status === 'verified') {
        setVin(data.vin.value);
        const result = await vehicleCheckInService.lookup({ vin: data.vin.value }).catch(() => null);
        if (result?.exists) openOnFile(result.vehicle, merged);
      }
    }
  };

  // ── Saving ───────────────────────────────────────────────────────────────
  const mileageNumber = mileage === '' ? null : Number(mileage);
  const mileageValid = mileageNumber === null || (Number.isInteger(mileageNumber) && mileageNumber >= 0);

  const saveOnFile = async () => {
    const { fields, mileageRecords } = review.collect(['currentMileage']);
    const result = await vehicleCheckInService.scanUpdate(vehicle._id, {
      ...fields,
      mileageRecords,
      reading: mileageNumber === null ? undefined : { mileage: mileageNumber, fromPhoto: mileageFromPhoto }
    });
    setDone({ kind: 'updated', name: vehicleName(vehicle), updated: result.updated.length, readings: result.readings });
    return true;
  };

  const sendToOffice = async () => {
    try {
      const checkIn = await vehicleCheckInService.create({
        scan,
        vin,
        mileage: mileageNumber === null ? undefined : mileageNumber,
        fromPhoto: mileageFromPhoto,
        note: note.trim()
      });
      setDone({ kind: 'sent', name: vehicleName(scan.fields) || 'Vehicle', to: checkIn.assignedToName });
      return true;
    } catch (err) {
      // Someone added it meanwhile — switch to updating it.
      if (err.response?.status === 409 && err.response.data?.data?.vehicle) {
        openOnFile(err.response.data.data.vehicle, scan);
        setError('This vehicle is on file now — review and save the update instead.');
        return false;
      }
      throw err;
    }
  };

  const save = async () => {
    setError(null);
    if (!mileageValid) {
      setError('Mileage must be a whole number.');
      return;
    }
    setSaving(true);
    try {
      const finished = phase === 'onFile' ? await saveOnFile() : await sendToOffice();
      if (finished) setPhase('done');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Rendering ────────────────────────────────────────────────────────────
  const errorBox = error && (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
  );

  const mileageInput = (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Current mileage</label>
      <input
        className={inputCls}
        type="number"
        inputMode="numeric"
        min="0"
        value={mileage}
        onChange={(e) => { setMileage(e.target.value); setMileageFromPhoto(false); }}
        placeholder="Odometer reading"
      />
      <p className="text-xs text-gray-500 mt-1">
        {mileageFromPhoto ? <><i className="fas fa-camera mr-1"></i>From the odometer photo.</> : 'Type it if the photo can\'t be read.'}
        {vehicle?.currentMileage ? ` On file: ${Number(vehicle.currentMileage).toLocaleString()} mi.` : ''}
      </p>
      {mileageNumber !== null && vehicle?.currentMileage && mileageNumber < vehicle.currentMileage && (
        <ScanWarning warning={{ level: 'warning', message: `Lower than the ${Number(vehicle.currentMileage).toLocaleString()} mi on file — check the reading.` }} />
      )}
      {followUpWarnings.filter(w => w.field === 'currentMileage').map((w, i) => <ScanWarning key={i} warning={w} />)}
    </div>
  );

  const renderOnFile = () => (
    <Card>
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-green-700 font-medium">
            <i className="fas fa-check-circle mr-1"></i>On file
          </p>
          <h2 className="text-lg font-semibold text-gray-900">{vehicleName(vehicle)}</h2>
          <p className="text-xs text-gray-500 font-mono">{vehicle.vin || 'No VIN on file'}</p>
        </div>

        <ScanReview
          result={reviewResult}
          review={review}
          currentValues={currentValues}
          hideFields={['vin', 'currentMileage']}
          onlyChanges
        />

        {!followUpRead && !mileageFromPhoto && (
          <div className="border-t border-gray-100 pt-3">
            <ScanCapture slots={['odometer']} intro="Now photograph the odometer." onResult={handleFollowUp} />
          </div>
        )}
        {mileageInput}
        {errorBox}
        <div className="flex justify-between gap-2 pt-2">
          <Button type="button" variant="light" onClick={reset} disabled={saving}>Start over</Button>
          <Button type="button" variant="primary" onClick={save} disabled={saving}>
            {saving ? <><i className="fas fa-spinner fa-spin mr-2"></i>Saving…</> : <><i className="fas fa-check mr-2"></i>Save{mileage === '' ? ' without mileage' : ''}</>}
          </Button>
        </div>
      </div>
    </Card>
  );

  const renderNewVehicle = () => {
    const f = scan.fields;
    const rows = SUMMARY_FIELDS.filter(([k]) => !isBlank(f[k]));
    return (
      <Card>
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-700 font-medium">
              <i className="fas fa-question-circle mr-1"></i>Not on file
            </p>
            <h2 className="text-lg font-semibold text-gray-900">{vehicleName(f) || 'Unknown vehicle'}</h2>
            <p className="text-xs text-gray-500 font-mono">{vin || 'No VIN'}</p>
            <p className="text-sm text-gray-600 mt-1">The office will match it to its owner. Add what you can from the car.</p>
          </div>

          {!followUpRead && (
            <ScanCapture
              slots={['odometer', 'doorJamb']}
              intro="Photograph the odometer and the driver door jamb label."
              onResult={handleFollowUp}
            />
          )}

          {rows.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {rows.map(([k, label]) => (
                <React.Fragment key={k}>
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="text-gray-900">{displayValue(k, f[k])}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
          {scan.warnings.filter(w => w.level !== 'info').map((w, i) => <ScanWarning key={i} warning={w} />)}

          {mileageInput}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Note for the office (optional)</label>
            <textarea
              className={inputCls}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. what the customer told you, where the keys are"
            />
          </div>
          {errorBox}
          <div className="flex justify-between gap-2 pt-2">
            <Button type="button" variant="light" onClick={reset} disabled={saving}>Start over</Button>
            <Button type="button" variant="primary" onClick={save} disabled={saving}>
              {saving ? <><i className="fas fa-spinner fa-spin mr-2"></i>Sending…</> : <><i className="fas fa-paper-plane mr-2"></i>Send to office</>}
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  const renderDone = () => (
    <Card>
      <div className="space-y-3">
        {done.kind === 'updated' ? (
          <p className="text-green-700 font-medium">
            <i className="fas fa-check-circle mr-2"></i>
            Updated {done.name}
            <span className="block text-sm font-normal text-gray-600 mt-1">
              {[done.updated > 0 && `${done.updated} ${done.updated === 1 ? 'detail' : 'details'} updated`, done.readings > 0 && `${done.readings} mileage ${done.readings === 1 ? 'reading' : 'readings'} added`].filter(Boolean).join(' · ') || 'Nothing needed changing.'}
            </span>
          </p>
        ) : (
          <p className="text-green-700 font-medium">
            <i className="fas fa-paper-plane mr-2"></i>
            Sent {done.name} to {done.to || 'the office'}
            <span className="block text-sm font-normal text-gray-600 mt-1">They'll match it to its owner.</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="primary" onClick={reset}>
            <i className="fas fa-camera mr-2"></i>Scan another
          </Button>
          <Button type="button" variant="light" to="/technician-portal">Back to portal</Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="max-w-xl mx-auto space-y-4 p-4">
      <div>
        <Link to="/technician-portal" className="text-sm text-primary-600"><i className="fas fa-arrow-left mr-1"></i>Portal</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Check In Vehicle</h1>
        <p className="text-sm text-gray-600">Photograph the registration and inspection stickers.</p>
      </div>

      {phase === 'capture' && (
        <Card>
          {errorBox}
          <ScanCapture slots={['registration']} onResult={handleResult} />
        </Card>
      )}
      {phase === 'looking' && (
        <Card><p className="text-sm text-gray-600"><i className="fas fa-spinner fa-spin mr-2"></i>Looking for this vehicle…</p></Card>
      )}
      {phase === 'confirmVin' && scan && (
        <VinConfirm
          scan={scan}
          options={confirmOptions(scan)}
          matches={vinMatches}
          pick={vinPick}
          onPick={setVinPick}
          typed={vinTyped}
          onType={setVinTyped}
          error={error}
          onContinue={confirmVin}
          onSkip={() => openNotOnFile('', scan)}
          skipLabel="Continue without VIN"
          onStartOver={reset}
        />
      )}
      {phase === 'onFile' && vehicle && review.ready && renderOnFile()}
      {phase === 'newVehicle' && scan && renderNewVehicle()}
      {phase === 'done' && done && renderDone()}
    </div>
  );
};

export default TechnicianVehicleScan;
