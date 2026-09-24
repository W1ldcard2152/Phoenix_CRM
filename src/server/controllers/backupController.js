const os = require('os');
const fs = require('fs');
const multer = require('multer');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const backupService = require('../services/backupService');

// Uploaded backup files go to disk, not memory — they can be large, and the
// restore reads them line by line.
exports.uploadMiddleware = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 1024 * 1024 * 1024 }
}).single('file');

// The client types RESTORE to confirm. Checked server-side too, so nothing
// short of a deliberate request replaces the shop's data.
const requireConfirmation = (req) => {
  if (req.body.confirm !== 'RESTORE') {
    throw new AppError('Type RESTORE to confirm.', 400);
  }
  // Checked here as well as in the service, so the admin hears it now
  // rather than from a background job that fails a moment later.
  if (!backupService.s3Configured()) {
    throw new AppError('Restoring needs backup storage (S3) set up, so a safety backup can be kept first.', 503);
  }
};

exports.getOverview = catchAsync(async (req, res) => {
  res.status(200).json({ status: 'success', data: await backupService.getOverview() });
});

exports.getJob = (req, res) => {
  res.status(200).json({ status: 'success', data: { job: backupService.getJob() } });
};

exports.backupNow = catchAsync(async (req, res) => {
  if (!backupService.s3Configured()) {
    throw new AppError('Backup storage (S3) is not set up for this shop. Use "Download a copy" instead.', 503);
  }
  const job = backupService.startJob('backup', () => backupService.takeBackup({ kind: 'manual', user: req.user }));
  res.status(202).json({ status: 'success', data: { job } });
});

exports.downloadFresh = catchAsync(async (req, res) => {
  await backupService.streamBackup(res, req.user);
});

exports.downloadStored = catchAsync(async (req, res) => {
  const url = await backupService.downloadUrl(req.params.id);
  res.status(200).json({ status: 'success', data: { url } });
});

exports.restoreStored = catchAsync(async (req, res) => {
  requireConfirmation(req);
  const job = backupService.startJob('restore', (setPhase) =>
    backupService.restore({ source: { logId: req.params.id }, user: req.user }, setPhase));
  res.status(202).json({ status: 'success', data: { job } });
});

exports.restoreUpload = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('Choose a backup file to restore.', 400);
  try {
    requireConfirmation(req);
    const job = backupService.startJob('restore', (setPhase) =>
      backupService.restore({
        source: { filePath: req.file.path, originalName: req.file.originalname },
        user: req.user
      }, setPhase));
    res.status(202).json({ status: 'success', data: { job } });
  } catch (err) {
    // Not started — the restore would have cleaned up the file itself.
    fs.rm(req.file.path, { force: true }, () => {});
    throw err;
  }
});
