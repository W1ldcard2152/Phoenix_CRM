import React, { useState } from 'react';
import AutosaveField from './AutosaveField';
import { useSaveTracker } from './SaveContext';
import WorksheetService from '../../services/worksheetService';
import { detectSellerFromUrl, extractHostname } from '../../utils/vendorRanking';

const inputCls =
  'w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500';
const labelCls = 'block text-[11px] font-medium text-gray-500 mb-0.5';

const CONDITIONS = ['new', 'aftermarket', 'used', 'reman'];
const ADD_VENDOR = '__add_vendor__'; // sentinel select value for "add a new vendor"

// One captured offer. Collapses to a single summary line (seller · price) and
// expands to the full editor. Typed fields autosave (debounced) via AutosaveField;
// the discrete controls (seller, condition, in-stock) save immediately. Offers are
// the audit trail, so removal is for mistaken captures only.
export default function OfferCard({ workOrderId, partId, offer, vendors, isStarred, onStar, onChanged, onAddVendor, onDecode, startExpanded }) {
  const { track } = useSaveTracker();
  const offerId = offer._id;

  // A freshly-added blank offer (or one just decoded) opens expanded; filled ones collapse.
  const [expanded, setExpanded] = useState(startExpanded || (!offer.seller && offer.price == null));

  // Screenshot decode (paste a listing image → AI fills the fields).
  const [decoding, setDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState(null);

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
    const imgItem = items.find((it) => it.type && it.type.startsWith('image/'));
    if (!imgItem || !onDecode) return; // let non-image pastes fall through
    e.preventDefault();
    const blob = imgItem.getAsFile();
    if (!blob) return;
    setDecoding(true);
    setDecodeError(null);
    try {
      await onDecode(blob);
      // On success the card remounts with the decoded values — no local reset needed.
    } catch (err) {
      setDecodeError(err.response?.data?.message || 'Could not decode screenshot.');
      setDecoding(false);
    }
  };
  // Live-mirrored values so the collapsed summary reflects unsaved edits.
  const [seller, setSeller] = useState(offer.seller || '');
  const [priceDisplay, setPriceDisplay] = useState(offer.price != null ? String(offer.price) : '');
  const [manufacturer, setManufacturer] = useState(offer.manufacturer || '');
  const [partNumber, setPartNumber] = useState(offer.partNumber || '');

  // Inline "add new vendor" flow off the seller dropdown.
  const [addingVendor, setAddingVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorHostname, setNewVendorHostname] = useState('');
  const [vendorError, setVendorError] = useState(null);
  const [savingVendor, setSavingVendor] = useState(false);

  const openAddVendor = () => {
    setNewVendorName('');
    // Prefill the hostname from this offer's URL so future URL detection works.
    setNewVendorHostname(extractHostname(offer.url) || '');
    setVendorError(null);
    setAddingVendor(true);
  };

  const saveNewVendor = async () => {
    const name = newVendorName.trim();
    if (!name) return;
    setSavingVendor(true);
    setVendorError(null);
    try {
      const added = await onAddVendor(name, newVendorHostname.trim() || undefined);
      setSeller(added);
      await persistField({ seller: added });
      setAddingVendor(false);
    } catch (e) {
      setVendorError(e.response?.data?.message || 'Could not add vendor.');
    } finally {
      setSavingVendor(false);
    }
  };

  // Fire-and-forget from discrete controls (seller/condition/in-stock); track() records
  // any failure for the save indicator, and the .catch keeps a failed save from
  // surfacing as an uncaught rejection.
  const persistField = (fields) =>
    track(() => WorksheetService.updateOffer(workOrderId, partId, offerId, fields)).catch(() => {});

  const handleUrlPersist = async (url) => {
    const fields = { url };
    // Auto-detect the seller from the pasted URL only when none is chosen yet.
    if (!seller) {
      const detected = detectSellerFromUrl(url, vendors);
      if (detected) {
        fields.seller = detected;
        setSeller(detected);
      }
    }
    await persistField(fields);
  };

  // Seller is a dropdown of configured vendors; preserve any pre-existing custom
  // value (e.g. legacy free-text) as an extra option so it isn't lost.
  const vendorNames = vendors.map((v) => v.name);
  const sellerOptions = seller && !vendorNames.includes(seller) ? [seller, ...vendorNames] : vendorNames;

  const priceText = priceDisplay !== '' && !Number.isNaN(Number(priceDisplay))
    ? `$${Number(priceDisplay).toFixed(2)}`
    : 'no price';

  return (
    <div
      className={`rounded-lg border shadow-sm bg-white overflow-hidden ${
        isStarred ? 'border-amber-400 ring-1 ring-amber-400' : 'border-gray-300'
      }`}
    >
      {/* Header / collapsed summary — always visible */}
      <div className={`flex items-center gap-2 px-2 py-1 ${expanded ? 'bg-gray-50 border-b border-gray-200' : ''}`}>
        <button
          type="button"
          onClick={() => onStar(offerId)}
          title={isStarred ? 'Starred for selection' : 'Star this offer'}
          className={`text-lg leading-none ${isStarred ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
        >
          <i className={`${isStarred ? 'fas' : 'far'} fa-star`} />
        </button>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 flex items-center gap-2 min-w-0 text-left"
        >
          <i className={`fas fa-chevron-${expanded ? 'down' : 'right'} text-xs text-gray-400 shrink-0`} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${seller ? 'font-medium text-gray-900' : 'text-gray-400 italic'}`}>
              {seller || 'No seller'}
            </span>
            {!expanded && (manufacturer || partNumber) && (
              <span className="block truncate text-[11px] text-gray-500">
                {[manufacturer, partNumber].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
          <span className="text-sm text-gray-600 shrink-0">{priceText}</span>
        </button>

        {offer.source === 'agent' && (
          <span className="text-[10px] uppercase tracking-wide text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
            agent
          </span>
        )}
        <button
          type="button"
          onClick={() => onChanged(() => WorksheetService.removeOffer(workOrderId, partId, offerId))}
          title="Remove this offer"
          className="text-gray-400 hover:text-red-600 text-sm"
        >
          <i className="fas fa-trash" />
        </button>
      </div>

      {/* Editor — kept MOUNTED (just hidden) when collapsed. AutosaveField snapshots its
          value at mount and field edits don't reload the offer prop, so unmounting on
          collapse would re-read the stale prop and look empty on re-expand. */}
      <div className={`p-2 grid grid-cols-2 gap-2 ${expanded ? '' : 'hidden'}`}>
          {/* Paste a screenshot of the listing to AI-decode the fields below. */}
          <div className="col-span-2">
            <div
              tabIndex={0}
              onPaste={handlePaste}
              title="Click here, then press Ctrl+V to paste a screenshot of the listing"
              className={`cursor-text rounded border border-dashed px-2 py-2 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                decoding ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-primary-300 bg-primary-50/40 text-primary-700 hover:bg-primary-50'
              }`}
            >
              {decoding ? (
                <span><i className="fas fa-spinner fa-spin mr-1" />Decoding screenshot…</span>
              ) : (
                <span><i className="fas fa-paste mr-1" />Click &amp; press Ctrl+V to decode a screenshot</span>
              )}
            </div>
            {decodeError && <p className="mt-1 text-[11px] text-red-600">{decodeError}</p>}
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Description</label>
            <AutosaveField
              className={inputCls}
              initialValue={offer.description}
              placeholder="Part name (replaces the placeholder on selection)"
              onPersist={(v) => persistField({ description: v })}
            />
          </div>
          <div>
            <label className={labelCls}>Seller</label>
            <select
              className={inputCls}
              value={seller}
              onChange={(e) => {
                if (e.target.value === ADD_VENDOR) {
                  openAddVendor();
                  return;
                }
                setSeller(e.target.value);
                persistField({ seller: e.target.value });
              }}
            >
              <option value="">Select vendor…</option>
              {sellerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value={ADD_VENDOR}>+ Add new vendor…</option>
            </select>

            {addingVendor && (
              <div className="mt-1 p-2 border border-primary-200 bg-primary-50/50 rounded space-y-1">
                <input
                  className={inputCls}
                  autoFocus
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveNewVendor(); } }}
                  placeholder="New vendor name"
                />
                <input
                  className={inputCls}
                  value={newVendorHostname}
                  onChange={(e) => setNewVendorHostname(e.target.value)}
                  placeholder="hostname (optional, e.g. fcpeuro.com)"
                />
                {vendorError && <p className="text-[11px] text-red-600">{vendorError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveNewVendor}
                    disabled={savingVendor || !newVendorName.trim()}
                    className={`px-2 py-1 text-xs rounded text-white ${
                      newVendorName.trim() && !savingVendor ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-300 cursor-not-allowed'
                    }`}
                  >
                    {savingVendor ? 'Adding…' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingVendor(false)}
                    className="px-2 py-1 text-xs rounded border border-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Cost</label>
            <AutosaveField
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              initialValue={offer.price != null ? offer.price : ''}
              placeholder="0.00"
              onValueChange={setPriceDisplay}
              onPersist={(v) => persistField({ price: v === '' ? null : parseFloat(v) || 0 })}
            />
          </div>
          <div>
            <label className={labelCls}>Marketplace Seller</label>
            <AutosaveField
              className={inputCls}
              initialValue={offer.marketplaceSeller}
              placeholder="eBay store, etc."
              onPersist={(v) => persistField({ marketplaceSeller: v })}
            />
          </div>
          <div>
            <label className={labelCls}>Core Charge</label>
            <AutosaveField
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              initialValue={offer.coreCharge != null ? offer.coreCharge : ''}
              placeholder="0.00"
              onPersist={(v) => persistField({ coreCharge: v === '' ? 0 : parseFloat(v) || 0 })}
            />
          </div>
          <div>
            <label className={labelCls}>Manufacturer</label>
            <AutosaveField
              className={inputCls}
              initialValue={offer.manufacturer}
              placeholder="Brand"
              onValueChange={setManufacturer}
              onPersist={(v) => persistField({ manufacturer: v })}
            />
          </div>
          <div>
            <label className={labelCls}>Part #</label>
            <AutosaveField
              className={inputCls}
              initialValue={offer.partNumber}
              placeholder="PN"
              onValueChange={setPartNumber}
              onPersist={(v) => persistField({ partNumber: v })}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>URL</label>
            <AutosaveField
              className={inputCls}
              type="url"
              initialValue={offer.url}
              placeholder="https://… (auto-detects seller)"
              onPersist={handleUrlPersist}
            />
          </div>
          <div>
            <label className={labelCls}>ETA</label>
            <AutosaveField
              className={inputCls}
              initialValue={offer.eta}
              placeholder="e.g. 2 days"
              onPersist={(v) => persistField({ eta: v })}
            />
          </div>
          <div>
            <label className={labelCls}>Condition</label>
            <select
              className={inputCls}
              defaultValue={offer.condition || ''}
              onChange={(e) => persistField({ condition: e.target.value || null })}
            >
              <option value="">—</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex items-center mt-1">
            <input
              id={`instock-${offerId}`}
              type="checkbox"
              defaultChecked={!!offer.inStock}
              onChange={(e) => persistField({ inStock: e.target.checked })}
              className="h-4 w-4 text-primary-600 border-gray-300 rounded"
            />
            <label htmlFor={`instock-${offerId}`} className="ml-2 text-sm text-gray-700">
              In stock
            </label>
          </div>
          {/* Everything autosaves; this just collapses the card. Clicking it also blurs
              the active field, flushing any pending debounced save before it closes. */}
          <div className="col-span-2 mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700"
            >
              <i className="fas fa-check mr-1" />Save offer
            </button>
          </div>
        </div>
    </div>
  );
}
