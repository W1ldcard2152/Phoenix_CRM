import React from 'react';
import { FIELD_ORDER, displayValue, isBlank, sameValue, vinOptions } from './useScanReview';

const LEVEL_STYLES = {
  error: 'text-red-700',
  warning: 'text-amber-700',
  info: 'text-gray-600'
};
const LEVEL_ICONS = {
  error: 'fa-exclamation-circle',
  warning: 'fa-exclamation-triangle',
  info: 'fa-info-circle'
};

export const ScanWarning = ({ warning }) => (
  <p className={`text-xs mt-1 ${LEVEL_STYLES[warning.level] || LEVEL_STYLES.info}`}>
    <i className={`fas ${LEVEL_ICONS[warning.level] || LEVEL_ICONS.info} mr-1`}></i>
    {warning.message}
  </p>
);

/**
 * Checkbox list of a scan's values and mileage records.
 *
 * @param result        - scan result from the server
 * @param review        - useScanReview(result, currentValues)
 * @param currentValues - what's on file, to show "Replaces …"
 * @param hideFields    - fields the page renders itself; their warnings move to the top
 * @param onlyChanges   - hide values that already match what's on file
 */
const ScanReview = ({ result, review, currentValues = {}, hideFields = [], onlyChanges = false }) => {
  const { checked, setChecked, vinChoice, setVinChoice, records, setRecords } = review;
  const hidden = new Set(hideFields);
  const warningsFor = (field) => result.warnings.filter(w => w.field === field);
  const options = vinOptions(result.vin);

  const candidateRows = FIELD_ORDER.filter(([field]) => {
    if (hidden.has(field)) return false;
    return field === 'vin' ? result.vin.status !== 'none' : result.fields[field] !== undefined;
  });
  const matches = ([field]) => {
    const value = field === 'vin' ? vinChoice : result.fields[field];
    return sameValue(field, currentValues[field], value) && warningsFor(field).length === 0;
  };
  const rows = onlyChanges ? candidateRows.filter(row => !matches(row)) : candidateRows;
  const unchangedCount = candidateRows.length - rows.length;

  // Warnings for fields without a row here (hidden, or rendered by the page) go on top.
  // A row hidden by onlyChanges never has warnings — see matches().
  const shownFields = new Set([...rows.map(([f]) => f), 'mileageHistory']);
  const general = result.warnings.filter(w => !shownFields.has(w.field));

  return (
    <div className="space-y-3">
      {(general.length > 0 || result.notes) && (
        <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
          {general.map((w, i) => <ScanWarning key={i} warning={w} />)}
          {result.notes && <ScanWarning warning={{ level: 'info', message: `Scanner note: ${result.notes}` }} />}
        </div>
      )}

      {rows.length > 0 && (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white">
          {rows.map(([field, label]) => {
            const isVin = field === 'vin';
            const value = isVin ? vinChoice : result.fields[field];
            const current = currentValues[field];
            const replaces = !isBlank(current) && !isBlank(value) && !sameValue(field, current, value);
            return (
              <div key={field} className="px-3 py-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={!!checked[field] && !isBlank(value)}
                    disabled={isBlank(value)}
                    onChange={(e) => setChecked(prev => ({ ...prev, [field]: e.target.checked }))}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs text-gray-500">{label}</span>
                    <span className={`block text-sm font-medium text-gray-900 break-all ${isVin ? 'font-mono' : ''}`}>
                      {displayValue(field, value)}
                    </span>
                    {replaces && (
                      <span className="block text-xs text-gray-500">Replaces {displayValue(field, current)}</span>
                    )}
                  </span>
                </label>
                {isVin && options.length > 1 && (
                  <div className="ml-7 mt-1 space-y-1">
                    {options.map(opt => (
                      <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="vinChoice"
                          checked={vinChoice === opt.value}
                          onChange={() => { setVinChoice(opt.value); setChecked(prev => ({ ...prev, vin: true })); }}
                        />
                        <span className="font-mono">{opt.value}</span>
                        <span className="text-xs text-gray-500">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="ml-7">
                  {warningsFor(field).map((w, i) => <ScanWarning key={i} warning={w} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onlyChanges && unchangedCount > 0 && (
        <p className="text-xs text-gray-500">
          <i className="fas fa-check mr-1"></i>
          {unchangedCount} scanned {unchangedCount === 1 ? 'value matches' : 'values match'} what's on file.
        </p>
      )}

      {records.length > 0 && (
        <div className="border border-gray-200 rounded-lg bg-white px-3 py-2">
          <p className="text-xs text-gray-500 mb-1">Add to mileage history</p>
          {records.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 py-1">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={r.include && !!r.date}
                disabled={!r.date}
                onChange={(e) => setRecords(prev => prev.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))}
              />
              <input
                type="date"
                value={r.date || ''}
                onChange={(e) => setRecords(prev => prev.map((x, j) => j === i ? { ...x, date: e.target.value, include: !!e.target.value } : x))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
              <span className="text-sm font-medium text-gray-900">{Number(r.mileage).toLocaleString()} mi</span>
              <span className="text-xs text-gray-500 basis-full sm:basis-auto">{r.notes}</span>
            </div>
          ))}
          {warningsFor('mileageHistory').map((w, i) => <ScanWarning key={i} warning={w} />)}
        </div>
      )}
    </div>
  );
};

export default ScanReview;
