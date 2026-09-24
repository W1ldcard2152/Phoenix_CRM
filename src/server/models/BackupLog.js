const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// One row per backup taken and per restore run. The index of what's in S3,
// and the audit trail of who restored what.
//
// This collection is deliberately EXCLUDED from backups and restores (see
// utils/backupFormat.js): restoring last Tuesday's data must not also erase
// the record of the backups taken since — including the safety backup that
// undoes the restore.
const BackupLogSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ['nightly', 'monthly', 'manual', 'pre-restore', 'restore'],
      required: true
    },
    status: {
      type: String,
      enum: ['running', 'success', 'failed'],
      default: 'running'
    },
    s3Key: String,
    fileName: String,
    size: Number,
    sha256: String,
    counts: { type: Schema.Types.Mixed, default: {} },
    totalDocuments: Number,
    // Object Lock retention — the backup cannot be deleted before this date,
    // not even with the app's own credentials.
    lockedUntil: Date,
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
    error: String,
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    userName: String, // kept as text: the user may not exist after a restore
    // Restores only
    restoredFrom: String, // backup file name, or "uploaded: <name>"
    safetyBackup: { type: Schema.Types.ObjectId, ref: 'BackupLog' },
    // Retired by the retention policy. The S3 object gets a delete marker; the
    // bucket's lifecycle rule removes the data 90 days later.
    pruned: { type: Boolean, default: false },
    prunedAt: Date
  },
  { collection: 'backuplogs' }
);

BackupLogSchema.index({ kind: 1, status: 1, startedAt: -1 });

module.exports = mongoose.model('BackupLog', BackupLogSchema);
