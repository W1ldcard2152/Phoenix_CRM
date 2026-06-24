import React, { useState, useRef } from 'react';
import OfferCard from './OfferCard';
import CompareView from './CompareView';
import AutosaveField from './AutosaveField';
import ApprovalPanel from './ApprovalPanel';
import WorksheetService from '../../services/worksheetService';

// One placeholder part on the worksheet. A writer captures offers and SELECTS one
// (records the choice only); a manager then APPROVES — committing the chosen offer's
// details onto the placeholder. pending → selected (awaiting approval) → approved.
export default function PartSourcingCard({ workOrderId, part, vendors, compareMode, mutate, onSplit, onAddVendor, isManager, markupPercentage }) {
  const partId = part._id;
  const offers = part.offers || [];
  const isSelected = part.sourcingStatus === 'selected';
  const isApproved = part.sourcingStatus === 'approved';
  const selectedOffer = offers.find((o) => String(o._id) === String(part.selectedOfferId));

  // Star defaults to the currently-selected offer so revisiting shows it.
  const [starredOfferId, setStarredOfferId] = useState(part.selectedOfferId || null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState(part.selectionReason || '');
  const [qty, setQty] = useState(part.quantity || 1);
  const [approving, setApproving] = useState(false);
  // Bumped per offer after a screenshot decode to force that card to remount — its
  // AutosaveFields only read their value at mount, so a remount surfaces the AI fills.
  const [decodeVersion, setDecodeVersion] = useState({});
  const [lastDecodedOfferId, setLastDecodedOfferId] = useState(null);
  // Inline rename of the placeholder part name (fix a mis-typed part before sourcing).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(part.name || '');
  const skipNameSaveRef = useRef(false); // set on Escape so the blur doesn't save

  const saveName = async () => {
    if (skipNameSaveRef.current) { skipNameSaveRef.current = false; setEditingName(false); return; }
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === part.name) return;
    await mutate(() => WorksheetService.updatePartName(workOrderId, partId, trimmed));
  };

  // Decode a pasted screenshot into an offer's fields, then remount that card so the
  // freshly-saved values appear, and keep it expanded for the user to verify.
  const handleDecode = async (oId, file) => {
    await mutate(() => WorksheetService.decodeOffer(workOrderId, partId, oId, file));
    setLastDecodedOfferId(oId);
    setDecodeVersion((v) => ({ ...v, [oId]: (v[oId] || 0) + 1 }));
  };

  const handleApprove = async (fields) => {
    setApproving(true);
    try {
      // Commit whatever the manager has starred (their pick), repointing the selection
      // server-side so the audit matches the committed values.
      const offerId = starredOfferId || selectedOffer?._id;
      await mutate(() => WorksheetService.approvePart(workOrderId, partId, { ...fields, offerId }));
    } finally {
      setApproving(false);
    }
  };

  // New offers prefill their description from the placeholder part name (the common
  // case); the writer can refine it per offer, and the selected one replaces part.name.
  const addOffer = () =>
    mutate(() => WorksheetService.addOffer(workOrderId, partId, { source: 'manual', description: part.name }));

  const commitQty = () => {
    const n = parseInt(qty, 10);
    if (!n || n < 1 || n === part.quantity) {
      setQty(part.quantity || 1);
      return;
    }
    mutate(() => WorksheetService.updatePartQuantity(workOrderId, partId, n));
  };

  const confirmSelection = async () => {
    if (!starredOfferId || !reason.trim()) return;
    await mutate(() => WorksheetService.selectOffer(workOrderId, partId, starredOfferId, reason.trim()));
    setConfirming(false);
  };

  const starredOffer = offers.find((o) => o._id === starredOfferId);
  // The manager's commit form follows the STARRED offer (their pick), falling back to
  // the recorded selection. So starring a different offer immediately re-seeds the panel.
  const reviewOffer = starredOffer || selectedOffer;

  const cardBorder = isApproved
    ? 'border-emerald-300 bg-emerald-50/40'
    : isSelected
      ? 'border-green-300 bg-green-50/40'
      : 'border-gray-200 bg-gray-50';

  return (
    <div className={`rounded-lg border p-3 ${cardBorder}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                  else if (e.key === 'Escape') { skipNameSaveRef.current = true; e.currentTarget.blur(); }
                }}
                className="font-semibold text-gray-900 border border-gray-300 rounded px-1.5 py-0.5 min-w-0 flex-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            ) : (
              <h3 className="font-semibold text-gray-900 truncate">{part.name}</h3>
            )}
            {!isApproved && !editingName && (
              <button
                type="button"
                onClick={() => { setNameDraft(part.name || ''); setEditingName(true); }}
                title="Rename this part"
                className="text-gray-400 hover:text-primary-600 text-xs shrink-0"
              >
                <i className="fas fa-pen" />
              </button>
            )}
            {isApproved ? (
              <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                approved
              </span>
            ) : isSelected ? (
              <span className="text-[10px] uppercase tracking-wide text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                selected
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                pending
              </span>
            )}
          </div>
          {isApproved ? (
            // Committed values live on the part itself.
            <p className="text-xs text-gray-500 mt-0.5">
              {part.brand ? `${part.brand} ` : ''}
              {part.partNumber || ''} {part.vendor ? `· ${part.vendor}` : ''}
              {part.cost ? ` · $${Number(part.cost).toFixed(2)}/ea` : ''}
            </p>
          ) : isSelected && selectedOffer ? (
            // Pre-approval: the placeholder is unchanged, so show the chosen OFFER's info.
            <p className="text-xs text-gray-500 mt-0.5">
              {selectedOffer.manufacturer ? `${selectedOffer.manufacturer} ` : ''}
              {selectedOffer.partNumber || ''} {selectedOffer.seller ? `· ${selectedOffer.seller}` : ''}
              {selectedOffer.price != null ? ` · $${Number(selectedOffer.price).toFixed(2)}/ea` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-gray-500">Qty</label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={commitQty}
            className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
          />
          <button
            type="button"
            onClick={() => onSplit(part)}
            title="Split into separately-sourced lines"
            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-white"
          >
            <i className="fas fa-code-branch mr-1" /> Split
          </button>
        </div>
      </div>

      {/* Offers */}
      <div className="mt-3">
        {compareMode ? (
          <CompareView offers={offers} starredOfferId={starredOfferId} onStar={setStarredOfferId} />
        ) : (
          <div className="space-y-2">
            {offers.length === 0 && (
              <p className="text-sm text-gray-500 italic">No offers yet — add one to start capturing.</p>
            )}
            {offers.map((o) => (
              <OfferCard
                key={`${o._id}:${decodeVersion[o._id] || 0}`}
                workOrderId={workOrderId}
                partId={partId}
                offer={o}
                vendors={vendors}
                isStarred={o._id === starredOfferId}
                onStar={setStarredOfferId}
                onChanged={mutate}
                onAddVendor={onAddVendor}
                onDecode={(file) => handleDecode(o._id, file)}
                startExpanded={o._id === lastDecodedOfferId}
              />
            ))}
            <button
              type="button"
              onClick={addOffer}
              className="w-full py-1.5 text-sm border border-dashed border-gray-300 rounded text-gray-600 hover:bg-white"
            >
              <i className="fas fa-plus mr-1" /> Add offer card
            </button>
          </div>
        )}
      </div>

      {/* Per-part scratchpad */}
      <div className="mt-3">
        <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Notes for this part</label>
        <AutosaveField
          multiline
          rows={2}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
          initialValue={part.scratchpad}
          placeholder="Sizing, fitment, which side, etc."
          onPersist={(v) => WorksheetService.updateScratchpad(workOrderId, partId, v)}
        />
      </div>

      {/* Status / approval / selection */}
      <div className="mt-3 border-t border-gray-200 pt-2 space-y-2">
        {isApproved ? (
          <div className="space-y-2">
            <div className="text-sm text-emerald-700">
              <i className="fas fa-check-circle mr-1" />
              Approved &amp; committed{part.approvedByName ? ` by ${part.approvedByName}` : ''}.
            </div>
            {/* Reopen for changes — e.g. a quote customer changes their mind. Reverts to
                awaiting-approval so a new offer can be picked and sent back through. */}
            <button
              type="button"
              onClick={() => mutate(() => WorksheetService.unapprovePart(workOrderId, partId))}
              className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-white"
            >
              <i className="fas fa-rotate-left mr-1" />Unapprove &amp; reselect
            </button>
          </div>
        ) : (
          <>
            {/* A selected part awaits approval: managers get the commit form; others a notice. */}
            {isSelected && (
              isManager ? (
                <ApprovalPanel
                  // Keyed on the reviewed offer so the form re-seeds the instant you star
                  // a different offer (the panel seeds its fields once at mount).
                  key={reviewOffer?._id || 'no-offer'}
                  offer={reviewOffer}
                  markupPercentage={markupPercentage}
                  saving={approving}
                  onApprove={handleApprove}
                />
              ) : (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                  <i className="fas fa-hourglass-half mr-1" />Selected — awaiting manager approval.
                </div>
              )
            )}

            {/* Select / change selection — available until approved. */}
            {!confirming ? (
              <div className="space-y-1">
                {!starredOfferId && (
                  <p className="text-xs text-gray-500">
                    <i className="far fa-star text-amber-400 mr-1" />
                    Star an offer above to pick it, then confirm.
                  </p>
                )}
                <button
                  type="button"
                  disabled={!starredOfferId}
                  onClick={() => setConfirming(true)}
                  className={`text-sm px-3 py-1.5 rounded-md ${
                    isSelected
                      ? 'border border-gray-300 text-gray-700 hover:bg-white'
                      : starredOfferId
                        ? 'bg-primary-600 hover:bg-primary-700 text-white'
                        : 'bg-gray-300 cursor-not-allowed text-white'
                  }`}
                >
                  {isSelected ? 'Change selection' : 'Confirm part selection'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  Confirming{' '}
                  <span className="font-medium">
                    {starredOffer?.seller || starredOffer?.marketplaceSeller || 'starred offer'}
                    {starredOffer?.partNumber ? ` (${starredOffer.partNumber})` : ''}
                  </span>
                  . Why this one?
                </p>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="One sentence: why this offer was chosen."
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={confirmSelection}
                    disabled={!reason.trim()}
                    className={`text-sm px-3 py-1.5 rounded-md text-white ${
                      reason.trim() ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300 cursor-not-allowed'
                    }`}
                  >
                    Confirm selection
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="text-sm px-3 py-1.5 rounded-md border border-gray-300 hover:bg-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
