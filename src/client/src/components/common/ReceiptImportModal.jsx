import React, { useEffect, useMemo, useState } from 'react';
import Button from './Button';
import SearchableDropdown from './SearchableDropdown';
import API from '../../services/api';
import InventoryService from '../../services/inventoryService';
import { formatCurrency } from '../../utils/formatters';

const STEPS = { UPLOAD: 'upload', TYPE: 'type', REVIEW: 'review', MERGE: 'merge' };

// Fields shown in the side-by-side merge UI for a WO match.
// Each entry: { key: incomingKey, existingKey, label, type }
const WO_MERGE_FIELDS = [
  { key: 'name',        existingKey: 'name',        label: 'Name' },
  { key: 'partNumber',  existingKey: 'partNumber',  label: 'Part #' },
  { key: 'vendor',      existingKey: 'vendor',      label: 'Vendor' },
  { key: 'supplier',    existingKey: 'supplier',    label: 'Supplier' },
  { key: 'price',       existingKey: 'cost',        label: 'Cost',     type: 'currency', inputType: 'number' },
  { key: 'notes',       existingKey: 'notes',       label: 'Notes' },
];

const INV_MERGE_FIELDS = [
  { key: 'name',        existingKey: 'name',        label: 'Name' },
  { key: 'partNumber',  existingKey: 'partNumber',  label: 'Part #' },
  { key: 'brand',       existingKey: 'brand',       label: 'Brand' },
  { key: 'vendor',      existingKey: 'vendor',      label: 'Vendor' },
  { key: 'price',       existingKey: 'cost',        label: 'Cost',     type: 'currency', inputType: 'number' },
  { key: 'notes',       existingKey: 'notes',       label: 'Notes' },
];

const parseFieldValue = (raw, type) => {
  if (type === 'currency') {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw ?? '';
};

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const formatVal = (v, type) => {
  if (isBlank(v)) return <span className="text-gray-400 italic">empty</span>;
  if (type === 'currency') {
    const n = Number(v);
    return Number.isFinite(n) ? formatCurrency(n) : String(v);
  }
  return String(v);
};

const ReceiptImportModal = ({ isOpen, onClose, entityId, onSuccess, markupPercentage = 30, existingParts = [], serviceId = null }) => {
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
  const [aiDuplicates, setAiDuplicates] = useState([]);
  const [mediaId, setMediaId] = useState(null);
  const [mediaS3Key, setMediaS3Key] = useState(null);
  const [selected, setSelected] = useState([]);
  const [catalogActions, setCatalogActions] = useState({}); // { [parsedIndex]: 'inventory' | null }
  const [confirming, setConfirming] = useState(false);

  // Manual match overrides — null means "no match (add new)"; undefined means "use AI default"
  const [woMatchOverrides, setWoMatchOverrides] = useState({});  // { [parsedIndex]: woPartId | null }
  const [invMatchOverrides, setInvMatchOverrides] = useState({}); // { [parsedIndex]: inventoryItemId | null }

  // Inventory items loaded for searchable dropdown + side-by-side comparison
  const [inventoryItems, setInventoryItems] = useState([]);

  // Per-field merge selections: { [`${parsedIndex}:${source}`]: { [fieldKey]: 'incoming' | 'existing' | 'custom' } }
  const [mergeSelections, setMergeSelections] = useState({});

  // Per-field custom-value overrides: { [`${parsedIndex}:${source}`]: { [fieldKey]: rawValue } }
  const [customValues, setCustomValues] = useState({});

  const resetAll = () => {
    setStep(STEPS.UPLOAD);
    setReceiptFile(null);
    setReceiptText('');
    setExtracting(false);
    setError(null);
    setIsOrder(null);
    setExtractedParts(null);
    setShippingTotal(0);
    setAiDuplicates([]);
    setMediaId(null);
    setMediaS3Key(null);
    setSelected([]);
    setCatalogActions({});
    setConfirming(false);
    setWoMatchOverrides({});
    setInvMatchOverrides({});
    setMergeSelections({});
    setCustomValues({});
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // Load inventory items once when modal opens (used by both inventory match dropdown and merge UI)
  useEffect(() => {
    if (!isOpen || inventoryItems.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await InventoryService.getAllItems({ limit: 5000, isActive: true });
        const items = resp?.data?.items || resp?.data || [];
        if (!cancelled) setInventoryItems(Array.isArray(items) ? items : []);
      } catch (e) {
        // Non-fatal — manual override and merge will still work for WO matches
        console.error('Failed to load inventory items for receipt import modal:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, inventoryItems.length]);

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
      setAiDuplicates(dupes || []);
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

  // Resolve effective WO match for a parsedIndex — user override, falling back to AI guess
  const getWoMatchId = (parsedIndex) => {
    const override = woMatchOverrides[parsedIndex];
    if (override !== undefined) return override; // null is a valid explicit "no match"
    const ai = aiDuplicates.find(d => d.parsedIndex === parsedIndex && d.source === 'wo');
    return ai ? ai.rawId : null;
  };

  const getInvMatchId = (parsedIndex) => {
    const override = invMatchOverrides[parsedIndex];
    if (override !== undefined) return override;
    const ai = aiDuplicates.find(d => d.parsedIndex === parsedIndex && d.source === 'inv');
    return ai ? ai.rawId : null;
  };

  // Build the list of matches that need the merge UI (selected rows with a resolved match)
  const getActiveMatches = () => {
    if (!extractedParts) return [];
    const matches = [];
    selected.forEach(parsedIndex => {
      const woMatch = getWoMatchId(parsedIndex);
      if (woMatch) {
        const existing = existingParts.find(p => String(p._id) === String(woMatch));
        if (existing) matches.push({ parsedIndex, source: 'wo', existingId: woMatch, existing });
      }
      if (catalogActions[parsedIndex] === 'inventory') {
        const invMatch = getInvMatchId(parsedIndex);
        if (invMatch) {
          const existing = inventoryItems.find(i => String(i._id) === String(invMatch));
          if (existing) matches.push({ parsedIndex, source: 'inv', existingId: invMatch, existing });
        }
      }
    });
    return matches;
  };

  const handleReviewSubmit = () => {
    if (selected.length === 0) {
      setError('Please select at least one part');
      return;
    }
    setError(null);

    const matches = getActiveMatches();
    if (matches.length === 0) {
      handleConfirm({});
      return;
    }

    // Initialize merge selections — preference depends on context:
    //   WO source: imported > existing > empty (the receipt is fresh authoritative data)
    //   INV source: existing > imported > empty (catalog data is curated; receipt fills gaps)
    const initSel = {};
    matches.forEach(m => {
      const fields = m.source === 'wo' ? WO_MERGE_FIELDS : INV_MERGE_FIELDS;
      const part = extractedParts[m.parsedIndex];
      const rowSel = {};
      fields.forEach(f => {
        const incomingVal = part?.[f.key];
        const existingVal = m.existing?.[f.existingKey];
        if (m.source === 'wo') {
          rowSel[f.key] = !isBlank(incomingVal) ? 'incoming' : 'existing';
        } else {
          rowSel[f.key] = !isBlank(existingVal) ? 'existing' : 'incoming';
        }
      });
      initSel[`${m.parsedIndex}:${m.source}`] = rowSel;
    });
    setMergeSelections(initSel);
    setStep(STEPS.MERGE);
  };

  const handleConfirm = async (mergeSelectionsOverride) => {
    const sel = mergeSelectionsOverride !== undefined ? mergeSelectionsOverride : mergeSelections;

    try {
      setConfirming(true);
      setError(null);

      const selectedPartData = selected.map(i => extractedParts[i]);

      const mappedCatalogActions = {};
      selected.forEach((origIndex, newIndex) => {
        if (catalogActions[origIndex]) mappedCatalogActions[newIndex] = catalogActions[origIndex];
      });

      // Resolve a single field's merged value given the user's choice
      const resolveField = (f, choice, part, existing, customRowVals) => {
        if (choice === 'custom') {
          const raw = customRowVals?.[f.key];
          return parseFieldValue(raw, f.type);
        }
        if (choice === 'existing') return existing?.[f.existingKey];
        return part?.[f.key]; // 'incoming' (default)
      };

      // Build duplicateResolutions payload from per-row overrides + per-field merge selections
      const duplicateResolutions = {};
      selected.forEach((origIndex, newIndex) => {
        const row = {};

        // WO match
        const woMatchId = getWoMatchId(origIndex);
        if (woMatchId) {
          row.woAction = 'overwrite';
          row.woMatchId = woMatchId;
          const existing = existingParts.find(p => String(p._id) === String(woMatchId));
          if (existing) {
            const part = extractedParts[origIndex];
            const rowSel = sel[`${origIndex}:wo`] || {};
            const customRowVals = customValues[`${origIndex}:wo`] || {};
            const merged = {};
            WO_MERGE_FIELDS.forEach(f => {
              const choice = rowSel[f.key] || 'incoming';
              merged[f.existingKey] = resolveField(f, choice, part, existing, customRowVals);
            });
            row.woMergedFields = merged;
          }
        } else {
          row.woAction = 'add_new';
        }

        // Inventory match (only when "+ Shop Inventory" was selected)
        if (catalogActions[origIndex] === 'inventory') {
          const invMatchId = getInvMatchId(origIndex);
          if (invMatchId) {
            row.inventoryAction = 'add_to_existing';
            row.inventoryMatchId = invMatchId;
            const existing = inventoryItems.find(i => String(i._id) === String(invMatchId));
            if (existing) {
              const part = extractedParts[origIndex];
              const rowSel = sel[`${origIndex}:inv`] || {};
              const customRowVals = customValues[`${origIndex}:inv`] || {};
              const merged = {};
              INV_MERGE_FIELDS.forEach(f => {
                const choice = rowSel[f.key] || 'incoming';
                merged[f.existingKey] = resolveField(f, choice, part, existing, customRowVals);
              });
              row.inventoryMergedFields = merged;
            }
          } else {
            row.inventoryAction = 'add_new';
          }
        }

        if (Object.keys(row).length > 0) duplicateResolutions[newIndex] = row;
      });

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
          duplicateResolutions,
          serviceId
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

  // Options for inventory match dropdown
  const invOptions = useMemo(() => inventoryItems.map(i => ({
    value: String(i._id),
    label: i.name,
    sublabel: [i.brand, i.partNumber, `QOH ${i.quantityOnHand ?? 0}`].filter(Boolean).join(' · '),
    keywords: [i.partNumber, i.brand, i.vendor].filter(Boolean).join(' '),
  })), [inventoryItems]);

  if (!isOpen) return null;

  // ──── Step 4: Field-by-field merge ────
  if (step === STEPS.MERGE && extractedParts) {
    const matches = getActiveMatches();

    return (
      <div className="fixed inset-0 md:left-64 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-[95vw] md:w-[calc((100vw-16rem)*0.95)] min-h-[70vh] max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-1">Merge Matched Parts</h3>
          <p className="text-sm text-gray-600 mb-4">
            For each match, pick the better value per field — or type your own in the Custom column. Defaults favor incoming when non-empty, otherwise existing.
          </p>

          <div className="space-y-4">
            {matches.map(m => {
              const part = extractedParts[m.parsedIndex];
              const fields = m.source === 'wo' ? WO_MERGE_FIELDS : INV_MERGE_FIELDS;
              const sourceLabel = m.source === 'wo' ? 'In this WO' : 'Shop Inventory';
              const sourceColor = m.source === 'wo' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700';
              const rowSel = mergeSelections[`${m.parsedIndex}:${m.source}`] || {};

              return (
                <div key={`${m.parsedIndex}:${m.source}`} className="border rounded-md overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b">
                    <div>
                      <div className="font-semibold text-gray-900">{part?.name}</div>
                      <div className="text-xs text-gray-500">
                        Matching against: <span className="font-medium text-gray-700">{m.existing?.name}</span>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sourceColor}`}>
                      {sourceLabel}
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
                      {fields.map(f => {
                        const rowKey = `${m.parsedIndex}:${m.source}`;
                        const existingVal = m.existing?.[f.existingKey];
                        const incomingVal = part?.[f.key];
                        const choice = rowSel[f.key] || 'incoming';
                        const customVal = (customValues[rowKey] || {})[f.key] ?? '';
                        const setChoice = (c) => setMergeSelections(prev => ({
                          ...prev,
                          [rowKey]: { ...(prev[rowKey] || {}), [f.key]: c }
                        }));
                        const setCustomVal = (v) => {
                          setCustomValues(prev => ({
                            ...prev,
                            [rowKey]: { ...(prev[rowKey] || {}), [f.key]: v }
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

                  {m.source === 'wo' && (
                    <div className="bg-blue-50 px-4 py-1.5 text-xs text-blue-800 border-t">
                      Quantity stays at <strong>{m.existing?.quantity}</strong> (existing). Receipt qty {part?.quantity} is discarded.
                    </div>
                  )}
                  {m.source === 'inv' && (
                    <div className="bg-blue-50 px-4 py-1.5 text-xs text-blue-800 border-t">
                      QOH increases by <strong>{part?.quantity || 1}</strong> (added to existing stock).
                    </div>
                  )}
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
      <div className="fixed inset-0 md:left-64 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-[95vw] md:w-[calc((100vw-16rem)*0.95)] min-h-[70vh] max-h-[90vh] overflow-y-auto">
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
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Part / Brand · Model</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">+ Ship</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price ({markupPercentage}%)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Match in WO</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Also Add To</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Inventory Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {extractedParts.map((part, index) => {
                  const isSelected = selected.includes(index);
                  const costWithShip = part.price + (isSelected ? shippingPerItem : 0);
                  const priceWithMarkup = costWithShip * (1 + markupPercentage / 100);

                  const woMatchId = getWoMatchId(index);
                  const aiWoMatch = aiDuplicates.find(d => d.parsedIndex === index && d.source === 'wo');
                  const aiInvMatch = aiDuplicates.find(d => d.parsedIndex === index && d.source === 'inv');
                  const invMatchId = catalogActions[index] === 'inventory' ? getInvMatchId(index) : null;

                  return (
                    <tr key={index} className={isSelected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50 opacity-50'}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePart(index)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-gray-900">{part.name}</div>
                        <div className="text-xs text-gray-500">
                          {[part.brand, part.itemNumber].filter(Boolean).join(' · ') || '—'}
                        </div>
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
                            className="w-24 pl-5 pr-1 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500 align-top">
                        {isSelected && shippingPerItem > 0 ? `+${formatCurrency(shippingPerItem)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 align-top">
                        {isSelected ? formatCurrency(priceWithMarkup) : '—'}
                      </td>
                      <td className="px-3 py-2 align-top w-48">
                        {isSelected && existingParts.length > 0 ? (
                          <div>
                            <select
                              value={woMatchId === null ? '__none__' : (woMatchId || '__none__')}
                              onChange={(e) => {
                                const v = e.target.value;
                                setWoMatchOverrides(prev => ({ ...prev, [index]: v === '__none__' ? null : v }));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs border border-gray-300 rounded px-1.5 py-1 w-full focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              <option value="__none__">— New part —</option>
                              {existingParts.map(p => (
                                <option key={String(p._id)} value={String(p._id)}>
                                  {p.name}{p.partNumber ? ` · ${p.partNumber}` : ''}
                                </option>
                              ))}
                            </select>
                            {aiWoMatch && woMatchId === aiWoMatch.rawId && (
                              <div className="text-[10px] text-orange-600 mt-0.5" title={aiWoMatch.reason}>
                                <i className="fas fa-robot mr-0.5"></i> AI suggested
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
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
                            <option value="inventory">+ Shop Inventory</option>
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top w-56">
                        {isSelected && catalogActions[index] === 'inventory' ? (
                          <div>
                            <SearchableDropdown
                              options={invOptions}
                              value={invMatchId}
                              onChange={(v) => setInvMatchOverrides(prev => ({ ...prev, [index]: v }))}
                              placeholder="— New item —"
                              allowClear
                              clearLabel="— New item —"
                            />
                            {aiInvMatch && invMatchId === aiInvMatch.rawId && (
                              <div className="text-[10px] text-teal-600 mt-0.5" title={aiInvMatch.reason}>
                                <i className="fas fa-robot mr-0.5"></i> AI suggested
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
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
      <div className="fixed inset-0 md:left-64 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
    <div className="fixed inset-0 md:left-64 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
              <strong>AI will extract:</strong> Part names, brands, model/part numbers, quantities, prices, vendors, and order numbers.
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
