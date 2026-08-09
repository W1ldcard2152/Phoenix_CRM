/**
 * Pricing for shop supplies.
 *
 *     markup = Settings.partMarkupPercentage   // a PERCENTAGE, e.g. 30
 *     price  = (cost / unitsPerPurchase) * (1 + markup / 100)
 *
 * `cost` is per PURCHASE unit (the 5qt jug); `price` is per STOCK unit (the
 * quart). Getting that division wrong is what the earlier inventory backfill
 * had to repair, so it lives in one function here rather than being re-derived
 * at each call site.
 *
 * Price is computed at write time and STORED. It is never recomputed on read,
 * which means changing the shop markup does not retroactively move existing
 * prices — repricing would be a separate, explicit operation.
 *
 * Pure and Mongoose-free so it can be unit-tested without a database.
 */

const DEFAULT_MARKUP_PERCENTAGE = 30;

const toMultiplier = (markupPercentage) => {
  // null and undefined mean "not configured" and must fall back to the default.
  // Number(null) is 0, which is finite — so an isFinite check alone would read a
  // null markup as a deliberate 0%, silently pricing every supply at cost.
  // An explicit 0 IS a real value and must survive.
  if (markupPercentage === null || markupPercentage === undefined) {
    return 1 + DEFAULT_MARKUP_PERCENTAGE / 100;
  }
  const markup = Number(markupPercentage);
  return 1 + (Number.isFinite(markup) ? markup : DEFAULT_MARKUP_PERCENTAGE) / 100;
};

// Plain toFixed rounding, deliberately matching InventoryItemForm.jsx,
// inventoryController.js and backfill-inventory-unit-pricing.js. It is not
// half-up correct for exact half-cents (4.005 rounds down, because the binary
// double is a hair below 4.005) — but the client computes the live preview with
// the same expression, and a server that rounded differently would disagree
// with the number the user just watched appear in the form.
const round2 = (n) => parseFloat(Number(n).toFixed(2));

/**
 * Retail price per stock unit.
 *
 * @param {number} cost - per purchase unit
 * @param {number} unitsPerPurchase - stock units in one purchase unit
 * @param {number} markupPercentage
 * @returns {number}
 */
const computePrice = (cost, unitsPerPurchase, markupPercentage) => {
  const c = Number(cost) || 0;
  const upp = Math.max(1, Number(unitsPerPurchase) || 1);
  return round2((c / upp) * toMultiplier(markupPercentage));
};

/**
 * Cost per purchase unit implied by a retail price — the inverse, for the
 * form's bidirectional cost<->price behaviour.
 *
 * @param {number} price - per stock unit
 * @param {number} unitsPerPurchase
 * @param {number} markupPercentage
 * @returns {number}
 */
const computeCost = (price, unitsPerPurchase, markupPercentage) => {
  const p = Number(price) || 0;
  const upp = Math.max(1, Number(unitsPerPurchase) || 1);
  return round2((p * upp) / toMultiplier(markupPercentage));
};

/**
 * Resolve the price to store for a create/update.
 *
 * An overridden price is taken verbatim — that item is detached from the calc
 * by the user's explicit choice, and silently recomputing it would undo their
 * edit on the next save.
 *
 * @param {object} data - { cost, price, unitsPerPurchase, priceOverridden }
 * @param {number} markupPercentage
 * @returns {number}
 */
const resolvePrice = (data, markupPercentage) => {
  if (data.priceOverridden) return round2(Number(data.price) || 0);
  return computePrice(data.cost, data.unitsPerPurchase, markupPercentage);
};

module.exports = {
  DEFAULT_MARKUP_PERCENTAGE,
  computePrice,
  computeCost,
  resolvePrice
};
