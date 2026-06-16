// Reusable multer fileFilter factory enforcing a MIME-type allowlist.
// Mirrors the image-only filter used for registration scans, so uploads can't
// smuggle executables/HTML/etc. into S3 via the media and receipt endpoints.

const AppError = require('./appError');

// `allowed` entries may be exact (`application/pdf`) or a prefix (`image/*`)
const makeFileFilter = (allowed, label) => (req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  const ok = allowed.some((a) =>
    a.endsWith('/*') ? mime.startsWith(a.slice(0, -1)) : mime === a
  );
  if (ok) return cb(null, true);
  cb(new AppError(`Unsupported file type. Allowed: ${label}.`, 400), false);
};

const imageFilter = makeFileFilter(['image/*'], 'images');
const receiptFilter = makeFileFilter(['image/*', 'application/pdf'], 'images or PDF');

module.exports = { makeFileFilter, imageFilter, receiptFilter };
