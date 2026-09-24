import React, { useCallback, useEffect, useRef, useState } from 'react';
import moment from 'moment';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import API from '../../services/api';
import { formatDateTime } from '../../utils/formatters';

const KIND_LABELS = {
  nightly: { label: 'Nightly', className: 'bg-gray-100 text-gray-700' },
  monthly: { label: 'Monthly', className: 'bg-blue-100 text-blue-800' },
  manual: { label: 'Manual', className: 'bg-green-100 text-green-800' },
  'pre-restore': { label: 'Before restore', className: 'bg-amber-100 text-amber-800' }
};

const PHASE_LABELS = {
  starting: 'Starting…',
  downloading: 'Fetching the backup…',
  checking: 'Checking the backup file…',
  'safety-backup': 'Taking a safety backup of the current data…',
  restoring: 'Restoring…',
  finishing: 'Finishing up…'
};

const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const Warning = ({ children }) => (
  <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded text-sm">{children}</div>
);

const BackupsPage = () => {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [job, setJob] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null); // { backup } or { file }
  const [confirmText, setConfirmText] = useState('');
  const [restoreDone, setRestoreDone] = useState(null);
  const fileInput = useRef(null);
  const [pickedFile, setPickedFile] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await API.get('/backups');
      setOverview(res.data.data);
      setJob(res.data.data.job);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load backups.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const running = Boolean(job && !job.finishedAt);

  // Poll while a backup or restore runs, then refresh the list once it ends.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(async () => {
      try {
        const res = await API.get('/backups/job');
        const next = res.data.data.job;
        setJob(next);
        if (next && next.finishedAt) {
          if (next.type === 'restore' && !next.error) setRestoreDone(next.result);
          load();
        }
      } catch {
        // Transient — keep polling.
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [running, load]);

  const startBackup = async () => {
    setError(null);
    try {
      const res = await API.post('/backups');
      setJob(res.data.data.job);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start a backup.');
    }
  };

  // A plain navigation, not axios: the file streams straight to disk and a
  // big shop's backup can outlast the API client's timeout.
  const downloadFresh = () => { window.location.href = '/api/backups/download'; };

  const downloadStored = async (backup) => {
    try {
      const res = await API.get(`/backups/${backup._id}/download`);
      window.location.href = res.data.data.url;
    } catch (err) {
      setError(err.response?.data?.message || 'Could not download that backup.');
    }
  };

  const openRestore = (target) => {
    setConfirmText('');
    setRestoreDone(null);
    setRestoreTarget(target);
  };

  const confirmRestore = async () => {
    const target = restoreTarget;
    setRestoreTarget(null);
    setError(null);
    try {
      let res;
      if (target.backup) {
        res = await API.post(`/backups/${target.backup._id}/restore`, { confirm: 'RESTORE' });
      } else {
        const form = new FormData();
        form.append('file', target.file);
        form.append('confirm', 'RESTORE');
        res = await API.post('/backups/restore-upload', form, { timeout: 0 });
        setPickedFile(null);
        if (fileInput.current) fileInput.current.value = '';
      }
      setJob(res.data.data.job);
    } catch (err) {
      setError(err.response?.data?.message || 'The restore could not start.');
    }
  };

  if (!overview) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-gray-800 mb-4">Backups</h1>
        {error ? <div className="text-red-600">{error}</div> : <p className="text-gray-500">Loading…</p>}
      </div>
    );
  }

  const { storage, schedule, lastBackup, backups, restores, lockDays } = overview;
  const lastAgeHours = lastBackup ? moment().diff(moment(lastBackup.startedAt), 'hours') : null;
  const stale = schedule.enabled && (lastAgeHours === null || lastAgeHours > 48);
  const jobFailed = job && job.finishedAt && job.error;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <h1 className="text-2xl font-semibold text-gray-800">Backups</h1>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

      {/* Status */}
      <Card>
        <div className="p-4 space-y-3">
          <div className={`text-base ${stale ? 'text-red-700 font-semibold' : 'text-gray-800'}`}>
            {lastBackup
              ? <>Last backup: <strong>{moment(lastBackup.startedAt).fromNow()}</strong> ({formatDateTime(lastBackup.startedAt)})</>
              : 'No backups yet.'}
          </div>
          <div className="text-sm text-gray-600">
            {schedule.enabled
              ? <>Backs up automatically every night at 2:00 AM — next {formatDateTime(schedule.nextRunAt)}.</>
              : storage.configured
                ? 'Automatic nightly backups run on the live site only.'
                : 'Automatic nightly backups are off.'}
          </div>

          {!storage.configured && (
            <Warning>
              Backup storage isn't set up for this shop, so nothing is backed up automatically and restores
              are unavailable. You can still <strong>download a copy</strong> and keep it safe yourself.
            </Warning>
          )}
          {storage.configured && storage.objectLock !== 'on' && (
            <Warning>
              {storage.objectLock === 'off'
                ? 'Backups are not locked, so they could be deleted by mistake or by someone with access. Turn on Object Lock for the storage bucket to protect them.'
                : storage.objectLock === 'no-permission'
                  ? "Backups are not being locked: the storage bucket supports it, but the app's storage permissions don't allow it (s3:PutObjectRetention)."
                  : "Couldn't check whether backups are locked — the app's storage permissions may be missing a read permission."}
            </Warning>
          )}
          {storage.configured && storage.versioning !== 'on' && (
            <Warning>
              {storage.versioning === 'off'
                ? 'Deleted photos and files cannot be recovered. Turn on versioning for the storage bucket so they can.'
                : "Couldn't check whether deleted photos and files are recoverable — the app's storage permissions may be missing a read permission."}
            </Warning>
          )}
          {storage.configured && storage.objectLock === 'on' && storage.versioning === 'on' && (
            <div className="text-sm text-green-700">
              <i className="fas fa-lock mr-1"></i>
              Each backup is locked for {lockDays} days, and deleted photos and files stay recoverable.
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" size="sm" onClick={startBackup} disabled={running || !storage.configured}>
              Back up now
            </Button>
            <Button variant="outline" size="sm" onClick={downloadFresh} disabled={running}>
              Download a copy
            </Button>
          </div>

          {running && (
            <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded px-4 py-3">
              <i className="fas fa-spinner fa-spin mr-2"></i>
              {job.type === 'restore'
                ? <>{PHASE_LABELS[job.phase] || 'Working…'} Saving is paused for everyone until this finishes.</>
                : 'Backing up…'}
            </div>
          )}
          {jobFailed && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
              The {job.type} failed: {job.error}
              {job.type === 'restore' && ' Nothing was changed unless the message says otherwise.'}
            </div>
          )}
          {restoreDone && (
            <div className="bg-green-50 border border-green-300 text-green-900 px-4 py-3 rounded text-sm space-y-2">
              <p>
                Restored the shop to <strong>{formatDateTime(restoreDone.backupTakenAt)}</strong>.
                The data from just before the restore was saved as a <strong>Before restore</strong> backup
                below — restore that one to undo this.
              </p>
              <Button size="sm" variant="primary" onClick={() => window.location.reload()}>Reload the app</Button>
            </div>
          )}
        </div>
      </Card>

      {/* Stored backups */}
      <Card title="Saved backups">
        {backups.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">None yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Taken</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Kind</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Records</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Size</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Locked until</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {backups.map((b) => {
                  const kind = KIND_LABELS[b.kind] || { label: b.kind, className: 'bg-gray-100 text-gray-700' };
                  return (
                    <tr key={b._id}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatDateTime(b.startedAt)}
                        {b.userName && b.kind !== 'nightly' && b.kind !== 'monthly' && (
                          <span className="text-gray-400"> · {b.userName}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${kind.className}`}>{kind.label}</span>
                      </td>
                      <td className="px-4 py-2 text-right">{b.totalDocuments?.toLocaleString() ?? '—'}</td>
                      <td className="px-4 py-2 text-right">{formatSize(b.size)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                        {b.lockedUntil ? formatDateTime(b.lockedUntil, 'MMM D, YYYY') : '—'}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                        <button className="text-primary-600 hover:text-primary-800 font-medium" onClick={() => downloadStored(b)}>
                          Download
                        </button>
                        <button
                          className="text-red-600 hover:text-red-800 font-medium disabled:opacity-40"
                          disabled={running}
                          onClick={() => openRestore({ backup: b })}
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-4 py-3 text-xs text-gray-500 border-t">
          Nightly and manual backups are kept 35 days, backups taken before a restore 90 days,
          and the first backup of each month is kept for good.
        </p>
      </Card>

      {/* Restore from a file */}
      <Card title="Restore from a file">
        <div className="p-4 space-y-3 text-sm">
          <p className="text-gray-600">
            Use a <code>.cvbackup</code> file — one you downloaded here, or from a backup drive.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept=".cvbackup"
              onChange={(e) => setPickedFile(e.target.files[0] || null)}
              className="text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!pickedFile || running || !storage.configured}
              onClick={() => openRestore({ file: pickedFile })}
            >
              Restore this file
            </Button>
          </div>
        </div>
      </Card>

      {/* Restore history */}
      {restores.length > 0 && (
        <Card title="Recent restores">
          <ul className="divide-y divide-gray-100 text-sm">
            {restores.map((r) => (
              <li key={r._id} className="px-4 py-2">
                <span className="text-gray-800">{formatDateTime(r.startedAt)}</span>
                <span className="text-gray-500"> · {r.userName || 'Someone'} restored {r.restoredFrom}</span>
                {r.status === 'failed' && <span className="text-red-600"> — failed: {r.error}</span>}
                {r.status === 'running' && <span className="text-gray-500"> — did not finish</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Confirm restore */}
      {restoreTarget && (
        <Modal isOpen onClose={() => setRestoreTarget(null)} title="Restore this backup?" size="md">
          <div className="space-y-4 text-sm text-gray-700">
            <p>
              Every customer, vehicle, work order, invoice and setting will go back to how it was
              {restoreTarget.backup
                ? <> on <strong>{formatDateTime(restoreTarget.backup.startedAt)}</strong></>
                : <> in <strong>{restoreTarget.file.name}</strong></>}.
              Anything entered since then will be replaced.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-gray-600">
              <li>A backup of the shop as it is right now is taken first — restore that to undo.</li>
              <li>Photos and files are not affected.</li>
              <li>Saving is paused for everyone while it runs, usually under a minute.</li>
            </ul>
            <div>
              <label className="block text-gray-700 mb-1">Type <strong>RESTORE</strong> to confirm</label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="light" onClick={() => setRestoreTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmRestore} disabled={confirmText !== 'RESTORE'}>Restore</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default BackupsPage;
