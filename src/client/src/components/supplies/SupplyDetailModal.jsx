import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SupplyService from '../../services/supplyService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { indexTags, tagPath, idOf } from './tagTree';

/**
 * Read-only detail card for a supply.
 *
 * Deliberately not the edit form with the inputs disabled. The form is arranged
 * for entry — every value a control, ordered by how it's typed. This is
 * arranged for reading: the photo and name lead, then what the thing IS, then
 * what it costs, then what it's done.
 *
 * Re-fetches on open rather than rendering the row it was opened from, because
 * the list omits movements entirely — the stock history has existed on
 * GET /api/supplies/:id since the module was built and has never been shown
 * anywhere.
 */
const MOVEMENT_LABELS = {
  count: 'Counted',
  receive: 'Received',
  consume: 'Used',
  adjust: 'Adjusted',
  return: 'Returned',
  import: 'Imported'
};

const Row = ({ label, children, className = '' }) => (
  <div className={className}>
    <dt className="text-[10px] uppercase tracking-wide text-gray-400">{label}</dt>
    <dd className="text-sm text-gray-900 mt-0.5">{children}</dd>
  </div>
);

const SupplyDetailModal = ({ isOpen, onClose, supplyId, tags = [], vocab = [], fields = [], onEdit }) => {
  const [supply, setSupply] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const byId = useMemo(() => indexTags(tags), [tags]);

  const vocabLabel = useCallback((id) => {
    const entry = vocab.find((v) => String(v._id) === idOf(id));
    return entry ? (entry.label || entry.value) : null;
  }, [vocab]);

  useEffect(() => {
    if (!isOpen || !supplyId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    SupplyService.getOne(supplyId)
      .then((res) => {
        // The modal can be closed and reopened on another item faster than a
        // response arrives; without this the previous item's data would land.
        if (cancelled) return;
        setSupply(res.data.supply);
        setMovements(res.data.movements || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Could not load this supply.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isOpen, supplyId]);

  const attributeRows = useMemo(() => {
    if (!supply?.attributes) return [];
    return Object.entries(supply.attributes)
      .filter(([, v]) => v)
      .map(([key, value]) => {
        const field = fields.find((f) => f.key === key);
        return {
          key,
          label: field ? field.label : key,
          value: field?.unit && !String(value).toLowerCase().endsWith(field.unit.toLowerCase())
            ? `${value}${field.unit}`
            : value,
          sortOrder: field?.sortOrder || 0
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [supply, fields]);

  const stockUnit = supply ? vocabLabel(supply.stockUnit) : null;
  const purchaseUnit = supply ? vocabLabel(supply.purchaseUnit) : null;
  const upp = Math.max(1, supply?.unitsPerPurchase || 1);
  const lowStock = supply && supply.quantityOnHand <= supply.reorderPoint;
  const photoUrl = supply ? SupplyService.photoUrl(supply) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={supply?.displayName || 'Supply'} size="lg">
      {loading && <p className="text-center text-gray-400 py-10">Loading…</p>}
      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {supply && !loading && (
        <div className="space-y-5">
          <div className="flex gap-5">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="w-36 h-36 shrink-0 rounded-lg object-cover border border-gray-200"
              />
            ) : (
              <div className="w-36 h-36 shrink-0 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
                <i className="fas fa-image text-gray-300 text-2xl"></i>
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              {/* Tags, primary first — the item's canonical home leads. */}
              {supply.tags?.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {[...supply.tags]
                    .sort((a, b) => (idOf(b) === idOf(supply.primaryTag) ? 1 : 0)
                      - (idOf(a) === idOf(supply.primaryTag) ? 1 : 0))
                    .map((t) => {
                      const id = idOf(t);
                      const isPrimary = id === idOf(supply.primaryTag);
                      return (
                        <span
                          key={id}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border ${
                            isPrimary
                              ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                              : 'border-gray-200 bg-gray-50 text-gray-600'
                          }`}
                        >
                          {isPrimary && <i className="fas fa-star text-[9px]"></i>}
                          {tagPath(id, byId)}
                        </span>
                      );
                    })}
                </div>
              ) : (
                <span className="inline-block px-2 py-1 text-xs rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                  Untagged
                </span>
              )}

              {attributeRows.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {attributeRows.map((a) => (
                    <span
                      key={a.key}
                      className="inline-flex items-baseline gap-1 px-2 py-1 text-xs rounded border border-blue-100 bg-blue-50"
                    >
                      <span className="text-blue-500 text-[10px]">{a.label}</span>
                      <span className="text-blue-900 font-medium">{a.value}</span>
                    </span>
                  ))}
                </div>
              )}

              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Row label="Brand">
                  {vocabLabel(supply.brand) || <span className="text-amber-600">missing</span>}
                </Row>
                <Row label="Part Number">{supply.partNumber || '—'}</Row>
                <Row label="Vendor">{vocabLabel(supply.vendor) || '—'}</Row>
                <Row label="Location">
                  {vocabLabel(supply.location) || <span className="text-gray-400">unassigned</span>}
                </Row>
                <Row label="Form">{vocabLabel(supply.form) || '—'}</Row>
                {supply.qualifier && <Row label="Qualifier">{supply.qualifier}</Row>}
              </dl>
            </div>
          </div>

          {/* Stock and money, the two things you open a supply to check. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="px-4 py-3 rounded-lg border border-gray-200 bg-gray-50">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Stock</div>
              <div className={`text-2xl font-semibold ${lowStock ? 'text-red-600' : 'text-gray-900'}`}>
                {supply.quantityOnHand}
                {stockUnit && <span className="text-sm font-normal text-gray-500 ml-1">{stockUnit}</span>}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Reorder at {supply.reorderPoint}
                {lowStock && <span className="ml-2 text-red-600 font-medium">· at or below reorder point</span>}
              </div>
              {upp > 1 && (
                <div className="text-xs text-gray-400 mt-1">
                  Bought as {purchaseUnit || 'pack'} of {upp} {stockUnit || 'unit'}
                </div>
              )}
            </div>

            <div className="px-4 py-3 rounded-lg border border-gray-200 bg-gray-50">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Pricing</div>
              <div className="text-2xl font-semibold text-gray-900">
                {formatCurrency(supply.price || 0)}
                <span className="text-sm font-normal text-gray-500 ml-1">
                  per {stockUnit || 'unit'}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Cost {formatCurrency(supply.cost || 0)} per {purchaseUnit || stockUnit || 'unit'}
                {supply.costIncludesTax && <span className="text-gray-400"> · tax included</span>}
              </div>
              {supply.priceOverridden && (
                <div className="text-xs text-gray-400 mt-1">Price set manually</div>
              )}
            </div>
          </div>

          {(supply.url || supply.sdsUrl || supply.notes) && (
            <div className="space-y-2">
              {supply.url && (
                <a
                  href={supply.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline mr-4"
                >
                  <i className="fas fa-external-link-alt text-[10px]"></i>Product page
                </a>
              )}
              {supply.sdsUrl && (
                <a
                  href={supply.sdsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
                >
                  <i className="fas fa-file-shield text-[10px]"></i>Safety data sheet
                </a>
              )}
              {supply.notes && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{supply.notes}</p>
              )}
            </div>
          )}

          {/* Stock history. Recorded since the module was built, never shown. */}
          {movements.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
                Stock history
              </div>
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                {movements.map((mv) => (
                  <li key={mv._id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className={`font-medium tabular-nums w-14 text-right ${
                      mv.quantity < 0 ? 'text-red-600' : 'text-green-700'
                    }`}
                    >
                      {mv.quantity > 0 ? '+' : ''}{mv.quantity}
                    </span>
                    <span className="text-gray-700 w-20">{MOVEMENT_LABELS[mv.type] || mv.type}</span>
                    <span className="text-gray-400 text-xs flex-1 truncate">
                      {mv.note}
                      {mv.createdBy?.displayName || mv.createdBy?.name
                        ? ` · ${mv.createdBy.displayName || mv.createdBy.name}`
                        : ''}
                    </span>
                    <span className="text-gray-400 text-xs whitespace-nowrap">
                      {formatDateTime(mv.createdAt)}
                    </span>
                    <span className="text-gray-500 text-xs tabular-nums w-12 text-right">
                      → {mv.resultingQoh}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="light" onClick={onClose}>Close</Button>
        {onEdit && supply && (
          <Button variant="primary" onClick={() => onEdit(supply)}>
            <i className="fas fa-pen mr-2 text-xs"></i>Edit
          </Button>
        )}
      </div>
    </Modal>
  );
};

export default SupplyDetailModal;
