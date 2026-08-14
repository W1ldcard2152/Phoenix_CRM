/**
 * The arithmetic of posting a cycle count.
 *
 * Pure and Mongoose-free so it can be unit-tested without a database, matching
 * supplyPricing.js and supplyRules.js. The service layer supplies live figures
 * and applies the results; every judgment about WHAT to post is made here.
 *
 * THE CENTRAL RULE: a count posts a DELTA, not a figure.
 *
 * A sheet records what was on the shelf and what the system expected when the
 * sheet was cut. Between those two moments stock legitimately moves - a tech
 * pulls two quarts for a job halfway through the morning. Overwriting quantity
 * on hand with the counted number would erase that consumption and reintroduce
 * exactly the error the count exists to remove. So:
 *
 *     variance = counted - expectedAtSnapshot     // what the count discovered
 *     newQoh   = liveQoh + variance               // applied to current reality
 *
 * When nothing moved, liveQoh === expectedAtSnapshot and newQoh === counted,
 * which is the ordinary case and reads as you would expect. When something did
 * move, both facts survive and the line is flagged so a human can see it
 * happened.
 */

/**
 * Has this line actually been counted?
 *
 * Counted-zero (the shelf is empty) and never-counted (nobody looked) are
 * different facts, and an uncounted line must never post as a shortage of
 * everything. Returns a real boolean, not a falsy value, so callers can compare
 * against it safely.
 */
const isCounted = (line) => Boolean(line
  && line.countedQuantity !== null
  && line.countedQuantity !== undefined
  && line.countedQuantity !== ''
  && Number.isFinite(Number(line.countedQuantity)));

/**
 * Work out what a single line should do when the count is posted.
 *
 * @param {object} line - { countedQuantity, expectedQuantity }
 * @param {number} liveQoh - the supply's quantity on hand right now
 * @returns {object} {
 *   counted, expected, variance, liveQoh, newQoh, delta,
 *   shouldPost,  // false when uncounted, or when the variance is zero
 *   moved,       // stock changed between snapshot and post
 *   clamped      // the delta would have driven stock negative
 * }
 */
const resolveCountLine = (line, liveQoh) => {
  const expected = Number(line?.expectedQuantity) || 0;
  const live = Number(liveQoh) || 0;

  if (!isCounted(line)) {
    return {
      counted: null,
      expected,
      variance: 0,
      liveQoh: live,
      newQoh: live,
      delta: 0,
      shouldPost: false,
      moved: false,
      clamped: false
    };
  }

  const counted = Number(line.countedQuantity);
  const variance = counted - expected;
  const moved = live !== expected;

  // Stock cannot go negative. This is reachable only through large drift - the
  // count says "two fewer than the eight I expected" while something else has
  // already taken stock to one - so the result is flagged rather than silently
  // absorbed. A silently clamped line would show a posted count whose result
  // does not equal what anybody counted.
  const rawNewQoh = live + variance;
  const clamped = rawNewQoh < 0;
  const newQoh = clamped ? 0 : rawNewQoh;

  return {
    counted,
    expected,
    variance,
    liveQoh: live,
    newQoh,
    delta: newQoh - live,
    shouldPost: variance !== 0,
    moved,
    clamped
  };
};

/**
 * Summarize a resolved sheet for the review screen.
 *
 * `price` is per stock unit, so value impact is variance * price. Lines with no
 * price contribute nothing rather than being dropped, so the item count and the
 * money never disagree about how many lines there were.
 *
 * @param {Array} resolved - [{ ...resolveCountLine result, price }]
 */
const summarizeCount = (resolved = []) => {
  const summary = {
    lines: resolved.length,
    counted: 0,
    uncounted: 0,
    variances: 0,
    shortages: 0,
    overages: 0,
    moved: 0,
    clamped: 0,
    netUnits: 0,
    netValue: 0
  };

  resolved.forEach((r) => {
    if (r.counted === null) { summary.uncounted += 1; return; }
    summary.counted += 1;
    if (r.moved) summary.moved += 1;
    if (r.clamped) summary.clamped += 1;
    if (r.variance === 0) return;

    summary.variances += 1;
    if (r.variance < 0) summary.shortages += 1; else summary.overages += 1;
    summary.netUnits += r.variance;
    summary.netValue += r.variance * (Number(r.price) || 0);
  });

  summary.netValue = parseFloat(summary.netValue.toFixed(2));
  return summary;
};

const blank = (v) => v === null || v === undefined || v === '';

/**
 * Resolve an entry as counted into a total in STOCK units.
 *
 * You BUY jugs and you USE quarts. What is physically on a shelf is jugs —
 * nobody knows they have 15 quarts of 5W-20, they know they have three 5qt
 * jugs — so the sheet asks in purchase units and converts here, once.
 *
 *     total = packages * unitsPerPurchase + loose
 *
 * `loose` covers the opened one: two full jugs and three loose quarts is 2 and
 * 3, and neither number alone can say that. An entry given as a bare
 * countedQuantity is already in stock units and is split back out for display.
 *
 * Returns the ok/error shape validateTagAssignment uses, so the service decides
 * the status code and this file stays free of HTTP concerns.
 *
 * @returns {object} { ok: true, entry } | { ok: true, entry: null } | { ok: false, error }
 */
const resolveCountEntry = (input = {}, unitsPerPurchase = 1) => {
  const { countedQuantity, countedPackages, countedLoose } = input;
  const upp = Math.max(1, Number(unitsPerPurchase) || 1);
  const invalid = { ok: false, error: 'A count must be a number, and cannot be negative.' };

  const usingPackages = !blank(countedPackages) || !blank(countedLoose);

  if (!usingPackages) {
    // Nothing entered at all: the line goes back to uncounted, which is not the
    // same as counting zero.
    if (blank(countedQuantity)) return { ok: true, entry: null };

    const total = Number(countedQuantity);
    if (!Number.isFinite(total) || total < 0) return invalid;

    return {
      ok: true,
      entry: {
        countedQuantity: total,
        countedPackages: upp > 1 ? Math.floor(total / upp) : total,
        countedLoose: upp > 1 ? total % upp : 0
      }
    };
  }

  const packages = blank(countedPackages) ? 0 : Number(countedPackages);
  const loose = blank(countedLoose) ? 0 : Number(countedLoose);
  if (![packages, loose].every((n) => Number.isFinite(n) && n >= 0)) return invalid;

  return {
    ok: true,
    entry: {
      countedQuantity: packages * upp + loose,
      countedPackages: packages,
      countedLoose: loose
    }
  };
};

/**
 * Is this sheet finished?
 *
 * Deliberately permissive: a count with lines left blank can still be posted,
 * because a partial sweep that corrects six shelves is worth more than one
 * abandoned for being incomplete. The uncounted lines simply do not post, and
 * do not get their last-counted stamp refreshed.
 */
const countProgress = (lines = []) => {
  const total = lines.length;
  const done = lines.filter(isCounted).length;
  return { total, done, remaining: total - done, complete: total > 0 && done === total };
};

module.exports = {
  isCounted,
  resolveCountEntry,
  resolveCountLine,
  summarizeCount,
  countProgress
};
