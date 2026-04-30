import React, { useState } from 'react';
import Button from '../common/Button';
import InventoryService from '../../services/inventoryService';
import { formatCurrency } from '../../utils/formatters';

const STEPS = { UPLOAD: 'upload', REVIEW: 'review', DUPLICATES: 'duplicates' };

const SOURCE_LABELS = { inv: 'Shop Inventory' };

const InventoryReceiptImportModal = ({ isOpen, onClose, onSuccess, markupPercentage = 30 }) => {
  const [step, setStep] = useState(STEPS.UPLOAD);

  // Upload state
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptText, setReceiptText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState(null);

  // Review state
  const [extractedParts, setExtractedParts] = useState(null);
  const [shippingTotal, setShippingTotal] = useState(0);
  const [duplicates, setDuplicates] = useState([]);
  const [selected, setSelected] = useState([]);

  // Duplicate resolution state: { [parsedIndex]: 'add_to_existing' | 'create_new' }
  const [decisions, setDecisions] = useState({});
  const [confirming, setConfirming] = useState(false);

  const resetAll = () => {
    setStep(STEPS.UPLOAD);
    setReceiptFile(null);
    setReceiptText('');
    setExtracting(false);
    setError(null);
    setExtractedParts(null);
    setShippingTotal(0);
    setDuplicates([]);
    setSelected([]);
    setDecisions({});
    setConfirming(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // Extract receipt on Next from upload step
  const handleExtract = async () => {
    if (!receiptFile && !receiptText.trim()) {
      setError('Please provide either a file or paste text');
      return;
    }
    setError(null);
    setExtracting(true);

    try {
      const formData = new FormData();
      if (receiptFile) formData.append('receipt', receiptFile);
      else formData.append('receiptText', receiptText);

      const response = await InventoryService.extractReceipt(formData);
      const { parts, shippingTotal: shipping, duplicates: dupes } = response.data;

      setExtractedParts(parts);
      setShippingTotal(shipping);
      setDuplicates(dupes || []);
      setSelected(parts.map((_, i) => i));

      // Default decisions: matched items → add_to_existing, others → create_new
      const defaultDecisions = {};
      parts.forEach((_, i) => {
        const match = (dupes || []).find(d => d.parsedIndex === i);
        defaultDecisions[i] = match ? 'add_to_existing' : 'create_new';
      });
      setDecisions(defaultDecisions);

      setExtracting(false);
      setStep(STEPS.REVIEW);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to extract. Please try again.';
      setError(message);
      setExtracting(false);
    }
  };

  const handleReviewNext = () => {
    if (selected.length === 0) {
      setError('Please select at least one item');
      return;
    }
    setError(null);
    setStep(STEPS.DUPLICATES);
  };

  const handleConfirm = async () => {
    try {
      setConfirming(true);
      setError(null);

      const confirmedItems = selected.map(i => {
        const parsedItem = extractedParts[i];
        const type = decisions[i] || 'create_new';
        const match = duplicates.find(d => d.parsedIndex === i);
        return {
          parsedItem,
          type,
          existingId: type === 'add_to_existing' && match ? match.existingId : undefined
        };
      });

      const response = await InventoryService.confirmReceipt({
        confirmedItems,
        shippingTotal,
        totalAllUnits
      });

      const { newItemPrefills } = response.data;
      setConfirming(false);
      handleClose();

      if (onSuccess) {
        onSuccess(newItemPrefills || []);
      }
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to import. Please try again.';
      setError(message);
      setConfirming(false);
    }
  };

  const toggleItem = (index) => {
    setSelected(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const toggleAll = () => {
    if (selected.length === extractedParts.length) setSelected([]);
    else setSelected(extractedParts.map((_, i) => i));
  };

  const updatePart = (index, field, value) => {
    setExtractedParts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const totalAllUnits = (extractedParts || []).reduce((sum, p) => sum + (p.quantity || 1), 0);
  const shippingPerItem = totalAllUnits > 0 ? shippingTotal / totalAllUnits : 0;

  if (!isOpen) return null;

  // ──── Extracting spinner (shown between UPLOAD and REVIEW) ────
  if (extracting) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent mb-4"></div>
          <p className="text-gray-700 font-medium text-lg">Reading receipt...</p>
          <p className="text-sm text-gray-500 mt-1">AI is extracting items and checking for duplicates</p>
        </div>
      </div>
    );
  }

  // ──── Step 3: Duplicate resolution ────
  if (step === STEPS.DUPLICATES && extractedParts) {
    const selectedParts = selected.map(i => ({ index: i, part: extractedParts[i] }));
    const matchCount = selectedParts.filter(({ index }) =>
      decisions[index] === 'add_to_existing'
    ).length;
    const newCount = selectedParts.filter(({ index }) =>
      decisions[index] === 'create_new'
    ).length;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-1">Review Matches</h3>
          <p className="text-sm text-gray-600 mb-4">
            Confirm how each item should be imported. Matched items will increase the existing item's stock.
          </p>

          <div className="overflow-x-auto border rounded-md">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item (from receipt)</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Inventory Match</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Brand / Model</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {selectedParts.map(({ index, part }) => {
                  const match = duplicates.find(d => d.parsedIndex === index);
                  const decision = decisions[index] || 'create_new';
                  const costWithShip = part.price + shippingPerItem;
                  const finalPrice = costWithShip * (1 + markupPercentage / 100);

                  return (
                    <tr key={index} className="bg-white hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-900">{part.name}</div>
                        {part.vendor && <div className="text-xs text-gray-400">{part.vendor}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{part.quantity}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="text-gray-900">{formatCurrency(costWithShip)}</div>
                        <div className="text-xs text-gray-400">→ {formatCurrency(finalPrice)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        {match ? (
                          <div>
                            <div className="font-medium text-gray-800">{match.existingName}</div>
                            <div className="text-xs text-gray-400">
                              QOH: {match.existingQoh} · {match.reason}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            No match found
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">
                        {(() => {
                          const receiptBrandModel = [part.brand, part.itemNumber].filter(Boolean).join(' · ');
                          if (match) {
                            return [match.existingBrand, match.existingPartNumber].filter(Boolean).join(' · ') || receiptBrandModel || '—';
                          }
                          return receiptBrandModel || '—';
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        {match ? (
                          <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs">
                            <button
                              onClick={() => setDecisions(prev => ({ ...prev, [index]: 'add_to_existing' }))}
                              className={`px-2.5 py-1.5 font-medium transition-colors ${
                                decision === 'add_to_existing'
                                  ? 'bg-green-600 text-white'
                                  : 'bg-white text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              Add to Existing
                            </button>
                            <button
                              onClick={() => setDecisions(prev => ({ ...prev, [index]: 'create_new' }))}
                              className={`px-2.5 py-1.5 font-medium border-l border-gray-300 transition-colors ${
                                decision === 'create_new'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              New Item
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            New Item
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-sm text-gray-600 flex gap-4">
            {matchCount > 0 && (
              <span className="text-green-700 font-medium">
                {matchCount} item{matchCount !== 1 ? 's' : ''} will add to existing stock
              </span>
            )}
            {newCount > 0 && (
              <span className="text-blue-700 font-medium">
                {newCount} new item{newCount !== 1 ? 's' : ''} to create
              </span>
            )}
          </div>

          {newCount > 0 && (
            <div className="mt-2 p-3 bg-blue-50 rounded-md text-sm text-blue-800">
              <strong>{newCount} new item{newCount !== 1 ? 's' : ''}</strong> will open one-by-one to fill in additional details (category, unit, reorder point, etc.).
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm mt-3">
              {error}
            </div>
          )}

          <div className="flex justify-between mt-4">
            <Button variant="light" onClick={() => setStep(STEPS.REVIEW)} disabled={confirming}>
              <i className="fas fa-arrow-left mr-1"></i> Back
            </Button>
            <div className="flex space-x-3">
              <Button variant="light" onClick={handleClose} disabled={confirming}>Cancel</Button>
              <Button variant="primary" onClick={handleConfirm} disabled={confirming}>
                {confirming ? 'Importing...' : `Import ${selected.length} Item${selected.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ──── Step 2: Review extracted items ────
  if (step === STEPS.REVIEW && extractedParts) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Review Items</h3>
          <p className="text-sm text-gray-600 mb-1">
            {extractedParts.length} item{extractedParts.length !== 1 ? 's' : ''} extracted. Edit costs before continuing.
          </p>

          <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
            <span>Shipping / tax total:</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={shippingTotal}
                onChange={(e) => setShippingTotal(parseFloat(e.target.value) || 0)}
                className="w-24 pl-5 pr-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <span className="text-gray-400">÷ {totalAllUnits} unit{totalAllUnits !== 1 ? 's' : ''} = {shippingTotal > 0 ? `$${(shippingTotal / totalAllUnits).toFixed(2)}/unit` : '$0.00/unit'}</span>
          </div>

          <div className="overflow-x-auto border rounded-md mt-3">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selected.length === extractedParts.length}
                      onChange={toggleAll}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Brand / Model</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">+ Ship</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price ({markupPercentage}%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {extractedParts.map((part, index) => {
                  const isSelected = selected.includes(index);
                  const costWithShip = part.price + (isSelected ? shippingPerItem : 0);
                  const priceWithMarkup = costWithShip * (1 + markupPercentage / 100);

                  return (
                    <tr key={index} className={isSelected ? 'bg-blue-50' : 'bg-white opacity-50 hover:bg-gray-50'}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(index)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">{part.name}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {(() => {
                          const match = duplicates.find(d => d.parsedIndex === index);
                          const receiptBrandModel = [part.brand, part.itemNumber].filter(Boolean).join(' · ');
                          if (match) {
                            return [match.existingBrand, match.existingPartNumber].filter(Boolean).join(' · ') || receiptBrandModel || '—';
                          }
                          return receiptBrandModel || '—';
                        })()}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {part.vendor}{part.supplier ? ` / ${part.supplier}` : ''}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">{part.quantity}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="relative inline-block">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={part.price}
                            onChange={(e) => updatePart(index, 'price', parseFloat(e.target.value) || 0)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-24 pl-5 pr-1 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {isSelected && shippingPerItem > 0 ? `+${formatCurrency(shippingPerItem)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {isSelected ? formatCurrency(priceWithMarkup) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-sm text-gray-600">
            {selected.length} of {extractedParts.length} items selected
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm mt-3">
              {error}
            </div>
          )}

          <div className="flex justify-between mt-4">
            <Button variant="light" onClick={() => { setStep(STEPS.UPLOAD); setExtractedParts(null); setError(null); }}>
              <i className="fas fa-arrow-left mr-1"></i> Start Over
            </Button>
            <div className="flex space-x-3">
              <Button variant="light" onClick={handleClose}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleReviewNext}
                disabled={selected.length === 0}
              >
                Next <i className="fas fa-arrow-right ml-1"></i>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ──── Step 1: Upload / paste ────
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Import to Shop Inventory</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Receipt or Screenshot
            </label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => { setReceiptFile(e.target.files[0]); setReceiptText(''); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            {receiptFile && (
              <p className="text-sm text-gray-600 mt-2">Selected: {receiptFile.name}</p>
            )}
          </div>

          <div className="flex items-center">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="px-4 text-sm text-gray-500">OR</span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Paste Receipt Text</label>
            <textarea
              rows="6"
              placeholder="Paste receipt text here..."
              value={receiptText}
              onChange={(e) => { setReceiptText(e.target.value); setReceiptFile(null); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>AI will extract</strong> item names, quantities, prices, and vendors — then check for existing inventory matches to avoid duplicates.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="light" onClick={handleClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleExtract}
            disabled={!receiptFile && !receiptText.trim()}
          >
            Next <i className="fas fa-arrow-right ml-1"></i>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InventoryReceiptImportModal;
