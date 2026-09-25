import React, { useRef, useState } from 'react';
import Button from '../../common/Button';
import vehicleScanService from '../../../services/vehicleScanService';

export const SLOTS = [
  { key: 'registration', title: 'Registration & inspection', hint: 'Windshield stickers, or the registration card', icon: 'fa-id-card' },
  { key: 'odometer', title: 'Odometer', hint: 'Instrument cluster showing total mileage', icon: 'fa-tachometer-alt' },
  { key: 'doorJamb', title: 'Door jamb label', hint: 'Build date, tire size, paint code', icon: 'fa-tag' }
];

const isTouchDevice = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

const PhotoSlot = ({ slot, photo, onPick, onClear, disabled, touch }) => {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const pick = (e) => {
    const picked = e.target.files?.[0];
    if (picked) onPick(slot.key, picked);
    e.target.value = '';
  };

  return (
    <div className={`border rounded-lg p-3 flex gap-3 items-center ${photo ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
      <div className="w-16 h-16 flex-shrink-0 rounded bg-gray-100 overflow-hidden flex items-center justify-center">
        {photo?.thumb
          ? <img src={photo.thumb} alt={slot.title} className="w-full h-full object-cover" />
          : photo
            ? <i className="fas fa-spinner fa-spin text-lg text-gray-400"></i>
            : <i className={`fas ${slot.icon} text-2xl text-gray-400`}></i>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {photo && <i className="fas fa-check-circle text-green-600 mr-1"></i>}
          {slot.title}
        </p>
        <p className="text-xs text-gray-500">{slot.hint}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {touch && (
            <Button type="button" size="sm" variant={photo ? 'light' : 'primary'} disabled={disabled} onClick={() => cameraRef.current?.click()}>
              <i className="fas fa-camera mr-1"></i>{photo ? 'Retake' : 'Take photo'}
            </Button>
          )}
          <Button type="button" size="sm" variant="light" disabled={disabled} onClick={() => libraryRef.current?.click()}>
            <i className="fas fa-image mr-1"></i>{touch ? 'Library' : (photo ? 'Replace' : 'Choose photo')}
          </Button>
          {photo && (
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

/**
 * The photo slots and the "Read photos" button. Calls onResult(scanResult)
 * once the server has read them; shows its own error on failure.
 *
 * Each photo is downscaled as soon as it is picked, not when Read is pressed,
 * so the resizing overlaps with taking the next photo and the slot fills in
 * without blocking the page. Read waits for anything still in flight.
 *
 * slots — which photo slots to offer (keys of SLOTS); all three by default.
 */
const ScanCapture = ({ onResult, intro, slots = SLOTS.map(s => s.key) }) => {
  // key → { file, thumb } — `file` is the raw pick until `prepare` replaces it.
  const [photos, setPhotos] = useState({});
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const touch = isTouchDevice();

  const prepared = useRef({}); // key → Promise<{ file, thumb }>
  const latest = useRef({});   // key → token, so a retake can't be overwritten by the pick it replaced

  const setPhoto = (key, file) => {
    setError(null);
    const token = (latest.current[key] || 0) + 1;
    latest.current[key] = token;

    if (!file) {
      delete prepared.current[key];
      setPhotos(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    // Show the slot as filled straight away; the thumbnail follows.
    setPhotos(prev => ({ ...prev, [key]: { file, thumb: null } }));

    const work = vehicleScanService.prepare(file);
    prepared.current[key] = work;
    work.then((result) => {
      if (latest.current[key] !== token) return; // superseded by a retake
      setPhotos(prev => (prev[key] ? { ...prev, [key]: result } : prev));
    });
  };

  const photoCount = Object.keys(photos).length;

  const scan = async () => {
    setScanning(true);
    setError(null);
    try {
      // Usually already resolved — this only waits when Read is pressed while a
      // photo is still being resized.
      const entries = await Promise.all(
        Object.entries(prepared.current).map(async ([key, work]) => [key, (await work).file])
      );
      const files = Object.fromEntries(entries.filter(([, file]) => file));
      const data = await vehicleScanService.scan(files);
      onResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not read the photos. Check your connection and try again.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-3">
      {intro && <p className="text-sm text-gray-700">{intro}</p>}
      {SLOTS.filter(slot => slots.includes(slot.key)).map(slot => (
        <PhotoSlot
          key={slot.key}
          slot={slot}
          photo={photos[slot.key]}
          onPick={setPhoto}
          onClear={(key) => setPhoto(key, null)}
          disabled={scanning}
          touch={touch}
        />
      ))}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="primary" onClick={scan} disabled={photoCount === 0 || scanning}>
          {scanning
            ? <><i className="fas fa-spinner fa-spin mr-2"></i>Reading photos…</>
            : <><i className="fas fa-magic mr-2"></i>Read {photoCount === 1 ? '1 photo' : `${photoCount} photos`}</>}
        </Button>
      </div>
    </div>
  );
};

export default ScanCapture;
