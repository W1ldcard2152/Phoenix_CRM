import React, { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import { formatCurrency } from '../../utils/formatters';

const SplitWorkOrderModal = ({ 
  isOpen, 
  onClose, 
  workOrder, 
  onSplit 
}) => {
  const [selectedParts, setSelectedParts] = useState([]);
  const [selectedLabor, setSelectedLabor] = useState([]);
  const [newWorkOrderTitle, setNewWorkOrderTitle] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset form when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setSelectedParts([]);
      setSelectedLabor([]);
      setNewWorkOrderTitle('');
    }
  }, [isOpen]);

  const handlePartSelection = (partId) => {
    setSelectedParts(prev => 
      prev.includes(partId) 
        ? prev.filter(id => id !== partId)
        : [...prev, partId]
    );
  };

  const handleLaborSelection = (laborId) => {
    setSelectedLabor(prev => 
      prev.includes(laborId) 
        ? prev.filter(id => id !== laborId)
        : [...prev, laborId]
    );
  };

  const calculateSelectedTotals = () => {
    const partsTotal = workOrder.parts
      .filter(part => selectedParts.includes(part._id))
      .reduce((total, part) => total + (part.price * part.quantity), 0);
    
    const laborTotal = workOrder.labor
      .filter(labor => selectedLabor.includes(labor._id))
      .reduce((total, labor) => {
        const qty = labor.quantity || labor.hours || 0;
        return total + (qty * labor.rate);
      }, 0);

    return { partsTotal, laborTotal, total: partsTotal + laborTotal };
  };

  const calculateRemainingTotals = () => {
    const partsTotal = workOrder.parts
      .filter(part => !selectedParts.includes(part._id))
      .reduce((total, part) => total + (part.price * part.quantity), 0);

    const laborTotal = workOrder.labor
      .filter(labor => !selectedLabor.includes(labor._id))
      .reduce((total, labor) => {
        const qty = labor.quantity || labor.hours || 0;
        return total + (qty * labor.rate);
      }, 0);

    return { partsTotal, laborTotal, total: partsTotal + laborTotal };
  };

  const handleSplit = async () => {
    if (selectedParts.length === 0 && selectedLabor.length === 0) {
      alert('Please select at least one part or labor item to move to the new work order.');
      return;
    }

    if (!newWorkOrderTitle.trim()) {
      alert('Please enter a title for the new work order.');
      return;
    }

    try {
      setLoading(true);
      await onSplit({
        partsToMove: selectedParts,
        laborToMove: selectedLabor,
        newWorkOrderTitle: newWorkOrderTitle.trim()
      });
      onClose();
    } catch (error) {
      console.error('Error splitting work order:', error);
      alert('Failed to split work order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedTotals = calculateSelectedTotals();
  const remainingTotals = calculateRemainingTotals();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Split Work Order" size="lg">
      <div className="space-y-6">
        {/* New Work Order Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            New Work Order Title *
          </label>
          <Input
            value={newWorkOrderTitle}
            onChange={(e) => setNewWorkOrderTitle(e.target.value)}
            placeholder="Enter title for the new work order..."
          />
        </div>

        {/* Parts Selection */}
        {workOrder.parts && workOrder.parts.length > 0 && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Select Parts to Move
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {workOrder.parts.map((part) => (
                <div
                  key={part._id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedParts.includes(part._id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handlePartSelection(part._id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedParts.includes(part._id)}
                          onChange={() => handlePartSelection(part._id)}
                          className="mr-3"
                        />
                        <div>
                          <p className="font-medium text-gray-900">{part.name}</p>
                          {part.partNumber && (
                            <p className="text-sm text-gray-500">Part #: {part.partNumber}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">
                        Qty: {part.quantity} × {formatCurrency(part.price)}
                      </p>
                      <p className="font-medium text-gray-900">
                        {formatCurrency(part.price * part.quantity)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Labor Selection */}
        {workOrder.labor && workOrder.labor.length > 0 && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Select Labor to Move
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {workOrder.labor.map((labor) => (
                <div
                  key={labor._id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedLabor.includes(labor._id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleLaborSelection(labor._id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedLabor.includes(labor._id)}
                          onChange={() => handleLaborSelection(labor._id)}
                          className="mr-3"
                        />
                        <div>
                          <p className="font-medium text-gray-900">{labor.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">
                        {labor.quantity || labor.hours}{labor.billingType !== 'fixed' ? ' hrs' : ''} × {formatCurrency(labor.rate)}
                      </p>
                      <p className="font-medium text-gray-900">
                        {formatCurrency((labor.quantity || labor.hours) * labor.rate)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="border-t pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">New Work Order Total</h4>
              <p className="text-sm text-gray-600">
                Parts: {formatCurrency(selectedTotals.partsTotal)}
              </p>
              <p className="text-sm text-gray-600">
                Labor: {formatCurrency(selectedTotals.laborTotal)}
              </p>
              <p className="font-bold text-blue-600">
                Total: {formatCurrency(selectedTotals.total)}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Remaining on Original</h4>
              <p className="text-sm text-gray-600">
                Parts: {formatCurrency(remainingTotals.partsTotal)}
              </p>
              <p className="text-sm text-gray-600">
                Labor: {formatCurrency(remainingTotals.laborTotal)}
              </p>
              <p className="font-bold text-gray-600">
                Total: {formatCurrency(remainingTotals.total)}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button
            onClick={onClose}
            variant="secondary"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSplit}
            disabled={loading || (selectedParts.length === 0 && selectedLabor.length === 0)}
          >
            {loading ? 'Splitting...' : 'Split Work Order'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default SplitWorkOrderModal;