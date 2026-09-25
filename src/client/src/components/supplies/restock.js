/**
 * When an item needs buying, and how much of it.
 *
 * One home for these, because the same judgement is made in four places — the
 * red quantity in QohEditor, the "reorder at" note on the supplies list, the
 * server's `stock=low` filter, and the Order Stock page — and three of them
 * drifting from the fourth would look exactly like working software.
 *
 * `isLow` mirrors the server's LOW_STOCK_EXPR in supplyService. Change one and
 * you must change the other; supplyStockFilter.test.js pins that side.
 */

/**
 * Needs restocking: AT or below the reorder point, not strictly below.
 *
 * A reorder point is the level you buy AT, so an item sitting exactly on it is
 * already on the list. An item with a reorder point of 0 therefore only
 * qualifies once it hits zero, which is the honest reading of "don't track this
 * one until it runs out".
 */
export const isLow = (supply) => (
  (supply?.quantityOnHand ?? 0) <= (supply?.reorderPoint ?? 0)
);

/** Out entirely — the urgent subset of low. */
export const isOut = (supply) => (supply?.quantityOnHand ?? 0) <= 0;

/** How far below the reorder point, in STOCK units. Never negative. */
export const shortfall = (supply) => Math.max(
  (supply?.reorderPoint ?? 0) - (supply?.quantityOnHand ?? 0),
  0
);

/**
 * How many PURCHASE units to buy to clear the shortfall.
 *
 * Two things the naive subtraction gets wrong:
 *
 * 1. You buy whole packages. A 3-quart gap on a 5-quart jug is one jug, not
 *    0.6 of one — hence the ceiling, against `unitsPerPurchase`.
 * 2. At least one, always. An item sitting exactly ON its reorder point has a
 *    shortfall of zero but is still on the list, and "buy 0" is not advice.
 */
export const purchaseUnitsNeeded = (supply) => {
  const perPurchase = Math.max(supply?.unitsPerPurchase || 1, 1);
  return Math.max(1, Math.ceil(shortfall(supply) / perPurchase));
};

/** What the suggested quantity is expected to cost, at last known cost. */
export const estimatedCost = (supply) => purchaseUnitsNeeded(supply) * (supply?.cost || 0);
