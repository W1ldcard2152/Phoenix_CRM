import React, { useState, useMemo } from 'react';

// Pull a leading number out of a free-text ETA ("2 days" → 2) for rough ordering;
// unparseable ETAs sort last.
const etaRank = (eta) => {
  if (!eta) return Number.POSITIVE_INFINITY;
  const m = String(eta).match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : Number.POSITIVE_INFINITY;
};

// Read-oriented comparison of a part's offers, grouped by part number and sorted
// by price or ETA. Starring still works here, so a writer can decide from the
// comparison and then confirm.
export default function CompareView({ offers, starredOfferId, onStar }) {
  const [sortBy, setSortBy] = useState('price');

  const groups = useMemo(() => {
    const byPn = new Map();
    for (const o of offers) {
      const key = (o.partNumber || '').trim() || '— no part # —';
      if (!byPn.has(key)) byPn.set(key, []);
      byPn.get(key).push(o);
    }
    const cmp =
      sortBy === 'price'
        ? (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)
        : (a, b) => etaRank(a.eta) - etaRank(b.eta);
    return Array.from(byPn.entries()).map(([pn, list]) => [pn, list.slice().sort(cmp)]);
  }, [offers, sortBy]);

  if (offers.length === 0) {
    return <p className="text-sm text-gray-500 italic px-1 py-2">No offers captured yet.</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="text-gray-500">Sort by</span>
        {['price', 'eta'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSortBy(k)}
            className={`px-2 py-0.5 rounded border ${
              sortBy === k ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-300 text-gray-600'
            }`}
          >
            {k === 'price' ? 'Price' : 'ETA'}
          </button>
        ))}
      </div>

      {groups.map(([pn, list]) => (
        <div key={pn} className="mb-3">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            {pn} <span className="text-gray-400">({list.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-400">
                  <th className="w-6"></th>
                  <th className="pr-2">Seller</th>
                  <th className="pr-2">Mfr</th>
                  <th className="pr-2 text-right">Price</th>
                  <th className="pr-2 text-right">Core</th>
                  <th className="pr-2">ETA</th>
                  <th className="pr-2">Stock</th>
                  <th className="pr-2">Cond.</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr
                    key={o._id}
                    className={`border-t border-gray-100 ${o._id === starredOfferId ? 'bg-amber-50' : ''}`}
                  >
                    <td>
                      <button
                        type="button"
                        onClick={() => onStar(o._id)}
                        className={o._id === starredOfferId ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}
                      >
                        <i className={`${o._id === starredOfferId ? 'fas' : 'far'} fa-star`} />
                      </button>
                    </td>
                    <td className="pr-2">{o.seller || o.marketplaceSeller || '—'}</td>
                    <td className="pr-2">{o.manufacturer || '—'}</td>
                    <td className="pr-2 text-right">{o.price != null ? `$${o.price.toFixed(2)}` : '—'}</td>
                    <td className="pr-2 text-right">{o.coreCharge ? `$${o.coreCharge.toFixed(2)}` : '—'}</td>
                    <td className="pr-2">{o.eta || '—'}</td>
                    <td className="pr-2">{o.inStock == null ? '—' : o.inStock ? 'Yes' : 'No'}</td>
                    <td className="pr-2">{o.condition || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
