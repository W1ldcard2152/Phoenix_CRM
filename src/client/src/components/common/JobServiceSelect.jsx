import React, { useState } from 'react';

// Dropdown for assigning a part/labor line to a "job" (a Services Requested entry).
// Lists existing services, a "General (unassigned)" option, and — when onCreateService
// is provided — an inline "+ New service" flow to create a job on the spot.
//
// Props:
//   services         array of { _id, description }
//   value            selected service _id (string) or null/'' for General
//   onChange(id|null)
//   onCreateService(description) -> Promise<serviceId>   (optional)
//   label            field label (default "Job / Service")
const JobServiceSelect = ({ services = [], value, onChange, onCreateService, label = 'Job / Service' }) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === '__new__') {
      setCreating(true);
      return;
    }
    onChange(v === '' ? null : v);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !onCreateService) return;
    setBusy(true);
    try {
      const newId = await onCreateService(name);
      if (newId) onChange(newId);
      setCreating(false);
      setNewName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {!creating ? (
        <select
          value={value || ''}
          onChange={handleSelect}
          className="w-full border rounded px-3 py-2 text-sm"
        >
          <option value="">General (unassigned)</option>
          {services.filter((s) => s && s._id).map((s) => (
            <option key={s._id} value={s._id}>{s.description}</option>
          ))}
          {onCreateService && <option value="__new__">+ New service…</option>}
        </select>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
            className="flex-1 border rounded px-3 py-2 text-sm"
            placeholder="New service name"
            autoFocus
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || !newName.trim()}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setNewName(''); }}
            className="px-3 py-2 text-sm border rounded"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default JobServiceSelect;
