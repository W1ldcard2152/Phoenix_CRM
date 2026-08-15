import React, { useEffect, useRef, useState } from 'react';
import SupplyService from '../../services/supplyService';
import { unitWord, meaningfulUnit } from './units';

/**
 * Edit a supply's quantity on hand in place.
 *
 * Reads as "the stock level is a number you can type over", which is the whole
 * point — but it is NOT a plain field write. `quantityOnHand` is create-only on
 * the server precisely so that every later change leaves a SupplyMovement
 * behind; this posts an absolute figure to /adjust and lets the server derive
 * the delta from live stock. See supplyService.adjustQuantity.
 *
 * Type `adjust` ('manual correction'), never `count`. A count is a deliberate
 * sweep of a shelf with a sheet; typing over a number in a list is not, and
 * conflating them would make the ledger unable to answer "was this a real
 * recount or someone fixing a typo?" — which is the question reconciliation
 * exists to answer.
 */
const QohEditor = ({ supply, vocab = [], onSaved, disabled = false, className = '' }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  // Guards against blur-after-commit firing a second save: Enter commits and
  // then moves focus, which is itself a blur.
  const committed = useRef(false);

  const qoh = supply?.quantityOnHand ?? 0;
  const lowStock = qoh <= (supply?.reorderPoint ?? 0);
  const unit = meaningfulUnit(unitWord(vocab, supply?.stockUnit, 'stock', qoh));

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const open = () => {
    if (disabled || saving) return;
    setError(null);
    setDraft(String(qoh));
    committed.current = false;
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft('');
  };

  const commit = async () => {
    if (committed.current) return;
    committed.current = true;

    const counted = parseFloat(draft);
    if (!Number.isFinite(counted) || counted < 0) {
      setError('Enter a number, zero or more.');
      committed.current = false;
      inputRef.current?.select();
      return;
    }
    if (counted === qoh) {
      cancel();
      return;
    }

    setSaving(true);
    try {
      const res = await SupplyService.adjustQuantity(supply._id, {
        countedQuantity: counted,
        type: 'adjust',
        note: 'Corrected in list'
      });
      setEditing(false);
      setDraft('');
      onSaved?.(res.data.supply);
    } catch (err) {
      // Stay open holding what was typed — closing would discard the entry and
      // silently show the old number as though nothing had been attempted.
      setError(err.response?.data?.message || 'Could not save that quantity.');
      committed.current = false;
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        title={disabled ? undefined : 'Click to correct the stock level'}
        className={`group inline-flex items-center gap-1 rounded px-1 -mx-1 ${
          disabled ? 'cursor-default' : 'hover:bg-primary-50 cursor-text'
        } ${lowStock ? 'text-red-600 font-medium' : 'text-gray-700'} ${className}`}
      >
        {saving ? <i className="fas fa-spinner fa-spin text-xs text-gray-400"></i> : qoh}
        {!disabled && (
          <i className="fas fa-pen text-[9px] text-gray-300 opacity-0 group-hover:opacity-100"></i>
        )}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-end">
      <span className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className="w-20 px-2 py-1 border border-primary-400 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50"
        />
        {unit && <span className="text-[11px] text-gray-400">{unit}</span>}
      </span>
      {error && <span className="mt-1 text-[11px] text-red-600 text-right">{error}</span>}
    </span>
  );
};

export default QohEditor;
