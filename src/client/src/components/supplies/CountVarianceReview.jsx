import React, { useCallback, useEffect, useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import SupplyCountService from '../../services/supplyCountService';
import SupplyService from '../../services/supplyService';
import { unitWord, meaningfulUnit } from './units';

/**
 * The variance report: what posting would do, before it does it.
 *
 * Counting and correcting are separate steps, and this is the seam. Nothing
 * here has touched stock yet; the Post button is the only thing that writes.
 *
 * Two flags are worth understanding, because they are where a count stops being
 * simple arithmetic:
 *
 *   MOVED   - stock changed between cutting the sheet and now, usually a tech
 *             consuming it mid-count. The count's finding still posts, applied
 *             to current stock, so both the shortage you found and the quarts
 *             they used survive. Flagged so you can recount if you'd rather.
 *
 *   CLAMPED - the correction would drive stock below zero, so it stops at zero
 *             and the posted figure will NOT equal what was counted. Rare, and
 *             always worth a look.
 */
const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

const CountVarianceReview = ({ countId, vocab = [], canPost = false, onChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [relocating, setRelocating] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await SupplyCountService.variances(countId);
      setData(res.data.count);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the variance report.');
    } finally {
      setLoading(false);
    }
  }, [countId]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    setBusy(true);
    try {
      const res = await SupplyCountService.post(countId);
      setData(res.data.count);
      setError(res.data.count.failures?.length
        ? `${res.data.count.failures.length} line(s) could not be posted.`
        : null);
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not post this count.');
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    setBusy(true);
    try {
      await SupplyCountService.reopen(countId);
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reopen this count.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * An item counted somewhere it doesn't live is usually mis-shelved rather
   * than miscounted. Fixing it here is the cheapest moment - you are standing
   * in front of the evidence.
   */
  const relocate = async (line, locationId) => {
    const key = String(line._id);
    setRelocating((p) => ({ ...p, [key]: true }));
    try {
      await SupplyService.update(line.supply._id, { location: locationId });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not move that item.');
    } finally {
      setRelocating((p) => ({ ...p, [key]: false }));
    }
  };

  if (loading) {
    return <Card><p className="text-center text-gray-400 py-8">Working out the variances...</p></Card>;
  }
  if (!data) {
    return <Card><p className="text-center text-gray-500 py-8">{error || 'Nothing to review.'}</p></Card>;
  }

  const s = data.summary || {};
  const posted = data.status === 'posted';
  const cancelled = data.status === 'cancelled';
  const withVariance = data.lines.filter((l) => l.counted !== null && l.variance !== 0);
  const matched = data.lines.filter((l) => l.counted !== null && l.variance === 0).length;
  const locationLabel = (id) => vocab.find((v) => String(v._id) === String(id))?.label || '';
  const locationOptionsList = vocab
    .filter((v) => v.fieldKey === 'location' && v.isActive !== false)
    .sort((a, b) => (a.label || a.value).localeCompare(b.label || b.value));

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Counted</div>
            <div className="text-xl font-semibold text-gray-900">
              {s.counted} <span className="text-sm font-normal text-gray-400">of {s.lines}</span>
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Variances</div>
            <div className="text-xl font-semibold text-gray-900">{s.variances}</div>
            <div className="text-[11px] text-gray-500">
              {s.shortages} short · {s.overages} over
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Net units</div>
            <div className={`text-xl font-semibold ${
              s.netUnits < 0 ? 'text-red-600' : s.netUnits > 0 ? 'text-green-700' : 'text-gray-900'
            }`}>
              {s.netUnits > 0 ? '+' : ''}{s.netUnits}
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Value impact</div>
            <div className={`text-xl font-semibold ${
              s.netValue < 0 ? 'text-red-600' : s.netValue > 0 ? 'text-green-700' : 'text-gray-900'
            }`}>
              {money(s.netValue || 0)}
            </div>
          </div>
        </div>

        {matched > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            {matched} item{matched === 1 ? '' : 's'} counted and matched. They write no correction,
            but their last-counted date still updates.
          </p>
        )}
        {s.uncounted > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            {s.uncounted} line{s.uncounted === 1 ? '' : 's'} left blank. Blank is skipped,
            not counted as zero.
          </p>
        )}
      </Card>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {(s.moved > 0 || s.clamped > 0) && !posted && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900 space-y-1">
          {s.moved > 0 && (
            <p>
              <strong>{s.moved}</strong> item{s.moved === 1 ? '' : 's'} moved while you were
              counting. Posting applies what you found on top of current stock, so both the
              variance and that movement are kept.
            </p>
          )}
          {s.clamped > 0 && (
            <p>
              <strong>{s.clamped}</strong> line{s.clamped === 1 ? '' : 's'} would go below zero
              and will stop at zero — the posted figure won't match what was counted. Worth a recount.
            </p>
          )}
        </div>
      )}

      <Card title={posted ? 'What was posted' : 'Variances'}>
        {withVariance.length === 0 ? (
          <p className="text-center text-gray-500 py-6">
            Everything counted matched what the system expected. Nothing to correct.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Expected</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Counted</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    {posted ? 'Result' : 'Will be'}
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {withVariance.map((line) => {
                  const unit = meaningfulUnit(unitWord(vocab, line.stockUnit, 'stock', 2));
                  const key = String(line._id);
                  return (
                    <tr key={key} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="text-sm font-medium text-gray-900">{line.displayName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          {line.location && (
                            <span className="text-xs text-gray-400">{locationLabel(line.location)}</span>
                          )}
                          {/* Every figure in this table is in stock units, so
                              show what was actually counted when they differ —
                              "3 jugs" is what the person wrote down. */}
                          {line.unitsPerPurchase > 1 && line.countedPackages !== null && (
                            <span className="text-xs text-gray-400">
                              counted {line.countedPackages}
                              {' '}
                              {unitWord(vocab, line.purchaseUnit, 'purchase', line.countedPackages)}
                              {line.countedLoose > 0 && (
                                <>
                                  {' + '}{line.countedLoose}
                                  {' '}
                                  {meaningfulUnit(unitWord(vocab, line.stockUnit, 'stock', line.countedLoose)) || 'loose'}
                                </>
                              )}
                            </span>
                          )}
                          {line.addedDuringCount && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              found off-scope
                            </span>
                          )}
                          {line.moved && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              moved during count
                            </span>
                          )}
                          {line.clamped && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                              clamped at zero
                            </span>
                          )}
                        </div>
                        {/* Off-scope finds are usually shelved wrong. Offer the fix
                            where the evidence is. */}
                        {line.addedDuringCount && !posted && canPost && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[11px] text-gray-500">Shelve at:</span>
                            <select
                              defaultValue=""
                              disabled={relocating[key]}
                              onChange={(e) => e.target.value && relocate(line, e.target.value)}
                              className="text-xs px-2 py-1 border border-gray-300 rounded"
                            >
                              <option value="">Leave where it is</option>
                              {locationOptionsList.map((v) => (
                                <option key={String(v._id)} value={String(v._id)}>
                                  {v.label || v.value}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-500">{line.expected}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">{line.counted}</td>
                      <td className={`px-4 py-2 text-sm text-right font-semibold ${
                        line.variance < 0 ? 'text-red-600' : 'text-green-700'
                      }`}>
                        {line.variance > 0 ? '+' : ''}{line.variance}
                        {unit && <span className="ml-1 text-xs font-normal text-gray-400">{unit}</span>}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">{line.newQoh}</td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        line.variance < 0 ? 'text-red-600' : 'text-green-700'
                      }`}>
                        {money(line.variance * (line.price || 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.foundNotInSystem?.length > 0 && (
        <Card title="Found on the shelf, not in the system">
          <p className="text-sm text-gray-500 mb-2">
            These need catalogue entries. Nothing here affects stock.
          </p>
          <ul className="space-y-1 text-sm text-gray-700">
            {data.foundNotInSystem.map((f, i) => (
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
        </Card>
      )}

      {!posted && !cancelled && (
        <Card>
          {canPost ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                Posting writes {s.variances} correction{s.variances === 1 ? '' : 's'} to stock
                and stamps {s.counted} item{s.counted === 1 ? '' : 's'} as counted today.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reopen} disabled={busy}>
                  Back to counting
                </Button>
                <Button variant="primary" onClick={post} disabled={busy || s.counted === 0}>
                  {busy ? 'Posting...' : 'Post this count'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              Counting is finished. An admin or manager reviews the variances and posts them.
            </p>
          )}
        </Card>
      )}

      {posted && (
        <Card>
          <p className="text-sm text-green-800">
            <i className="fas fa-check-circle mr-2"></i>
            Posted{data.postedAt ? ` on ${new Date(data.postedAt).toLocaleDateString()}` : ''}
            {data.postedBy?.displayName || data.postedBy?.name
              ? ` by ${data.postedBy.displayName || data.postedBy.name}`
              : ''}.
            Stock was corrected and every counted item now carries today's count date.
          </p>
        </Card>
      )}
    </div>
  );
};

export default CountVarianceReview;
