import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import ButtonMenu from '../../components/common/ButtonMenu';
import Modal from '../../components/common/Modal';
import SearchableDropdown from '../../components/common/SearchableDropdown';
import ResponsiveTable, { MobileCard, MobileContainer } from '../../components/common/ResponsiveTable';
import SupplyForm from '../../components/supplies/SupplyForm';
import SupplyImportModal from '../../components/supplies/SupplyImportModal';
import SupplyDetailModal from '../../components/supplies/SupplyDetailModal';
import TagPicker from '../../components/supplies/TagPicker';
import QohEditor from '../../components/supplies/QohEditor';
import SupplyService from '../../services/supplyService';
import SettingsService from '../../services/settingsService';
import { resolveFields } from '../../components/supplies/SupplyAttributes';
import { indexTags, buildTree, tagPath, idOf, treeLabel } from '../../components/supplies/tagTree';
import { locationOptions, locationParams } from '../../components/supplies/locationTree';
import { isLow, isOut } from '../../components/supplies/restock';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Inventory & Shop Supplies — the single source of truth for stock.
 *
 * The old Shop Inventory page is retired: it is gone from the nav and nothing
 * writes to `InventoryItem` any more. Its route still resolves read-only so the
 * work order lines that consumed stock from it stay legible.
 *
 * Uses the shared primitives (Modal, ResponsiveTable, Button) rather than the
 * hand-rolled table and inline modals that InventoryList grew.
 */
const SupplyList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOfficeStaff = ['admin', 'management', 'service-writer'].includes(user?.role);

  const [supplies, setSupplies] = useState([]);
  const [tags, setTags] = useState([]);
  const [vocab, setVocab] = useState([]);
  const [fields, setFields] = useState([]);
  const [untaggedCount, setUntaggedCount] = useState(0);
  // Shop-wide restock figures, unaffected by the filters below — they label the
  // shortcuts that turn the stock filter ON, so they have to keep reporting the
  // whole shop while the list itself is narrowed.
  const [stockCounts, setStockCounts] = useState({ low: 0, out: 0 });
  const [markup, setMarkup] = useState(30);
  const [taxRate, setTaxRate] = useState(0);
  const [taxRules, setTaxRules] = useState([]);
  const [directoryVendors, setDirectoryVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [tagFilter, setTagFilter] = useState(null);
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  // null | 'low' | 'out'. 'low' means at or below the reorder point, which
  // already includes everything that is out; 'out' narrows to the zeroes.
  const [stockFilter, setStockFilter] = useState(null);
  const [brandFilter, setBrandFilter] = useState(null);
  const [vendorFilter, setVendorFilter] = useState(null);
  const [locationFilter, setLocationFilter] = useState(null);
  const [search, setSearch] = useState('');
  // { viscosity: '5W-30' } — only meaningful once a tag filter narrows things
  // to items that actually carry that measurement.
  const [attrFilters, setAttrFilters] = useState({});

  // Selection + modals
  const [selectedIds, setSelectedIds] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkLocationOpen, setBulkLocationOpen] = useState(false);
  const [bulkLocation, setBulkLocation] = useState(null);
  const [bulkError, setBulkError] = useState(null);
  const [lastUsed, setLastUsed] = useState({});
  const [copied, setCopied] = useState(false);

  const byId = useMemo(() => indexTags(tags), [tags]);
  const tree = useMemo(() => buildTree(tags), [tags]);

  /**
   * Fold a created vocab entry into local state by id.
   *
   * The server's createVocab returns the EXISTING row when the value is already
   * taken, so adding the same brand from several queued import cards is a no-op
   * in the database but used to append a copy per click here — eight "Bosch"
   * entries in the dropdown backed by one row.
   */
  const addVocabEntry = useCallback((entry) => {
    if (!entry?._id) return;
    setVocab((prev) => {
      const without = prev.filter((v) => String(v._id) !== String(entry._id));
      return [...without, entry];
    });
  }, []);

  const vocabByField = useCallback((fieldKey) => vocab
    .filter((v) => v.fieldKey === fieldKey && v.isActive !== false)
    .map((v) => ({ value: String(v._id), label: v.label || v.value })), [vocab]);

  /**
   * Filter options: only values something actually uses, with the count shown.
   *
   * Offering a value no item carries is indistinguishable from a broken filter
   * — you pick "Walmart", get nothing, and conclude filtering doesn't work,
   * when really the items are on "Walmart.com". Everything offered here returns
   * at least one row by construction.
   *
   * Deliberately NOT used for the entry dropdowns in the form and import modal:
   * a vendor you haven't used yet is exactly the one you're about to use.
   */
  const filterOptionsFor = useCallback((fieldKey) => vocab
    .filter((v) => v.fieldKey === fieldKey && v.isActive !== false && v.usageCount > 0)
    .sort((a, b) => (b.usageCount - a.usageCount)
      || (a.label || a.value).localeCompare(b.label || b.value))
    .map((v) => ({
      value: String(v._id),
      label: v.label || v.value,
      sublabel: `${v.usageCount} item${v.usageCount === 1 ? '' : 's'}`
    })), [vocab]);

  /**
   * Shelf codes as a hierarchy, so one dropdown offers "Stock Room 1" (the
   * whole room), "1-C" (a column) and "1-C-2" (a single shelf). Derived from
   * the vocab values themselves, so new shelves appear without any change here.
   */
  const locationFilterOptions = useMemo(
    () => locationOptions(vocab, { usedOnly: true }),
    [vocab]
  );

  const vocabLabel = useCallback((id) => {
    const entry = vocab.find((v) => String(v._id) === idOf(id));
    return entry ? (entry.label || entry.value) : '';
  }, [vocab]);

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
      // The vendor directory, for URL→vendor detection on entry.
      setDirectoryVendors(settingsRes.data.settings?.customVendors || []);
    } catch (err) {
      setError('Could not load tags and vocabulary.');
    }
  }, []);

  const loadSupplies = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (untaggedOnly) params.untagged = 'true';
      else if (tagFilter) params.tag = tagFilter;
      if (stockFilter) params.stock = stockFilter;
      if (brandFilter) params.brand = brandFilter;
      if (vendorFilter) params.vendor = vendorFilter;
      // Either an exact shelf or a prefix covering everything under a room or
      // column, depending on which level was picked.
      Object.assign(params, locationParams(locationFilter));
      if (search.trim()) params.search = search.trim();
      Object.entries(attrFilters).forEach(([k, v]) => {
        if (v) params[`attr[${k}]`] = v;
      });

      const res = await SupplyService.getAll(params);
      setSupplies(res.data.supplies);
      setUntaggedCount(res.data.untaggedCount);
      setStockCounts({
        low: res.data.lowStockCount || 0,
        out: res.data.outOfStockCount || 0
      });
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load supplies.');
    } finally {
      setLoading(false);
    }
  }, [tagFilter, untaggedOnly, brandFilter, vendorFilter, locationFilter, search,
    attrFilters, stockFilter]);

  // Measurements offered as filters are those the SELECTED TAG defines — the
  // reason "filter by viscosity" is a coherent question only once you've said
  // you're looking at engine oil.
  const filterableFields = useMemo(() => {
    if (!tagFilter) return [];
    const { required, optional } = resolveFields([tagFilter], tagFilter, tags);
    const byId = {};
    fields.forEach((f) => { byId[String(f._id)] = f; });
    return [...required, ...optional]
      .map((id) => byId[id])
      .filter(Boolean)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [tagFilter, tags, fields]);

  useEffect(() => { loadReference(); }, [loadReference]);

  useEffect(() => {
    const t = setTimeout(loadSupplies, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadSupplies, search]);

  const clearFilters = () => {
    setTagFilter(null);
    setUntaggedOnly(false);
    setStockFilter(null);
    setBrandFilter(null);
    setVendorFilter(null);
    setLocationFilter(null);
    setSearch('');
    setAttrFilters({});
  };

  // Changing the tag changes which measurements exist, so stale attribute
  // filters would silently return nothing with no visible cause.
  const changeTagFilter = (value) => {
    setTagFilter(value);
    setUntaggedOnly(false);
    setAttrFilters({});
  };

  // Split, because the restock banner needs to say whether the shortage count
  // it is showing is the whole shop's or just this corner of it.
  const hasNarrowingFilters = tagFilter || untaggedOnly || brandFilter || vendorFilter
    || locationFilter || search || Object.values(attrFilters).some(Boolean);
  const hasFilters = hasNarrowingFilters || !!stockFilter;

  // Flat tag options, indented by depth, so a single dropdown can stand in for
  // the deferred browse sidebar without losing the shape of the tree.
  const tagOptions = useMemo(() => {
    const out = [];
    const walk = (nodes, depth) => {
      nodes.forEach((n) => {
        out.push({
          value: idOf(n._id),
          label: treeLabel(n.name, depth),
          keywords: n.name
        });
        walk(n.children, depth + 1);
      });
    };
    walk(tree, 0);
    return out;
  }, [tree]);

  /**
   * Rows in display order.
   *
   * The server sorts by name, which is right for browsing. When the list is
   * being read as a shopping list it isn't: a zero buried alphabetically among
   * items that have merely dipped to their reorder point is the one you forget
   * to buy. So under the stock filter, everything that is OUT floats to the top
   * and the alphabet only breaks ties.
   */
  const rows = useMemo(() => {
    if (!stockFilter) return supplies;
    return [...supplies].sort((a, b) => (
      (isOut(a) ? 0 : 1) - (isOut(b) ? 0 : 1)
      || (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '')
    ));
  }, [supplies, stockFilter]);

  /**
   * The shortage as plain text, in the order shown, for pasting into a notes
   * app or a message to whoever is doing the run. Each line carries the vendor
   * and the product URL, because a shopping list that makes you come back here
   * to look things up hasn't left the building.
   */
  const copyShoppingList = async () => {
    const date = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    const lines = rows.map((s) => {
      const bits = [s.displayName || s.name];
      if (s.partNumber) bits.push(`#${s.partNumber}`);
      const vendorName = vocabLabel(s.vendor);
      if (vendorName) bits.push(vendorName);
      bits.push(`have ${s.quantityOnHand ?? 0}, reorder at ${s.reorderPoint ?? 0}`);
      return `- ${bits.join(' · ')}${s.url ? `\n  ${s.url}` : ''}`;
    });
    const text = [`Shopping list (${date})`, '', ...lines].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Clipboard access can be refused outright (insecure origin, denied
      // permission). Saying so beats a button that silently does nothing.
      setError('Could not copy to the clipboard.');
    }
  };

  const toggleSelect = (id) => setSelectedIds((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ));

  const allSelected = supplies.length > 0 && selectedIds.length === supplies.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : supplies.map((s) => String(s._id)));

  const runBulk = async (set) => {
    setBulkError(null);
    try {
      await SupplyService.bulkUpdate(selectedIds, set);
      setSelectedIds([]);
      setBulkTagOpen(false);
      setBulkLocationOpen(false);
      loadSupplies();
    } catch (err) {
      const data = err.response?.data;
      if (data?.violations?.length) {
        setBulkError(`${data.message} Affected: ${data.violations.map((v) => v.name).join(', ')}`);
      } else {
        setBulkError(data?.message || 'Bulk update failed.');
      }
    }
  };

  const openDetail = (id) => setDetailId(id);

  /**
   * Fold one updated supply back into the list.
   *
   * Used instead of reloading after an inline quantity edit: a reload re-sorts
   * and re-renders the whole table, so correcting a run of stock levels would
   * make rows jump under the cursor between edits.
   */
  const applySupply = useCallback((updated) => {
    if (!updated?._id) return;
    setSupplies((prev) => prev.map((s) => (
      String(s._id) === String(updated._id) ? { ...s, ...updated } : s
    )));
  }, []);

  const handleDelete = async (supply) => {
    if (!window.confirm(`Remove "${supply.displayName || supply.name}" from supplies?`)) return;
    await SupplyService.remove(supply._id);
    loadSupplies();
  };

  // Measurements shown inline under the name — the point of pulling viscosity
  // out of the title is that it stays visible without being part of the title.
  const renderAttributes = (supply) => {
    const attrs = supply.attributes || {};
    const entries = Object.entries(attrs).filter(([, v]) => v);
    if (entries.length === 0) return null;

    const labelFor = (key) => {
      const f = fields.find((x) => x.key === key);
      return f ? f.label : key;
    };

    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {entries.map(([key, value]) => (
          <span
            key={key}
            title={labelFor(key)}
            className="inline-flex items-center px-1.5 py-0.5 text-[11px] rounded bg-blue-50 text-blue-700 border border-blue-100"
          >
            {value}
          </span>
        ))}
      </div>
    );
  };

  /**
   * The product page, one click away and in a new tab.
   *
   * The whole point of spotting a shortage is to end up on the vendor's site,
   * and a URL you have to open the detail modal to reach is a URL you retype.
   * stopPropagation because the row itself opens the detail modal.
   */
  const renderProductLink = (supply, { label = false } = {}) => {
    if (!supply.url) return null;
    return (
      <a
        href={supply.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Open product page in a new tab"
        className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-800 hover:underline"
      >
        <i className="fas fa-external-link-alt text-[10px]"></i>
        {label && <span className="text-xs">Product page</span>}
      </a>
    );
  };

  /**
   * Why a stock figure is red. QohEditor colours it but says nothing; a bare
   * red number reports that something is wrong without saying what the
   * threshold was, which is the difference between "buy some" and "buy some
   * because we keep four".
   */
  const renderStockNote = (supply) => {
    if (!isLow(supply)) return null;
    return (
      <div className="text-[11px] text-red-600">
        {isOut(supply) ? 'out of stock' : `reorder at ${supply.reorderPoint ?? 0}`}
      </div>
    );
  };

  const renderTags = (supply) => {
    if (!supply.tags?.length) {
      return <span className="text-xs text-amber-600 italic">untagged</span>;
    }
    const primary = idOf(supply.primaryTag);
    return (
      <div className="flex flex-wrap gap-1">
        {supply.tags.map((t) => {
          const id = idOf(t);
          return (
            <span
              key={id}
              title={tagPath(id, byId)}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded border ${
                primary === id
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              {primary === id && <i className="fas fa-star text-[8px]"></i>}
              {byId[id]?.name || '—'}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Inventory &amp; Shop Supplies</h1>
          <p className="text-sm text-gray-500">
            {supplies.length} shown
            {untaggedCount > 0 && (
              <>
                {' · '}
                <button
                  onClick={() => { setUntaggedOnly(true); setTagFilter(null); }}
                  className="text-amber-600 hover:underline"
                >
                  {untaggedCount} untagged
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/supplies/counts')}>
            <i className="fas fa-clipboard-check mr-2"></i>Cycle counts
          </Button>
        {isOfficeStaff && (
          <>
            <Button variant="outline" onClick={() => navigate('/supplies/receive')}>
              <i className="fas fa-dolly mr-2"></i>Receive stock
            </Button>
            {/* The badge is the point: what needs buying has to be legible from
                the toolbar, not only once you have filtered the table. */}
            <Button variant="outline" onClick={() => navigate('/supplies/order')}>
              <i className="fas fa-cart-shopping mr-2"></i>Order Stock
              {stockCounts.low > 0 && (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                    stockCounts.out > 0
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {stockCounts.low}
                </span>
              )}
            </Button>
            {/* Two ways to get an item in, one slot. Entering one by hand and
                reading a batch off photos are the same errand, and the toolbar
                had run out of room to say so. */}
            <ButtonMenu
              label={<><i className="fas fa-plus mr-2"></i>Add Supply</>}
              items={[
                {
                  key: 'single',
                  label: 'Add a single item',
                  description: 'Fill in the form yourself',
                  icon: 'fas fa-pen-to-square',
                  onClick: () => { setEditing(null); setFormOpen(true); }
                },
                {
                  key: 'photos',
                  label: 'Import from photos',
                  description: 'Read receipts or product labels',
                  icon: 'fas fa-camera',
                  onClick: () => setImportOpen(true)
                }
              ]}
            />
          </>
        )}
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, part number, notes..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tag (includes sub-tags)</label>
            <SearchableDropdown
              size="md"
              options={tagOptions}
              value={tagFilter}
              onChange={changeTagFilter}
              placeholder="All tags"
              allowClear
              clearLabel="— All tags —"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
            <SearchableDropdown
              size="md"
              options={filterOptionsFor('vendor')}
              value={vendorFilter}
              onChange={setVendorFilter}
              placeholder="Any"
              allowClear
              clearLabel="— Any vendor —"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Location <span className="font-normal text-gray-400">(includes sub-shelves)</span>
            </label>
            <SearchableDropdown
              size="md"
              options={locationFilterOptions}
              value={locationFilter}
              onChange={setLocationFilter}
              placeholder="Any"
              allowClear
              clearLabel="— Any location —"
            />
          </div>
          {/* A plain select, not SearchableDropdown: three fixed options do not
              need a search box, and the counts have to stay visible. */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Stock level</label>
            <select
              value={stockFilter || ''}
              onChange={(e) => setStockFilter(e.target.value || null)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Any level</option>
              <option value="low">Low or out ({stockCounts.low})</option>
              <option value="out">Out of stock ({stockCounts.out})</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={untaggedOnly}
              onChange={(e) => { setUntaggedOnly(e.target.checked); if (e.target.checked) setTagFilter(null); }}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Untagged only ({untaggedCount})
          </label>
          <SearchableDropdown
            className="w-48"
            options={filterOptionsFor('brand')}
            value={brandFilter}
            onChange={setBrandFilter}
            placeholder="Any brand"
            allowClear
            clearLabel="— Any brand —"
          />
          {hasFilters && (
            <button onClick={clearFilters} className="text-sm text-primary-600 hover:underline">
              Clear filters
            </button>
          )}
        </div>

        {/* Measurement filters, offered only for the selected tag. */}
        {filterableFields.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex flex-wrap items-end gap-3">
              {filterableFields.map((f) => (
                <div key={String(f._id)} className="w-40">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {f.label}
                    {f.unit && <span className="text-gray-400"> ({f.unit})</span>}
                  </label>
                  {f.type === 'select' ? (
                    <SearchableDropdown
                      size="md"
                      options={(f.options || []).map((o) => ({ value: o, label: o }))}
                      value={attrFilters[f.key] || null}
                      onChange={(v) => setAttrFilters((prev) => ({ ...prev, [f.key]: v || '' }))}
                      placeholder="Any"
                      allowClear
                      clearLabel="— Any —"
                    />
                  ) : (
                    <input
                      type="text"
                      value={attrFilters[f.key] || ''}
                      onChange={(e) => setAttrFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder="Any"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {stockFilter && !loading && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-md">
          <span className="text-sm text-red-900">
            <i className="fas fa-cart-shopping mr-2"></i>
            {rows.length === 0
              ? `Nothing is ${stockFilter === 'out' ? 'out of stock' : 'below its reorder point'}`
              : `${rows.length} item${rows.length === 1 ? '' : 's'} ${
                stockFilter === 'out' ? 'out of stock' : 'at or below the reorder point'}`}
            {hasNarrowingFilters && ' under the current filters'}
          </span>
          {rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={copyShoppingList}>
              <i className={`fas ${copied ? 'fa-check' : 'fa-copy'} mr-2`}></i>
              {copied ? 'Copied' : 'Copy shopping list'}
            </Button>
          )}
          <button
            onClick={() => setStockFilter(null)}
            className="text-sm text-red-700 hover:underline"
          >
            Show all stock levels
          </button>
        </div>
      )}

      {selectedIds.length > 0 && isOfficeStaff && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-primary-50 border border-primary-200 rounded-md">
          <span className="text-sm font-medium text-primary-900">
            {selectedIds.length} selected
          </span>
          <Button size="sm" variant="outline" onClick={() => { setBulkError(null); setBulkTagOpen(true); }}>
            Edit tags
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setBulkError(null); setBulkLocationOpen(true); }}>
            Set location
          </Button>
          <button onClick={() => setSelectedIds([])} className="text-sm text-gray-600 hover:underline">
            Clear selection
          </button>
          {bulkError && <span className="text-sm text-red-700 w-full">{bulkError}</span>}
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <Card><p className="text-center text-gray-400 py-8">Loading...</p></Card>
      ) : rows.length === 0 ? (
        stockFilter ? null : (
          <Card>
            <p className="text-center text-gray-500 py-8">
              {hasFilters
                ? 'No supplies match these filters.'
                : 'No supplies yet. Add one, or run the import to bring over your existing inventory.'}
            </p>
          </Card>
        )
      ) : (
        <>
          <ResponsiveTable>
            <thead className="bg-gray-50">
              <tr>
                {isOfficeStaff && (
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                )}
                <th className="px-2 py-2 w-12"></th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tags</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">QOH</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map((s) => {
                const id = String(s._id);
                return (
                  <tr
                    key={id}
                    onClick={() => openDetail(id)}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedIds.includes(id) ? 'bg-primary-50' : ''}`}
                  >
                    {isOfficeStaff && (
                      // Selecting rows for a bulk edit must not also open each
                      // one, so the checkbox cell swallows the row click.
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(id)}
                          onChange={() => toggleSelect(id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    )}
                    <td className="px-2 py-2">
                      {SupplyService.photoUrl(s) ? (
                        <img
                          src={SupplyService.photoUrl(s)}
                          alt=""
                          loading="lazy"
                          className="w-10 h-10 rounded object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200 flex items-center justify-center">
                          <i className="fas fa-image text-gray-300 text-xs"></i>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-start gap-1.5">
                        <span className="text-sm font-medium text-gray-900">
                          {s.displayName || s.name}
                        </span>
                        {renderProductLink(s)}
                      </div>
                      {renderAttributes(s)}
                    </td>
                    <td className="px-4 py-2">{renderTags(s)}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {s.brand ? vocabLabel(s.brand) : (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          brand missing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{vocabLabel(s.vendor) || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{vocabLabel(s.location) || '—'}</td>
                    {/* Editing stock must not also open the detail modal. */}
                    <td className="px-4 py-2 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                      <QohEditor
                        supply={s}
                        vocab={vocab}
                        disabled={!isOfficeStaff}
                        onSaved={applySupply}
                      />
                      {renderStockNote(s)}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-700">
                      ${(s.price ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {isOfficeStaff && (
                        <>
                          <button
                            onClick={() => { setEditing(s); setFormOpen(true); }}
                            className="text-gray-400 hover:text-primary-600 px-1"
                            title="Edit"
                          >
                            <i className="fas fa-pen text-xs"></i>
                          </button>
                          <button
                            onClick={() => handleDelete(s)}
                            className="text-gray-400 hover:text-red-600 px-1"
                            title="Remove"
                          >
                            <i className="fas fa-trash text-xs"></i>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </ResponsiveTable>

          <MobileContainer>
            {rows.map((s) => (
              <MobileCard key={String(s._id)} onClick={() => openDetail(String(s._id))}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    {SupplyService.photoUrl(s) && (
                      <img
                        src={SupplyService.photoUrl(s)}
                        alt=""
                        loading="lazy"
                        className="w-12 h-12 rounded object-cover border border-gray-200 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{s.displayName || s.name}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="text-sm">
                      <QohEditor
                        supply={s}
                        vocab={vocab}
                        disabled={!isOfficeStaff}
                        onSaved={applySupply}
                      />
                    </div>
                    {renderStockNote(s)}
                    <div className="text-xs text-gray-400">${(s.price ?? 0).toFixed(2)}</div>
                  </div>
                </div>
                <div className="mt-2">{renderTags(s)}</div>
                <div className="mt-2 text-xs text-gray-500 space-x-2">
                  {vocabLabel(s.vendor) && <span>{vocabLabel(s.vendor)}</span>}
                  {vocabLabel(s.location) && <span>· {vocabLabel(s.location)}</span>}
                </div>
                {s.url && (
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    {renderProductLink(s, { label: true })}
                  </div>
                )}
                {isOfficeStaff && (
                  <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="light" onClick={() => { setEditing(s); setFormOpen(true); }}>
                      Edit
                    </Button>
                  </div>
                )}
              </MobileCard>
            ))}
          </MobileContainer>
        </>
      )}

      <SupplyForm
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); loadSupplies(); }}
        onSaved={(used) => { setLastUsed(used); loadSupplies(); }}
        onRefresh={loadSupplies}
        onVocabAdded={addVocabEntry}
        vocab={vocab}
        tags={tags}
        fields={fields}
        markupPercentage={markup}
        taxRate={taxRate}
        taxRules={taxRules}
        directoryVendors={directoryVendors}
        onTaxRuleLearned={(rule) => setTaxRules((prev) => [
          ...prev.filter((r) => r.hostname !== rule.hostname), rule
        ])}
        initial={editing}
        lastUsed={lastUsed}
      />

      <SupplyDetailModal
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        supplyId={detailId}
        tags={tags}
        vocab={vocab}
        fields={fields}
        onEdit={isOfficeStaff ? (supply) => {
          // Hand off to the form rather than stacking modals.
          setDetailId(null);
          setEditing(supply);
          setFormOpen(true);
        } : null}
      />

      <SupplyImportModal
        isOpen={importOpen}
        onClose={() => { setImportOpen(false); loadSupplies(); }}
        onImported={loadSupplies}
        tags={tags}
        fields={fields}
        vocab={vocab}
        markupPercentage={markup}
        taxRate={taxRate}
        taxRules={taxRules}
        directoryVendors={directoryVendors}
        onTaxRuleLearned={(rule) => setTaxRules((prev) => [
          ...prev.filter((r) => r.hostname !== rule.hostname), rule
        ])}
        lastUsed={lastUsed}
        onVocabAdded={addVocabEntry}
      />

      {/* Bulk tag edit — adds tags to every selected item. */}
      <TagPicker
        isOpen={bulkTagOpen}
        onClose={() => setBulkTagOpen(false)}
        tags={tags}
        selectedTags={[]}
        primaryTag={null}
        onSave={({ tags: nextTags, primaryTag }) => {
          runBulk({ addTags: nextTags, primaryTag });
        }}
      />

      <Modal
        isOpen={bulkLocationOpen}
        onClose={() => setBulkLocationOpen(false)}
        title={`Set location for ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'}`}
      >
        <SearchableDropdown
          size="md"
          options={vocabByField('location')}
          value={bulkLocation}
          onChange={setBulkLocation}
          placeholder="Select or type a shelf code..."
          allowClear
          allowCreate
          onCreate={async (typed) => {
            const res = await SupplyService.createVocab('location', typed, typed);
            addVocabEntry(res.data.entry);
            return String(res.data.entry._id);
          }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="light" onClick={() => setBulkLocationOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => runBulk({ location: bulkLocation })}>Apply</Button>
        </div>
      </Modal>
    </div>
  );
};

export default SupplyList;
