import React, { useState } from 'react';
import Button from './Button';
import API from '../../services/api';
import { formatCurrency } from '../../utils/formatters';

const STEPS = { UPLOAD: 'upload', TYPE: 'type', REVIEW: 'review', DUPLICATES: 'duplicates' };

const SOURCE_LABELS = { wo: 'In this WO', catalog: 'Parts Catalog', inv: 'Shop Inventory' };

const ReceiptImportModal = ({ isOpen, onClose, entityId, onSuccess, markupPercentage = 30 }) => {
  const [step, setStep] = useState(STEPS.UPLOAD);

  // Upload state
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptText, setReceiptText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState(null);

  // Type choice
  const [isOrder, setIsOrder] = useState(null);

  // Review state
  const [extractedParts, setExtractedParts] = useState(null);
  const [shippingTotal, setShippingTotal] = useState(0);
  const [duplicates, setDuplicates] = useState([]);
  const [mediaId, setMediaId] = useState(null);
  const [mediaS3Key, setMediaS3Key] = useState(null);
  const [selected, setSelected] = useState([]);
  const [catalogActions, setCatalogActions] = useState({});
  const [confirming, setConfirming] = useState(false);

  // Duplicate resolution state: { [`${parsedIndex}:${source}`]: 'same' | 'different' }
  const [dupResolutions, setDupResolutions] = useState({});

  const resetAll = () => {
    setStep(STEPS.UPLOAD);
    setReceiptFile(null);
    setReceiptText('');
    setExtracting(false);
    setError(null);
    setIsOrder(null);
    setExtractedParts(null);
    setShippingTotal(0);
    setDuplicates([]);
    setMediaId(null);
    setMediaS3Key(null);
    setSelected([]);
    setCatalogActions({});
    setConfirming(false);
    setDupResolutions({});
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleNext = () => {
    if (!receiptFile && !receiptText.trim()) {
      setError('Please provide either a file or paste text');
      return;
    }
    setError(null);
    setStep(STEPS.TYPE);
  };

  const handleTypeChoice = async (ordered) => {
    setIsOrder(ordered);
    setError(null);
    setExtracting(true);

    try {
      const formData = new FormData();
      if (receiptFile) formData.append('receipt', receiptFile);
      else formData.append('receiptText', receiptText);

      const response = await API.post(
        `/workorders/${entityId}/extract-receipt`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }
      );

      const { parts, shippingTotal: shipping, mediaId: mid, mediaS3Key: mkey, duplicates: dupes } = response.data.data;

      setExtractedParts(parts);
      setShippingTotal(shipping);
      setDuplicates(dupes || []);
      setMediaId(mid);
      setMediaS3Key(mkey);
      setSelected(parts.map((_, i) => i));
      setExtracting(false);
      setStep(STEPS.REVIEW);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to extract. Please try again.';
      setError(message);
      setExtracting(false);
      setStep(STEPS.UPLOAD);
    }
  };

  // Compute which duplicates are relevant given current selections + catalog actions
  const getRelevantDuplicates = () => {
    if (!duplicates.length || !extractedParts) return [];
    return duplicates.filter(dup => {
      if (!selected.includes(dup.parsedIndex)) return false;
      if (dup.source === 'wo') return true;
      if (dup.source === 'catalog') return catalogActions[dup.parsedIndex] === 'catalog';
      if (dup.source === 'inv') return catalogActions[dup.parsedIndex] === 'inventory';
      return false;
    });
  };

  // Move from REVIEW to DUPLICATES (or straight to confirm if no relevant dupes)
  const handleReviewSubmit = () => {
    if (selected.length === 0) {
      setError('Please select at least one part');
      return;
    }
    setError(null);

    const relevant = getRelevantDuplicates();
    if (relevant.length === 0) {
      handleConfirm({});
      return;
    }

    // Initialize all relevant duplicates as 'same' by default
    const initRes = {};
    relevant.forEach(dup => {
      initRes[`${dup.parsedIndex}:${dup.source}`] = 'same';
    });
    setDupResolutions(initRes);
    setStep(STEPS.DUPLICATES);
  };

  const handleConfirm = async (resolutionsOverride) => {
    const resolutions = resolutionsOverride !== undefined ? resolutionsOverride : dupResolutions;

    try {
      setConfirming(true);
      setError(null);

      const selectedPartData = selected.map(i => extractedParts[i]);

      const mappedCatalogActions = {};
      selected.forEach((origIndex, newIndex) => {
        if (catalogActions[origIndex]) mappedCatalogActions[newIndex] = catalogActions[origIndex];
      });

      // Build duplicateResolutions payload from per-duplicate decisions
      const duplicateResolutionsPayload = {};
      if (duplicates.length > 0) {
        duplicates.forEach(dup => {
          const key = `${dup.parsedIndex}:${dup.source}`;
          const decision = resolutions[key] ?? 'same';

          // Map from selected-parts index to original index for payload
          const selectedIdx = selected.indexOf(dup.parsedIndex);
          if (selectedIdx === -1) return;

          if (!duplicateResolutionsPayload[selectedIdx]) duplicateResolutionsPayload[selectedIdx] = {};

          if (dup.source === 'wo') {
            duplicateResolutionsPayload[selectedIdx].woAction = decision === 'same' ? 'overwrite' : 'add_new';
            if (decision === 'same') duplicateResolutionsPayload[selectedIdx].woMatchId = dup.rawId;
          } else if (dup.source === 'catalog') {
            duplicateResolutionsPayload[selectedIdx].catalogAction = decision === 'same' ? 'update_price' : 'add_new';
            if (decision === 'same') duplicateResolutionsPayload[selectedIdx].catalogMatchId = dup.rawId;
          } else if (dup.source === 'inv') {
            duplicateResolutionsPayload[selectedIdx].inventoryAction = decision === 'same' ? 'add_to_existing' : 'add_new';
            if (decision === 'same') duplicateResolutionsPayload[selectedIdx].inventoryMatchId = dup.rawId;
          }
        });
      }

      const response = await API.post(
        `/workorders/${entityId}/confirm-receipt-parts`,
        {
          selectedParts: selectedPartData,
          shippingTotal,
          totalAllUnits,
          isOrder,
          mediaId,
          mediaS3Key,
          catalogActions: mappedCatalogActions,
          duplicateResolutions: duplicateResolutionsPayload
        },
        { timeout: 30000 }
      );

      const { workOrder, addedParts } = response.data.data;
      setConfirming(false);
      handleClose();

      if (onSuccess) onSuccess(workOrder, addedParts);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to add parts. Please try again.';
      setError(message);
      setConfirming(false);
    }
  };

  const togglePart = (index) => {
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

  // ──── Step 4: Duplicate resolution ────
  if (step === STEPS.DUPLICATES && extractedParts) {
    const relevantDuplicates = getRelevantDuplicates();

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-1">Confirm Matches</h3>
          <p className="text-sm text-gray-600 mb-4">
            AI found potential duplicates. Confirm whether these are the same item.
          </p>

          <div className="overflow-x-auto border rounded-md">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Receipt Item</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Found In</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Matched Item</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {relevantDuplicates.map((dup, rowIdx) => {
                  const key = `${dup.parsedIndex}:${dup.source}`;
                  const decision = dupResolutions[key] ?? 'same';
                  const part = extractedParts[dup.parsedIndex];

                  const sameLabel = dup.source === 'wo' ? 'Overwrite' : dup.source === 'catalog' ? 'Update Price' : 'Add to Stock';
                  const diffLabel = 'Add as New';

                  return (
                    <tr key={rowIdx} className="bg-white hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-900">{part?.name}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          dup.source === 'wo' ? 'bg-orange-100 text-orange-700' :
                          dup.source === 'catalog' ? 'bg-purple-100 text-purple-700' :
                          'bg-teal-100 text-teal-700'
                        }`}>
                          {SOURCE_LABELS[dup.source] || dup.source}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-800">{dup.existingName}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">{dup.reason}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs">
                          <button
                            onClick={() => setDupResolutions(prev => ({ ...prev, [key]: 'same' }))}
                            className={`px-2.5 py-1.5 font-medium transition-colors ${
                              decision === 'same'
                                ? 'bg-green-600 text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {sameLabel}
                          </button>
                          <button
                            onClick={() => setDupResolutions(prev => ({ ...prev, [key]: 'different' }))}
                            className={`px-2.5 py-1.5 font-medium border-l border-gray-300 transition-colors ${
                              decision === 'different'
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {diffLabel}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
              <Button variant="primary" onClick={() => handleConfirm(dupResolutions)} disabled={confirming}>
                {confirming ? 'Adding...' : `Add ${selected.length} Part${selected.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ──── Step 3: Review extracted parts ────
  if (step === STEPS.REVIEW && extractedParts) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            Select Parts to Import
          </h3>
          <p className="text-sm text-gray-600 mb-1">
            {extractedParts.length} part(s) extracted.
            Importing as <strong>{isOrder ? 'receipt (ordered)' : 'price quote (not ordered)'}</strong>.
          </p>

          {/* Editable shipping total */}
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
            <span>Shipping total:</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={shippingTotal}
                onChange={(e) => setShippingTotal(parseFloat(e.target.value) || 0)}
                className="w-24 pl-5 pr-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <span className="text-gray-400">÷ {totalAllUnits} unit{totalAllUnits !== 1 ? 's' : ''} = {shippingTotal > 0 ? `$${(shippingTotal / totalAllUnits).toFixed(2)}/unit` : '$0.00/unit'}</span>
          </div>

          {/* Bulk action for catalog/inventory */}
          <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
            <span>Add all selected to:</span>
            <select
              onChange={(e) => {
                const action = e.target.value || null;
                const newActions = {};
                selected.forEach(i => { newActions[i] = action; });
                setCatalogActions(newActions);
              }}
              className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">WO Only</option>
              <option value="catalog">+ Parts Catalog</option>
              <option value="inventory">+ Shop Inventory</option>
            </select>
          </div>

          {/* Parts table */}
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
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Part</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">+ Ship</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price ({markupPercentage}%)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Also Add To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {extractedParts.map((part, index) => {
                  const isSelected = selected.includes(index);
                  const costWithShip = part.price + (isSelected ? shippingPerItem : 0);
                  const priceWithMarkup = costWithShip * (1 + markupPercentage / 100);

                  return (
                    <tr key={index} className={isSelected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50 opacity-50'}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePart(index)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">{part.name}</td>
                      <td className="px-3 py-2 text-gray-500">{part.itemNumber || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{part.vendor}{part.supplier ? ` / ${part.supplier}` : ''}</td>
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
                            className="w-24 pl-5 pr-1 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {isSelected && shippingPerItem > 0 ? `+${formatCurrency(shippingPerItem)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {isSelected ? formatCurrency(priceWithMarkup) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {isSelected && (
                          <select
                            value={catalogActions[index] || ''}
                            onChange={(e) => setCatalogActions(prev => ({
                              ...prev,
                              [index]: e.target.value || null
                            }))}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          >
                            <option value="">WO Only</option>
                            <option value="catalog">+ Parts Catalog</option>
                            <option value="inventory">+ Shop Inventory</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="mt-3 text-sm text-gray-600 flex justify-between items-center">
            <span>{selected.length} of {extractedParts.length} parts selected</span>
            {selected.length > 0 && (
              <span className="font-medium">
                Total customer price: {formatCurrency(
                  selected.reduce((sum, i) => {
                    const cost = extractedParts[i].price + shippingPerItem;
                    return sum + (cost * (1 + markupPercentage / 100) * extractedParts[i].quantity);
                  }, 0)
                )}
              </span>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm mt-3">
              {error}
            </div>
          )}

          <div className="flex justify-between mt-4">
            <Button
              variant="light"
              onClick={() => { setStep(STEPS.UPLOAD); setExtractedParts(null); setError(null); }}
              disabled={confirming}
            >
              <i className="fas fa-arrow-left mr-1"></i> Start Over
            </Button>
            <div className="flex space-x-3">
              <Button variant="light" onClick={handleClose} disabled={confirming}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleReviewSubmit}
                disabled={selected.length === 0 || confirming}
              >
                {confirming ? 'Adding...' : `Add ${selected.length} Part${selected.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ──── Step 2: Type choice (receipt vs quote) ────
  if (step === STEPS.TYPE) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          {extracting ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent mb-4"></div>
              <p className="text-gray-700 font-medium">Extracting parts...</p>
              <p className="text-sm text-gray-500 mt-1">AI is reading your document and checking for duplicates</p>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-bold text-gray-900 mb-2">What type of document is this?</h3>
              <p className="text-sm text-gray-600 mb-4">
                {receiptFile ? receiptFile.name : 'Pasted text'}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleTypeChoice(true)}
                  className="border-2 border-gray-200 rounded-lg p-5 text-center hover:border-green-500 hover:bg-green-50 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 group"
                >
                  <div className="text-3xl mb-2">
                    <i className="fas fa-receipt text-green-600"></i>
                  </div>
                  <div className="font-semibold text-gray-900 group-hover:text-green-700">Receipt</div>
                  <div className="text-xs text-gray-500 mt-1">Parts have been ordered</div>
                </button>

                <button
                  onClick={() => handleTypeChoice(false)}
                  className="border-2 border-gray-200 rounded-lg p-5 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 group"
                >
                  <div className="text-3xl mb-2">
                    <i className="fas fa-file-invoice-dollar text-blue-600"></i>
                  </div>
                  <div className="font-semibold text-gray-900 group-hover:text-blue-700">Price Quote</div>
                  <div className="text-xs text-gray-500 mt-1">Parts not yet ordered</div>
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm mt-4">
                  {error}
                </div>
              )}

              <div className="flex justify-start mt-4">
                <Button variant="light" onClick={() => { setStep(STEPS.UPLOAD); setError(null); }}>
                  <i className="fas fa-arrow-left mr-1"></i> Back
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ──── Step 1: Upload / paste ────
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Import Parts</h3>
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
              <strong>AI will extract:</strong> Part names, quantities, prices, vendors, order numbers, and item SKUs.
              You'll review and select which parts to add.
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
            onClick={handleNext}
            disabled={!receiptFile && !receiptText.trim()}
          >
            Next <i className="fas fa-arrow-right ml-1"></i>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptImportModal;
