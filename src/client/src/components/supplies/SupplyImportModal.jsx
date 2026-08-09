import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SearchableDropdown from '../common/SearchableDropdown';
import SupplyAttributes from './SupplyAttributes';
import TagPicker from './TagPicker';
import SupplyService from '../../services/supplyService';
import { composeDisplayName } from './composeName';
import { indexTags, tagPath, idOf } from './tagTree';

/**
 * Bulk label import: drop in a stack of product photos, work them one at a time.
 *
 * Each photo gets a one-click AI read of its label into brand / part number /
 * measurements, and the photo itself becomes the item's picture — you were
 * photographing the product anyway.
 *
 * THE TAG IS NEVER APPLIED AUTOMATICALLY. The AI's category guess renders as a
 * dashed, unconfirmed chip that has to be clicked to accept. Save without
 * accepting and the item lands untagged, in the Untagged (N) queue, exactly as
 * if the AI had never run. A wrongly-tagged item looks finished from every
 * angle; an untagged one is visibly unfinished. That asymmetry is the whole
 * reason the confirm step exists.
 */
const STATUS = {
  pending: { label: 'Not read', cls: 'bg-gray-100 text-gray-500' },
  extracting: { label: 'Reading…', cls: 'bg-blue-50 text-blue-600' },
  ready: { label: 'Reviewed', cls: 'bg-amber-50 text-amber-700' },
  saved: { label: 'Saved', cls: 'bg-green-50 text-green-700' },
  skipped: { label: 'Skipped', cls: 'bg-gray-100 text-gray-400' },
  error: { label: 'Failed', cls: 'bg-red-50 text-red-600' }
};

const EMPTY_DRAFT = {
  brand: null, vendor: null, partNumber: '', qualifier: '', name: '',
  tags: [], primaryTag: null, form: null, location: null,
  quantityOnHand: 1, stockUnit: null, purchaseUnit: null, unitsPerPurchase: 1,
  reorderPoint: 1, cost: 0, price: 0, priceOverridden: false,
  attributes: {}, notes: '', url: '', sdsUrl: ''
};

const SupplyImportModal = ({
  isOpen, onClose, onImported, tags = [], fields = [], vocab = [],
  markupPercentage = 30, onVocabAdded, lastUsed = {}
}) => {
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const urlsRef = useRef([]);

  const byId = useMemo(() => indexTags(tags), [tags]);
  const current = queue[index] || null;

  useEffect(() => {
    if (isOpen) return;
    // Only revoke on close — revoking while the queue is live would blank the
    // thumbnails the user is still working through.
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    setQueue([]);
    setIndex(0);
  }, [isOpen]);

  const addFiles = (fileList) => {
    const images = Array.from(fileList || []).filter((f) => f.type?.startsWith('image/'));
    if (images.length === 0) return;

    const items = images.map((file) => {
      const url = URL.createObjectURL(file);
      urlsRef.current.push(url);
      return {
        file,
        url,
        status: 'pending',
        draft: { ...EMPTY_DRAFT, location: lastUsed.location || null },
        suggestedTag: null,
        similar: [],
        rejected: [],
        brandSuggestion: '',
        error: null
      };
    });
    setQueue((prev) => [...prev, ...items]);
  };

  const patch = (i, changes) => setQueue((prev) => prev.map(
    (item, n) => (n === i ? { ...item, ...changes } : item)
  ));

  const patchDraft = (i, changes) => setQueue((prev) => prev.map(
    (item, n) => (n === i ? { ...item, draft: { ...item.draft, ...changes } } : item)
  ));

  const extract = async (i) => {
    // Only the file is read from the closure — it never changes. Everything
    // else is merged functionally below, so an edit made while the request was
    // in flight survives the result landing.
    const file = queue[i]?.file;
    if (!file) return;
    patch(i, { status: 'extracting', error: null });

    try {
      const res = await SupplyService.extractLabel(file);
      const { draft, suggestedTag, similar, rejected } = res.data;

      setQueue((prev) => prev.map((item, n) => (n === i ? {
        ...item,
        status: 'ready',
        suggestedTag,
        similar: similar || [],
        rejected: rejected || [],
        brandSuggestion: draft.brandSuggestion || '',
        draft: {
          ...item.draft,
          // Don't overwrite anything the user already typed.
          brand: item.draft.brand || draft.brand || null,
          partNumber: item.draft.partNumber || draft.partNumber || '',
          qualifier: item.draft.qualifier || draft.qualifier || '',
          attributes: { ...(draft.attributes || {}), ...(item.draft.attributes || {}) },
          form: item.draft.form || draft.form || null,
          purchaseUnit: item.draft.purchaseUnit || draft.purchaseUnit || null,
          unitsPerPurchase: item.draft.unitsPerPurchase > 1
            ? item.draft.unitsPerPurchase
            : (draft.unitsPerPurchase || 1)
        }
      } : item)));
    } catch (err) {
      patch(i, {
        status: 'error',
        error: err.response?.data?.message || 'Could not read this label.'
      });
    }
  };

  const extractAll = async () => {
    for (let i = 0; i < queue.length; i += 1) {
      if (queue[i].status === 'pending') await extract(i);
    }
  };

  // Accepting the suggestion is the ONLY way a tag gets applied.
  const acceptTag = (i) => {
    const item = queue[i];
    if (!item?.suggestedTag) return;
    patchDraft(i, {
      tags: [item.suggestedTag._id],
      primaryTag: item.suggestedTag._id
    });
  };

  const createBrand = async (i, label) => {
    const res = await SupplyService.createVocab('brand', label, label);
    onVocabAdded?.(res.data.entry);
    patch(i, { brandSuggestion: '' });
    patchDraft(i, { brand: String(res.data.entry._id) });
  };

  const advance = () => {
    const next = queue.findIndex((q, n) => n > index && q.status !== 'saved' && q.status !== 'skipped');
    setIndex(next >= 0 ? next : Math.min(index + 1, queue.length - 1));
  };

  const save = async () => {
    if (!current) return;
    const preview = composeDisplayName(current.draft, tags, fields, vocab);
    if (!preview) {
      patch(index, { error: 'Needs a brand and a tag, or a custom name.' });
      return;
    }

    setSaving(true);
    try {
      const res = await SupplyService.create(current.draft);
      try {
        await SupplyService.uploadPhoto(res.data.supply._id, current.file);
      } catch (photoErr) {
        console.error('Photo upload failed for imported supply:', photoErr);
      }
      patch(index, { status: 'saved', error: null });
      onImported?.();
      advance();
    } catch (err) {
      patch(index, { error: err.response?.data?.message || 'Could not save this item.' });
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    patch(index, { status: 'skipped' });
    advance();
  };

  const optionsFor = (fieldKey) => vocab
    .filter((v) => v.fieldKey === fieldKey && v.isActive !== false)
    .map((v) => ({ value: String(v._id), label: v.label || v.value }));

  const preview = current ? composeDisplayName(current.draft, tags, fields, vocab) : '';
  const remaining = queue.filter((q) => q.status !== 'saved' && q.status !== 'skipped').length;
  const savedCount = queue.filter((q) => q.status === 'saved').length;

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Import from product photos" size="xl">
        {queue.length === 0 ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center"
          >
            <i className="fas fa-camera text-3xl text-gray-300 mb-3"></i>
            <p className="text-sm text-gray-600 mb-1">
              Drop photos of product labels here, or
              <button
                onClick={() => fileRef.current?.click()}
                className="ml-1 text-primary-600 hover:underline"
              >
                choose files
              </button>
            </p>
            <p className="text-xs text-gray-400">
              Add as many as you like — you'll work through them one at a time.
              Each photo becomes that item's picture.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Queue strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {queue.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  className={`relative shrink-0 w-14 h-14 rounded border-2 overflow-hidden ${
                    i === index ? 'border-primary-500' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  title={STATUS[item.status].label}
                >
                  <img src={item.url} alt="" className="w-full h-full object-cover" />
                  {item.status === 'saved' && (
                    <span className="absolute inset-0 bg-green-600/60 flex items-center justify-center">
                      <i className="fas fa-check text-white text-xs"></i>
                    </span>
                  )}
                  {item.status === 'skipped' && (
                    <span className="absolute inset-0 bg-gray-700/50"></span>
                  )}
                </button>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="shrink-0 w-14 h-14 rounded border-2 border-dashed border-gray-300 text-gray-400 hover:border-primary-400"
                title="Add more"
              >
                <i className="fas fa-plus text-xs"></i>
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                Item {index + 1} of {queue.length} · {savedCount} saved · {remaining} left
              </span>
              {queue.some((q) => q.status === 'pending') && (
                <button onClick={extractAll} className="text-primary-600 hover:underline">
                  Read all labels
                </button>
              )}
            </div>

            {current && (
              <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
                {/* Photo + extract */}
                <div>
                  <img
                    src={current.url}
                    alt=""
                    className="w-full rounded border border-gray-200 object-contain max-h-56 bg-gray-50"
                  />
                  <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[11px] ${STATUS[current.status].cls}`}>
                    {STATUS[current.status].label}
                  </span>
                  {(current.status === 'pending' || current.status === 'error') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => extract(index)}
                    >
                      <i className="fas fa-wand-magic-sparkles mr-1.5 text-[10px]"></i>
                      Read the label
                    </Button>
                  )}
                  {current.status === 'extracting' && (
                    <p className="mt-2 text-xs text-blue-600">
                      <i className="fas fa-spinner fa-spin mr-1"></i>Reading…
                    </p>
                  )}
                  {current.error && <p className="mt-2 text-xs text-red-600">{current.error}</p>}
                </div>

                {/* Review */}
                <div className="space-y-3">
                  <div className="px-3 py-2 rounded bg-gray-50 border border-gray-200">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">
                      Will be listed as
                    </div>
                    <div className={`text-sm ${preview ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
                      {preview || 'Needs a brand and a tag, or a custom name'}
                    </div>
                  </div>

                  {current.similar.length > 0 && (
                    <div className="px-3 py-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
                      <strong>Possibly already stocked:</strong>{' '}
                      {current.similar.map((s) => s.displayName).join(', ')}
                      <div className="text-[11px] text-amber-700 mt-0.5">
                        Saving will create a separate item. Skip this photo and adjust the
                        existing item's quantity instead if it's the same product.
                      </div>
                    </div>
                  )}

                  {/* Tag suggestion — unconfirmed until clicked */}
                  <div>
                    <label className={labelCls}>Tag</label>
                    {current.draft.primaryTag ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-yellow-400 bg-yellow-50 text-yellow-800">
                        <i className="fas fa-star text-[9px]"></i>
                        {tagPath(current.draft.primaryTag, byId)}
                        <button
                          onClick={() => patchDraft(index, { tags: [], primaryTag: null })}
                          className="text-gray-400 hover:text-gray-700 ml-1"
                        >
                          <i className="fas fa-times text-[10px]"></i>
                        </button>
                      </span>
                    ) : current.suggestedTag ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => acceptTag(index)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border border-dashed border-primary-400 bg-primary-50/50 text-primary-700 hover:bg-primary-50"
                        >
                          <i className="fas fa-plus text-[9px]"></i>
                          {current.suggestedTag.path}
                          <span className="text-[10px] text-primary-500">
                            ({current.suggestedTag.confidence} confidence — click to accept)
                          </span>
                        </button>
                        <button
                          onClick={() => setTagPickerOpen(true)}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          pick another
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setTagPickerOpen(true)}
                        className="px-2 py-1 text-xs rounded-md border border-dashed border-gray-400 text-gray-600 hover:bg-gray-50"
                      >
                        <i className="fas fa-plus text-[10px] mr-1"></i>Choose a tag
                      </button>
                    )}
                    {!current.draft.primaryTag && current.status === 'ready' && (
                      <p className="mt-1 text-[11px] text-gray-400">
                        Leave it unaccepted and this saves untagged — it'll be waiting in Untagged.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Brand</label>
                      <SearchableDropdown
                        size="md"
                        options={optionsFor('brand')}
                        value={current.draft.brand}
                        onChange={(v) => patchDraft(index, { brand: v })}
                        placeholder="—"
                        allowClear
                        allowCreate
                        onCreate={async (typed) => {
                          const res = await SupplyService.createVocab('brand', typed, typed);
                          onVocabAdded?.(res.data.entry);
                          return String(res.data.entry._id);
                        }}
                      />
                      {current.brandSuggestion && (
                        <button
                          onClick={() => createBrand(index, current.brandSuggestion)}
                          className="mt-1 text-[11px] text-primary-600 hover:underline"
                        >
                          + Add "{current.brandSuggestion}" from the label
                        </button>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>Part Number</label>
                      <input
                        type="text"
                        value={current.draft.partNumber}
                        onChange={(e) => patchDraft(index, { partNumber: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Location</label>
                      <SearchableDropdown
                        size="md"
                        options={optionsFor('location')}
                        value={current.draft.location}
                        onChange={(v) => patchDraft(index, { location: v })}
                        placeholder="Shelf"
                        allowClear
                        allowCreate
                        onCreate={async (typed) => {
                          const res = await SupplyService.createVocab('location', typed, typed);
                          onVocabAdded?.(res.data.entry);
                          return String(res.data.entry._id);
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Qualifier</label>
                    <input
                      type="text"
                      value={current.draft.qualifier}
                      onChange={(e) => patchDraft(index, { qualifier: e.target.value })}
                      className={inputCls}
                      placeholder="e.g. full synthetic, dexos-d"
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Measurements</label>
                    <SupplyAttributes
                      tags={current.draft.tags}
                      primaryTag={current.draft.primaryTag}
                      tagList={tags}
                      fieldList={fields}
                      values={current.draft.attributes}
                      onChange={(attributes) => patchDraft(index, { attributes })}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Qty on hand</label>
                      <input
                        type="number" min="0"
                        value={current.draft.quantityOnHand}
                        onChange={(e) => patchDraft(index, { quantityOnHand: parseFloat(e.target.value) || 0 })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Cost</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={current.draft.cost}
                        onChange={(e) => {
                          const cost = parseFloat(e.target.value) || 0;
                          const upp = Math.max(1, current.draft.unitsPerPurchase || 1);
                          patchDraft(index, {
                            cost,
                            price: parseFloat(((cost / upp) * (1 + markupPercentage / 100)).toFixed(2))
                          });
                        }}
                        className={inputCls}
                      />
                      <p className="mt-1 text-[10px] text-gray-400">Labels don't carry prices</p>
                    </div>
                    <div>
                      <label className={labelCls}>Units / purchase</label>
                      <input
                        type="number" min="1"
                        value={current.draft.unitsPerPurchase}
                        onChange={(e) => patchDraft(index, { unitsPerPurchase: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  {current.rejected.length > 0 && (
                    <p className="text-[11px] text-gray-400">
                      Ignored from the label (not in your vocabulary): {current.rejected.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />

        {queue.length > 0 && (
          <div className="mt-5 flex justify-between items-center">
            <button onClick={skip} className="text-sm text-gray-500 hover:underline">
              Skip this photo
            </button>
            <div className="flex gap-2">
              <Button variant="light" onClick={onClose} disabled={saving}>Done</Button>
              <Button
                variant="primary"
                onClick={save}
                disabled={saving || !preview || current?.status === 'saved'}
              >
                {saving ? 'Saving…' : 'Save & Next'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <TagPicker
        isOpen={tagPickerOpen}
        onClose={() => setTagPickerOpen(false)}
        tags={tags}
        selectedTags={current?.draft.tags || []}
        primaryTag={current?.draft.primaryTag || null}
        onSave={({ tags: nextTags, primaryTag }) => {
          patchDraft(index, { tags: nextTags, primaryTag });
        }}
      />
    </>
  );
};

export default SupplyImportModal;
