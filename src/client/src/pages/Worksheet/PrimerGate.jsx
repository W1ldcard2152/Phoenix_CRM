import React, { useState } from 'react';

const PRIORITY_OPTIONS = [
  { value: 'cost', label: 'Lowest Cost', hint: 'Cheapest source wins; willing to wait.' },
  { value: 'time', label: 'Fastest Availability', hint: 'Get it here soonest; cost is secondary.' },
];

const QUALITY_OPTIONS = [
  { value: 'oem', label: 'OEM', hint: 'Original-equipment parts only.' },
  { value: 'aftermarket', label: 'Aftermarket', hint: 'Quality aftermarket acceptable.' },
  { value: 'used-ok', label: 'Used OK', hint: 'Good used parts acceptable.' },
];

// Hard gate shown when a WO reaches sourcing with an unanswered primer (e.g. a
// converted quote). The part list and vendor ranking stay hidden until BOTH
// questions are answered, because the ranking is meaningless without them. The
// answers are written back to the WO ROOT, so they show everywhere afterward.
export default function PrimerGate({ onSubmit, vehicleLabel }) {
  const [priority, setPriority] = useState('');
  const [quality, setQuality] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = priority && quality && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ sourcingPriority: priority, sourcingQuality: quality });
    } catch (e) {
      setError('Could not save your answers. Please try again.');
      setSaving(false);
    }
  };

  const OptionGroup = ({ title, prompt, options, value, onChange }) => (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="text-xs text-gray-500 mb-2">{prompt}</p>
      <div className="space-y-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`w-full text-left px-3 py-2 rounded-md border transition ${
              value === opt.value
                ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600'
                : 'border-gray-300 bg-white hover:bg-gray-50'
            }`}
          >
            <span className="font-medium text-gray-900">{opt.label}</span>
            <span className="block text-xs text-gray-500">{opt.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto mt-8 px-4">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
        <h2 className="text-lg font-bold text-gray-900">Answer before sourcing</h2>
        <p className="text-sm text-gray-600 mt-1 mb-4">
          These can't be guessed — answer them fresh for{' '}
          <span className="font-medium">{vehicleLabel || 'this work order'}</span>. The vendor
          ranking and offer capture unlock once both are set.
        </p>

        <OptionGroup
          title="Sourcing Priority"
          prompt="What matters more for this job?"
          options={PRIORITY_OPTIONS}
          value={priority}
          onChange={setPriority}
        />
        <OptionGroup
          title="Parts Quality Preference"
          prompt="What quality of parts is acceptable?"
          options={QUALITY_OPTIONS}
          value={quality}
          onChange={setQuality}
        />

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full py-2 rounded-md font-medium text-white ${
            canSubmit ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving…' : 'Start Sourcing'}
        </button>
      </div>
    </div>
  );
}
