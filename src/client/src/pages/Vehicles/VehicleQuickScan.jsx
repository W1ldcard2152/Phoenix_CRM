import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import ScanCapture from '../../components/vehicles/scan/ScanCapture';
import ScanReview, { ScanWarning } from '../../components/vehicles/scan/ScanReview';
import OwnerPicker from '../../components/vehicles/scan/OwnerPicker';
import { useScanReview } from '../../components/vehicles/scan/useScanReview';
import VinConfirm from '../../components/vehicles/scan/VinConfirm';
import PendingCheckIns from '../../components/vehicles/scan/PendingCheckIns';
import {
  VIN_PATTERN, normalizePlate, vehicleName, forReview, valuesOnFile, confirmOptions
} from '../../components/vehicles/scan/scanHelpers';
import vehicleCheckInService from '../../services/vehicleCheckInService';
import VehicleService from '../../services/vehicleService';
import CustomerService from '../../services/customerService';
import moment from 'moment';
import { formatDate, formatDateForInput, getTodayForInput } from '../../utils/formatters';
import { useCapabilities } from '../../contexts/CompanyContext';
import { defaultCommunicationPreference } from '../../utils/communicationChannels';

/**
 * Scan Vehicle: photograph the registration (and optionally the odometer and
 * door jamb). A VIN already on file opens that vehicle for an update — new
 * plate, renewed registration/inspection, today's mileage. An unknown VIN
 * becomes a new vehicle, with its owner picked or added on the spot.
 *
 * The owner is assumed unchanged for a known vehicle; changing it is a link on
 * the confirmation screen, not a question asked every time.
 *
 * ?checkIn=<id> opens a technician's check-in (a vehicle they scanned that
 * wasn't on file) with their scan and mileage loaded; saving resolves it.
 */

// Fields each mode renders itself rather than as review checkboxes.
const UPDATE_OWN_FIELDS = ['vin', 'currentMileage'];
const CREATE_OWN_FIELDS = ['vin', 'year', 'make', 'model', 'licensePlate', 'licensePlateState', 'currentMileage'];

const inputCls = 'block w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-base sm:text-sm';

const OwnerLine = ({ owner }) => (
  <span>
    <span className="font-medium text-gray-900">{owner.name}</span>
    {owner.phone && <span className="text-gray-500"> · {owner.phone}</span>}
    {owner.isNew && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">new customer</span>}
  </span>
);

const VehicleQuickScan = () => {
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  const [searchParams] = useSearchParams();
  const checkInId = searchParams.get('checkIn');

  // capture → (looking) → confirmVin? → merge? → update | create → done
  const [phase, setPhase] = useState(checkInId ? 'looking' : 'capture');
  const [checkIn, setCheckIn] = useState(null);     // technician check-in being resolved
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [scan, setScan] = useState(null);           // full server result
  const [reviewResult, setReviewResult] = useState(null);
  const [currentValues, setCurrentValues] = useState({});
  const review = useScanReview(reviewResult, currentValues);

  // VIN confirmation (when the scan couldn't verify one)
  const [vinPick, setVinPick] = useState('');
  const [vinTyped, setVinTyped] = useState('');
  const [vinMatches, setVinMatches] = useState({}); // vin → vehicle on file

  // Update mode
  const [vehicle, setVehicle] = useState(null);     // vehicle on file
  const [matchedBy, setMatchedBy] = useState(null); // 'vin' | 'plate' | 'vinless'

  // Merge prompt: same year/make/model on file, no VIN on it yet
  const [mergeCandidates, setMergeCandidates] = useState([]);
  const [pendingNew, setPendingNew] = useState(null); // { vin, data } if declined
  const [mergeVin, setMergeVin] = useState('');       // VIN to stamp on the merged vehicle

  // Both modes
  const [owner, setOwner] = useState(null);         // customer, or { isNew, name, phone }
  const [pickingOwner, setPickingOwner] = useState(false);
  const [mileage, setMileage] = useState('');
  const [mileageFromPhoto, setMileageFromPhoto] = useState(false);
  const [readingDate, setReadingDate] = useState(getTodayForInput()); // a check-in's reading keeps its day

  // Create mode
  const [vin, setVin] = useState('');
  const [basics, setBasics] = useState({ year: '', make: '', model: '', licensePlate: '', licensePlateState: '' });
  const [duplicate, setDuplicate] = useState(null);

  // Done
  const [saved, setSaved] = useState(null);         // { vehicle, owner, created, changes }

  const reset = () => {
    setPhase('capture');
    setCheckIn(null);
    setReadingDate(getTodayForInput());
    setError(null);
    setScan(null);
    setReviewResult(null);
    setCurrentValues({});
    setVinPick('');
    setVinTyped('');
    setVinMatches({});
    setVehicle(null);
    setMatchedBy(null);
    setMergeCandidates([]);
    setPendingNew(null);
    setMergeVin('');
    setOwner(null);
    setPickingOwner(false);
    setMileage('');
    setMileageFromPhoto(false);
    setVin('');
    setDuplicate(null);
    setSaved(null);
  };

  const startMileage = (data) => {
    const odometer = data.fields.currentMileage;
    setMileage(odometer ? String(odometer) : '');
    setMileageFromPhoto(data.checkIn ? data.checkIn.mileageFromPhoto : !!odometer);
    setReadingDate(data.checkIn?.date || getTodayForInput());
  };

  // ── Finding the vehicle ──────────────────────────────────────────────────
  // `stampVin` applies to the 'vinless' match only: the VIN this scan resolved,
  // which the vehicle on file is missing and this merge exists to fill in.
  const openExisting = async (vehicleId, data, how, stampVin = '') => {
    const response = await VehicleService.getVehicle(vehicleId);
    const onFile = response.data.vehicle;
    setMergeCandidates([]);
    setPendingNew(null);
    setMergeVin(how === 'vinless' ? stampVin : '');
    setVehicle(onFile);
    setOwner(onFile.customer || null);
    setMatchedBy(how);
    setCurrentValues(valuesOnFile(onFile));
    setReviewResult(forReview(data));
    startMileage(data);
    setPhase('update');
  };

  const openNew = (chosenVin, data) => {
    setVehicle(null);
    setMergeCandidates([]);
    setPendingNew(null);
    setMergeVin('');
    setVin(chosenVin || '');
    setOwner(null);
    setPickingOwner(true);
    setBasics({
      year: data.fields.year || '',
      make: data.fields.make || '',
      model: data.fields.model || '',
      licensePlate: data.fields.licensePlate || '',
      licensePlateState: data.fields.licensePlateState || ''
    });
    setCurrentValues({});
    setReviewResult(forReview(data));
    startMileage(data);
    setPhase('create');
  };

  /**
   * No VIN match, but the car may already be in a garage without its VIN —
   * added when it was booked, before anyone had the VIN to hand. Offer those
   * to fill in rather than silently adding a second copy of the same car.
   *
   * Only VIN-less rows are candidates: two of the same model with VINs on each
   * are two cars, and the server enforces that. Needs all of year/make/model,
   * which for a verified VIN come from the NHTSA decode.
   */
  const offerMerge = async (chosenVin, data) => {
    const { year, make, model } = data.fields;
    if (!year || !make || !model) return false;
    const candidates = await VehicleService.findVinlessMatches({ year, make, model });
    if (candidates.length === 0) return false;
    setMergeCandidates(candidates);
    setPendingNew({ vin: chosenVin, data });
    setPhase('merge');
    return true;
  };

  // Everything that would add a vehicle goes through here, so the merge offer
  // can't be skipped by arriving at "new" down a different path.
  const goCreate = async (chosenVin, data) => {
    if (!(await offerMerge(chosenVin, data))) openNew(chosenVin, data);
  };

  const lookup = async (chosenVin, data) => {
    setPhase('looking');
    setError(null);
    try {
      const found = await VehicleService.checkVinExists(chosenVin);
      if (found.data.exists) {
        await openExisting(found.data.vehicle._id, data, 'vin');
      } else {
        await goCreate(chosenVin, data);
      }
    } catch (err) {
      setError('Could not look up the VIN. Check your connection and try again.');
      setPhase('confirmVin');
    }
  };

  // With no VIN in the photos, a plate + state that matches exactly one vehicle is enough.
  const findByPlate = async (plate, state) => {
    try {
      const response = await VehicleService.searchVehicles(plate);
      const matches = (response.data.vehicles || []).filter(v =>
        normalizePlate(v.licensePlate) === normalizePlate(plate) &&
        (!state || !v.licensePlateState || v.licensePlateState === state)
      );
      return matches.length === 1 ? matches[0] : null;
    } catch {
      return null;
    }
  };

  const handleResult = async (data) => {
    setScan(data);
    setError(null);
    const status = data.vin.status;

    if (status === 'verified' || status === 'nonstandard') {
      return lookup(data.vin.value, data);
    }

    setPhase('looking');
    if (status === 'none' && data.fields.licensePlate) {
      const byPlate = await findByPlate(data.fields.licensePlate, data.fields.licensePlateState);
      if (byPlate) {
        try {
          return await openExisting(byPlate._id, data, 'plate');
        } catch {
          // fall through to asking for the VIN
        }
      }
    }

    // Couldn't settle on a VIN. Any candidate already on file is almost certainly
    // the right one, so look them all up before asking.
    const options = confirmOptions(data);
    const matches = {};
    await Promise.all(options.map(async (opt) => {
      try {
        const found = await VehicleService.checkVinExists(opt.value);
        const v = found.data.vehicle;
        if (found.data.exists) matches[opt.value] = `On file: ${vehicleName(v)}${v.customer ? ` — ${v.customer.name}` : ''}`;
      } catch {
        // an option without a lookup is still selectable
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
      setError('Pick a VIN, type one, or continue without a VIN.');
      return;
    }
    lookup(chosen, scan);
  };

  // ── Saving ───────────────────────────────────────────────────────────────
  const mileageNumber = mileage === '' ? null : Number(mileage);
  const mileageValid = mileageNumber === null || (Number.isInteger(mileageNumber) && mileageNumber >= 0);

  const todaysReading = () => (mileageNumber === null ? [] : [{
    date: readingDate,
    mileage: mileageNumber,
    source: mileageFromPhoto ? 'Odometer photo' : (checkIn ? 'Technician check-in' : 'Vehicle scan'),
    notes: checkIn
      ? `Checked in by ${checkIn.submittedByName || 'a technician'}`
      : (mileageFromPhoto ? 'Odometer photo' : 'Entered during vehicle scan')
  }]);

  // ── Technician check-ins ────────────────────────────────────────────────
  // The stored scan, with the technician's reading in the mileage prompt.
  const scanFromCheckIn = (ci) => ({
    ...ci.scan,
    fields: { ...(ci.scan?.fields || {}), currentMileage: ci.mileage ?? undefined },
    mileageRecords: ci.scan?.mileageRecords || [],
    warnings: ci.scan?.warnings || [],
    checkIn: { mileageFromPhoto: !!ci.mileageFromPhoto, date: formatDateForInput(ci.createdAt) }
  });

  const beginFromCheckIn = (ci) => {
    const data = scanFromCheckIn(ci);
    setScan(data);
    if (ci.vin) lookup(ci.vin, data);
    else handleResult(data);
  };

  useEffect(() => {
    if (!checkInId) return undefined;
    let cancelled = false;
    reset();
    setPhase('looking');
    vehicleCheckInService.get(checkInId)
      .then(ci => {
        if (cancelled) return;
        if (ci.status !== 'open') {
          setError('That check-in has already been handled.');
          setPhase('capture');
          return;
        }
        setCheckIn(ci);
        beginFromCheckIn(ci);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load that check-in.');
          setPhase('capture');
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per check-in
  }, [checkInId]);

  const dismissCheckIn = async () => {
    if (!window.confirm('Dismiss this check-in? Nothing will be saved.')) return;
    try {
      await vehicleCheckInService.resolve(checkIn._id, { status: 'dismissed' });
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not dismiss the check-in.');
    }
  };

  const startOver = () => (checkIn ? beginFromCheckIn(checkIn) : reset());

  const scanAnother = () => {
    reset();
    if (checkInId) navigate('/vehicles/scan');
  };

  // Creates a new owner on first save; later retries reuse it.
  const ensureOwner = async () => {
    if (!owner.isNew) return owner;
    const response = await CustomerService.createCustomer({
      name: owner.name,
      phone: owner.phone,
      communicationPreference: defaultCommunicationPreference(capabilities)
    });
    const created = response.data.customer;
    setOwner(created);
    return created;
  };

  const saveUpdate = async () => {
    const { fields, mileageRecords } = review.collect(UPDATE_OWN_FIELDS);
    const originalOwnerId = vehicle.customer?._id;
    const ownerChanged = owner && String(owner._id || '') !== String(originalOwnerId || '');
    const finalOwner = ownerChanged ? await ensureOwner() : owner;

    const body = { ...fields };
    if (ownerChanged) body.customer = finalOwner._id;

    // Filling in a VIN-less vehicle. The VIN is set explicitly rather than
    // collected, because UPDATE_OWN_FIELDS skips it: on every other update path
    // the vehicle was found BY its VIN, so there is nothing to write.
    const changed = Object.keys(fields);
    if (mergeVin && !vehicle.vin) {
      body.vin = mergeVin;
      changed.push('vin');
    }

    let latest = vehicle;
    if (Object.keys(body).length > 0) {
      latest = (await VehicleService.updateVehicle(vehicle._id, body)).data.vehicle;
    }
    const readings = [...mileageRecords, ...todaysReading()];
    for (const reading of readings) {
      latest = (await VehicleService.addMileageRecord(vehicle._id, reading)).data.vehicle;
    }

    setSaved({
      vehicle: latest,
      owner: finalOwner,
      created: false,
      ownerChanged,
      changes: changed,
      readings
    });
    return latest;
  };

  const saveCreate = async () => {
    const { fields, mileageRecords } = review.collect(CREATE_OWN_FIELDS);
    const finalOwner = await ensureOwner();
    const readings = [...mileageRecords, ...todaysReading()];
    const body = {
      ...fields,
      customer: finalOwner._id,
      year: Number(basics.year),
      make: basics.make.trim(),
      model: basics.model.trim(),
      licensePlate: normalizePlate(basics.licensePlate),
      licensePlateState: basics.licensePlateState.trim().toUpperCase(),
      mileageHistory: readings
    };
    if (vin) body.vin = vin;
    if (mileageNumber !== null) body.currentMileage = mileageNumber;

    const created = (await VehicleService.createVehicle(body)).data.vehicle;
    setSaved({
      vehicle: created,
      owner: finalOwner,
      created: true,
      changes: Object.keys(fields),
      readings
    });
    return created;
  };

  const createProblems = () => {
    const problems = [];
    if (!owner) problems.push('Choose the owner.');
    const year = Number(basics.year);
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1) problems.push('Enter the year.');
    if (!basics.make.trim()) problems.push('Enter the make.');
    if (!basics.model.trim()) problems.push('Enter the model.');
    if (basics.licensePlateState && !/^[A-Za-z]{2}$/.test(basics.licensePlateState.trim())) problems.push('Plate state must be 2 letters.');
    return problems;
  };

  const save = async () => {
    setError(null);
    if (!mileageValid) {
      setError('Mileage must be a whole number.');
      return;
    }
    if (phase === 'create') {
      const problems = createProblems();
      if (problems.length) {
        setError(problems.join(' '));
        return;
      }
    }
    setSaving(true);
    try {
      const savedVehicle = phase === 'update' ? await saveUpdate() : await saveCreate();
      if (checkIn) {
        try {
          await vehicleCheckInService.resolve(checkIn._id, { status: 'resolved', vehicle: savedVehicle._id });
        } catch {
          // The vehicle is saved; an unresolved check-in just stays in the queue.
          setSaved(prev => ({ ...prev, checkInWarning: true }));
        }
      }
      setPhase('done');
    } catch (err) {
      const existing = err.response?.status === 409 && err.response.data?.data?.existingVehicle;
      if (existing) {
        setDuplicate(existing);
        setError(null);
      } else {
        setError(err.response?.data?.message || 'Could not save. Check your connection and try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Rendering ────────────────────────────────────────────────────────────
  const renderOwner = (label) => (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      {pickingOwner || !owner ? (
        <OwnerPicker
          onSelect={(picked) => { setOwner(picked); setPickingOwner(false); }}
          onCancel={owner ? () => setPickingOwner(false) : undefined}
        />
      ) : (
        <div className="flex items-center justify-between gap-3 text-sm">
          <OwnerLine owner={owner} />
          <button type="button" className="text-sm text-primary-600 hover:text-primary-800 whitespace-nowrap" onClick={() => setPickingOwner(true)}>
            Change owner
          </button>
        </div>
      )}
      {phase === 'update' && vehicle.customer && owner && String(owner._id || '') !== String(vehicle.customer._id) && (
        <p className="text-xs text-amber-700">
          <i className="fas fa-exchange-alt mr-1"></i>
          Ownership moves from {vehicle.customer.name}. Past work orders stay with them.
          <button type="button" className="ml-2 underline" onClick={() => { setOwner(vehicle.customer); setPickingOwner(false); }}>Undo</button>
        </p>
      )}
    </div>
  );

  const renderMileage = () => {
    const onFile = vehicle?.currentMileage;
    const lower = mileageNumber !== null && onFile && mileageNumber < onFile;
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Current mileage</label>
        <input
          className={inputCls}
          type="number"
          inputMode="numeric"
          min="0"
          value={mileage}
          autoFocus={phase === 'update' && !mileage}
          onChange={(e) => { setMileage(e.target.value); setMileageFromPhoto(false); }}
          placeholder="Odometer reading"
        />
        <p className="text-xs text-gray-500 mt-1">
          {mileageFromPhoto && <><i className="fas fa-camera mr-1"></i>From the odometer photo. </>}
          {onFile ? `On file: ${Number(onFile).toLocaleString()} mi.` : ''}
          {mileage === '' && ' Leave blank if you can\'t get a reading right now.'}
        </p>
        {lower && <ScanWarning warning={{ level: 'warning', message: `Lower than the ${Number(onFile).toLocaleString()} mi on file — check the reading.` }} />}
      </div>
    );
  };

  const saveButton = (label) => (
    <div className="flex justify-between gap-2 pt-2">
      <Button type="button" variant="light" onClick={startOver} disabled={saving}>Start over</Button>
      <Button type="button" variant="primary" onClick={save} disabled={saving}>
        {saving
          ? <><i className="fas fa-spinner fa-spin mr-2"></i>Saving…</>
          : <><i className="fas fa-check mr-2"></i>{label}{mileage === '' ? ' without mileage' : ''}</>}
      </Button>
    </div>
  );

  const errorBox = error && (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
  );

  const renderConfirmVin = () => (
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
      onSkip={() => { setPhase('looking'); goCreate('', scan); }}
      skipLabel="Add without a VIN"
      onStartOver={startOver}
    />
  );

  // Same year/make/model already in a garage without a VIN. Almost always the
  // car being scanned, but "almost always" is why this asks instead of merging.
  const scannedPlate = normalizePlate(pendingNew?.data?.fields?.licensePlate || '');
  const plateMatches = (c) => !!scannedPlate && normalizePlate(c.licensePlate || '') === scannedPlate;
  const sortedCandidates = [...mergeCandidates].sort(
    (a, b) => Number(plateMatches(b)) - Number(plateMatches(a))
  );

  const renderMerge = () => (
    <Card>
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-yellow-700 font-medium">
            <i className="fas fa-code-branch mr-1"></i>Already on file without a VIN
          </p>
          <h2 className="text-lg font-semibold text-gray-900">
            {[pendingNew?.data?.fields?.year, pendingNew?.data?.fields?.make, pendingNew?.data?.fields?.model].filter(Boolean).join(' ')}
          </h2>
          <p className="text-xs text-gray-500 font-mono">{pendingNew?.vin || 'No VIN'}</p>
        </div>

        <p className="text-sm text-gray-700">
          {mergeCandidates.length === 1
            ? 'This vehicle is already in a customer’s garage with no VIN on it. Is it the same one?'
            : `${mergeCandidates.length} customers have one of these on file with no VIN. Whose is this?`}
        </p>

        {/* Every candidate is the same year/make/model as the car being scanned —
            that is why it matched — so the owner is the only thing that tells
            them apart, and it leads each row.

            A candidate whose plate matches the scanned one is almost certainly
            the right vehicle: the plate-match lookup only runs when the scan
            found no VIN at all, so it never got a chance to catch this. Those
            are flagged and sorted first, but still only offered, never assumed. */}
        <div className="space-y-2">
          {sortedCandidates.map(c => (
            <div
              key={c._id}
              className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${
                plateMatches(c) ? 'border-green-300 bg-green-50' : 'border-gray-200'
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {c.customer?.name || <span className="text-gray-500 italic">No owner on file</span>}
                  {plateMatches(c) && (
                    <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                      plate matches
                    </span>
                  )}
                </p>
                {c.customer?.phone && <p className="text-xs text-gray-500">{c.customer.phone}</p>}
                <p className="text-xs text-gray-500">
                  {[
                    c.licensePlate ? `${c.licensePlate}${c.licensePlateState ? ` (${c.licensePlateState})` : ''}` : 'No plate',
                    c.currentMileage ? `${Number(c.currentMileage).toLocaleString()} mi` : null,
                    c.createdAt ? `added ${formatDate(c.createdAt)}` : null
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={saving}
                onClick={() => {
                  setError(null);
                  openExisting(c._id, pendingNew.data, 'vinless', pendingNew.vin)
                    .catch(() => setError('Could not open that vehicle. Try again.'));
                }}
              >
                This one
              </Button>
            </div>
          ))}
        </div>

        {errorBox}

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <Button type="button" variant="light" onClick={startOver} disabled={saving}>Start over</Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => openNew(pendingNew.vin, pendingNew.data)}
          >
            None of these — add as new
          </Button>
        </div>
      </div>
    </Card>
  );

  const renderUpdate = () => (
    <Card>
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-green-700 font-medium">
            <i className="fas fa-check-circle mr-1"></i>On file{matchedBy === 'plate' ? ' — matched by license plate' : ''}{matchedBy === 'vinless' ? ' — adding the VIN to it' : ''}
          </p>
          <h2 className="text-lg font-semibold text-gray-900">{vehicleName(vehicle)}</h2>
          <p className="text-xs text-gray-500 font-mono">
            {vehicle.vin || (mergeVin
              ? <span className="text-green-700">{mergeVin} <span className="font-sans">— will be added</span></span>
              : 'No VIN on file')}
          </p>
        </div>
        {renderOwner('Owner')}
        <div className="border-t border-gray-100 pt-3">
          <ScanReview
            result={reviewResult}
            review={review}
            currentValues={currentValues}
            hideFields={UPDATE_OWN_FIELDS}
            onlyChanges
          />
        </div>
        {renderMileage()}
        {errorBox}
        {saveButton('Update vehicle')}
      </div>
    </Card>
  );

  const renderCreate = () => (
    <Card>
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-blue-700 font-medium">
            <i className="fas fa-plus-circle mr-1"></i>New vehicle — not on file yet
          </p>
          <p className="text-xs text-gray-500 font-mono">{vin || 'No VIN'}</p>
        </div>

        {renderOwner('Owner')}

        <div className="border-t border-gray-100 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[['year', 'Year', 'number'], ['make', 'Make', 'text'], ['model', 'Model', 'text']].map(([key, label, type]) => (
            <div key={key} className={key === 'model' ? 'col-span-2 sm:col-span-1' : ''}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}<span className="text-red-500 ml-0.5">*</span></label>
              <input
                className={inputCls}
                type={type}
                inputMode={type === 'number' ? 'numeric' : undefined}
                value={basics[key]}
                onChange={(e) => setBasics(prev => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">License plate</label>
            <input
              className={inputCls}
              value={basics.licensePlate}
              onChange={(e) => setBasics(prev => ({ ...prev, licensePlate: e.target.value.toUpperCase() }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
            <input
              className={inputCls}
              value={basics.licensePlateState}
              maxLength={2}
              onChange={(e) => setBasics(prev => ({ ...prev, licensePlateState: e.target.value.toUpperCase() }))}
            />
          </div>
        </div>

        <ScanReview
          result={reviewResult}
          review={review}
          currentValues={currentValues}
          hideFields={CREATE_OWN_FIELDS}
        />
        {renderMileage()}

        {duplicate && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-3 py-2 rounded">
            <p>
              <i className="fas fa-exclamation-triangle mr-1"></i>
              This VIN was just added as {vehicleName(duplicate)}{duplicate.customer ? ` (${duplicate.customer.name})` : ''}.
            </p>
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => {
                setDuplicate(null);
                openExisting(duplicate._id, scan, 'vin').catch(() => setError('Could not open that vehicle. Try again.'));
              }}>
              Update that vehicle instead
            </Button>
          </div>
        )}
        {errorBox}
        {saveButton(owner?.isNew ? 'Add customer & vehicle' : 'Add vehicle')}
      </div>
    </Card>
  );

  const renderDone = () => {
    const { vehicle: v, owner: o, created, ownerChanged, changes, readings } = saved;
    const labels = changes.map(f => ({
      licensePlate: 'plate', licensePlateState: 'plate state', registrationExpiration: 'registration expiry',
      inspectionExpiration: 'inspection expiry', buildDate: 'build date', paintCode: 'paint code', tireSize: 'tire size',
      year: 'year', make: 'make', model: 'model', vin: 'VIN'
    }[f] || f));
    return (
      <Card>
        <div className="space-y-3">
          <p className="text-green-700 font-medium">
            <i className="fas fa-check-circle mr-2"></i>
            {created ? 'Added' : 'Updated'} {vehicleName(v)} for {o.name}
          </p>
          <ul className="text-sm text-gray-700 list-disc ml-5 space-y-0.5">
            {ownerChanged && <li>Owner changed to {o.name}</li>}
            {!created && labels.length > 0 && <li>Updated {labels.join(', ')}</li>}
            {readings.map((r, i) => (
              <li key={i}>{Number(r.mileage).toLocaleString()} mi on {moment(r.date, 'YYYY-MM-DD').format('MM/DD/YYYY')} ({r.source.toLowerCase()})</li>
            ))}
            {!created && labels.length === 0 && readings.length === 0 && !ownerChanged && <li>Nothing needed changing.</li>}
          </ul>
          {saved.checkInWarning && (
            <ScanWarning warning={{ level: 'warning', message: 'Saved, but the check-in could not be marked done — dismiss it from Scan Vehicle.' }} />
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="primary" onClick={() => navigate('/intake', { state: { customer: o, vehicle: v } })}>
              <i className="fas fa-clipboard-list mr-2"></i>Start work order
            </Button>
            <Button type="button" variant="outline" to={`/vehicles/${v._id}`}>View vehicle</Button>
            <Button type="button" variant="light" onClick={scanAnother}>
              <i className="fas fa-camera mr-2"></i>Scan another
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scan Vehicle</h1>
        <p className="text-sm text-gray-600">
          Photograph the registration to update a vehicle on file, or add a new one.{' '}
          <Link to="/intake" className="text-primary-600 hover:text-primary-800">Full Quick Entry instead</Link>
        </p>
      </div>

      {checkIn && phase !== 'done' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <div className="text-sm text-amber-900">
            <p className="font-medium">
              <i className="fas fa-car-side mr-1"></i>
              Checked in by {checkIn.submittedByName || 'a technician'} {moment(checkIn.createdAt).fromNow()}
            </p>
            {checkIn.note && <p className="mt-1">“{checkIn.note}”</p>}
            <p className="text-xs text-amber-800 mt-1">Find the owner, check the details, and save to finish the check-in.</p>
          </div>
          <Button type="button" size="sm" variant="light" onClick={dismissCheckIn}>Dismiss</Button>
        </div>
      )}

      {phase === 'capture' && (
        <>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>}
          <Card>
            <ScanCapture
              intro="The registration photo is all it needs. Add the odometer to record today's mileage, and the door jamb label for build date, tires and paint."
              onResult={handleResult}
            />
          </Card>
          <PendingCheckIns hideWhenEmpty />
        </>
      )}

      {phase === 'looking' && (
        <Card>
          <p className="text-sm text-gray-600"><i className="fas fa-spinner fa-spin mr-2"></i>Looking for this vehicle…</p>
        </Card>
      )}

      {phase === 'confirmVin' && scan && renderConfirmVin()}
      {phase === 'merge' && pendingNew && renderMerge()}
      {phase === 'update' && vehicle && review.ready && renderUpdate()}
      {phase === 'create' && review.ready && renderCreate()}
      {phase === 'done' && saved && renderDone()}
    </div>
  );
};

export default VehicleQuickScan;
