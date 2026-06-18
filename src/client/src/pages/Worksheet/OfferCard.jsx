import React, { useState } from 'react';
import AutosaveField from './AutosaveField';
import { useSaveTracker } from './SaveContext';
import WorksheetService from '../../services/worksheetService';
import { detectSellerFromUrl } from '../../utils/vendorRanking';

const inputCls =
  'w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500';
const labelCls = 'block text-[11px] font-medium text-gray-500 mb-0.5';

const CONDITIONS = ['new', 'used', 'reman'];

// One captured offer. Typed fields autosave (debounced) via AutosaveField; the
// discrete controls (in-stock, condition) save immediately. Offers are the
// audit trail, so removal is for mistaken captures only.
export default function OfferCard({ workOrderId, partId, offer, vendors, isStarred, onStar, onChanged }) {
  const { track } = useSaveTracker();
  const offerId = offer._id;

  // Seller field is remounted (via sellerKey) when a pasted URL auto-detects it.
  const [sellerInitial, setSellerInitial] = useState(offer.seller || '');
  const [sellerKey, setSellerKey] = useState(0);

  const persistField = (fields) =>
    track(() => WorksheetService.updateOffer(workOrderId, partId, offerId, fields));

  const handleUrlPersist = async (url) => {
    const fields = { url };
    // Auto-detect seller from the pasted URL only when seller is still empty.
    if (!sellerInitial) {
      const detected = detectSellerFromUrl(url, vendors);
      if (detected) {
        fields.seller = detected;
        setSellerInitial(detected);
        setSellerKey((k) => k + 1);
      }
    }
    await persistField(fields);
  };

  return (
    <div
      className={`rounded-md border p-2 ${
        isStarred ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => onStar(offerId)}
          title={isStarred ? 'Starred for selection' : 'Star this offer'}
          className={`text-lg leading-none ${isStarred ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
        >
          <i className={`${isStarred ? 'fas' : 'far'} fa-star`} />
        </button>
        <div className="flex items-center gap-2">
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
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Seller</label>
          <AutosaveField
            key={sellerKey}
            className={inputCls}
            initialValue={sellerInitial}
            placeholder="e.g. RockAuto"
            onPersist={(v) => {
              setSellerInitial(v);
              return persistField({ seller: v });
            }}
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
          <label className={labelCls}>Manufacturer</label>
          <AutosaveField
            className={inputCls}
            initialValue={offer.manufacturer}
            placeholder="Brand"
            onPersist={(v) => persistField({ manufacturer: v })}
          />
        </div>
        <div>
          <label className={labelCls}>Part #</label>
          <AutosaveField
            className={inputCls}
            initialValue={offer.partNumber}
            placeholder="PN"
            onPersist={(v) => persistField({ partNumber: v })}
          />
        </div>
        <div>
          <label className={labelCls}>Unit Price (shop pays)</label>
          <AutosaveField
            className={inputCls}
            type="number"
            min="0"
            step="0.01"
            initialValue={offer.price != null ? offer.price : ''}
            placeholder="0.00"
            onPersist={(v) => persistField({ price: v === '' ? null : parseFloat(v) || 0 })}
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
      </div>
    </div>
  );
}
