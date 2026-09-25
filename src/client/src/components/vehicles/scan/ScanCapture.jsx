import React, { useEffect, useRef, useState } from 'react';
import Button from '../../common/Button';
import vehicleScanService from '../../../services/vehicleScanService';

export const SLOTS = [
  { key: 'registration', title: 'Registration & inspection', hint: 'Windshield stickers, or the registration card', icon: 'fa-id-card' },
  { key: 'odometer', title: 'Odometer', hint: 'Instrument cluster showing total mileage', icon: 'fa-tachometer-alt' },
  { key: 'doorJamb', title: 'Door jamb label', hint: 'Build date, tire size, paint code', icon: 'fa-tag' }
];

const isTouchDevice = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

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

/**
 * The photo slots and the "Read photos" button. Calls onResult(scanResult)
 * once the server has read them; shows its own error on failure.
 *
 * slots — which photo slots to offer (keys of SLOTS); all three by default.
 */
const ScanCapture = ({ onResult, intro, slots = SLOTS.map(s => s.key) }) => {
  const [photos, setPhotos] = useState({});
  const [previews, setPreviews] = useState({});
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const touch = isTouchDevice();

  // Release preview object URLs on unmount (replacements are released in setPhoto).
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  useEffect(() => () => Object.values(previewsRef.current).forEach(url => url && URL.revokeObjectURL(url)), []);

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
    setScanning(true);
    setError(null);
    try {
      const data = await vehicleScanService.scan(photos);
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
          file={photos[slot.key]}
          preview={previews[slot.key]}
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
