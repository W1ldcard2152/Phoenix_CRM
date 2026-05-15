import React, { useEffect, useMemo, useState } from 'react';
import Button from '../common/Button';
import SearchableDropdown from '../common/SearchableDropdown';
import InventoryService from '../../services/inventoryService';
import { formatCurrency } from '../../utils/formatters';

const STEPS = { UPLOAD: 'upload', REVIEW: 'review', MERGE: 'merge' };

// Side-by-side merge fields (key = parsed receipt field, existingKey = inventory field)
const INV_MERGE_FIELDS = [
  { key: 'name',        existingKey: 'name',        label: 'Name' },
  { key: 'itemNumber',  existingKey: 'partNumber',  label: 'Part #' },
  { key: 'brand',       existingKey: 'brand',       label: 'Brand' },
  { key: 'vendor',      existingKey: 'vendor',      label: 'Vendor' },
  { key: 'price',       existingKey: 'cost',        label: 'Cost',     type: 'currency', inputType: 'number' },
  { key: 'notes',       existingKey: 'notes',       label: 'Notes' },
];

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const formatVal = (v, type) => {
  if (isBlank(v)) return <span className="text-gray-400 italic">empty</span>;
  if (type === 'currency') {
    const n = Number(v);
    return Number.isFinite(n) ? formatCurrency(n) : String(v);
  }
  return String(v);
};

const parseFieldValue = (raw, type) => {
  if (type === 'currency') {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw ?? '';
};

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
  const [aiDuplicates, setAiDuplicates] = useState([]);
  const [selected, setSelected] = useState([]);

  // Manual match overrides — null means "no match (create new)"; undefined means "use AI default"
  const [matchOverrides, setMatchOverrides] = useState({}); // { [parsedIndex]: inventoryItemId | null }

  // Full inventory items (for searchable dropdown + merge UI)
  const [inventoryItems, setInventoryItems] = useState([]);

  // Per-field merge selections: { [parsedIndex]: { [fieldKey]: 'incoming' | 'existing' | 'custom' } }
  const [mergeSelections, setMergeSelections] = useState({});

  // Per-field custom-value overrides: { [parsedIndex]: { [fieldKey]: rawValue } }
  const [customValues, setCustomValues] = useState({});
  const [confirming, setConfirming] = useState(false);

  const resetAll = () => {
    setStep(STEPS.UPLOAD);
    setReceiptFile(null);
    setReceiptText('');
    setExtracting(false);
    setError(null);
    setExtractedParts(null);
    setShippingTotal(0);
    setAiDuplicates([]);
    setSelected([]);
    setMatchOverrides({});
    setMergeSelections({});
    setCustomValues({});
    setConfirming(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // Load full inventory items when modal opens
  useEffect(() => {
    if (!isOpen || inventoryItems.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await InventoryService.getAllItems({ limit: 5000, isActive: true });
        const items = resp?.data?.items || resp?.data || [];
        if (!cancelled) setInventoryItems(Array.isArray(items) ? items : []);
      } catch (e) {
        console.error('Failed to load inventory items for receipt import modal:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, inventoryItems.length]);

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
      setAiDuplicates(dupes || []);
      setSelected(parts.map((_, i) => i));

      setExtracting(false);
      setStep(STEPS.REVIEW);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to extract. Please try again.';
      setError(message);
      setExtracting(false);
    }
  };

  // Resolve effective match for a parsed index — user override, or AI guess
  const getMatchId = (parsedIndex) => {
    const override = matchOverrides[parsedIndex];
    if (override !== undefined) return override;
    const ai = aiDuplicates.find(d => d.parsedIndex === parsedIndex);
    return ai ? ai.existingId : null;
  };

  const getActiveMatches = () => {
    if (!extractedParts) return [];
    const matches = [];
    selected.forEach(parsedIndex => {
      const matchId = getMatchId(parsedIndex);
      if (!matchId) return;
      const existing = inventoryItems.find(i => String(i._id) === String(matchId));
      if (existing) matches.push({ parsedIndex, existingId: matchId, existing });
    });
    return matches;
  };

  const handleReviewNext = () => {
    if (selected.length === 0) {
      setError('Please select at least one item');
      return;
    }
    setError(null);

    const matches = getActiveMatches();
    if (matches.length === 0) {
      // No matches → straight to confirm (skip merge step)
      handleConfirm({});
      return;
    }

    // Initialize merge selections — incoming if non-empty, else existing
    const initSel = {};
    matches.forEach(m => {
      const part = extractedParts[m.parsedIndex];
      const rowSel = {};
      INV_MERGE_FIELDS.forEach(f => {
        const incomingVal = part?.[f.key];
        rowSel[f.key] = !isBlank(incomingVal) ? 'incoming' : 'existing';
      });
      initSel[m.parsedIndex] = rowSel;
    });
    setMergeSelections(initSel);
    setStep(STEPS.MERGE);
  };

  const handleConfirm = async (mergeSelectionsOverride) => {
    const sel = mergeSelectionsOverride !== undefined ? mergeSelectionsOverride : mergeSelections;

    try {
      setConfirming(true);
      setError(null);

      const resolveField = (f, choice, parsedItem, existing, customRowVals) => {
        if (choice === 'custom') {
          const raw = customRowVals?.[f.key];
          return parseFieldValue(raw, f.type);
        }
        if (choice === 'existing') return existing?.[f.existingKey];
        return parsedItem?.[f.key];
      };

      const confirmedItems = selected.map(i => {
        const parsedItem = extractedParts[i];
        const matchId = getMatchId(i);
        const type = matchId ? 'add_to_existing' : 'create_new';

        let mergedFields;
        if (matchId) {
          const existing = inventoryItems.find(it => String(it._id) === String(matchId));
          if (existing) {
            const rowSel = sel[i] || {};
            const customRowVals = customValues[i] || {};
            mergedFields = {};
            INV_MERGE_FIELDS.forEach(f => {
              const choice = rowSel[f.key] || 'incoming';
              mergedFields[f.existingKey] = resolveField(f, choice, parsedItem, existing, customRowVals);
            });
          }
        }

        return {
          parsedItem,
          type,
          existingId: matchId || undefined,
          mergedFields,
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

  // Options for the searchable inventory dropdown
  const invOptions = useMemo(() => inventoryItems.map(i => ({
    value: String(i._id),
    label: i.name,
    sublabel: [i.brand, i.partNumber, `QOH ${i.quantityOnHand ?? 0}`].filter(Boolean).join(' · '),
    keywords: [i.partNumber, i.brand, i.vendor].filter(Boolean).join(' '),
  })), [inventoryItems]);

  if (!isOpen) return null;

  // ──── Extracting spinner (shown between UPLOAD and REVIEW) ────
  if (extracting) {
    return (
      <div className="fixed inset-0 md:left-64 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent mb-4"></div>
          <p className="text-gray-700 font-medium text-lg">Reading receipt...</p>
          <p className="text-sm text-gray-500 mt-1">AI is extracting items and checking for duplicates</p>
        </div>
      </div>
    );
  }

  // ──── Step 3: Field-by-field merge ────
  if (step === STEPS.MERGE && extractedParts) {
    const matches = getActiveMatches();

    return (
      <div className="fixed inset-0 md:left-64 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-[95vw] md:w-[calc((100vw-16rem)*0.95)] min-h-[70vh] max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-1">Merge Matched Items</h3>
          <p className="text-sm text-gray-600 mb-4">
            For each match, pick the better value per field — or type your own in the Custom column. Defaults favor incoming when non-empty, otherwise existing.
          </p>

          <div className="space-y-4">
            {matches.map(m => {
              const part = extractedParts[m.parsedIndex];
              const rowSel = mergeSelections[m.parsedIndex] || {};

              return (
                <div key={m.parsedIndex} className="border rounded-md overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b">
                    <div>
                      <div className="font-semibold text-gray-900">{part?.name}</div>
                      <div className="text-xs text-gray-500">
                        Matching against: <span className="font-medium text-gray-700">{m.existing?.name}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                      Shop Inventory
                    </span>
                  </div>

                  <table className="w-full text-sm table-fixed">
                    <thead className="bg-gray-50 border-b text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-1.5 text-left w-24">Field</th>
                        <th className="px-3 py-1.5 text-left">Existing</th>
                        <th className="px-3 py-1.5 text-left">From receipt</th>
                        <th className="px-3 py-1.5 text-left">Custom</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {INV_MERGE_FIELDS.map(f => {
                        const existingVal = m.existing?.[f.existingKey];
                        const incomingVal = part?.[f.key];
                        const choice = rowSel[f.key] || 'incoming';
                        const customVal = (customValues[m.parsedIndex] || {})[f.key] ?? '';
                        const setChoice = (c) => setMergeSelections(prev => ({
                          ...prev,
                          [m.parsedIndex]: { ...(prev[m.parsedIndex] || {}), [f.key]: c }
                        }));
                        const setCustomVal = (v) => {
                          setCustomValues(prev => ({
                            ...prev,
                            [m.parsedIndex]: { ...(prev[m.parsedIndex] || {}), [f.key]: v }
                          }));
                          setChoice('custom');
                        };

                        const cellCls = (active) => `px-3 py-2 cursor-pointer ${active ? 'bg-primary-50 border-l-4 border-primary-500' : 'hover:bg-gray-50 border-l-4 border-transparent'}`;

                        return (
                          <tr key={f.key}>
                            <td className="px-3 py-2 font-medium text-gray-700 align-top">{f.label}</td>
                            <td onClick={() => setChoice('existing')} className={cellCls(choice === 'existing')}>
                              <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  className="mt-1"
                                  checked={choice === 'existing'}
                                  onChange={() => setChoice('existing')}
                                />
                                <span className="text-gray-800 break-words">{formatVal(existingVal, f.type)}</span>
                              </label>
                            </td>
                            <td onClick={() => setChoice('incoming')} className={cellCls(choice === 'incoming')}>
                              <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  className="mt-1"
                                  checked={choice === 'incoming'}
                                  onChange={() => setChoice('incoming')}
                                />
                                <span className="text-gray-800 break-words">{formatVal(incomingVal, f.type)}</span>
                              </label>
                            </td>
                            <td onClick={() => setChoice('custom')} className={cellCls(choice === 'custom')}>
                              <div className="flex items-start gap-2">
                                <input
                                  type="radio"
                                  className="mt-2"
                                  checked={choice === 'custom'}
                                  onChange={() => setChoice('custom')}
                                />
                                <input
                                  type={f.inputType || 'text'}
                                  step={f.inputType === 'number' ? '0.01' : undefined}
                                  value={customVal}
                                  onChange={(e) => setCustomVal(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Type your own..."
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="bg-blue-50 px-4 py-1.5 text-xs text-blue-800 border-t">
                    QOH increases by <strong>{(part?.quantity || 1) * (m.existing?.unitsPerPurchase || 1)}</strong> (added to existing stock).
                  </div>
                </div>
              );
            })}
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
              <Button variant="primary" onClick={() => handleConfirm(mergeSelections)} disabled={confirming}>
                {confirming ? 'Importing...' : `Import ${selected.length} Item${selected.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ──── Step 2: Review extracted items (with manual match override) ────
  if (step === STEPS.REVIEW && extractedParts) {
    const matchCount = selected.filter(i => !!getMatchId(i)).length;
    const newCount = selected.length - matchCount;

    return (
      <div className="fixed inset-0 md:left-64 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-[95vw] md:w-[calc((100vw-16rem)*0.95)] min-h-[70vh] max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Review Items</h3>
          <p className="text-sm text-gray-600 mb-1">
            {extractedParts.length} item{extractedParts.length !== 1 ? 's' : ''} extracted. Edit costs and confirm matches before continuing.
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
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item / Brand · Model</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">+ Ship</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price ({markupPercentage}%)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-64">Inventory Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {extractedParts.map((part, index) => {
                  const isSelected = selected.includes(index);
                  const costWithShip = part.price + (isSelected ? shippingPerItem : 0);
                  const priceWithMarkup = costWithShip * (1 + markupPercentage / 100);
                  const matchId = getMatchId(index);
                  const aiMatch = aiDuplicates.find(d => d.parsedIndex === index);

                  return (
                    <tr key={index} className={isSelected ? 'bg-blue-50' : 'bg-white opacity-50 hover:bg-gray-50'}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(index)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-gray-900">{part.name}</div>
                        <div className="text-xs text-gray-500">
                          {[part.brand, part.itemNumber].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-500 align-top">
                        {part.vendor}{part.supplier ? ` / ${part.supplier}` : ''}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900 align-top">{part.quantity}</td>
                      <td className="px-3 py-2 text-right align-top">
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
                      <td className="px-3 py-2 text-right text-gray-500 align-top">
                        {isSelected && shippingPerItem > 0 ? `+${formatCurrency(shippingPerItem)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 align-top">
                        {isSelected ? formatCurrency(priceWithMarkup) : '—'}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {isSelected && (
                          <div>
                            <SearchableDropdown
                              options={invOptions}
                              value={matchId}
                              onChange={(v) => setMatchOverrides(prev => ({ ...prev, [index]: v }))}
                              placeholder="— Create new item —"
                              allowClear
                              clearLabel="— Create new item —"
                            />
                            {aiMatch && matchId === aiMatch.existingId && (
                              <div className="text-[10px] text-teal-600 mt-0.5" title={aiMatch.reason}>
                                <i className="fas fa-robot mr-0.5"></i> AI suggested
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-sm text-gray-600 flex gap-4 flex-wrap">
            <span>{selected.length} of {extractedParts.length} items selected</span>
            {matchCount > 0 && (
              <span className="text-green-700 font-medium">
                {matchCount} will add to existing stock
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
    <div className="fixed inset-0 md:left-64 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
