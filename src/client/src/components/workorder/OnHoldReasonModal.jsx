import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import SelectInput from '../common/SelectInput';
import Input from '../common/Input';
import Button from '../common/Button';

const HOLD_REASONS = [
  { value: '', label: 'Select a reason...' },
  { value: 'Waiting for Parts', label: 'Waiting for Parts' },
  { value: 'Waiting for Customer Approval', label: 'Waiting for Customer Approval' },
  { value: 'Waiting for Insurance', label: 'Waiting for Insurance' },
  { value: 'Customer Requested Delay', label: 'Customer Requested Delay' },
  { value: 'Shop Capacity', label: 'Shop Capacity' },
  { value: 'Backordered Parts', label: 'Backordered Parts' },
  { value: 'Vehicle Storage', label: 'Vehicle Storage' },
  { value: 'Other', label: 'Other' }
];

const OnHoldReasonModal = ({ isOpen, onClose, onConfirm, loading }) => {
  const [selectedReason, setSelectedReason] = useState('');
  const [otherReason, setOtherReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedReason('');
      setOtherReason('');
    }
  }, [isOpen]);

  const isValid = selectedReason && (selectedReason !== 'Other' || otherReason.trim());

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      holdReason: selectedReason,
      holdReasonOther: selectedReason === 'Other' ? otherReason.trim() : undefined
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Place Work Order On Hold">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Please select a reason for placing this work order on hold.
        </p>

        <SelectInput
          label="Hold Reason"
          name="holdReason"
          options={HOLD_REASONS}
          value={selectedReason}
          onChange={(e) => setSelectedReason(e.target.value)}
          required
        />

        {selectedReason === 'Other' && (
          <Input
            label="Please specify"
            name="holdReasonOther"
            value={otherReason}
            onChange={(e) => setOtherReason(e.target.value)}
            placeholder="Enter the reason..."
            required
          />
        )}

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button variant="light" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!isValid || loading}
          >
            {loading ? 'Updating...' : 'Place On Hold'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default OnHoldReasonModal;
