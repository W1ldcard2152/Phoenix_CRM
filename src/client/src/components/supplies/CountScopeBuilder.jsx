import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SearchableDropdown from '../common/SearchableDropdown';
import SupplyCountService from '../../services/supplyCountService';
import { resolveFields } from './SupplyAttributes';
import { buildTree, idOf, treeLabel } from './tagTree';
import { locationOptions } from './locationTree';

/**
 * Build the scope a cycle count is cut from.
 *
 * Every field accepts SEVERAL values, and they AND across fields while ORing
 * within one: brand Valvoline + brand Mobil, in Stock Room 1, tagged Fluids
 * means "either brand, in that room, under that tag". That combination is what
 * makes "count all the Valvoline" and "count shelf 1-C-1" and "count the
 * degreasers" one screen rather than three.
 *
 * The preview count is the point of the screen. Starting a 400-item sweep by
 * accident is a wasted afternoon, so the size of the job is always on screen
 * before the button that commits to it.
 */

/** Multi-select built from the single-select dropdown, plus removable chips. */
const MultiPicker = ({ label, hint, options, values, onChange, placeholder }) => {
  const selected = values || [];
  const available = options.filter((o) => !selected.includes(o.value));
  const labelFor = (v) => options.find((o) => o.value === v)?.label?.trim() || v;

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {hint && <span className="font-normal text-gray-400"> {hint}</span>}
      </label>
      <SearchableDropdown
        size="md"
        options={available}
        value={null}
        onChange={(v) => v && onChange([...selected, v])}
        placeholder={selected.length > 0 ? 'Add another...' : placeholder}
      />
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-primary-200 bg-primary-50 text-primary-800"
            >
              {labelFor(v)}
              <button
                type="button"
                onClick={() => onChange(selected.filter((x) => x !== v))}
                className="text-primary-400 hover:text-primary-700"
                aria-label={`Remove ${labelFor(v)}`}
              >
                <i className="fas fa-times text-[10px]"></i>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const EMPTY_SCOPE = {
  tag: [], brand: [], vendor: [], form: [], location: [], locationPrefix: [], attributes: {}
};

const CountScopeBuilder = ({
  isOpen, onClose, onStarted, tags = [], vocab = [], fields = [], initialScope = null
}) => {
  const [name, setName] = useState('');
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saveName, setSaveName] = useState('');
  const [savedMsg, setSavedMsg] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setScope(initialScope ? { ...EMPTY_SCOPE, ...initialScope } : EMPTY_SCOPE);
    setName('');
    setSaveName('');
    setSavedMsg(null);
    setError(null);
    setPreview(null);
  }, [isOpen, initialScope]);

  const vocabOptions = useCallback((fieldKey) => vocab
    .filter((v) => v.fieldKey === fieldKey && v.isActive !== false && v.usageCount > 0)
    .sort((a, b) => (b.usageCount - a.usageCount)
      || (a.label || a.value).localeCompare(b.label || b.value))
    .map((v) => ({
      value: String(v._id),
      label: v.label || v.value,
      sublabel: `${v.usageCount} item${v.usageCount === 1 ? '' : 's'}`
    })), [vocab]);

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
    walk(buildTree(tags), 0);
    return out;
  }, [tags]);

  /**
   * Locations offer both levels and leaves in one list. A level selection is a
   * prefix ("Stock Room 1-C" = that whole column), a leaf is an exact shelf, so
   * the two land in different scope fields.
   */
  const locationPickerOptions = useMemo(
    () => locationOptions(vocab, { usedOnly: true }),
    [vocab]
  );

  const locationValues = useMemo(() => [
    ...(scope.locationPrefix || []).map((p) => `prefix:${p}`),
    ...(scope.location || []).map((id) => `id:${id}`)
  ], [scope.location, scope.locationPrefix]);

  const setLocationValues = (values) => {
    setScope((prev) => ({
      ...prev,
      locationPrefix: values.filter((v) => v.startsWith('prefix:')).map((v) => v.slice(7)),
      location: values.filter((v) => v.startsWith('id:')).map((v) => v.slice(3))
    }));
  };

  /**
   * Measurements are only a coherent question once a single tag has said what
   * kind of thing we're looking at — "filter by viscosity" means nothing across
   * a mixed scope. Matches how the supply list offers them.
   */
  const attrFields = useMemo(() => {
    if ((scope.tag || []).length !== 1) return [];
    const only = scope.tag[0];
    const { required, optional } = resolveFields([only], only, tags);
    const byId = {};
    fields.forEach((f) => { byId[String(f._id)] = f; });
    return [...required, ...optional]
      .map((id) => byId[id])
      .filter(Boolean)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [scope.tag, tags, fields]);

  const isEmpty = useMemo(() => (
    (scope.tag || []).length === 0
    && (scope.brand || []).length === 0
    && (scope.vendor || []).length === 0
    && (scope.form || []).length === 0
    && (scope.location || []).length === 0
    && (scope.locationPrefix || []).length === 0
    && Object.values(scope.attributes || {}).every((v) => !v || v.length === 0)
  ), [scope]);

  // Preview follows the scope, debounced so dragging through the dropdowns
  // doesn't fire a request per keystroke.
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setPreviewing(true);

    const t = setTimeout(async () => {
      try {
        const res = await SupplyCountService.preview(scope);
        if (!cancelled) { setPreview(res.data); setError(null); }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Could not preview that scope.');
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 300);

    return () => { cancelled = true; clearTimeout(t); };
  }, [scope, isOpen]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await SupplyCountService.create({ name: name.trim(), scope, blind: true });
      onStarted?.(res.data.count);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start that count.');
    } finally {
      setBusy(false);
    }
  };

  const saveScope = async () => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await SupplyCountService.createScope(trimmed, scope);
      setSavedMsg(`Saved as "${trimmed}". It'll be on the counts page to re-run.`);
      setSaveName('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save that scope.');
    } finally {
      setBusy(false);
    }
  };

  const itemCount = preview?.count ?? 0;
  const neverCounted = (preview?.supplies || []).filter((s) => !s.lastCountedAt).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New cycle count" size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Name <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Valvoline sweep, Stock Room 1-C"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MultiPicker
            label="Tags"
            hint="(includes sub-tags)"
            options={tagOptions}
            values={scope.tag}
            onChange={(v) => setScope((p) => ({ ...p, tag: v, attributes: {} }))}
            placeholder="Any tag"
          />
          <MultiPicker
            label="Location"
            hint="(a level covers everything under it)"
            options={locationPickerOptions}
            values={locationValues}
            onChange={setLocationValues}
            placeholder="Anywhere"
          />
          <MultiPicker
            label="Brand"
            options={vocabOptions('brand')}
            values={scope.brand}
            onChange={(v) => setScope((p) => ({ ...p, brand: v }))}
            placeholder="Any brand"
          />
          <MultiPicker
            label="Vendor"
            options={vocabOptions('vendor')}
            values={scope.vendor}
            onChange={(v) => setScope((p) => ({ ...p, vendor: v }))}
            placeholder="Any vendor"
          />
        </div>

        {attrFields.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {attrFields.map((f) => (
                <MultiPicker
                  key={String(f._id)}
                  label={f.label}
                  hint={f.unit ? `(${f.unit})` : undefined}
                  options={(f.options || []).map((o) => ({ value: o, label: o }))}
                  values={scope.attributes?.[f.key] || []}
                  onChange={(v) => setScope((p) => ({
                    ...p,
                    attributes: { ...p.attributes, [f.key]: v }
                  }))}
                  placeholder="Any"
                />
              ))}
            </div>
          </div>
        )}

        {/* How big is this job? Always visible before committing to it. */}
        <div className={`px-4 py-3 rounded-md border ${
          isEmpty
            ? 'border-amber-200 bg-amber-50'
            : 'border-gray-200 bg-gray-50'
        }`}>
          {isEmpty ? (
            <p className="text-sm text-amber-800">
              <i className="fas fa-triangle-exclamation mr-2"></i>
              No filters set — this would count <strong>every</strong> supply in the shop
              {previewing ? '' : ` (${itemCount} items)`}.
            </p>
          ) : (
            <p className="text-sm text-gray-700">
              {previewing ? (
                <span className="text-gray-400">Counting up...</span>
              ) : (
                <>
                  <strong className="text-lg text-gray-900">{itemCount}</strong>
                  {' '}item{itemCount === 1 ? '' : 's'} in scope
                  {neverCounted > 0 && (
                    <span className="text-gray-500"> · {neverCounted} never counted</span>
                  )}
                </>
              )}
            </p>
          )}
        </div>

        <div className="px-4 py-3 rounded-md bg-blue-50 border border-blue-100 text-xs text-blue-800">
          <i className="fas fa-eye-slash mr-1.5"></i>
          This count runs <strong>blind</strong>: expected quantities stay hidden until
          you finish counting and open the review. Nothing is written to stock until you post.
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}
        {savedMsg && (
          <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
            {savedMsg}
          </div>
        )}

        {/* Saving the scope is separate from starting a count: a scope worth
            re-running quarterly is worth naming even when you aren't counting
            it right now. */}
        <div className="pt-3 border-t border-gray-100">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Save this scope to re-run later <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveScope()}
              placeholder="e.g. Monday: Fluids"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <Button variant="outline" onClick={saveScope} disabled={busy || !saveName.trim() || isEmpty}>
              Save scope
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="light" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={start} disabled={busy || previewing || itemCount === 0}>
            {busy ? 'Starting...' : `Start counting ${itemCount} item${itemCount === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CountScopeBuilder;
