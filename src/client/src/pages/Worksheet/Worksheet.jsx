import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import WorkOrderService from '../../services/workOrderService';
import SettingsService from '../../services/settingsService';
import WorksheetService from '../../services/worksheetService';
import { rankVendors, vendorUrl } from '../../utils/vendorRanking';
import { SaveProvider, useSaveTracker } from './SaveContext';
import PrimerGate from './PrimerGate';
import PartSourcingCard from './PartSourcingCard';
import SplitPartModal from './SplitPartModal';
import AutosaveField from './AutosaveField';

const PRIORITY_LABEL = { cost: 'Cost-driven', time: 'Time-driven' };
const QUALITY_LABEL = { oem: 'OEM (New)', 'used-ok': 'OEM (Used)', aftermarket: 'Aftermarket' };
const PRIORITY_OPTIONS = [
  { value: 'cost', label: 'Cost-driven' },
  { value: 'time', label: 'Time-driven' },
];
const QUALITY_OPTIONS = [
  { value: 'oem', label: 'OEM (New)' },
  { value: 'used-ok', label: 'OEM (Used)' },
  { value: 'aftermarket', label: 'Aftermarket' },
];

const qualityLabels = (arr) => (arr || []).map((q) => QUALITY_LABEL[q] || q).join(', ');

const ADD_PART_OPTION = '__add_part__';

// Dropdown label for a part: a status marker (✓ approved, ◐ selected) + name + qty.
const partOptionLabel = (p) => {
  const mark = p.sourcingStatus === 'approved' ? '✓ ' : p.sourcingStatus === 'selected' ? '◐ ' : '';
  const qty = p.quantity > 1 ? ` (×${p.quantity})` : '';
  return `${mark}${p.name || 'Unnamed part'}${qty}`;
};

// The worksheet strip's width — vendor sites open in the remaining right slab.
const WORKSHEET_W = 400;

// Open a vendor's site in its OWN window docked to the right of the worksheet strip.
// Browsers can't put multiple tabs in a script-created window, so each vendor gets a
// separate window, cascaded ~30px (sharing the bottom-right corner) so stacked ones
// stay clickable. Same-vendor clicks reuse that vendor's window instead of piling up
// duplicates. Positioning a NEW window works the same in a browser tab or installed
// PWA — none of the move-an-existing-window restrictions apply.
const CASCADE_STEP = 30;   // px each new window steps in from the top-left
const CASCADE_WRAP = 8;    // restart the cascade after this many windows
// screen.availWidth under-reports the usable width on this scaled display, so a
// flush-right window lands ~250px short. Bleed the right edge back out by that much
// so the first (un-cascaded) window sits flush against the true right edge. If the
// gap looks wrong on a given monitor, this is the one number to nudge.
const RIGHT_BLEED = 250;
// Small rightward nudge to absorb the invisible window border / DPI-rounding slop that
// leaves a thin overlap at the worksheet↔vendor seam. Bump up if they still overlap,
// down if a gap appears.
const SEAM_NUDGE = 20;
let vendorWinCount = 0;
const vendorWindows = new Map(); // vendor key -> WindowProxy

function openVendorBrowser(url, openInTab) {
  // Marketplace vendors (eBay/Amazon) are flagged to open as a normal browser tab —
  // full navigation, and their target=_blank links don't escape a docked popup.
  if (openInTab) {
    window.open(url, '_blank', 'noopener');
    return;
  }

  const left = window.screen.availLeft ?? 0;
  const top = window.screen.availTop ?? 0;
  const availW = window.screen.availWidth || 1920;
  const h = window.screen.availHeight || 1040;

  // Key the window by vendor host so re-clicking the same vendor reuses its window.
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { host = url; }
  const name = `worksheet-vendor-${host}`;

  const existing = vendorWindows.get(name);
  if (existing && !existing.closed) {
    try { existing.location = url; } catch (_) { /* cross-origin nav still allowed; ignore */ }
    existing.focus();
    return;
  }

  // All vendor windows share one right edge (flush to the screen's right); each new
  // one steps its top-left in by CASCADE_STEP and shrinks to match, so the stack fans
  // out from the top-left while the right/bottom edges stay put.
  const offset = (vendorWinCount % CASCADE_WRAP) * CASCADE_STEP;
  vendorWinCount += 1;
  // Butt the vendor window against the worksheet's ACTUAL right edge. This code runs
  // inside the worksheet popup, so its own frame is the source of truth — the browser
  // can render the popup a bit wider than the requested WORKSHEET_W, which was causing
  // the seam overlap. Fall back to the nominal width if we're not in a narrow popup
  // (e.g. the worksheet was opened directly as a full browser tab).
  const stripRight = window.outerWidth < availW * 0.6
    ? window.screenX + window.outerWidth
    : left + WORKSHEET_W;
  const vendorLeft = stripRight + SEAM_NUDGE + offset;
  const screenRight = left + availW + RIGHT_BLEED; // availWidth under-reports the true edge
  const w = Math.max(640, screenRight - vendorLeft);
  const win = window.open(
    url,
    name,
    `width=${w},height=${h - offset},left=${vendorLeft},top=${top + offset}`
  );
  if (win) {
    vendorWindows.set(name, win);
    win.focus();
  }
}

// Inline editor for the sourcing basis — writes back to the WO root via setPrimer,
// so a change here is reflected on the work order form (and vice versa).
function BasisEditor({ initialPriority, initialQuality, onSave, onCancel, saving }) {
  const [priority, setPriority] = useState(initialPriority || '');
  const [quality, setQuality] = useState(initialQuality || []);
  const toggle = (v) => setQuality((q) => (q.includes(v) ? q.filter((x) => x !== v) : [...q, v]));
  const canSave = priority && quality.length > 0 && !saving;

  const pill = (active) =>
    `px-2 py-1 text-xs rounded border ${active ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-300 text-gray-600'}`;

  return (
    <div className="text-sm">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Sourcing priority</div>
      <div className="flex gap-1 mb-2">
        {PRIORITY_OPTIONS.map((o) => (
          <button key={o.value} type="button" className={pill(priority === o.value)} onClick={() => setPriority(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Acceptable quality (one or more)</div>
      <div className="flex flex-wrap gap-1 mb-3">
        {QUALITY_OPTIONS.map((o) => (
          <button key={o.value} type="button" className={pill(quality.includes(o.value))} onClick={() => toggle(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => onSave({ sourcingPriority: priority, sourcingQuality: quality })}
          className={`px-3 py-1 text-xs rounded text-white ${canSave ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-300 cursor-not-allowed'}`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1 text-xs rounded border border-gray-300">Cancel</button>
      </div>
    </div>
  );
}

function SaveIndicator() {
  const { isSaving, lastSaved, error } = useSaveTracker();
  if (error) return <span className="text-xs text-red-600"><i className="fas fa-triangle-exclamation mr-1" />Save failed</span>;
  if (isSaving) return <span className="text-xs text-gray-500"><i className="fas fa-spinner fa-spin mr-1" />Saving…</span>;
  if (lastSaved)
    return (
      <span className="text-xs text-green-600">
        <i className="fas fa-check mr-1" />Saved {lastSaved.toLocaleTimeString()}
      </span>
    );
  return <span className="text-xs text-gray-400">All changes save automatically</span>;
}

const VENDOR_PREVIEW = 5;

function VendorPanel({ vendors, priority }) {
  const [expanded, setExpanded] = useState(false);
  const tierLabel = priority === 'time' ? 'Speed' : 'Cost';
  const shown = expanded ? vendors : vendors.slice(0, VENDOR_PREVIEW);
  return (
    <div className="text-sm">
      <div className="text-[11px] text-gray-400 mb-1">
        Ranked by {tierLabel.toLowerCase()} tier, then manual order. Quality is a capture hint, not a filter.
      </div>
      <ol className="space-y-1">
        {shown.map((v, i) => {
          const url = vendorUrl(v);
          return (
            <li key={v._id || v.name || i} className="flex items-baseline justify-between gap-2">
              <span className="text-gray-800">
                <span className="text-gray-400 mr-1">{i + 1}.</span>
                {v.name}
                {url && (
                  <a
                    href={url}
                    onClick={(e) => { e.preventDefault(); openVendorBrowser(url, v.openInTab); }}
                    title={`Open ${v.name}${v.openInTab ? ' (new tab)' : ' (docks to the right)'}`}
                    className="ml-1.5 text-primary-600 hover:text-primary-800"
                  >
                    <i className="fas fa-external-link-alt text-[11px]" />
                  </a>
                )}
              </span>
              <span className="text-[11px] text-gray-400 shrink-0">{tierLabel} {priority === 'time' ? v.speedTier ?? 0 : v.costTier ?? 0}</span>
            </li>
          );
        })}
        {vendors.length === 0 && <li className="text-gray-400 italic">No vendors configured.</li>}
      </ol>
      {vendors.length > VENDOR_PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 text-xs text-primary-600 hover:text-primary-800"
        >
          {expanded ? 'Show fewer' : `Show ${vendors.length - VENDOR_PREVIEW} more`}
        </button>
      )}
    </div>
  );
}

// Add a new placeholder part to a job without leaving the worksheet.
function AddPartForm({ services, onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [serviceId, setServiceId] = useState(services[0]?._id || '');
  const [saving, setSaving] = useState(false);
  const canAdd = name.trim() && !saving;

  const submit = async () => {
    if (!canAdd) return;
    setSaving(true);
    try {
      await onAdd({ name: name.trim(), quantity: parseInt(quantity, 10) || 1, serviceId: serviceId || null });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="bg-white border border-primary-200 rounded-lg p-3 space-y-2">
      <input
        className={`${inputCls} w-full`}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        placeholder="New part name"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Qty</label>
        <input type="number" min="1" className={`${inputCls} w-16`} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <label className="text-xs text-gray-500 ml-1">Job</label>
        <select className={`${inputCls} flex-1 min-w-0`} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {services.map((s) => (
            <option key={s._id} value={s._id}>{s.description}</option>
          ))}
          <option value="">General (no job)</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canAdd}
          className={`px-3 py-1 text-sm rounded-md text-white ${canAdd ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-300 cursor-not-allowed'}`}
        >
          {saving ? 'Adding…' : 'Add part'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm rounded-md border border-gray-300">Cancel</button>
      </div>
    </div>
  );
}

function WorksheetInner() {
  const { workOrderId } = useParams();
  const { track } = useSaveTracker();
  const { user } = useAuth();
  const isManager = ['admin', 'management'].includes(user?.role);

  const [workOrder, setWorkOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [splitTarget, setSplitTarget] = useState(null);
  const [closed, setClosed] = useState(false);
  const [editingBasis, setEditingBasis] = useState(false);
  const [savingBasis, setSavingBasis] = useState(false);
  const [addingPart, setAddingPart] = useState(false);
  // Which part the worksheet is currently pricing (null → fall back to the first part).
  const [selectedPartId, setSelectedPartId] = useState(null);

  const reload = useCallback(async () => {
    const resp = await WorkOrderService.getWorkOrder(workOrderId);
    setWorkOrder(resp.data.workOrder);
  }, [workOrderId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Opening transitions the WO to 'Parts Sourcing - In Progress' (and self-heals
        // an abandoned session). Tolerate failure so the page still loads read-only.
        try {
          await WorksheetService.openWorksheet(workOrderId);
        } catch (_) { /* backend not ready / not transitionable — fall through to load */ }

        const [woResp, setResp] = await Promise.all([
          WorkOrderService.getWorkOrder(workOrderId),
          SettingsService.getSettings(),
        ]);
        if (!active) return;
        setWorkOrder(woResp.data.workOrder);
        setSettings(setResp.data.settings);
      } catch (e) {
        if (active) setLoadError('Could not load this work order.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [workOrderId]);

  // Enforce a 400px minimum width. This page runs in a script-opened popup, so it's
  // allowed to resize itself — if the user drags it narrower than the layout supports,
  // snap it back. No-op when opened as a normal tab (resizeTo is ignored there).
  useEffect(() => {
    const MIN_W = 400;
    const enforce = () => {
      if (window.outerWidth < MIN_W) {
        try { window.resizeTo(MIN_W, window.outerHeight); } catch (_) { /* not a popup */ }
      }
    };
    window.addEventListener('resize', enforce);
    return () => window.removeEventListener('resize', enforce);
  }, []);

  // Structural mutation: run the call through the save tracker, then refetch.
  const mutate = useCallback(async (fn) => {
    await track(fn);
    await reload();
  }, [track, reload]);

  const handlePrimer = async (answers) => {
    await track(() => WorksheetService.setPrimer(workOrderId, answers));
    await reload();
  };

  // Add a vendor from the seller dropdown; refresh the local settings so the new
  // vendor appears in every card's dropdown and in the ranking. Returns its name.
  const handleAddVendor = useCallback(async (name, hostname) => {
    const body = await track(() => SettingsService.addVendor(name, hostname, ['parts']));
    if (body?.data?.settings) setSettings(body.data.settings);
    return name;
  }, [track]);

  const handleClose = async () => {
    await track(() => WorksheetService.closeWorksheet(workOrderId));
    setClosed(true);
    // Opened via window.open for split-screen use — try to close it.
    setTimeout(() => { try { window.close(); } catch (_) { /* ignore */ } }, 400);
  };

  const handleSplit = async (splits) => {
    const partId = splitTarget._id;
    await mutate(() => WorksheetService.splitPart(workOrderId, partId, splits));
    setSplitTarget(null);
  };

  const handleAddPart = async (fields) => {
    const body = await track(() => WorksheetService.addPart(workOrderId, fields));
    await reload();
    // Jump straight to the part just added (it's appended last) so the user can price it.
    const newParts = body?.data?.workOrder?.parts;
    if (newParts?.length) setSelectedPartId(newParts[newParts.length - 1]._id);
    setAddingPart(false);
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading worksheet…</div>;
  if (loadError) return <div className="p-8 text-center text-red-600">{loadError}</div>;
  if (!workOrder) return null;

  if (closed) {
    return (
      <div className="p-8 text-center text-gray-600">
        <i className="fas fa-check-circle text-green-500 text-3xl mb-2" />
        <p>Worksheet closed. You can close this window.</p>
      </div>
    );
  }

  const vehicle = typeof workOrder.vehicle === 'object' ? workOrder.vehicle : null;
  const vehicleLabel = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : '';

  // HARD GATE: an unanswered primer blocks everything until both are set
  // (quality is now a multi-select array, so check its length).
  if (!workOrder.sourcingPriority || !(workOrder.sourcingQuality || []).length) {
    return <PrimerGate onSubmit={handlePrimer} vehicleLabel={vehicleLabel} />;
  }

  const allVendors = settings?.customVendors || [];
  // One list for both the ranking panel and the seller dropdown: parts-tagged vendors
  // matching this vehicle's make (make-specific vendors are hidden, not just ranked
  // down). Vendors tagged makes:['all'] always show; "Add new vendor" covers one-offs.
  const partsVendors = rankVendors(allVendors, {
    priority: workOrder.sourcingPriority,
    make: vehicle?.make,
    usage: 'parts',
  });

  const parts = workOrder.parts || [];
  const allSourced = parts.length > 0 && parts.every((p) => p.sourcingStatus !== 'pending');
  const isQuoteDoc = String(workOrder.status || '').startsWith('Quote');
  const services = workOrder.services || [];
  // The part currently being priced. A stale/missing selection falls back to the first.
  const currentPart = parts.find((p) => p._id === selectedPartId) || parts[0] || null;

  return (
    <div className="min-h-screen bg-parchment">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-900 truncate">Parts Worksheet</h1>
            <p className="text-xs text-gray-500 truncate">
              {vehicleLabel || 'Work Order'} · #{String(workOrder._id).slice(-8).toUpperCase()}
            </p>
          </div>
          <SaveIndicator />
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setCompareMode(false)}
              className={`px-3 py-1 ${!compareMode ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}
            >
              Capture
            </button>
            <button
              type="button"
              onClick={() => setCompareMode(true)}
              className={`px-3 py-1 ${compareMode ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}
            >
              Compare
            </button>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-sm px-3 py-1 rounded-md bg-gray-800 text-white hover:bg-gray-900"
          >
            Close worksheet
          </button>
        </div>
      </header>

      <div className="p-3 space-y-4">
        {/* Part picker — choose which part to price; last option adds a new one. */}
        <section className="bg-white border border-gray-200 rounded-lg p-3">
          <label className="block text-[11px] uppercase tracking-wide text-gray-400 mb-1">Pricing part</label>
          <select
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            value={addingPart ? ADD_PART_OPTION : currentPart?._id || ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === ADD_PART_OPTION) {
                setAddingPart(true);
              } else {
                setAddingPart(false);
                setSelectedPartId(v);
              }
            }}
          >
            {parts.length === 0 && <option value="" disabled>No parts yet</option>}
            {parts.map((p) => (
              <option key={p._id} value={p._id}>{partOptionLabel(p)}</option>
            ))}
            <option value={ADD_PART_OPTION}>+ Add part…</option>
          </select>
        </section>

        {/* Sourcing basis (editable — syncs with the work order form) + vendor ranking */}
        <section className="bg-white border border-gray-200 rounded-lg p-3">
          {editingBasis ? (
            <BasisEditor
              initialPriority={workOrder.sourcingPriority}
              initialQuality={workOrder.sourcingQuality || []}
              saving={savingBasis}
              onCancel={() => setEditingBasis(false)}
              onSave={async (answers) => {
                setSavingBasis(true);
                try {
                  await handlePrimer(answers);
                  setEditingBasis(false);
                } finally {
                  setSavingBasis(false);
                }
              }}
            />
          ) : (
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Sourcing basis</div>
                <div className="text-gray-700 text-sm">
                  {PRIORITY_LABEL[workOrder.sourcingPriority] || workOrder.sourcingPriority}
                  {' · '}
                  {qualityLabels(workOrder.sourcingQuality)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBasis(true)}
                className="text-xs text-primary-600 hover:text-primary-800 shrink-0"
              >
                Edit
              </button>
            </div>
          )}
          {!editingBasis && <VendorPanel vendors={partsVendors} priority={workOrder.sourcingPriority} />}
        </section>

        {/* The part being priced (or the add-part form). */}
        <section className="space-y-3">
          {addingPart ? (
            <AddPartForm services={services} onAdd={handleAddPart} onCancel={() => setAddingPart(false)} />
          ) : parts.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              {isQuoteDoc
                ? 'This quote has no parts yet — pick “Add part” above to start sourcing.'
                : 'This work order has no parts. Closing the worksheet will send it to approval so an approver can ask why.'}
            </div>
          ) : currentPart ? (
            <PartSourcingCard
              key={currentPart._id}
              workOrderId={workOrderId}
              part={currentPart}
              vendors={partsVendors}
              compareMode={compareMode}
              mutate={mutate}
              onSplit={setSplitTarget}
              onAddVendor={handleAddVendor}
              isManager={isManager}
              markupPercentage={settings?.partMarkupPercentage ?? 30}
            />
          ) : null}
        </section>

        {/* Worksheet-level scratchpad */}
        <section className="bg-white border border-gray-200 rounded-lg p-3">
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Worksheet notes</label>
          <AutosaveField
            multiline
            rows={3}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            initialValue={workOrder.sourcingNotes}
            placeholder="Overall sourcing notes for this job…"
            onPersist={(v) => WorksheetService.updateSourcingNotes(workOrderId, v)}
          />
        </section>

        {parts.length > 0 && (
          <p className="text-xs text-gray-500 text-center">
            {isQuoteDoc
              ? 'Sourcing on a quote — closing won’t change the quote’s status. Answers and offers carry over when it converts.'
              : allSourced
                ? 'All parts sourced — closing will send this WO to “Parts Selected - Pending Approval”.'
                : 'Some parts are still pending — closing keeps this WO in sourcing.'}
          </p>
        )}
      </div>

      {splitTarget && (
        <SplitPartModal part={splitTarget} onClose={() => setSplitTarget(null)} onConfirm={handleSplit} />
      )}
    </div>
  );
}

export default function Worksheet() {
  return (
    <SaveProvider>
      <WorksheetInner />
    </SaveProvider>
  );
}
