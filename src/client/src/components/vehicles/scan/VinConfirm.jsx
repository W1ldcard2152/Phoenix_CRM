import React from 'react';
import Button from '../../common/Button';
import Card from '../../common/Card';
import { ScanWarning } from './ScanReview';

const inputCls = 'block w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-base sm:text-sm font-mono';

/**
 * "Confirm the VIN" step, shown when a scan couldn't settle on one VIN.
 *
 * options   — [{ value, label }] from confirmOptions()
 * matches   — { [vin]: 'On file: …' } for options that are already on file
 * skipLabel — the button for going on without a VIN
 */
const VinConfirm = ({ scan, options, matches = {}, pick, onPick, typed, onType, error, onContinue, onSkip, skipLabel, onStartOver }) => (
  <Card title="Confirm the VIN">
    <div className="space-y-3">
      {scan.warnings.filter(w => w.field === 'vin').map((w, i) => <ScanWarning key={i} warning={w} />)}
      {scan.vin.status === 'none' && (
        <p className="text-sm text-gray-700">
          No VIN was found in the photo{scan.fields.licensePlate ? `, and plate ${scan.fields.licensePlate} doesn't match a single vehicle on file` : ''}.
        </p>
      )}
      {options.length > 0 && (
        <div className="space-y-2">
          {options.map(opt => (
            <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="vinPick"
                className="mt-1"
                checked={pick === opt.value && !typed}
                onChange={() => { onPick(opt.value); onType(''); }}
              />
              <span>
                <span className="font-mono text-sm">{opt.value}</span>
                <span className="block text-xs text-gray-500">{opt.label}</span>
                {matches[opt.value] && (
                  <span className="block text-xs text-green-700">
                    <i className="fas fa-check-circle mr-1"></i>{matches[opt.value]}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {options.length ? 'Or type the VIN from the vehicle' : 'Type the VIN from the vehicle'}
        </label>
        <input
          className={inputCls}
          value={typed}
          maxLength={17}
          onChange={(e) => onType(e.target.value.toUpperCase())}
          placeholder="17 characters"
        />
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>}
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="light" onClick={onStartOver}>Start over</Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onSkip}>{skipLabel}</Button>
          <Button type="button" variant="primary" onClick={onContinue}>Continue</Button>
        </div>
      </div>
    </div>
  </Card>
);

export default VinConfirm;
