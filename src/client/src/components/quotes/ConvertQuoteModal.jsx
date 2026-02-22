import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';

const ConvertQuoteModal = ({ isOpen, onClose, quote, onConvert }) => {
  const [selectedParts, setSelectedParts] = useState([]);
  const [selectedLabor, setSelectedLabor] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && quote) {
      // Default: select all
      setSelectedParts(quote.parts?.map(p => p._id) || []);
      setSelectedLabor(quote.labor?.map(l => l._id) || []);
    }
  }, [isOpen, quote]);

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

  const toggleSelectAll = () => {
    const allPartsSelected = selectedParts.length === (quote.parts?.length || 0);
    const allLaborSelected = selectedLabor.length === (quote.labor?.length || 0);

    if (allPartsSelected && allLaborSelected) {
      setSelectedParts([]);
      setSelectedLabor([]);
    } else {
      setSelectedParts(quote.parts?.map(p => p._id) || []);
      setSelectedLabor(quote.labor?.map(l => l._id) || []);
    }
  };

  const calculateSelectedTotals = () => {
    const partsTotal = (quote.parts || [])
      .filter(part => selectedParts.includes(part._id))
      .reduce((total, part) => total + (part.price * part.quantity), 0);
    const laborTotal = (quote.labor || [])
      .filter(labor => selectedLabor.includes(labor._id))
      .reduce((total, labor) => {
        const qty = labor.quantity || labor.hours || 0;
        return total + (qty * labor.rate);
      }, 0);
    return { partsTotal, laborTotal, total: partsTotal + laborTotal };
  };

  const calculateRemainingTotals = () => {
    const partsTotal = (quote.parts || [])
      .filter(part => !selectedParts.includes(part._id))
      .reduce((total, part) => total + (part.price * part.quantity), 0);
    const laborTotal = (quote.labor || [])
      .filter(labor => !selectedLabor.includes(labor._id))
      .reduce((total, labor) => {
        const qty = labor.quantity || labor.hours || 0;
        return total + (qty * labor.rate);
      }, 0);
    return { partsTotal, laborTotal, total: partsTotal + laborTotal };
  };

  const handleConvert = async () => {
    if (selectedParts.length === 0 && selectedLabor.length === 0) {
      alert('Please select at least one part or labor item to convert.');
      return;
    }

    try {
      setLoading(true);

      const allPartsSelected = selectedParts.length === (quote.parts?.length || 0);
      const allLaborSelected = selectedLabor.length === (quote.labor?.length || 0);
      const isFullConversion = allPartsSelected && allLaborSelected;

      const data = isFullConversion ? {} : {
        partsToConvert: selectedParts,
        laborToConvert: selectedLabor
      };

      await onConvert(data);
      onClose();
    } catch (error) {
      console.error('Error converting quote:', error);
      alert('Failed to convert quote. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!quote) return null;

  const selectedTotals = calculateSelectedTotals();
  const remainingTotals = calculateRemainingTotals();
  const allSelected = selectedParts.length === (quote.parts?.length || 0) &&
    selectedLabor.length === (quote.labor?.length || 0);
  const nothingToConvert = (!quote.parts || quote.parts.length === 0) && (!quote.labor || quote.labor.length === 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Convert Quote to Work Order" size="lg">
      <div className="space-y-6">
        {nothingToConvert ? (
          <div className="text-center py-4">
            <p className="text-gray-600">This quote has no parts or labor to convert.</p>
            <p className="text-sm text-gray-500 mt-1">Add parts and labor to the quote first, then convert.</p>
          </div>
        ) : (
          <>
            {/* Select All Toggle */}
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">
                Select the parts and labor items to include in the new work order.
              </p>
              <button
                type="button"
                className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                onClick={toggleSelectAll}
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Parts Selection */}
            {quote.parts && quote.parts.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Parts</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {quote.parts.map((part) => (
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
                            Qty: {part.quantity} x {formatCurrency(part.price)}
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
            {quote.labor && quote.labor.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Labor</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {quote.labor.map((labor) => (
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
                            {labor.quantity || labor.hours}{labor.billingType !== 'fixed' ? ' hrs' : ''} x {formatCurrency(labor.rate)}
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
                  <h4 className="font-medium text-gray-900 mb-2">New Work Order</h4>
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
                  <h4 className="font-medium text-gray-900 mb-2">Remaining on Quote</h4>
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

              {allSelected && (
                <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800">
                    <i className="fas fa-info-circle mr-1"></i>
                    All items selected — the quote will be archived after conversion.
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button onClick={onClose} variant="light" disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={handleConvert}
                variant="primary"
                disabled={loading || (selectedParts.length === 0 && selectedLabor.length === 0)}
              >
                {loading ? (
                  <><i className="fas fa-spinner fa-spin mr-1"></i>Converting...</>
                ) : (
                  <><i className="fas fa-arrow-right mr-1"></i>Convert Selected to Work Order</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default ConvertQuoteModal;
