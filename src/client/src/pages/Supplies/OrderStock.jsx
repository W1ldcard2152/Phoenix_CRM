import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SupplyDetailModal from '../../components/supplies/SupplyDetailModal';
import SupplyService from '../../services/supplyService';
import { unitWord, meaningfulUnit } from '../../components/supplies/units';
import { idOf } from '../../components/supplies/tagTree';
import { isOut, purchaseUnitsNeeded, estimatedCost } from '../../components/supplies/restock';
import { formatCurrency } from '../../utils/formatters';

/**
 * Order Stock — everything at or below its reorder point, arranged as a
 * shopping trip rather than as a table.
 *
 * The same set the supplies list shows under its "Low or out of stock" filter,
 * and deliberately the same server query (`GET /supplies/shopping-list`), so
 * the two can never disagree about what "low" means. What this page adds is the
 * shape you actually buy in:
 *
 *   **Grouped by vendor.** A flat alphabetical list is the wrong unit of work —
 *   you don't buy one item, you place one order per supplier. Each group copies
 *   on its own, because that group IS the order.
 *
 *   **Out of stock first, everywhere.** A zero buried alphabetically among
 *   items that merely dipped to their reorder point is the one you forget.
 *
 *   **The product link is on the row.** Ending up on the vendor's site is the
 *   whole point; a URL you have to open a modal to reach is a URL you retype.
 *
 * Nothing here writes. Marking things as ordered would need an order state the
 * model doesn't have, and adding stock before it physically arrives is exactly
 * what Receive stock exists to prevent.
 */

const OrderStock = () => {
  const navigate = useNavigate();

  const [supplies, setSupplies] = useState([]);
  const [vocab, setVocab] = useState([]);
  const [tags, setTags] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [outOnly, setOutOnly] = useState(false);
  const [detailId, setDetailId] = useState(null);
  // Keyed by vendor id (or 'ALL') so each Copy button confirms for itself
  // rather than every button on the page flashing "Copied" at once.
  const [copied, setCopied] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, vocabRes, tagRes, fieldRes] = await Promise.all([
        SupplyService.getShoppingList(),
        SupplyService.getVocab(),
        SupplyService.getTags(),
        SupplyService.getFields()
      ]);
      setSupplies(listRes.data.supplies || []);
      setVocab(vocabRes.data.vocab);
      setTags(tagRes.data.tags);
      setFields(fieldRes.data.fields);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the order list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const vocabLabel = useCallback((id) => {
    const entry = vocab.find((v) => String(v._id) === idOf(id));
    return entry ? (entry.label || entry.value) : '';
  }, [vocab]);

  /** "4 jugs", or bare "4" when the purchase unit carries no information. */
  const buyPhrase = useCallback((s) => {
    const n = purchaseUnitsNeeded(s);
    const unit = meaningfulUnit(unitWord(vocab, s.purchaseUnit, 'purchase', n));
    return unit ? `${n} ${unit}` : String(n);
  }, [vocab]);

  const visible = useMemo(
    () => (outOnly ? supplies.filter(isOut) : supplies),
    [supplies, outOnly]
  );

  /**
   * One group per vendor, each already in buying order. Items with no vendor
   * set collect in a group of their own and sort LAST — they need a decision
   * before they need a basket, so they shouldn't head the page.
   */
  const groups = useMemo(() => {
    const byVendor = new Map();
    visible.forEach((s) => {
      const key = idOf(s.vendor) || '';
      if (!byVendor.has(key)) byVendor.set(key, []);
      byVendor.get(key).push(s);
    });

    return [...byVendor.entries()]
      .map(([key, items]) => ({
        key: key || 'none',
        vendorName: key ? (vocabLabel(key) || 'Unknown vendor') : 'No vendor set',
        hasVendor: !!key,
        items: [...items].sort((a, b) => (
          (isOut(a) ? 0 : 1) - (isOut(b) ? 0 : 1)
          || (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '')
        )),
        estimate: items.reduce((sum, s) => sum + estimatedCost(s), 0)
      }))
      .sort((a, b) => (a.hasVendor === b.hasVendor
        ? a.vendorName.localeCompare(b.vendorName)
        : (a.hasVendor ? -1 : 1)));
  }, [visible, vocabLabel]);

  const outCount = useMemo(() => supplies.filter(isOut).length, [supplies]);
  const grandTotal = useMemo(
    () => groups.reduce((sum, g) => sum + g.estimate, 0),
    [groups]
  );

  /** One item as a line of plain text, with its URL indented beneath it. */
  const itemLine = useCallback((s) => {
    const bits = [s.displayName || s.name];
    if (s.partNumber) bits.push(`#${s.partNumber}`);
    bits.push(`have ${s.quantityOnHand ?? 0}, reorder at ${s.reorderPoint ?? 0}`);
    bits.push(`buy ${buyPhrase(s)}`);
    return `- ${bits.join(' · ')}${s.url ? `\n  ${s.url}` : ''}`;
  }, [buyPhrase]);

  const copy = useCallback(async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch (err) {
      // Clipboard access can be refused outright (insecure origin, denied
      // permission). Saying so beats a button that silently does nothing.
      setError('Could not copy to the clipboard.');
    }
  }, []);

  const groupHeading = (g) => `${g.vendorName} — ${g.items.length} item${g.items.length === 1 ? '' : 's'}`;

  const copyGroup = (group) => copy(group.key, [
    groupHeading(group),
    '',
    ...group.items.map(itemLine)
  ].join('\n'));

  const copyAll = () => copy('ALL', [
    `Order list (${new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })})`,
    ...groups.flatMap((g) => ['', groupHeading(g), ...g.items.map(itemLine)])
  ].join('\n'));

  const renderItem = (s) => {
    const out = isOut(s);
    return (
      <div
        key={String(s._id)}
        onClick={() => setDetailId(String(s._id))}
        className="flex cursor-pointer items-start gap-3 border-t border-gray-100 px-1 py-3 first:border-t-0 hover:bg-gray-50"
      >
        {SupplyService.photoUrl(s) ? (
          <img
            src={SupplyService.photoUrl(s)}
            alt=""
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded border border-gray-200 object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-100">
            <i className="fas fa-image text-xs text-gray-300"></i>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-gray-900">{s.displayName || s.name}</span>
            {out && (
              <span className="rounded border border-red-200 bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                out of stock
              </span>
            )}
            {s.url && (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Open product page in a new tab"
                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 hover:underline"
              >
                <i className="fas fa-external-link-alt text-[10px]"></i>Product page
              </a>
            )}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {[s.partNumber && `#${s.partNumber}`, vocabLabel(s.brand), vocabLabel(s.location)]
              .filter(Boolean).join(' · ') || '—'}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className={`text-sm ${out ? 'font-medium text-red-600' : 'text-gray-700'}`}>
            have {s.quantityOnHand ?? 0}
          </div>
          <div className="text-[11px] text-gray-400">reorder at {s.reorderPoint ?? 0}</div>
        </div>

        <div className="w-28 shrink-0 text-right">
          <div className="text-sm font-medium text-gray-900">buy {buyPhrase(s)}</div>
          {s.cost > 0 && (
            <div className="text-[11px] text-gray-400">
              {formatCurrency(estimatedCost(s))} est.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={() => navigate('/supplies')}
            className="mb-1 text-sm text-primary-600 hover:underline"
          >
            <i className="fas fa-arrow-left mr-1"></i>Inventory &amp; Shop Supplies
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">Order Stock</h1>
          <p className="text-sm text-gray-500">
            {loading
              ? 'Loading…'
              : `${supplies.length} item${supplies.length === 1 ? '' : 's'} at or below the reorder point`}
            {!loading && outCount > 0 && (
              <span className="text-red-600"> · {outCount} out of stock</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={outOnly}
              onChange={(e) => setOutOnly(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Out of stock only
          </label>
          {groups.length > 0 && (
            <Button variant="outline" onClick={copyAll}>
              <i className={`fas ${copied === 'ALL' ? 'fa-check' : 'fa-copy'} mr-2`}></i>
              {copied === 'ALL' ? 'Copied' : 'Copy full list'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <Card><p className="py-8 text-center text-gray-400">Loading…</p></Card>
      ) : groups.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-gray-500">
            {outOnly
              ? 'Nothing is out of stock.'
              : 'Everything is above its reorder point — nothing to order.'}
          </p>
        </Card>
      ) : (
        <>
          {groups.map((group) => (
            <Card key={group.key}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                <div>
                  <h2 className={`text-base font-semibold ${group.hasVendor ? 'text-gray-900' : 'text-amber-700'}`}>
                    {group.vendorName}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {group.items.length} item{group.items.length === 1 ? '' : 's'}
                    {group.estimate > 0 && ` · ${formatCurrency(group.estimate)} est.`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => copyGroup(group)}>
                  <i className={`fas ${copied === group.key ? 'fa-check' : 'fa-copy'} mr-2`}></i>
                  {copied === group.key ? 'Copied' : 'Copy'}
                </Button>
              </div>
              {group.items.map(renderItem)}
            </Card>
          ))}

          {grandTotal > 0 && (
            <div className="px-1 text-right text-sm text-gray-500">
              Estimated total{' '}
              <span className="font-medium text-gray-800">{formatCurrency(grandTotal)}</span>
              <span className="text-gray-400"> · at last known cost, before tax and shipping</span>
            </div>
          )}
        </>
      )}

      <SupplyDetailModal
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        supplyId={detailId}
        tags={tags}
        vocab={vocab}
        fields={fields}
      />
    </div>
  );
};

export default OrderStock;
