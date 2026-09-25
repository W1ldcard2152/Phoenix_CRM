import API from './api';

// Long edge after downscaling. Phone photos are ~4000px; 2400px keeps a VIN or a
// door-jamb label legible while cutting a 3-photo upload from ~12MB to ~2MB.
const MAX_EDGE = 2400;
const JPEG_QUALITY = 0.85;

/**
 * Downscale a photo to MAX_EDGE as JPEG. Returns the original file when it is
 * already small enough, or when the browser can't decode it (e.g. HEIC outside
 * Safari) — the server accepts HEIC as-is.
 */
const downscale = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const ratio = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    if (ratio === 1 && file.size < 2 * 1024 * 1024) return resolve(file);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file),
      'image/jpeg',
      JPEG_QUALITY
    );
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    resolve(file);
  };
  img.src = url;
});

const vehicleScanService = {
  /**
   * @param {{registration?: File, odometer?: File, doorJamb?: File}} photos
   * @returns {Promise<Object>} { vin, fields, mileageRecords, warnings, found, notes }
   */
  scan: async (photos) => {
    const formData = new FormData();
    for (const [slot, file] of Object.entries(photos)) {
      if (file) formData.append(slot, await downscale(file));
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
