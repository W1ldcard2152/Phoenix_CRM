import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SearchableDropdown from '../common/SearchableDropdown';
import SupplyForm from '../supplies/SupplyForm';
import SupplyService from '../../services/supplyService';
import SettingsService from '../../services/settingsService';
import { formatCurrency } from '../../utils/formatters';
import { buildTree, indexTags, idOf } from '../supplies/tagTree';

/**
 * Pull a part onto a work order from shop supplies.
 *
 * Built for finding things rather than browsing them: search runs against the
 * composed name, and the tag filter walks descendants so "Chemicals & Fluids"
 * finds everything beneath it. The old inventory picker offered a flat list
 * against a free-text category, which is a large part of why only six parts in
 * five hundred were ever pulled from it.
 *
 * Also creates supplies inline. Something that arrived this morning and hasn't
 * been entered yet shouldn't force you to abandon the work order, go and add
 * it, and come back — so "Add a new supply" opens the same form the supplies
 * page uses, and the new item is selected on save.
 */
const SORTS = {
  name: { label: 'Name', fn: (a, b) => (a.displayName || '').localeCompare(b.displayName || '') },
  stock: { label: 'Most stock', fn: (a, b) => b.quantityOnHand - a.quantityOnHand },
  low: { label: 'Lowest stock', fn: (a, b) => a.quantityOnHand - b.quantityOnHand },
  price: { label: 'Price', fn: (a, b) => (b.price || 0) - (a.price || 0) }
};

const SupplyPickerModal = ({ isOpen, onClose, onConfirm, isLoading }) => {
  const [supplies, setSupplies] = useState([]);
  const [tags, setTags] = useState([]);
  const [vocab, setVocab] = useState([]);
  const [fields, setFields] = useState([]);
  const [markup, setMarkup] = useState(30);
  const [taxRate, setTaxRate] = useState(0);
  const [taxRules, setTaxRules] = useState([]);
  const [directoryVendors, setDirectoryVendors] = useState([]);

  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState(null);
  const [locationFilter, setLocationFilter] = useState(null);
  const [sortKey, setSortKey] = useState('name');

  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const byId = useMemo(() => indexTags(tags), [tags]);

  const loadReference = useCallback(async () => {
    try {
      const [tagRes, vocabRes, fieldRes, taxRuleRes, settingsRes] = await Promise.all([
        SupplyService.getTags(),
        SupplyService.getVocab(),
        SupplyService.getFields(),
        SupplyService.getTaxRules(),
        SettingsService.getSettings()
      ]);
      setTags(tagRes.data.tags);
      setVocab(vocabRes.data.vocab);
      setFields(fieldRes.data.fields);
      setTaxRules(taxRuleRes.data.rules);
      setMarkup(settingsRes.data.settings?.partMarkupPercentage ?? 30);
      setTaxRate(settingsRes.data.settings?.taxRate ?? 0);
      setDirectoryVendors(settingsRes.data.settings?.customVendors || []);
    } catch (err) {
      console.error('Error loading supply reference data:', err);
    }
  }, []);

  const loadSupplies = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (tagFilter) params.tag = tagFilter;
      if (locationFilter) params.location = locationFilter;
      if (search.trim()) params.search = search.trim();
      const res = await SupplyService.getAll(params);
      setSupplies(res.data.supplies || []);
    } catch (err) {
      console.error('Error loading supplies:', err);
    } finally {
      setLoading(false);
    }
  }, [tagFilter, locationFilter, search]);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(null);
    setQuantity(1);
    loadReference();
  }, [isOpen, loadReference]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(loadSupplies, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [isOpen, loadSupplies, search]);

  const vocabLabel = (id) => {
    const entry = vocab.find((v) => String(v._id) === idOf(id));
    return entry ? (entry.label || entry.value) : null;
  };

  const tagOptions = useMemo(() => {
    const out = [];
    const walk = (nodes, depth) => {
      nodes.forEach((n) => {
        out.push({
          value: idOf(n._id),
          label: `${'  '.repeat(depth)}${depth > 0 ? '└ ' : ''}${n.name}`,
          keywords: n.name
        });
        walk(n.children, depth + 1);
      });
    };
    walk(buildTree(tags), 0);
    return out;
  }, [tags]);

  const locationOptions = useMemo(() => vocab
    .filter((v) => v.fieldKey === 'location' && v.usageCount > 0)
    .map((v) => ({
      value: String(v._id),
      label: v.label || v.value,
      sublabel: `${v.usageCount} item${v.usageCount === 1 ? '' : 's'}`
    })), [vocab]);

  const sorted = useMemo(
    () => [...supplies].sort(SORTS[sortKey].fn),
    [supplies, sortKey]
  );

  const confirm = () => {
    if (!selected) return;
    onConfirm({ shopSupplyId: selected._id, quantity });
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Add part from Shop Supplies" size="xl">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, part number, notes..."
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <SearchableDropdown
                size="md"
                options={tagOptions}
                value={tagFilter}
                onChange={setTagFilter}
                placeholder="All"
                allowClear
                clearLabel="— All categories —"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <SearchableDropdown
                size="md"
                options={locationOptions}
                value={locationFilter}
                onChange={setLocationFilter}
                placeholder="Any"
                allowClear
                clearLabel="— Any location —"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Sort</span>
              {Object.entries(SORTS).map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`px-2 py-0.5 rounded ${
                    sortKey === key ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setFormOpen(true)}
              className="text-primary-600 hover:underline"
            >
              <i className="fas fa-plus mr-1 text-[10px]"></i>Add a new supply
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg max-h-[45vh] overflow-y-auto divide-y divide-gray-100">
            {loading ? (
              <p className="text-center text-gray-400 py-8 text-sm">Loading…</p>
            ) : sorted.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">Nothing matches.</p>
                <button onClick={() => setFormOpen(true)} className="mt-1 text-sm text-primary-600 hover:underline">
                  Add it as a new supply
                </button>
              </div>
            ) : sorted.map((s) => {
              const isSelected = selected && String(selected._id) === String(s._id);
              const out = s.quantityOnHand <= 0;
              const low = !out && s.quantityOnHand <= s.reorderPoint;
              return (
                <button
                  key={String(s._id)}
                  onClick={() => setSelected(s)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2 ${
                    isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {SupplyService.photoUrl(s) ? (
                    <img
                      src={SupplyService.photoUrl(s)}
                      alt=""
                      loading="lazy"
                      className="w-9 h-9 rounded object-cover border border-gray-200 shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded bg-gray-100 border border-gray-200 shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900 truncate">{s.displayName}</div>
                    <div className="text-[11px] text-gray-400 truncate">
                      {vocabLabel(s.location) && <span>{vocabLabel(s.location)} · </span>}
                      {s.primaryTag && byId[idOf(s.primaryTag)]?.name}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`text-sm ${out ? 'text-red-600' : low ? 'text-amber-600' : 'text-gray-700'}`}>
                      {s.quantityOnHand}
                      {out && <span className="ml-1 text-[10px]">out</span>}
                      {low && <span className="ml-1 text-[10px]">low</span>}
                    </div>
                    <div className="text-[11px] text-gray-400">{formatCurrency(s.price || 0)}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="flex items-end gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-gray-400">Selected</div>
                <div className="text-sm font-medium text-gray-900 truncate">{selected.displayName}</div>
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={inputCls}
                />
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-gray-400">Line total</div>
                <div className="text-sm font-medium text-gray-900">
                  {formatCurrency((selected.price || 0) * quantity)}
                </div>
              </div>
            </div>
          )}

          {selected && quantity > selected.quantityOnHand && (
            <p className="text-xs text-amber-700">
              Only {selected.quantityOnHand} in stock. The part will be added as a draft
              either way — committing it later is what checks stock.
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="light" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button variant="primary" onClick={confirm} disabled={!selected || isLoading}>
            {isLoading ? 'Adding…' : 'Add to work order'}
          </Button>
        </div>
      </Modal>

      {/* The same form the supplies page uses, so anything created here is a
          complete record rather than a stub needing fixing up later. */}
      <SupplyForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); loadSupplies(); }}
        onRefresh={loadSupplies}
        onVocabAdded={(entry) => setVocab((prev) => [
          ...prev.filter((v) => String(v._id) !== String(entry._id)), entry
        ])}
        vocab={vocab}
        tags={tags}
        fields={fields}
        markupPercentage={markup}
        taxRate={taxRate}
        taxRules={taxRules}
        directoryVendors={directoryVendors}
      />
    </>
  );
};

export default SupplyPickerModal;
