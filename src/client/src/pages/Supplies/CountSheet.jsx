import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import SearchableDropdown from '../../components/common/SearchableDropdown';
import SupplyCountService from '../../services/supplyCountService';
import SupplyService from '../../services/supplyService';
import SettingsService from '../../services/settingsService';
import SupplyImportModal from '../../components/supplies/SupplyImportModal';
import CountVarianceReview from '../../components/supplies/CountVarianceReview';
import { unitWord, meaningfulUnit } from '../../components/supplies/units';
import { useAuth } from '../../contexts/AuthContext';

/**
 * One cycle count, from empty sheet to posted.
 *
 * Counting is ONE ITEM AT A TIME, deliberately mirroring the photo-import
 * workflow: a big picture of the thing, its shelf code, one number to type, and
 * a strip of squares showing what is done. Counting is a physical task done
 * standing at a shelf holding a phone, and a dense grid of thirty rows is the
 * wrong shape for it - you lose your place, and the item you are holding is
 * never the one your thumb is nearest.
 *
 * The picture earns its space here more than it does in the importer. Half of
 * counting is deciding whether the jug in your hand is the item on the screen.
 *
 * No expected quantities appear while counting, and this isn't hiding them: the
 * server omits them from the response until the count leaves the counting
 * state. See supplyCountService.decorateCount.
 */
const CountSheet = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = ['admin', 'management'].includes(user?.role);

  const [count, setCount] = useState(null);
  const [vocab, setVocab] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Reference data for the photo importer, which can be opened mid-count to
  // catalogue something found on the shelf. Loaded lazily — a phone that never
  // opens it never pays for it.
  const [importOpen, setImportOpen] = useState(false);
  const [importRef, setImportRef] = useState(null);

  // Which line is in front of you. Everything else is a square.
  const [index, setIndex] = useState(0);
  // Counted as it sits on the shelf: whole packages, plus loose stock units
  // from an opened one. For an item with no packaging ratio only `packages` is
  // shown, and it simply is the stock-unit count.
  const [draft, setDraft] = useState({ packages: '', loose: '' });
  const [savingLine, setSavingLine] = useState(false);
  const inputRef = useRef(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addChoice, setAddChoice] = useState(null);
  const [allSupplies, setAllSupplies] = useState([]);
  const [foundOpen, setFoundOpen] = useState(false);
  const [foundText, setFoundText] = useState('');
  const [foundQty, setFoundQty] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await SupplyCountService.get(id);
      setCount(res.data.count);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load this count.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    SupplyService.getVocab()
      .then((res) => setVocab(res.data.vocab))
      .catch(() => { /* labels degrade to blank; not worth blocking the sheet */ });
  }, []);

  const lines = useMemo(() => count?.lines || [], [count]);
  const current = lines[index] || null;
  const status = count?.status;
  const isCounting = status === 'counting';

  const isDone = (line) => line?.countedQuantity !== null && line?.countedQuantity !== undefined;

  // Open the sheet on the first thing still needing a number, so resuming a
  // half-finished count doesn't start by scrolling past what's already done.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (jumpedRef.current || lines.length === 0) return;
    jumpedRef.current = true;
    const firstUncounted = lines.findIndex((l) => !isDone(l));
    if (firstUncounted > 0) setIndex(firstUncounted);
  }, [lines]);

  // The draft follows whichever line is in front of you.
  useEffect(() => {
    if (!current) return;
    setDraft(isDone(current)
      ? {
        packages: String(current.countedPackages ?? current.countedQuantity ?? ''),
        loose: current.countedLoose ? String(current.countedLoose) : ''
      }
      : { packages: '', loose: '' });
    if (isCounting) {
      // Focus without scrolling the page out from under a thumb on mobile.
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [index, current?._id, isCounting]); // eslint-disable-line react-hooks/exhaustive-deps

  const vocabLabel = useCallback(
    (vid) => vocab.find((v) => String(v._id) === String(vid))?.label || '',
    [vocab]
  );

  const advance = () => {
    const next = lines.findIndex((l, i) => i > index && !isDone(l));
    if (next >= 0) { setIndex(next); return; }
    // Nothing after this one; fall back to anything still blank anywhere.
    const anyBlank = lines.findIndex((l) => !isDone(l));
    setIndex(anyBlank >= 0 ? anyBlank : Math.min(index + 1, lines.length - 1));
  };

  const saveCurrent = async ({ then, clear } = {}) => {
    if (!current) return;

    const packages = clear ? '' : draft.packages.trim();
    const loose = clear ? '' : draft.loose.trim();
    const entry = (packages === '' && loose === '')
      ? { countedQuantity: null }
      : { countedPackages: packages === '' ? 0 : Number(packages),
        countedLoose: loose === '' ? 0 : Number(loose) };

    if (entry.countedQuantity !== null
      && ![entry.countedPackages, entry.countedLoose].every((n) => Number.isFinite(n) && n >= 0)) {
      setError('A count has to be a number, and cannot be negative.');
      return;
    }

    setSavingLine(true);
    try {
      const res = await SupplyCountService.setLine(id, String(current._id), entry);
      setCount(res.data.count);
      setError(null);
      if (then === 'advance') advance();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save that count.');
    } finally {
      setSavingLine(false);
    }
  };

  // Only fetched when the add control is opened: the whole catalogue is a big
  // payload to carry on a phone that may never need it.
  const openAdd = async () => {
    setAddOpen(true);
    if (allSupplies.length === 0) {
      try {
        const res = await SupplyService.getAll({});
        setAllSupplies(res.data.supplies);
      } catch (err) {
        setError('Could not load the item list.');
      }
    }
  };

  const onSheet = useMemo(
    () => new Set(lines.map((l) => String(l.supply?._id || l.supply))),
    [lines]
  );

  const addOptions = useMemo(() => allSupplies
    .filter((s) => !onSheet.has(String(s._id)))
    .map((s) => ({
      value: String(s._id),
      label: s.displayName || s.name,
      keywords: `${s.partNumber || ''} ${s.name || ''}`
    })), [allSupplies, onSheet]);

  const addItem = async () => {
    if (!addChoice) return;
    setBusy(true);
    try {
      const res = await SupplyCountService.addLine(id, addChoice);
      setCount(res.data.count);
      setAddChoice(null);
      setAddOpen(false);
      // Land on what was just added — it's in your hand right now.
      setIndex((res.data.count.lines || []).length - 1);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add that item.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Catalogue something on the fly, then count it.
   *
   * The alternative was jotting it in the found-items note and dealing with it
   * after posting — which works, but means the thing you are holding right now
   * doesn't make it into this count at all. Photographing it here puts it on
   * the sheet before you put it back on the shelf.
   */
  const openImport = async () => {
    setImportOpen(true);
    if (importRef) return;
    try {
      const [tagRes, fieldRes, taxRuleRes, settingsRes] = await Promise.all([
        SupplyService.getTags(),
        SupplyService.getFields(),
        SupplyService.getTaxRules(),
        SettingsService.getSettings()
      ]);
      setImportRef({
        tags: tagRes.data.tags,
        fields: fieldRes.data.fields,
        taxRules: taxRuleRes.data.rules,
        markup: settingsRes.data.settings?.partMarkupPercentage ?? 30,
        taxRate: settingsRes.data.settings?.taxRate ?? 0,
        directoryVendors: settingsRes.data.settings?.customVendors || []
      });
    } catch (err) {
      setError('Could not load what the importer needs.');
    }
  };

  // A freshly created supply goes straight onto this sheet, flagged the same
  // way any other off-scope find is.
  const onImported = async (supply) => {
    if (!supply?._id) return;
    try {
      const res = await SupplyCountService.addLine(id, supply._id);
      setCount(res.data.count);
      setAllSupplies([]); // stale now; refetched next time the picker opens
      setIndex((res.data.count.lines || []).length - 1);
    } catch (err) {
      setError(err.response?.data?.message || 'Item was created, but could not be added to this sheet.');
    }
  };

  const recordFound = async () => {
    if (!foundText.trim()) return;
    setBusy(true);
    try {
      const res = await SupplyCountService.addFound(id, {
        description: foundText.trim(),
        quantity: foundQty === '' ? null : Number(foundQty)
      });
      setCount(res.data.count);
      setFoundText('');
      setFoundQty('');
      setFoundOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not record that.');
    } finally {
      setBusy(false);
    }
  };

  const finishCounting = async () => {
    setBusy(true);
    try {
      const res = await SupplyCountService.review(id);
      setCount(res.data.count);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not move this count to review.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Card><p className="text-center text-gray-400 py-8">Loading count...</p></Card>;
  }

  if (!count) {
    return (
      <Card>
        <p className="text-center text-gray-500 py-8">{error || 'Count not found.'}</p>
        <div className="text-center">
          <Button variant="light" onClick={() => navigate('/supplies/counts')}>Back to counts</Button>
        </div>
      </Card>
    );
  }

  const progress = count.progress || { total: 0, done: 0, remaining: 0 };
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const photoUrl = current?.supply ? SupplyService.photoUrl(current.supply) : null;
  const unit = meaningfulUnit(unitWord(vocab, current?.stockUnit, 'stock', 2));

  // An item only has a packaging to count in when it actually comes in one.
  // A box of gloves is a box of gloves; a 5qt jug is five quarts.
  const upp = Math.max(1, current?.unitsPerPurchase || 1);
  const packaged = upp > 1;
  const packageWord = unitWord(vocab, current?.purchaseUnit, 'purchase', 2);
  const singularPackageWord = unitWord(vocab, current?.purchaseUnit, 'purchase', 1);

  // Live preview of what the two boxes come to in stock units, so the
  // conversion is never a surprise that only shows up in the variance report.
  const draftTotal = (() => {
    const p = draft.packages.trim();
    const l = draft.loose.trim();
    if (p === '' && l === '') return null;
    const total = (p === '' ? 0 : Number(p)) * upp + (l === '' ? 0 : Number(l));
    return Number.isFinite(total) ? total : null;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={() => navigate('/supplies/counts')}
            className="text-sm text-primary-600 hover:underline mb-1"
          >
            <i className="fas fa-arrow-left mr-1"></i>All counts
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">
            {count.name || 'Cycle count'}
          </h1>
          <p className="text-sm text-gray-500">
            {progress.done} of {progress.total} counted
            {count.blind && isCounting && (
              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 text-[11px]">
                <i className="fas fa-eye-slash text-[9px]"></i>blind
              </span>
            )}
            {status === 'posted' && (
              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-100 text-[11px]">
                posted
              </span>
            )}
            {status === 'cancelled' && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px]">
                cancelled
              </span>
            )}
          </p>
        </div>

        {isCounting && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openAdd}>
              <i className="fas fa-plus mr-2"></i>Add an item
            </Button>
            <Button variant="outline" onClick={openImport}>
              <i className="fas fa-camera mr-2"></i>New from photo
            </Button>
            <Button variant="primary" onClick={finishCounting} disabled={busy || progress.done === 0}>
              Finish counting
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {isCounting && (
        <>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-primary-500 transition-all" style={{ width: `${pct}%` }} />
          </div>

          {/* ── The item in your hand ── */}
          {current && (
            <Card>
              <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-5">
                <div>
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt=""
                      className="w-full rounded border border-gray-200 object-contain max-h-56 bg-gray-50"
                    />
                  ) : (
                    <div className="w-full h-40 rounded border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-300">
                      <i className="fas fa-image text-3xl mb-2"></i>
                      <span className="text-[11px] text-gray-400">No photo</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex flex-col">
                  <div className="text-xs text-gray-400 mb-1">
                    Item {index + 1} of {lines.length}
                    {current.addedDuringCount && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                        added during count
                      </span>
                    )}
                  </div>

                  <h2 className="text-xl font-semibold text-gray-900 leading-snug">
                    {current.displayName}
                  </h2>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                    {current.location && (
                      <span className="inline-flex items-center gap-1">
                        <i className="fas fa-location-dot text-xs text-gray-400"></i>
                        {vocabLabel(current.location)}
                      </span>
                    )}
                    {current.supply?.partNumber && (
                      <span className="font-mono text-xs">{current.supply.partNumber}</span>
                    )}
                  </div>

                  {/* Counted the way the shelf is stacked. Nobody knows they
                      have 15 quarts of 5W-20; they know they have three jugs. */}
                  <div className="mt-5 flex flex-wrap items-end gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {packaged ? `How many ${packageWord}?` : 'How many on the shelf?'}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          ref={inputRef}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={draft.packages}
                          placeholder="—"
                          onChange={(e) => setDraft((d) => ({ ...d, packages: e.target.value }))}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); saveCurrent({ then: 'advance' }); }
                          }}
                          className="w-32 px-4 py-4 border-2 border-gray-300 rounded-lg text-3xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
                        />
                        <span className="text-sm text-gray-500">
                          {packaged ? packageWord : unit}
                        </span>
                      </div>
                    </div>

                    {packaged && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Loose {unit || 'units'}
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
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); saveCurrent({ then: 'advance' }); }
                            }}
                            className="w-24 px-3 py-4 border-2 border-gray-200 rounded-lg text-2xl text-center font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
                          />
                          <span className="text-sm text-gray-400">
                            from an opened {singularPackageWord}
                          </span>
                        </div>
                      </div>
                    )}

                    {isDone(current) && (
                      <span className="text-xs text-green-700 inline-flex items-center gap-1 pb-4">
                        <i className="fas fa-check-circle"></i>counted
                      </span>
                    )}
                  </div>

                  {packaged && draftTotal !== null && (
                    <p className="mt-2 text-[11px] text-blue-600">
                      = <strong>{draftTotal} {unit || 'in stock'}</strong>
                      <span className="text-gray-400">
                        {' '}({current.unitsPerPurchase} per {singularPackageWord})
                      </span>
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      onClick={() => saveCurrent({ then: 'advance' })}
                      disabled={savingLine || (draft.packages.trim() === '' && draft.loose.trim() === '')}
                    >
                      {savingLine
                        ? 'Saving...'
                        : progress.remaining <= 1 && !isDone(current)
                          ? 'Count it'
                          : 'Count & next'}
                    </Button>
                    <Button variant="light" onClick={advance} disabled={savingLine}>
                      Skip for now
                    </Button>
                    {isDone(current) && (
                      <Button
                        variant="light"
                        onClick={() => saveCurrent({ clear: true })}
                        disabled={savingLine}
                      >
                        Clear
                      </Button>
                    )}
                  </div>

                  <p className="mt-3 text-[11px] text-gray-400">
                    Enter saves and moves on. Skipping leaves it blank, and blank is
                    skipped at posting rather than counted as zero.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* ── Everything on the sheet ── */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">
                On this sheet
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {progress.done} counted · {progress.remaining} left
                </span>
              </h3>
              {progress.remaining === 0 && (
                <span className="text-xs text-green-700">
                  <i className="fas fa-check-circle mr-1"></i>All counted
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {lines.map((line, i) => {
                const done = isDone(line);
                const src = line.supply ? SupplyService.photoUrl(line.supply) : null;
                return (
                  <button
                    key={String(line._id)}
                    onClick={() => setIndex(i)}
                    title={`${line.displayName}${done ? ` — counted ${line.countedQuantity}` : ''}`}
                    className={`relative shrink-0 w-14 h-14 rounded border-2 overflow-hidden transition-all ${
                      i === index
                        ? 'border-primary-500 ring-2 ring-primary-200'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    {src ? (
                      <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full bg-gray-100 flex items-center justify-center">
                        <i className="fas fa-image text-gray-300 text-xs"></i>
                      </span>
                    )}
                    {done && (
                      <span className="absolute inset-0 bg-green-600/60 flex items-center justify-center">
                        <i className="fas fa-check text-white text-xs"></i>
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                onClick={openAdd}
                title="Found something not on this sheet"
                className="shrink-0 w-14 h-14 rounded border-2 border-dashed border-gray-300 text-gray-400 hover:border-primary-400 hover:text-primary-500"
              >
                <i className="fas fa-plus text-xs"></i>
              </button>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <button
                onClick={openImport}
                className="text-sm text-primary-600 hover:underline"
              >
                <i className="fas fa-camera mr-2"></i>
                Photograph something new and count it
              </button>
              <button
                onClick={() => setFoundOpen(true)}
                className="text-sm text-gray-500 hover:underline"
              >
                <i className="fas fa-clipboard-question mr-2"></i>
                Or just make a note of it for later
              </button>
            </div>
            {count.foundNotInSystem?.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-gray-600">
                {count.foundNotInSystem.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <i className="fas fa-circle-exclamation text-amber-500 text-xs mt-1"></i>
                    <span>
                      {f.description}
                      {f.quantity !== null && f.quantity !== undefined && (
                        <span className="text-gray-400"> ({f.quantity})</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {(status === 'review' || status === 'posted' || status === 'cancelled') && (
        <CountVarianceReview
          countId={id}
          vocab={vocab}
          canPost={isAdmin}
          onChanged={load}
        />
      )}

      {/* Add an item found on the shelf but not in this scope. */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add an item to this sheet">
        <p className="text-sm text-gray-600 mb-3">
          Found something on the shelf that this count didn't ask for? Add it and count it.
          If it's shelved in the wrong place, the review step will offer to fix its location.
        </p>
        <SearchableDropdown
          size="md"
          options={addOptions}
          value={addChoice}
          onChange={setAddChoice}
          placeholder="Search supplies..."
          allowClear
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="light" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={addItem} disabled={!addChoice || busy}>Add to sheet</Button>
        </div>
      </Modal>

      {/* Something with no catalogue entry at all. Deliberately just text —
          stopping to create a supply mid-count is how counts get abandoned. */}
      <Modal isOpen={foundOpen} onClose={() => setFoundOpen(false)} title="Found, but not in the system">
        <p className="text-sm text-gray-600 mb-3">
          Jot down what you found. It won't touch stock — it's a to-do that shows up
          after this count is posted.
        </p>
        <label className="block text-xs font-medium text-gray-600 mb-1">What is it?</label>
        <textarea
          value={foundText}
          onChange={(e) => setFoundText(e.target.value)}
          rows={2}
          placeholder="e.g. 3 bottles of gear oil, no label, shelf 1-C-1"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <label className="block text-xs font-medium text-gray-600 mb-1 mt-3">
          How many? <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          type="number"
          min="0"
          value={foundQty}
          onChange={(e) => setFoundQty(e.target.value)}
          className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="light" onClick={() => setFoundOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={recordFound} disabled={!foundText.trim() || busy}>
            Record it
          </Button>
        </div>
      </Modal>

      {/* The same photo importer the supplies page uses. Anything saved from it
          is added to this sheet immediately, so it can be counted in the same
          pass rather than remembered afterwards. */}
      {importRef && (
        <SupplyImportModal
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={onImported}
          tags={importRef.tags}
          fields={importRef.fields}
          vocab={vocab}
          markupPercentage={importRef.markup}
          taxRate={importRef.taxRate}
          taxRules={importRef.taxRules}
          directoryVendors={importRef.directoryVendors}
          onTaxRuleLearned={(rule) => setImportRef((r) => ({
            ...r,
            taxRules: [...r.taxRules.filter((x) => x.hostname !== rule.hostname), rule]
          }))}
          onVocabAdded={(entry) => setVocab((prev) => [
            ...prev.filter((v) => String(v._id) !== String(entry._id)), entry
          ])}
          lastUsed={{ location: current?.location || null }}
        />
      )}
    </div>
  );
};

export default CountSheet;
