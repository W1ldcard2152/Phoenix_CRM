import { isLow, isOut, shortfall, purchaseUnitsNeeded, estimatedCost } from './restock';

/**
 * The restock maths behind the Order Stock page.
 *
 * The cases worth pinning are the boundaries, because every one of them is a
 * plausible off-by-one: at the reorder point (in, not out), at zero with a
 * reorder point of zero (in), and the "buy at least one" floor that stops an
 * item on its threshold being advised as "buy 0".
 */

const item = (over = {}) => ({
  quantityOnHand: 0,
  reorderPoint: 0,
  unitsPerPurchase: 1,
  cost: 0,
  ...over
});

describe('isLow', () => {
  it('counts an item sitting exactly ON its reorder point', () => {
    expect(isLow(item({ quantityOnHand: 4, reorderPoint: 4 }))).toBe(true);
  });

  it('leaves an item one above its reorder point alone', () => {
    expect(isLow(item({ quantityOnHand: 5, reorderPoint: 4 }))).toBe(false);
  });

  it('only flags an untracked item (reorder point 0) once it runs out', () => {
    expect(isLow(item({ quantityOnHand: 1, reorderPoint: 0 }))).toBe(false);
    expect(isLow(item({ quantityOnHand: 0, reorderPoint: 0 }))).toBe(true);
  });

  it('treats missing quantities as zero rather than throwing', () => {
    expect(isLow({})).toBe(true);
    expect(isLow(undefined)).toBe(true);
  });
});

describe('isOut', () => {
  it('is independent of the reorder point', () => {
    expect(isOut(item({ quantityOnHand: 0, reorderPoint: 12 }))).toBe(true);
    expect(isOut(item({ quantityOnHand: 1, reorderPoint: 12 }))).toBe(false);
  });
});

describe('shortfall', () => {
  it('measures the gap in stock units', () => {
    expect(shortfall(item({ quantityOnHand: 1, reorderPoint: 4 }))).toBe(3);
  });

  it('never goes negative for an item above its reorder point', () => {
    expect(shortfall(item({ quantityOnHand: 9, reorderPoint: 4 }))).toBe(0);
  });
});

describe('purchaseUnitsNeeded', () => {
  it('buys whole packages, rounding up', () => {
    // 3 quarts short, sold by the 5-quart jug: one jug.
    expect(purchaseUnitsNeeded(item({
      quantityOnHand: 1, reorderPoint: 4, unitsPerPurchase: 5
    }))).toBe(1);

    // 11 short, sold in boxes of 5: three boxes.
    expect(purchaseUnitsNeeded(item({
      quantityOnHand: 1, reorderPoint: 12, unitsPerPurchase: 5
    }))).toBe(3);
  });

  it('suggests at least one even with no shortfall to clear', () => {
    // Exactly on the reorder point: on the list, so "buy 0" would be useless.
    expect(purchaseUnitsNeeded(item({ quantityOnHand: 4, reorderPoint: 4 }))).toBe(1);
  });

  it('falls back to one stock unit per purchase when unitsPerPurchase is unset', () => {
    expect(purchaseUnitsNeeded({ quantityOnHand: 0, reorderPoint: 3 })).toBe(3);
  });

  it('does not divide by zero on a corrupt unitsPerPurchase', () => {
    expect(purchaseUnitsNeeded(item({
      quantityOnHand: 0, reorderPoint: 3, unitsPerPurchase: 0
    }))).toBe(3);
  });
});

describe('estimatedCost', () => {
  it('prices the suggested quantity at the per-purchase-unit cost', () => {
    expect(estimatedCost(item({
      quantityOnHand: 1, reorderPoint: 12, unitsPerPurchase: 5, cost: 20
    }))).toBe(60);
  });

  it('is zero for an item whose cost was never recorded', () => {
    expect(estimatedCost(item({ quantityOnHand: 0, reorderPoint: 3 }))).toBe(0);
  });
});
