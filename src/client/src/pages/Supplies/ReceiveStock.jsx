import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SupplyImportModal from '../../components/supplies/SupplyImportModal';
import SupplyService from '../../services/supplyService';
import SettingsService from '../../services/settingsService';
import { unitWord, meaningfulUnit } from '../../components/supplies/units';
import { idOf } from '../../components/supplies/tagTree';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Receive stock — getting a delivery off the incoming table and onto the shelf.
 *
 * The workflow this is shaped around is physical: deliveries land on a table
 * outside the stock room, and an item is carried in only once it has been
 * entered. The TABLE IS THE RECORD of what still needs doing, which is what
 * makes this different from a cycle count in the one way that matters:
 *
 *   **Every item commits the moment you confirm it, not at the end.**
 *
 * A count fills in a sheet, reviews variances, and posts the lot — safe there,
 * because the shelf doesn't move while you count it. Batching here would break
 * the airlock: carry five things in, hit a partial failure on post, and the
 * table is empty while stock is wrong, with nothing left to tell you which two
 * didn't land. Committing per item means the physical state and the ledger
 * agree at every moment, and the worst case is an item you have to enter twice.
 *
 * Search comes first and the camera is an accelerator on the same screen, the
 * same way vehicle entry offers registration reading over a form you could
 * always have typed. For an item you order every month, typing three letters
 * beats waiting on a model round-trip; the camera earns its place on the box
 * you don't recognise. Keeping both on one screen means a slow or wrong read
 * costs you nothing — you are already standing where you can just type.
 *
 * Writes go through `adjustQuantity` as a signed delta with type `receive`,
 * like every other movement in this module. There is no privileged write path
 * and no new server surface: `receive` was declared in SupplyMovement's enum
 * and left unused for exactly this.
 */

const OFFICE_ROLES = ['admin', 'management', 'service-writer'];

/** Stock units represented by a packages + loose entry, or null if both blank. */
const draftTotal = (draft, unitsPerPurchase) => {
  const p = String(draft.packages ?? '').trim();
  const l = String(draft.loose ?? '').trim();
  if (p === '' && l === '') return null;
  const total = (p === '' ? 0 : Number(p)) * unitsPerPurchase + (l === '' ? 0 : Number(l));
  return Number.isFinite(total) ? total : null;
};

const ReceiveStock = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOfficeStaff = OFFICE_ROLES.includes(user?.role);

  const [supplies, setSupplies] = useState([]);
  const [vocab, setVocab] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ packages: '', loose: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // What the label said, when this item arrived via the camera. Kept only to
  // cross-check the pack size below — the supply's own ratio always wins.
  const [labelHint, setLabelHint] = useState(null);

  const [reading, setReading] = useState(false);
  const [candidates, setCandidates] = useState(null);

  /**
   * Everything the item-creation modal needs, fetched only when it is opened.
   *
   * Five more requests on mount would slow the path this screen exists for —
   * search — to serve the case it explicitly doesn't handle. Receiving is
   * mostly reordering what you already stock, so creating an item from here is
   * the rare branch and can afford to wait a moment for its own data.
   */
  const [importOpen, setImportOpen] = useState(false);
  const [reference, setReference] = useState(null);
  const [openingImporter, setOpeningImporter] = useState(false);

  /**
   * What has been received since this screen was opened.
   *
   * Deliberately in memory only. Each entry is already durable in the movement
   * ledger by the time it appears here, so losing the list to a refresh or a
   * locked phone costs a convenience, never a record — it is a session receipt,
   * not a pending batch.
   */
  const [received, setReceived] = useState([]);

  const searchRef = useRef(null);
  const packagesRef = useRef(null);
  const photoRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [supplyRes, vocabRes] = await Promise.all([
        SupplyService.getAll(),
        SupplyService.getVocab()
      ]);
      setSupplies(supplyRes.data.supplies);
      setVocab(vocabRes.data.vocab);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Could not load supplies.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openImporter = async () => {
    if (openingImporter) return;
    if (reference) { setImportOpen(true); return; }

    setOpeningImporter(true);
    try {
      const [tagRes, fieldRes, taxRuleRes, settingsRes] = await Promise.all([
        SupplyService.getTags(),
        SupplyService.getFields(),
        SupplyService.getTaxRules(),
        SettingsService.getSettings()
      ]);
      setReference({
        tags: tagRes.data.tags,
        fields: fieldRes.data.fields,
        taxRules: taxRuleRes.data.rules,
        markup: settingsRes.data.settings?.partMarkupPercentage ?? 30,
        taxRate: settingsRes.data.settings?.taxRate ?? 0,
        directoryVendors: settingsRes.data.settings?.customVendors || []
      });
      setImportOpen(true);
    } catch (err) {
      // Better to send them to the fully-equipped screen than to open a creation
      // form with no tag tree and a defaulted markup, which would silently price
      // the new item wrong.
      setError('Could not open the new-supply form here — add it from the supplies list.');
    } finally {
      setOpeningImporter(false);
    }
  };

  const vocabLabel = useCallback((id) => {
    const entry = vocab.find((v) => String(v._id) === idOf(id));
    return entry ? (entry.label || entry.value) : '';
  }, [vocab]);

  /**
   * Search runs against a list loaded once, in memory, rather than per keystroke
   * against the server.
   *
   * The whole promise of this screen is that identifying an item is instant, and
   * a round-trip per character isn't. The shop's catalogue is small enough that
   * holding it costs nothing — the list endpoint has no pagination and already
   * filters `search` in memory server-side for the same reason — and receiving
   * is a burst activity: you open this, clear a table, and leave. An item added
   * by someone else mid-session won't appear until reload, which is why "add it
   * as a new supply" ends with one.
   *
   * Same fields as the server's own search, so an item found on the supplies
   * list is found here, plus the shelf code — on this screen "what's on 1-C-2"
   * is a reasonable way to ask for something you're holding.
   */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/);
    return supplies
      .filter((s) => {
        const haystack = [
          s.displayName, s.name, s.qualifier, s.partNumber, s.notes,
          vocabLabel(s.location)
        ].filter(Boolean).join(' ').toLowerCase();
        return terms.every((t) => haystack.includes(t));
      })
      .slice(0, 8);
  }, [query, supplies, vocabLabel]);

  const select = (supply, hint = null) => {
    setSelected(supply);
    setLabelHint(hint);
    setError(null);
    setCandidates(null);
    // One package is the overwhelmingly common delivery, and the field selects
    // its contents on focus, so the guess costs nothing when it's wrong.
    setDraft({ packages: '1', loose: '' });
    setTimeout(() => packagesRef.current?.select(), 0);
  };

  const clearSelection = ({ refocus = true } = {}) => {
    setSelected(null);
    setLabelHint(null);
    setDraft({ packages: '', loose: '' });
    setQuery('');
    setError(null);
    if (refocus) setTimeout(() => searchRef.current?.focus(), 0);
  };

  const unitsPerPurchase = Math.max(1, selected?.unitsPerPurchase || 1);
  const packaged = unitsPerPurchase > 1;
  const stockWord = meaningfulUnit(unitWord(vocab, selected?.stockUnit, 'stock', 2));
  const packageWord = unitWord(vocab, selected?.purchaseUnit, 'purchase', 2);
  const singularPackageWord = unitWord(vocab, selected?.purchaseUnit, 'purchase', 1);
  const pendingTotal = selected ? draftTotal(draft, unitsPerPurchase) : null;

  /** Patch one supply in the local cache so the QOH on screen stays honest. */
  const syncSupply = (updated) => {
    setSupplies((prev) => prev.map((s) => (
      String(s._id) === String(updated._id) ? updated : s
    )));
  };

  const commit = async () => {
    if (!selected || saving) return;
    const delta = draftTotal(draft, unitsPerPurchase);
    if (delta === null || !Number.isFinite(delta) || delta <= 0) {
      setError('Enter how many arrived — more than zero.');
      packagesRef.current?.select();
      return;
    }

    setSaving(true);
    try {
      const packagesIn = String(draft.packages ?? '').trim();
      const looseIn = String(draft.loose ?? '').trim();
      // Spelled the way it was entered, so the ledger says "3 jugs" rather than
      // a pre-multiplied 15 that nobody can trace back to a delivery.
      const asEntered = packaged
        ? [
          packagesIn && Number(packagesIn) > 0
            ? `${packagesIn} ${unitWord(vocab, selected.purchaseUnit, 'purchase', Number(packagesIn))}`
            : null,
          looseIn && Number(looseIn) > 0
            ? `${looseIn} loose ${unitWord(vocab, selected.stockUnit, 'stock', Number(looseIn))}`
            : null
        ].filter(Boolean).join(' + ')
        : `${delta} ${unitWord(vocab, selected.stockUnit, 'stock', delta)}`;

      const res = await SupplyService.adjustQuantity(selected._id, {
        quantity: delta,
        type: 'receive',
        unit: idOf(selected.stockUnit) || undefined,
        note: `Received ${asEntered}`
      });

      const updated = res.data.supply;
      syncSupply(updated);
      setReceived((prev) => [{
        key: `${updated._id}-${Date.now()}`,
        supply: updated,
        delta,
        asEntered,
        resultingQoh: updated.quantityOnHand,
        undone: false,
        undoing: false,
        error: null
      }, ...prev]);
      clearSelection();
    } catch (err) {
      // Hold the entry. Clearing it would leave the item on the table with no
      // sign anything was attempted, which is the one failure the airlock can't
      // recover from by looking at the table.
      setError(err.response?.data?.message || 'Could not add that to stock.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Undo posts a compensating `adjust`, it does not erase the receipt.
   *
   * Movements are append-only, and `adjust` is this module's word for "a human
   * corrected a mistake" (see QohEditor). Posting the reversal as a negative
   * `receive` would instead read as a delivery that arrived in the negative,
   * and would quietly corrupt any future "what did we take in this month".
   *
   * A signed delta, not an absolute figure: someone may have consumed from this
   * item in the seconds since, and an absolute would silently swallow that.
   */
  const undo = async (entry) => {
    setReceived((prev) => prev.map((r) => (
      r.key === entry.key ? { ...r, undoing: true, error: null } : r
    )));
    try {
      const res = await SupplyService.adjustQuantity(entry.supply._id, {
        quantity: -entry.delta,
        type: 'adjust',
        unit: idOf(entry.supply.stockUnit) || undefined,
        note: `Undo — ${entry.asEntered} was not received`
      });
      syncSupply(res.data.supply);
      setReceived((prev) => prev.map((r) => (
        r.key === entry.key ? { ...r, undone: true, undoing: false } : r
      )));
    } catch (err) {
      setReceived((prev) => prev.map((r) => (
        r.key === entry.key
          ? { ...r, undoing: false, error: err.response?.data?.message || 'Could not undo that.' }
          : r
      )));
    }
  };

  /**
   * Read a label and go straight to the matching supply when the match is
   * decisive — same part number, and ideally the same brand (findSimilar scores
   * that 100, part number alone 80, brand + product type 50).
   *
   * Below that threshold the candidates are offered rather than chosen. A wrong
   * auto-match adds stock to the wrong item and looks finished from every angle,
   * which is the same asymmetry that makes the label importer refuse to apply a
   * tag without a click.
   */
  const readPhoto = async (file) => {
    if (!file) return;
    setReading(true);
    setError(null);
    setCandidates(null);
    try {
      const res = await SupplyService.extractLabel(file);
      const { draft: parsed, similar = [] } = res.data;
      const top = similar[0];

      if (top && top.matchScore >= 80) {
        select(supplies.find((s) => String(s._id) === String(top._id)) || top, parsed);
      } else {
        setCandidates({ parsed, similar });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not read that photo.');
    } finally {
      setReading(false);
    }
  };

  /**
   * The label's own pack size, when it disagrees with how the item is set up.
   *
   * Surfaced, never applied. The supply's `unitsPerPurchase` is a deliberate
   * setting and the label read is a guess; silently trusting the guess would
   * multiply the delta by the wrong number and land a plausible-looking figure
   * that never gets checked.
   */
  const packMismatch = (labelHint?.contentQuantity && packaged
    && Number(labelHint.contentQuantity) !== unitsPerPurchase)
    ? Number(labelHint.contentQuantity)
    : null;

  const labelReads = candidates
    ? [
      candidates.parsed?.brand ? vocabLabel(candidates.parsed.brand) : '',
      candidates.parsed?.productType,
      candidates.parsed?.partNumber
    ].filter(Boolean).join(' ')
    : '';

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500';

  if (!isOfficeStaff) {
    return (
      <Card>
        <p className="text-sm text-gray-600">Receiving stock needs office staff access.</p>
        <div className="mt-3">
          <Button variant="light" onClick={() => navigate('/supplies')}>Back to supplies</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={() => navigate('/supplies')}
            className="text-sm text-primary-600 hover:underline mb-1"
          >
            <i className="fas fa-arrow-left mr-1"></i>Inventory &amp; Shop Supplies
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">Receive stock</h1>
          <p className="text-sm text-gray-500">
            Each item is added the moment you confirm it — shelve it and move on.
          </p>
        </div>
        {received.length > 0 && (
          <div className="text-right">
            <div className="text-2xl font-semibold text-green-700">
              {received.filter((r) => !r.undone).length}
            </div>
            <div className="text-xs text-gray-500">received this session</div>
          </div>
        )}
      </div>

      {loadError && <Card><p className="text-sm text-red-600">{loadError}</p></Card>}

      {/* ── Identify ─────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">What came in?</label>
            <input
              ref={searchRef}
              type="text"
              autoFocus
              value={query}
              disabled={loading}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches.length > 0) {
                  e.preventDefault();
                  select(matches[0]);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  clearSelection();
                }
              }}
              placeholder={loading ? 'Loading supplies…' : 'Name, brand, part number, shelf…'}
              className={inputCls}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => photoRef.current?.click()}
            disabled={reading || loading}
          >
            <i className={`fas ${reading ? 'fa-spinner fa-spin' : 'fa-camera'} mr-2`}></i>
            {reading ? 'Reading…' : 'Photo'}
          </Button>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { readPhoto(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>

        {/* Results, only while nothing is picked. */}
        {!selected && matches.length > 0 && (
          <div className="mt-3 divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden">
            {matches.map((s) => (
              <button
                key={s._id}
                onClick={() => select(s)}
                className="w-full text-left px-3 py-2 hover:bg-primary-50 flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-gray-900 truncate">{s.displayName}</span>
                  <span className="block text-[11px] text-gray-500">
                    {vocabLabel(s.location) || 'No shelf set'}
                    {s.partNumber ? ` · ${s.partNumber}` : ''}
                  </span>
                </span>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {s.quantityOnHand ?? 0}{' '}
                  {meaningfulUnit(unitWord(vocab, s.stockUnit, 'stock', s.quantityOnHand ?? 0))}
                </span>
              </button>
            ))}
          </div>
        )}

        {!selected && query.trim() && matches.length === 0 && !loading && (
          <div className="mt-3 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
            Nothing stocked matches that.
            <button
              onClick={openImporter}
              disabled={openingImporter}
              className="ml-1 underline hover:no-underline font-medium disabled:opacity-50"
            >
              {openingImporter ? 'Opening…' : 'Add it as a new supply'}
            </button>{' '}
            — receiving only tops up what is already stocked.
          </div>
        )}

        {/* A photo read that wasn't decisive enough to pick for you. */}
        {candidates && !selected && (
          <div className="mt-3 rounded border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-xs text-gray-600">
              Label reads <strong className="text-gray-900">{labelReads || 'something unclear'}</strong>
              {candidates.similar.length > 0 ? ' — which of these is it?' : '.'}
            </div>
            {candidates.similar.map((s) => (
              <button
                key={s._id}
                onClick={() => select(
                  supplies.find((x) => String(x._id) === String(s._id)) || s,
                  candidates.parsed
                )}
                className="w-full text-left px-3 py-2 hover:bg-primary-50 border-t border-gray-100"
              >
                <span className="block text-sm text-gray-900">{s.displayName}</span>
                <span className="block text-[11px] text-gray-500">{s.matchReason}</span>
              </button>
            ))}
            <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500">
              {candidates.similar.length === 0 && 'No stocked item looks like this. '}
              <button
                onClick={openImporter}
                disabled={openingImporter}
                className="underline hover:no-underline disabled:opacity-50"
              >
                {openingImporter ? 'Opening…' : 'Add it as a new supply'}
              </button>
              {' · '}
              <button onClick={() => setCandidates(null)} className="underline hover:no-underline">
                Search instead
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Quantity ─────────────────────────────────────────────────────── */}
      {selected && (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-medium text-gray-900">{selected.displayName}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {selected.quantityOnHand ?? 0}{' '}
                {meaningfulUnit(unitWord(vocab, selected.stockUnit, 'stock', selected.quantityOnHand ?? 0)) || 'on hand'}
                {' · goes to '}
                <strong className="text-gray-700">{vocabLabel(selected.location) || 'no shelf set'}</strong>
              </div>
            </div>
            <button
              onClick={() => clearSelection()}
              className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
            >
              <i className="fas fa-times mr-1"></i>Not this
            </button>
          </div>

          {packMismatch && (
            <p className="mt-3 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
              The label reads <strong>{packMismatch}</strong> per {singularPackageWord}, but this item is
              set up as <strong>{unitsPerPurchase}</strong>. Counting by the item&apos;s setting — fix the
              item if the label is right.
            </p>
          )}

          {/* Entered the way the delivery is stacked, matching the count sheet:
              nobody knows they took in 15 quarts, they know it was three jugs. */}
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {packaged ? `How many ${packageWord}?` : 'How many arrived?'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={packagesRef}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={draft.packages}
                  placeholder="—"
                  onChange={(e) => setDraft((d) => ({ ...d, packages: e.target.value }))}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
                  className="w-32 px-4 py-4 border-2 border-gray-300 rounded-lg text-3xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
                />
                <span className="text-sm text-gray-500">{packaged ? packageWord : stockWord}</span>
              </div>
            </div>

            {packaged && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Loose {stockWord || 'units'}
                  <span className="font-normal text-gray-400"> (optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={draft.loose}
                    placeholder="0"
                    onChange={(e) => setDraft((d) => ({ ...d, loose: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
                    className="w-24 px-3 py-4 border-2 border-gray-200 rounded-lg text-2xl text-center font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
                  />
                  <span className="text-sm text-gray-400">outside a {singularPackageWord}</span>
                </div>
              </div>
            )}
          </div>

          {pendingTotal !== null && pendingTotal > 0 && (
            <p className="mt-2 text-[11px] text-blue-600">
              {selected.quantityOnHand ?? 0} →{' '}
              <strong>
                {(selected.quantityOnHand ?? 0) + pendingTotal} {stockWord || 'in stock'}
              </strong>
              {packaged && (
                <span className="text-gray-400">
                  {' '}(+{pendingTotal}; {unitsPerPurchase} per {singularPackageWord})
                </span>
              )}
            </p>
          )}

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={commit} disabled={saving || !pendingTotal}>
              {saving ? 'Adding…' : 'Add to stock'}
            </Button>
            <Button variant="light" onClick={() => clearSelection()} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* ── Session receipt ──────────────────────────────────────────────── */}
      {received.length > 0 && (
        <Card>
          <h2 className="text-sm font-medium text-gray-700 mb-2">Received this session</h2>
          <div className="divide-y divide-gray-100">
            {received.map((entry) => (
              <div key={entry.key} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-sm truncate ${entry.undone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {entry.supply.displayName}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {entry.asEntered} · now {entry.resultingQoh}
                    {entry.error && <span className="text-red-600"> · {entry.error}</span>}
                  </div>
                </div>
                {entry.undone ? (
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">undone</span>
                ) : (
                  <button
                    onClick={() => undo(entry)}
                    disabled={entry.undoing}
                    className="text-xs text-gray-500 hover:text-red-600 whitespace-nowrap disabled:opacity-50"
                  >
                    {entry.undoing ? 'Undoing…' : 'Undo'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Creating an item is a different job — tags, vocab, units — so it reuses
          the existing importer rather than growing a second creation path here.
          Closing reloads, which is also how a newly created item becomes
          searchable in the in-memory list above. */}
      {reference && (
        <SupplyImportModal
          isOpen={importOpen}
          onClose={() => { setImportOpen(false); load(); }}
          onImported={load}
          tags={reference.tags}
          fields={reference.fields}
          vocab={vocab}
          markupPercentage={reference.markup}
          taxRate={reference.taxRate}
          taxRules={reference.taxRules}
          directoryVendors={reference.directoryVendors}
          onTaxRuleLearned={(rule) => setReference((prev) => (prev ? {
            ...prev,
            taxRules: [...prev.taxRules.filter((r) => r.hostname !== rule.hostname), rule]
          } : prev))}
          onVocabAdded={(entry) => setVocab((prev) => (
            prev.some((v) => String(v._id) === String(entry._id))
              ? prev.map((v) => (String(v._id) === String(entry._id) ? entry : v))
              : [...prev, entry]
          ))}
        />
      )}
    </div>
  );
};

export default ReceiveStock;
