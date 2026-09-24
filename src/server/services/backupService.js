// Server-side backups: the shop's database, copied nightly into the shop's own
// S3 bucket, and restored from there (or from an uploaded file) by an admin.
//
// Kinds and how long each is kept (see RETENTION_DAYS):
//   monthly     — the first scheduled backup of each calendar month. Forever.
//   nightly     — every other scheduled backup. 35 days.
//   manual      — "Back up now". 35 days.
//   pre-restore — taken automatically before every restore. 90 days.
//
// Every backup is uploaded with a 30-day Object Lock (GOVERNANCE) when the
// bucket has Object Lock on, so even the app's own credentials cannot delete
// the last month of backups. Retiring a backup only adds a delete marker; the
// bucket's lifecycle rule purges the data later. Without Object Lock, backups
// still work and the Backups page says they aren't locked.
//
// Only one backup or restore runs at a time. While a restore runs, every
// write to the API is refused (app.js), so nothing saved mid-restore is lost.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const mongoose = require('mongoose');
const cron = require('node-cron');
const moment = require('moment-timezone');
const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectLockConfigurationCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Service = require('./s3Service');
const cacheService = require('./cacheService');
const BackupLog = require('../models/BackupLog');
const AppError = require('../utils/appError');
const { writeBackup, inspectBackup, restoreBackup } = require('../utils/backupFormat');
const { TIMEZONE } = require('../config/timezone');

const PREFIX = 'backups/';
const LOCK_DAYS = 30;
const RETENTION_DAYS = { nightly: 35, manual: 35, 'pre-restore': 90, monthly: null };
const NIGHTLY_CRON = '0 2 * * *'; // 2:00 AM shop time
const STATUS_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const s3Configured = () => Boolean(s3Service.client && s3Service.bucketName);

const s3 = (command) => s3Service.client.send(command);

// ── Bucket status ─────────────────────────────────────────────────────────────

let statusCache = null;

/**
 * { configured, versioning, objectLock } — each 'on' | 'off' | 'unknown'.
 * 'unknown' almost always means the app's IAM policy lacks the read action,
 * which the Backups page explains.
 */
const getStorageStatus = async ({ fresh = false } = {}) => {
  if (!s3Configured()) return { configured: false, versioning: 'off', objectLock: 'off' };
  if (!fresh && statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.value;

  const Bucket = s3Service.bucketName;
  const value = { configured: true, versioning: 'unknown', objectLock: 'unknown' };
  try {
    const res = await s3(new GetBucketVersioningCommand({ Bucket }));
    value.versioning = res.Status === 'Enabled' ? 'on' : 'off';
  } catch (err) {
    console.warn(`[Backup] Could not read bucket versioning: ${err.name}`);
  }
  try {
    const res = await s3(new GetObjectLockConfigurationCommand({ Bucket }));
    value.objectLock = res.ObjectLockConfiguration?.ObjectLockEnabled === 'Enabled' ? 'on' : 'off';
  } catch (err) {
    if (err.name === 'ObjectLockConfigurationNotFoundError') value.objectLock = 'off';
    else console.warn(`[Backup] Could not read bucket Object Lock: ${err.name}`);
  }
  statusCache = { at: Date.now(), value };
  return value;
};

// ── Jobs ──────────────────────────────────────────────────────────────────────
// Backups and restores run in the background; the Backups page polls getJob().
// Held in memory: a Render web service is one process.

let job = null;

const getJob = () => job;
const isBusy = () => Boolean(job && !job.finishedAt);
const isRestoring = () => Boolean(job && job.type === 'restore' && !job.finishedAt);

const startJob = (type, work) => {
  if (isBusy()) {
    throw new AppError(`A ${job.type} is already running. Try again when it finishes.`, 409);
  }
  const current = { id: crypto.randomUUID(), type, phase: 'starting', startedAt: new Date(), finishedAt: null, error: null, result: null };
  job = current;
  const setPhase = (phase) => { current.phase = phase; };
  Promise.resolve()
    .then(() => work(setPhase))
    .then(
      (result) => { current.result = result; },
      (err) => {
        current.error = err.message;
        console.error(`[Backup] ${type} failed:`, err);
      }
    )
    .finally(() => {
      current.finishedAt = new Date();
      current.phase = 'done';
    });
  return current;
};

// ── Backup ────────────────────────────────────────────────────────────────────

const tempPath = (name) => path.join(os.tmpdir(), `${crypto.randomUUID()}-${name}`);

// The random tail keeps two backups in the same second (a small shop's backup
// takes milliseconds) from sharing an S3 key and overwriting one another.
const backupFileName = (kind) =>
  `cvrepair-${mongoose.connection.db.databaseName}-${moment.tz(TIMEZONE).format('YYYY-MM-DD-HHmmss')}-${kind}-${crypto.randomBytes(2).toString('hex')}.cvbackup`;

// Upload with a 30-day lock when the bucket supports it. If the IAM policy is
// missing s3:PutObjectRetention the locked upload is refused — fall back to an
// unlocked one rather than skip the backup, and let the page say so.
let lockRefused = false; // last locked upload was denied — shown on the Backups page

const upload = async (Key, Body, Metadata) => {
  const Bucket = s3Service.bucketName;
  const base = { Bucket, Key, Body, ContentType: 'application/gzip', Metadata };
  const { objectLock } = await getStorageStatus();
  if (objectLock === 'on') {
    const lockedUntil = new Date(Date.now() + LOCK_DAYS * DAY_MS);
    try {
      await s3(new PutObjectCommand({ ...base, ObjectLockMode: 'GOVERNANCE', ObjectLockRetainUntilDate: lockedUntil }));
      lockRefused = false;
      return lockedUntil;
    } catch (err) {
      if (err.name !== 'AccessDenied') throw err;
      lockRefused = true;
      console.warn('[Backup] Locked upload refused (IAM policy lacks s3:PutObjectRetention) — uploading unlocked.');
    }
  }
  await s3(new PutObjectCommand(base));
  return null;
};

/**
 * Back up the database to S3. Returns the BackupLog.
 */
const takeBackup = async ({ kind, user = null }) => {
  if (!s3Configured()) {
    throw new AppError('Backup storage (S3) is not set up for this shop. Use "Download a copy" instead.', 503);
  }
  const db = mongoose.connection.db;
  const fileName = backupFileName(kind);
  const tmp = tempPath(fileName);
  const log = await BackupLog.create({ kind, user: user?._id, userName: user?.name || 'Schedule' });

  try {
    const { counts, total } = await writeBackup(db, fs.createWriteStream(tmp), {
      kind,
      takenBy: user?.name || 'schedule'
    });
    // Read back what was written before trusting it.
    await inspectBackup(tmp);

    const body = await fs.promises.readFile(tmp);
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    const s3Key = `${PREFIX}${kind}/${fileName}`;
    const lockedUntil = await upload(s3Key, body, { sha256, total: String(total), kind });

    Object.assign(log, {
      status: 'success', s3Key, fileName, size: body.length, sha256, counts,
      totalDocuments: total, lockedUntil, finishedAt: new Date()
    });
    await log.save();
    await prune().catch((err) => console.error('[Backup] Pruning failed:', err.message));
    return log;
  } catch (err) {
    Object.assign(log, { status: 'failed', error: err.message, finishedAt: new Date() });
    await log.save().catch(() => {});
    throw err;
  } finally {
    fs.rm(tmp, { force: true }, () => {});
  }
};

// Retire backups past their kind's retention. A delete on a versioned bucket
// only adds a delete marker; the data goes when the lifecycle rule says so.
const prune = async () => {
  for (const [kind, days] of Object.entries(RETENTION_DAYS)) {
    if (!days) continue;
    const expired = await BackupLog.find({
      kind,
      status: 'success',
      pruned: false,
      startedAt: { $lt: new Date(Date.now() - days * DAY_MS) }
    });
    for (const log of expired) {
      await s3(new DeleteObjectCommand({ Bucket: s3Service.bucketName, Key: log.s3Key }));
      Object.assign(log, { pruned: true, prunedAt: new Date() });
      await log.save();
    }
  }
};

/**
 * Stream a fresh backup straight to an HTTP response. Needs no S3. If the
 * connection drops mid-way the file has no footer, and a restore refuses it.
 */
const streamBackup = async (res, user) => {
  const fileName = backupFileName('download');
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  await writeBackup(mongoose.connection.db, res, { kind: 'download', takenBy: user?.name });
};

const downloadUrl = async (id) => {
  const log = await BackupLog.findOne({ _id: id, status: 'success', pruned: false, s3Key: { $exists: true } });
  if (!log) throw new AppError('That backup is no longer available.', 404);
  return getSignedUrl(
    s3Service.client,
    new GetObjectCommand({
      Bucket: s3Service.bucketName,
      Key: log.s3Key,
      ResponseContentDisposition: `attachment; filename="${log.fileName}"`
    }),
    { expiresIn: 300 }
  );
};

// ── Restore ───────────────────────────────────────────────────────────────────

/**
 * Restore the database from a stored backup ({ logId }) or an uploaded file
 * ({ filePath, originalName }). In order:
 *
 *   1. Check the file completely — wrong shop or damaged file stops here.
 *   2. Take a pre-restore safety backup. If that fails, stop.
 *   3. Restore, keeping the admin running it.
 *   4. Clear the in-memory caches and make sure every model's indexes exist.
 *
 * Restores need S3, because the safety backup has to live somewhere durable.
 */
const restore = async ({ source, user }, setPhase = () => {}) => {
  const db = mongoose.connection.db;
  // An uploaded file is ours to delete from the moment we're called, whatever
  // happens next; a downloaded one from the moment it lands.
  let file = source.filePath || null;
  let log = null;

  try {
    if (!s3Configured()) {
      throw new AppError('Restoring needs backup storage (S3) set up, so a safety backup can be kept first.', 503);
    }

    let restoredFrom;
    if (source.logId) {
      const from = await BackupLog.findOne({
        _id: source.logId, status: 'success', pruned: false, s3Key: { $exists: true }
      });
      if (!from) throw new AppError('That backup is no longer available.', 404);
      setPhase('downloading');
      file = tempPath(from.fileName);
      const object = await s3(new GetObjectCommand({ Bucket: s3Service.bucketName, Key: from.s3Key }));
      await pipeline(object.Body, fs.createWriteStream(file));
      restoredFrom = from.fileName;
    } else {
      restoredFrom = `uploaded: ${source.originalName}`;
    }

    log = await BackupLog.create({ kind: 'restore', user: user?._id, userName: user?.name, restoredFrom });

    setPhase('checking');
    const { header } = await inspectBackup(file);
    if (header.database !== db.databaseName) {
      throw new AppError(`That backup is from a different database ("${header.database}"), not this shop's. Nothing was changed.`, 400);
    }

    setPhase('safety-backup');
    const safety = await takeBackup({ kind: 'pre-restore', user });
    log.safetyBackup = safety._id;

    setPhase('restoring');
    const { counts, total } = await restoreBackup(db, file, { preserveUserId: user?._id });

    setPhase('finishing');
    cacheService.flushAll();
    await Promise.all(mongoose.modelNames().map((name) =>
      mongoose.model(name).createIndexes().catch((err) =>
        console.error(`[Backup] Index check failed for ${name}:`, err.message))));

    Object.assign(log, { status: 'success', counts, totalDocuments: total, finishedAt: new Date() });
    await log.save();
    return {
      backupTakenAt: header.createdAt,
      restoredFrom,
      totalDocuments: total,
      safetyBackupId: safety._id,
      safetyBackupFileName: safety.fileName
    };
  } catch (err) {
    if (log) {
      Object.assign(log, { status: 'failed', error: err.message, finishedAt: new Date() });
      await log.save().catch(() => {});
    }
    throw err;
  } finally {
    if (file) fs.rm(file, { force: true }, () => {});
  }
};

// ── Overview for the Backups page ─────────────────────────────────────────────

const listBackups = () =>
  BackupLog.find({ kind: { $ne: 'restore' }, status: 'success', pruned: false })
    .sort({ startedAt: -1 })
    .limit(200)
    .lean();

const listRestores = () =>
  BackupLog.find({ kind: 'restore' }).sort({ startedAt: -1 }).limit(20).lean();

const lastSuccessfulBackup = () =>
  BackupLog.findOne({ kind: { $in: ['nightly', 'monthly', 'manual'] }, status: 'success' })
    .sort({ startedAt: -1 })
    .lean();

const schedulerEnabled = () => process.env.NODE_ENV === 'production' && s3Configured();

const getOverview = async () => ({
  // 'no-permission': the bucket has Object Lock, but the app may not use it.
  storage: await getStorageStatus().then((s) =>
    (lockRefused && s.objectLock === 'on' ? { ...s, objectLock: 'no-permission' } : s)),
  schedule: {
    enabled: schedulerEnabled(),
    nextRunAt: schedulerEnabled()
      ? moment.tz(TIMEZONE).add(moment.tz(TIMEZONE).hour() >= 2 ? 1 : 0, 'day').startOf('day').add(2, 'hours').toDate()
      : null
  },
  lastBackup: await lastSuccessfulBackup(),
  backups: await listBackups(),
  restores: await listRestores(),
  job: getJob(),
  lockDays: LOCK_DAYS,
  retentionDays: RETENTION_DAYS
});

// ── Schedule ──────────────────────────────────────────────────────────────────

// The first scheduled backup of each month is kept forever.
const scheduledKind = async () => {
  const monthStart = moment.tz(TIMEZONE).startOf('month').toDate();
  const haveMonthly = await BackupLog.exists({ kind: 'monthly', status: 'success', startedAt: { $gte: monthStart } });
  return haveMonthly ? 'nightly' : 'monthly';
};

const runScheduled = async (reason) => {
  try {
    const kind = await scheduledKind();
    console.log(`[Backup] Starting ${kind} backup (${reason})`);
    startJob('backup', () => takeBackup({ kind }));
  } catch (err) {
    console.error(`[Backup] Scheduled backup not started (${reason}): ${err.message}`);
  }
};

/**
 * Nightly at 2 AM shop time, plus a catch-up shortly after boot if the last
 * backup is more than a day old — a service that was asleep or redeploying
 * at 2 AM (Render's free tier sleeps) still gets its backup. Production only,
 * so a developer's laptop never backs up whatever database .env points at.
 */
const startBackupScheduler = () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Backup] Scheduled backups run in production only.');
    return;
  }
  if (!s3Configured()) {
    console.warn('[Backup] S3 is not configured — scheduled backups are OFF for this deployment.');
    return;
  }
  cron.schedule(NIGHTLY_CRON, () => runScheduled('nightly schedule'), { timezone: TIMEZONE });
  setTimeout(async () => {
    const last = await lastSuccessfulBackup().catch(() => null);
    if (!last || Date.now() - new Date(last.startedAt).getTime() > DAY_MS + 2 * 60 * 60 * 1000) {
      runScheduled('catch-up after start');
    }
  }, 2 * 60 * 1000);
  console.log('[Backup] Scheduler started — nightly at 2:00 AM shop time');
};

module.exports = {
  LOCK_DAYS,
  RETENTION_DAYS,
  s3Configured,
  getStorageStatus,
  getOverview,
  getJob,
  isRestoring,
  startJob,
  takeBackup,
  streamBackup,
  downloadUrl,
  restore,
  startBackupScheduler
};
