import API from './api';

// Long edge after downscaling. Phone photos are ~4000px; 2400px keeps a VIN or a
// door-jamb label legible while cutting a 3-photo upload from ~12MB to ~2MB.
const MAX_EDGE = 2400;
const JPEG_QUALITY = 0.85;

// The preview is a 64px square. Decoding a 12MP photo to fill it costs a second
// or more of blocked main thread on a phone — the freeze felt right after the
// camera hands the picture back — so the preview gets its own small copy.
const THUMB_EDGE = 192;
const THUMB_QUALITY = 0.7;

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    resolve(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Could not decode image'));
  };
  img.src = url;
});

const scaleTo = (img, maxEdge) => {
  const ratio = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * ratio));
  canvas.height = Math.max(1, Math.round(img.height * ratio));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const toJpegFile = (canvas) => new Promise((resolve) => {
  canvas.toBlob(
    (blob) => resolve(blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : null),
    'image/jpeg',
    JPEG_QUALITY
  );
});

/**
 * Decode a picked photo once and produce both things the UI needs from it: the
 * downscaled file that will be uploaded, and a thumbnail for the preview.
 *
 * Called as soon as a photo is picked rather than at upload time, so the work
 * overlaps with the person taking the next photo instead of stalling the
 * "Read photos" press.
 *
 * A photo the browser can't decode (HEIC outside Safari) is uploaded as-is —
 * the server accepts HEIC — and simply has no thumbnail.
 *
 * @returns {Promise<{file: File, thumb: string|null}>}
 */
export const prepare = async (file) => {
  // Never rejects: resizing is an optimisation, and the original is always a
  // usable fallback. A throw here would block a scan the server could have read.
  try {
    const img = await loadImage(file);
    const thumb = scaleTo(img, THUMB_EDGE).toDataURL('image/jpeg', THUMB_QUALITY);

    // Already small enough to send untouched.
    if (Math.max(img.width, img.height) <= MAX_EDGE && file.size < 2 * 1024 * 1024) {
      return { file, thumb };
    }

    const downscaled = await toJpegFile(scaleTo(img, MAX_EDGE));
    return { file: downscaled || file, thumb };
  } catch {
    return { file, thumb: null };
  }
};

const vehicleScanService = {
  prepare,

  /**
   * @param {{registration?: File, odometer?: File, doorJamb?: File}} photos
   *        already through `prepare` — sent as given.
   * @returns {Promise<Object>} { vin, fields, mileageRecords, warnings, found, notes }
   */
  scan: async (photos) => {
    const formData = new FormData();
    for (const [slot, file] of Object.entries(photos)) {
      if (file) formData.append(slot, file);
    }
    const response = await API.post('/registration/scan', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // Three photos through the model plus an NHTSA lookup can outrun the 30s default.
      timeout: 120000
    });
    return response.data.data;
  }
};

export default vehicleScanService;
