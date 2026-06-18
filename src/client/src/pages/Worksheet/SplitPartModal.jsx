import React, { useState } from 'react';

// Split one placeholder part into N independently-sourced lines (e.g. "tie rod
// ends qty 2" → left PN ≠ right PN). Clones the placeholder into N parts and
// redistributes the requested quantity; each resulting line then sources on its
// own. This is the ONLY sanctioned part creation in the worksheet.
export default function SplitPartModal({ part, onClose, onConfirm }) {
  const total = part.quantity || 1;
  const [lines, setLines] = useState(() => {
    // Default: two lines, quantity split as evenly as possible.
    const base = Math.floor(total / 2);
    return [
      { name: part.name, quantity: base || 1 },
      { name: part.name, quantity: total - (base || 1) > 0 ? total - (base || 1) : 1 },
    ];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const sum = lines.reduce((t, l) => t + (parseInt(l.quantity, 10) || 0), 0);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { name: part.name, quantity: 1 }]);
  const removeLine = (i) => setLines((ls) => (ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls));

  const valid =
    lines.length >= 2 &&
    lines.every((l) => l.name.trim() && (parseInt(l.quantity, 10) || 0) >= 1) &&
    sum === total;

  const handleConfirm = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(lines.map((l) => ({ name: l.name.trim(), quantity: parseInt(l.quantity, 10) })));
    } catch (e) {
      setError('Could not split the part. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-5">
        <h3 className="text-lg font-bold text-gray-900">Split “{part.name}”</h3>
        <p className="text-sm text-gray-600 mt-1 mb-4">
          Divide the requested quantity ({total}) across separately-sourced lines. Each line gets its
          own offers and selection.
        </p>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                value={l.name}
                onChange={(e) => setLine(i, { name: e.target.value })}
                placeholder={`Line ${i + 1} name`}
              />
              <input
                type="number"
                min="1"
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                value={l.quantity}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
              />
              {lines.length > 2 && (
                <button type="button" onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-600">
                  <i className="fas fa-times" />
                </button>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={addLine} className="mt-2 text-sm text-primary-600 hover:text-primary-800">
          <i className="fas fa-plus mr-1" /> Add line
        </button>

        <p className={`text-sm mt-3 ${sum === total ? 'text-gray-500' : 'text-red-600'}`}>
          Quantities sum to {sum} of {total}
          {sum !== total && ' — must match the original.'}
        </p>
        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!valid || saving}
            className={`px-3 py-2 text-sm rounded-md text-white ${
              valid && !saving ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-300 cursor-not-allowed'
            }`}
          >
            {saving ? 'Splitting…' : `Split into ${lines.length} lines`}
          </button>
        </div>
      </div>
    </div>
  );
}
