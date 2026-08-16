/**
 * Pricing for shop supplies. Pure — no database. See §9.2.
 *
 * The invariant these lock down:
 *   price = (cost / unitsPerPurchase) * (1 + markupPercentage / 100)
 *
 * markupPercentage is a PERCENTAGE (Settings.partMarkupPercentage, default 30),
 * not a fraction. Treating it as a fraction yields a 31x markup, which is the
 * specific mistake these tests exist to catch.
 */

const {
  DEFAULT_MARKUP_PERCENTAGE,
  computePrice,
  computeCost,
  resolvePrice
} = require('../../utils/supplyPricing');

describe('computePrice', () => {
  it('applies markup as a percentage, not a fraction', () => {
    // $10 at 30% is $13.00 — NOT $110.
    expect(computePrice(10, 1, 30)).toBe(13);
  });

  it('divides cost by units per purchase to get a per-stock-unit price', () => {
    // A $25 five-quart jug at 30% is $6.50 per quart.
    expect(computePrice(25, 5, 30)).toBe(6.5);
  });

  it('rounds to two decimals', () => {
    expect(computePrice(9.99, 3, 30)).toBe(4.33);
  });

  it('treats a missing or invalid unitsPerPurchase as 1 rather than dividing by zero', () => {
    expect(computePrice(10, 0, 30)).toBe(13);
    expect(computePrice(10, undefined, 30)).toBe(13);
    expect(computePrice(10, 'nonsense', 30)).toBe(13);
  });

  it('handles zero cost', () => {
    expect(computePrice(0, 5, 30)).toBe(0);
  });

  it('falls back to the default markup when it is missing or unusable', () => {
    expect(computePrice(10, 1, undefined)).toBe(13);
    expect(computePrice(10, 1, null)).toBe(13);
    expect(DEFAULT_MARKUP_PERCENTAGE).toBe(30);
  });

  it('accepts a zero markup as a real value, not a missing one', () => {
    // 0 is falsy — a `markup || 30` fallback would silently mark up at 30%.
    expect(computePrice(10, 1, 0)).toBe(10);
  });
});

describe('computeCost', () => {
  it('inverts computePrice', () => {
    expect(computeCost(6.5, 5, 30)).toBe(25);
    expect(computeCost(13, 1, 30)).toBe(10);
  });
});

describe('resolvePrice', () => {
  it('computes from cost when the price is not overridden', () => {
    expect(resolvePrice({ cost: 25, unitsPerPurchase: 5, price: 999 }, 30)).toBe(6.5);
  });

  it('takes an overridden price verbatim', () => {
    // Recomputing here would silently undo the user's edit on their next save.
    expect(resolvePrice({
      cost: 25, unitsPerPurchase: 5, price: 9.99, priceOverridden: true
    }, 30)).toBe(9.99);
  });

  it('rounds an overridden price to two decimals', () => {
    expect(resolvePrice({ price: 4.129, priceOverridden: true }, 30)).toBe(4.13);
  });

  it('rounds exact half-cents down, matching the client and the old inventory', () => {
    // (4.005).toFixed(2) is "4.00" — the binary double sits a hair below the
    // decimal literal. Asserting 4.01 would be asserting arithmetic JS doesn't
    // do here. What matters more than half-up correctness is that the server
    // agrees with InventoryItemForm and the existing inventory code, which all
    // round the same way; a server that disagreed would overwrite the number
    // the user just watched compute in the form.
    expect(resolvePrice({ price: 4.005, priceOverridden: true }, 30)).toBe(4);
  });
});
