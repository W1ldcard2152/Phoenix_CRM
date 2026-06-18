import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import WorkOrderService from '../../services/workOrderService';
import SettingsService from '../../services/settingsService';
import WorksheetService from '../../services/worksheetService';
import { rankVendors } from '../../utils/vendorRanking';
import { SaveProvider, useSaveTracker } from './SaveContext';
import PrimerGate from './PrimerGate';
import PartSourcingCard from './PartSourcingCard';
import SplitPartModal from './SplitPartModal';
import AutosaveField from './AutosaveField';

const PRIORITY_LABEL = { cost: 'Lowest Cost', time: 'Fastest Availability' };
const QUALITY_LABEL = { oem: 'OEM', aftermarket: 'Aftermarket', 'used-ok': 'Used OK' };

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

function VendorPanel({ vendors, priority, quality }) {
  const tierLabel = priority === 'time' ? 'Speed' : 'Cost';
  return (
    <div className="text-sm">
      <div className="mb-2">
        <div className="text-[11px] uppercase tracking-wide text-gray-400">Sourcing basis</div>
        <div className="text-gray-700">
          {PRIORITY_LABEL[priority] || priority} · {QUALITY_LABEL[quality] || quality}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          Ranked by {tierLabel.toLowerCase()} tier, then manual order. Quality is a capture hint, not a filter.
        </div>
      </div>
      <ol className="space-y-1">
        {vendors.map((v, i) => (
          <li key={v._id || v.name || i} className="flex items-baseline justify-between gap-2">
            <span className="text-gray-800">
              <span className="text-gray-400 mr-1">{i + 1}.</span>
              {v.name}
            </span>
            <span className="text-[11px] text-gray-400 shrink-0">{tierLabel} {priority === 'time' ? v.speedTier ?? 0 : v.costTier ?? 0}</span>
          </li>
        ))}
        {vendors.length === 0 && <li className="text-gray-400 italic">No vendors configured.</li>}
      </ol>
    </div>
  );
}

function WorksheetInner() {
  const { workOrderId } = useParams();
  const { track } = useSaveTracker();

  const [workOrder, setWorkOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [splitTarget, setSplitTarget] = useState(null);
  const [closed, setClosed] = useState(false);

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

  // Structural mutation: run the call through the save tracker, then refetch.
  const mutate = useCallback(async (fn) => {
    await track(fn);
    await reload();
  }, [track, reload]);

  const handlePrimer = async (answers) => {
    await track(() => WorksheetService.setPrimer(workOrderId, answers));
    await reload();
  };

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

  // HARD GATE: an unanswered primer blocks everything until both are set.
  if (!workOrder.sourcingPriority || !workOrder.sourcingQuality) {
    return <PrimerGate onSubmit={handlePrimer} vehicleLabel={vehicleLabel} />;
  }

  const vendors = rankVendors(settings?.customVendors || [], {
    priority: workOrder.sourcingPriority,
    make: vehicle?.make,
  });

  const parts = workOrder.parts || [];
  const allSelected = parts.length > 0 && parts.every((p) => p.sourcingStatus === 'selected');

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
        {/* Vendor ranking */}
        <section className="bg-white border border-gray-200 rounded-lg p-3">
          <VendorPanel vendors={vendors} priority={workOrder.sourcingPriority} quality={workOrder.sourcingQuality} />
        </section>

        {/* Parts */}
        <section className="space-y-3">
          {parts.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              This work order has no parts. Closing the worksheet will send it to approval so an approver can ask
              why.
            </div>
          ) : (
            parts.map((part) => (
              <PartSourcingCard
                key={part._id}
                workOrderId={workOrderId}
                part={part}
                vendors={vendors}
                compareMode={compareMode}
                mutate={mutate}
                onSplit={setSplitTarget}
              />
            ))
          )}
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
            {allSelected
              ? 'All parts selected — closing will send this WO to “Parts Selected - Pending Approval”.'
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
