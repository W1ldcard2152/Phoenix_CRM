import React, { useState } from 'react';
import Button from '../common/Button';
import Card from '../common/Card';
import ScanCapture from './scan/ScanCapture';
import ScanReview from './scan/ScanReview';
import { useScanReview } from './scan/useScanReview';

/**
 * Photo-based vehicle entry for a vehicle form: up to three photos
 * (registration/stickers, odometer, door jamb) → the server reads them → the
 * user reviews every value before any of it touches the form. Nothing is
 * applied silently: each value is a checkbox, and anything the server flagged
 * as doubtful starts unchecked.
 *
 * Props:
 *   currentValues — the form's values, to show what a scan would replace
 *   onApply({ fields, mileageRecords }) — the values the user accepted
 */
const VehicleScanner = ({ currentValues = {}, onApply }) => {
  const [phase, setPhase] = useState('capture'); // capture | review | applied
  const [result, setResult] = useState(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const review = useScanReview(result, currentValues);

  const apply = () => {
    const accepted = review.collect();
    onApply?.(accepted);
    setAppliedCount(Object.keys(accepted.fields).length + accepted.mileageRecords.length);
    setPhase('applied');
  };

  const reset = () => {
    setResult(null);
    setPhase('capture');
  };

  return (
    <Card className="bg-blue-50 border-blue-200">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            <i className="fas fa-camera mr-2 text-blue-600"></i>Scan Vehicle
          </h3>
          {phase === 'review' && <span className="text-xs text-gray-500">Review before filling in</span>}
        </div>

        {phase === 'capture' && (
          <ScanCapture
            intro="Photograph whatever you have — each photo is optional. The scan reads the VIN, plate, expiry dates, mileage, build date, tire size and paint code, and you review everything before it's filled in."
            onResult={(data) => { setResult(data); setPhase('review'); }}
          />
        )}

        {phase === 'review' && result && review.ready && (
          <>
            {Object.keys(result.fields).length === 0 && result.vin.status === 'none' && result.mileageRecords.length === 0 && (
              <p className="text-sm text-gray-600">Nothing usable was found in these photos.</p>
            )}
            <ScanReview result={result} review={review} currentValues={currentValues} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="light" onClick={reset}>Start over</Button>
              <Button type="button" variant="primary" onClick={apply}>
                <i className="fas fa-check mr-2"></i>Fill in selected
              </Button>
            </div>
          </>
        )}

        {phase === 'applied' && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-green-700">
              <i className="fas fa-check-circle mr-1"></i>
              Filled in {appliedCount} {appliedCount === 1 ? 'value' : 'values'}. Check the form, then save.
            </p>
            <Button type="button" size="sm" variant="light" onClick={reset}>Scan again</Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default VehicleScanner;
