import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SearchableDropdown from '../common/SearchableDropdown';
import TagPicker from './TagPicker';
import SupplyPhoto from './SupplyPhoto';
import SupplyAttributes from './SupplyAttributes';
import { composeDisplayName } from './composeName';
import SupplyService from '../../services/supplyService';
import { indexTags, tagPath, idOf } from './tagTree';

/**
 * Create / edit a shop supply.
 *
 * The cost<->price behaviour is carried over from InventoryItemForm: editing
 * either side recomputes the other from the shop markup, and the override
 * checkbox detaches the item from the calc entirely. That behaviour works and
 * is liked; the only change is that the override now persists as
 * `priceOverridden` instead of being local UI state that forgets itself.
 *
 * Entry ergonomics matter more than usual here (§7.1): ~200 items get triaged
 * through this form, much of it in one sitting. Hence Save & Next, which keeps
 * the modal open and carries location and primary tag forward — those are the
 * two fields that repeat run-to-run.
 */
const EMPTY = {
  name: '', qualifier: '', brand: null, vendor: null, partNumber: '',
  tags: [], primaryTag: null,
  form: null, location: null,
  quantityOnHand: 0, stockUnit: null, purchaseUnit: null, unitsPerPurchase: 1,
  reorderPoint: 1, cost: 0, price: 0, priceOverridden: false,
  sdsUrl: '', url: '', notes: '', attributes: {},
  // Entered in PURCHASE units and multiplied into quantityOnHand on save —
  // you count jugs on the shelf, not quarts.
  packagesOnHand: 0
};

const round2 = (n) => parseFloat(Number(n).toFixed(2));

const SupplyForm = ({
  isOpen, onClose, onSaved, onRefresh, vocab = [], tags = [], fields = [],
  markupPercentage = 30, initial = null, lastUsed = {}, onVocabAdded
}) => {
  const [data, setData] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  // A photo pasted while creating: there is no id to POST to until the item
  // exists, so hold the blob and upload it right after the create call.
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [savedSupply, setSavedSupply] = useState(null);
  const [photoNonce, setPhotoNonce] = useState(0);
  const nameRef = useRef(null);

  const byId = useMemo(() => indexTags(tags), [tags]);
  const isEditing = !!(initial && initial._id);

  const optionsFor = (fieldKey) => vocab
    .filter((v) => v.fieldKey === fieldKey && v.isActive !== false)
    .map((v) => ({ value: String(v._id), label: v.label || v.value }));

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setPendingPhoto(null);
    setSavedSupply(initial || null);
    setPhotoNonce((n) => n + 1);
    if (initial) {
      setData({
        ...EMPTY,
        ...initial,
        brand: idOf(initial.brand),
        vendor: idOf(initial.vendor),
        form: idOf(initial.form),
        location: idOf(initial.location),
        stockUnit: idOf(initial.stockUnit),
        purchaseUnit: idOf(initial.purchaseUnit),
        primaryTag: idOf(initial.primaryTag),
        tags: (initial.tags || []).map(idOf),
        // displayName is derived server-side and must not round-trip into the
        // stored name — that would freeze a composed name as a custom one.
        name: initial.name || '',
        qualifier: initial.qualifier || '',
        // Serialized from a Mongoose Map, so it arrives as a plain object.
        attributes: initial.attributes || {}
      });
    } else {
      setData({
        ...EMPTY,
        location: lastUsed.location || null,
        stockUnit: lastUsed.stockUnit || null,
        tags: lastUsed.primaryTag ? [lastUsed.primaryTag] : [],
        primaryTag: lastUsed.primaryTag || null
      });
    }
    setTimeout(() => nameRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initial]);

  const set = (field, value) => setData((prev) => ({ ...prev, [field]: value }));

  const preview = useMemo(
    () => composeDisplayName(data, tags, fields, vocab),
    [data, tags, fields, vocab]
  );

  const multiplier = 1 + markupPercentage / 100;
  const upp = Math.max(1, parseInt(data.unitsPerPurchase, 10) || 1);

  const unitLabel = (id, fallback) => {
    const entry = vocab.find((v) => String(v._id) === idOf(id));
    return entry ? (entry.label || entry.value) : fallback;
  };
  const stockLabel = unitLabel(data.stockUnit, 'unit');
  const purchaseLabel = upp > 1 ? unitLabel(data.purchaseUnit, 'purchase') : stockLabel;

  const handleCost = (cost) => setData((prev) => (prev.priceOverridden
    ? { ...prev, cost }
    : { ...prev, cost, price: round2((cost / upp) * multiplier) }));

  const handlePrice = (price) => setData((prev) => (prev.priceOverridden
    ? { ...prev, price }
    : { ...prev, price, cost: round2((price * upp) / multiplier) }));

  const handleUpp = (value) => {
    const next = Math.max(1, parseInt(value, 10) || 1);
    setData((prev) => (prev.priceOverridden
      ? { ...prev, unitsPerPurchase: next }
      : { ...prev, unitsPerPurchase: next, price: round2(((parseFloat(prev.cost) || 0) / next) * multiplier) }));
  };

  // Creating a vocab value inline, from the dropdown the user is already in.
  const createVocab = (fieldKey) => async (typed) => {
    const res = await SupplyService.createVocab(fieldKey, typed, typed);
    const entry = res.data.entry;
    onVocabAdded?.(entry);
    return String(entry._id);
  };

  const tagsInvalid = data.tags.length > 0 && !data.primaryTag;

  const save = async (addAnother) => {
    if (!preview) {
      setError('This needs something to be called — add a brand and a tag, or type a custom name.');
      return;
    }
    if (tagsInvalid) {
      setError('Star one tag as the primary, or clear the tags.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { packagesOnHand, ...rest } = data;
      const payload = {
        ...rest,
        name: (data.name || '').trim(),
        // Purchase units in, stock units stored: 3 jugs becomes 15 quarts.
        quantityOnHand: (parseFloat(packagesOnHand) || 0) * upp
      };
      delete payload.displayName; // server-derived; never sent back
      let photoFailed = false;

      if (isEditing) {
        delete payload.quantityOnHand; // moves only through /adjust
        await SupplyService.update(initial._id, payload);
      } else {
        const res = await SupplyService.create(payload);
        // The item exists now, so a photo pasted during entry has somewhere to
        // go. A failure here must not read as "the item didn't save" — it did.
        if (pendingPhoto) {
          try {
            await SupplyService.uploadPhoto(res.data.supply._id, pendingPhoto);
          } catch (photoErr) {
            photoFailed = true;
            setError('Item saved, but the photo failed to upload. Edit the item to add it.');
          }
          setPendingPhoto(null);
        }
      }

      onSaved?.({
        location: data.location,
        stockUnit: data.stockUnit,
        primaryTag: data.primaryTag
      });

      // Hold the modal open on a photo failure — closing would take the only
      // notice of it off screen, and the item would look photo-less for no
      // stated reason.
      if (photoFailed) return;

      if (addAnother) {
        // Keep location / unit / primary tag; clear what's item-specific.
        setData((prev) => ({
          ...EMPTY,
          location: prev.location,
          stockUnit: prev.stockUnit,
          vendor: prev.vendor,
          tags: prev.primaryTag ? [prev.primaryTag] : [],
          primaryTag: prev.primaryTag
        }));
        setSavedSupply(null);
        setPhotoNonce((n) => n + 1);
        nameRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this supply.');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    // Ctrl/Cmd+Enter is save-and-next — the whole point of a triage pass is not
    // reaching for the mouse between items.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      save(!isEditing);
    }
  };

  const field = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500';
  const label = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEditing ? 'Edit Supply' : 'Add Supply'}
        size="lg"
      >
        <div className="space-y-4" onKeyDown={onKeyDown}>
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-4">
            <div className="flex-1 min-w-0 space-y-3">
              {/* The name is composed from brand + measurements + tag, so what
                  gets typed here is only the part that isn't derivable. */}
              <div>
                <label className={label}>
                  Qualifier <span className="font-normal text-gray-400">— the part that isn't derivable</span>
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={data.qualifier}
                  onChange={(e) => set('qualifier', e.target.value)}
                  className={field}
                  placeholder="e.g. High Mileage, Full Synthetic"
                />
              </div>

              <div className="px-3 py-2 rounded bg-gray-50 border border-gray-200">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">
                  Will be listed as
                </div>
                <div className={`text-sm ${preview ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
                  {preview || 'Add a brand and a tag, or type a name below'}
                </div>
              </div>

              <details open={!!data.name}>
                <summary className="text-xs text-primary-600 cursor-pointer hover:underline">
                  {data.name ? 'Using a custom name' : 'Use a custom name instead'}
                </summary>
                <input
                  type="text"
                  value={data.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={`${field} mt-2`}
                  placeholder="e.g. Shop Towels"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Overrides the composed name entirely. For things that have a name
                  rather than a description.
                </p>
              </details>
            </div>
            <div>
              <label className={label}>Photo</label>
              <SupplyPhoto
                // Remounting on reset clears the pasted-blob preview; without
                // this, Save & Next would carry the last item's photo on screen.
                key={photoNonce}
                supply={savedSupply}
                onPendingChange={setPendingPhoto}
                onUploaded={(updated) => { setSavedSupply(updated); onRefresh?.(); }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={label}>Brand</label>
              <SearchableDropdown
                size="md"
                options={optionsFor('brand')}
                value={data.brand}
                onChange={(v) => set('brand', v)}
                placeholder="Select or type..."
                allowClear
                allowCreate
                onCreate={createVocab('brand')}
              />
            </div>
            <div>
              <label className={label}>Vendor</label>
              <SearchableDropdown
                size="md"
                options={optionsFor('vendor')}
                value={data.vendor}
                onChange={(v) => set('vendor', v)}
                placeholder="Select or type..."
                allowClear
                allowCreate
                onCreate={createVocab('vendor')}
              />
            </div>
            <div>
              <label className={label}>Part Number</label>
              <input
                type="text"
                value={data.partNumber}
                onChange={(e) => set('partNumber', e.target.value)}
                className={field}
                placeholder="Manufacturer number only"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className={label}>Tags</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {data.tags.map((id) => (
                <span
                  key={id}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border ${
                    data.primaryTag === id
                      ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                      : 'border-gray-300 bg-gray-50 text-gray-700'
                  }`}
                >
                  {data.primaryTag === id && <i className="fas fa-star text-[9px]"></i>}
                  {tagPath(id, byId)}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setTagPickerOpen(true)}
                className="px-2 py-1 text-xs rounded-md border border-dashed border-gray-400 text-gray-600 hover:bg-gray-50"
              >
                <i className="fas fa-plus text-[10px] mr-1"></i>
                {data.tags.length ? 'Edit tags' : 'Add tags'}
              </button>
            </div>
            {tagsInvalid && (
              <p className="mt-1 text-xs text-red-600">Star one tag as the primary.</p>
            )}
          </div>

          {/* Measurements. Which inputs appear comes from the tags above — the
              judgment decides which measurements are even meaningful. */}
          <div className="pt-1 border-t border-gray-100">
            <label className={`${label} pt-3`}>Measurements</label>
            <SupplyAttributes
              tags={data.tags}
              primaryTag={data.primaryTag}
              tagList={tags}
              fieldList={fields}
              values={data.attributes}
              onChange={(attributes) => set('attributes', attributes)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={label}>Form</label>
              <SearchableDropdown
                size="md"
                options={optionsFor('form')}
                value={data.form}
                onChange={(v) => set('form', v)}
                placeholder="—"
                allowClear
              />
            </div>
            <div>
              <label className={label}>Location</label>
              <SearchableDropdown
                size="md"
                options={optionsFor('location')}
                value={data.location}
                onChange={(v) => set('location', v)}
                placeholder="Shelf code"
                allowClear
                allowCreate
                onCreate={createVocab('location')}
              />
            </div>
            {!isEditing && (
              <div>
                <label className={label}>
                  Starting Qty <span className="font-normal text-gray-400">
                    in {upp > 1 ? `${purchaseLabel}s` : `${stockLabel}s`}
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={data.packagesOnHand}
                  onChange={(e) => set('packagesOnHand', parseFloat(e.target.value) || 0)}
                  className={field}
                />
                {upp > 1 && data.packagesOnHand > 0 && (
                  <p className="mt-1 text-[11px] text-blue-600">
                    = <strong>{data.packagesOnHand * upp} {stockLabel}</strong> in stock
                  </p>
                )}
              </div>
            )}
            <div>
              <label className={label}>
                Reorder At <span className="font-normal text-gray-400">in {stockLabel}s</span>
              </label>
              <input
                type="number"
                min="0"
                value={data.reorderPoint}
                onChange={(e) => set('reorderPoint', parseFloat(e.target.value) || 0)}
                className={field}
              />
            </div>
          </div>

          {/* You BUY jugs and you USE quarts. Quantity on hand, reorder point
              and price are all counted in the stock unit; cost is per purchase
              unit. Conflating the two is the classic inventory bug. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={label}>
                Stock Unit <span className="font-normal text-gray-400">— what you use</span>
              </label>
              <SearchableDropdown
                size="md"
                options={optionsFor('unit')}
                value={data.stockUnit}
                onChange={(v) => set('stockUnit', v)}
                placeholder="quart, each..."
                allowClear
                allowCreate
                onCreate={createVocab('unit')}
              />
            </div>
            <div>
              <label className={label}>{stockLabel}s per {purchaseLabel}</label>
              <input
                type="number"
                min="1"
                value={data.unitsPerPurchase}
                onChange={(e) => handleUpp(e.target.value)}
                className={field}
              />
              <p className="mt-1 text-[10px] text-gray-400">5 for a 5qt jug</p>
            </div>
            <div>
              <label className={label}>
                Purchase Unit <span className="font-normal text-gray-400">— what you order</span>
              </label>
              <SearchableDropdown
                size="md"
                options={optionsFor('unit')}
                value={data.purchaseUnit}
                onChange={(v) => set('purchaseUnit', v)}
                placeholder={upp > 1 ? 'jug, case...' : '—'}
                allowClear
                allowCreate
                onCreate={createVocab('unit')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className={label}>Cost <span className="text-gray-400">per {purchaseLabel}</span></label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={data.cost}
                onChange={(e) => handleCost(parseFloat(e.target.value) || 0)}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Price <span className="text-gray-400">per {stockLabel}</span></label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={data.price}
                onChange={(e) => handlePrice(parseFloat(e.target.value) || 0)}
                className={field}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={data.priceOverridden}
              onChange={(e) => set('priceOverridden', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Set price manually — detach this item from the {markupPercentage}% shop markup
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Product URL</label>
              <input type="url" value={data.url} onChange={(e) => set('url', e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>SDS URL</label>
              <input type="url" value={data.sdsUrl} onChange={(e) => set('sdsUrl', e.target.value)} className={field} />
            </div>
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea
              rows="2"
              value={data.notes}
              onChange={(e) => set('notes', e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-between items-center">
          <span className="text-[11px] text-gray-400 hidden sm:block">
            Ctrl+Enter to {isEditing ? 'save' : 'save and add another'}
          </span>
          <div className="flex gap-2">
            <Button variant="light" onClick={onClose} disabled={saving}>Cancel</Button>
            {!isEditing && (
              <Button variant="outline" onClick={() => save(true)} disabled={saving}>
                Save &amp; Next
              </Button>
            )}
            <Button variant="primary" onClick={() => save(false)} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <TagPicker
        isOpen={tagPickerOpen}
        onClose={() => setTagPickerOpen(false)}
        tags={tags}
        selectedTags={data.tags}
        primaryTag={data.primaryTag}
        onSave={({ tags: nextTags, primaryTag }) => {
          setData((prev) => ({ ...prev, tags: nextTags, primaryTag }));
        }}
      />
    </>
  );
};

export default SupplyForm;
