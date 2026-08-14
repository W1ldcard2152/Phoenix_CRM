const {
  isCounted,
  resolveCountEntry,
  resolveCountLine,
  summarizeCount,
  countProgress
} = require('../../utils/countRules');

/**
 * Pure unit tests — no DB, no mocks, matching supplyPricing.test.js.
 *
 * The behaviour under test is the one design decision the whole feature rests
 * on: a count posts a delta against live stock, not the counted figure.
 */

describe('isCounted', () => {
  it('treats a real zero as counted', () => {
    // The distinction that matters most: counted-zero (the shelf is empty) is
    // not the same as never-counted (nobody looked).
    expect(isCounted({ countedQuantity: 0 })).toBe(true);
  });

  it('treats null, undefined and empty string as not counted', () => {
    expect(isCounted({ countedQuantity: null })).toBe(false);
    expect(isCounted({ countedQuantity: undefined })).toBe(false);
    expect(isCounted({ countedQuantity: '' })).toBe(false);
    expect(isCounted({})).toBe(false);
    expect(isCounted(null)).toBe(false);
  });

  it('rejects values that are not numbers', () => {
    expect(isCounted({ countedQuantity: 'lots' })).toBe(false);
    expect(isCounted({ countedQuantity: NaN })).toBe(false);
  });
});

describe('resolveCountEntry', () => {
  // A 5qt jug: you count jugs, the system stores quarts.
  const JUG = 5;

  it('converts whole packages into stock units', () => {
    const { entry } = resolveCountEntry({ countedPackages: 3 }, JUG);
    expect(entry.countedQuantity).toBe(15);
  });

  it('adds loose stock units from an opened package', () => {
    // Two full jugs and three quarts sloshing in a third.
    const { entry } = resolveCountEntry({ countedPackages: 2, countedLoose: 3 }, JUG);
    expect(entry.countedQuantity).toBe(13);
  });

  it('handles loose stock with no full packages left', () => {
    const { entry } = resolveCountEntry({ countedPackages: 0, countedLoose: 2 }, JUG);
    expect(entry.countedQuantity).toBe(2);
  });

  it('treats an unpackaged item as a plain stock count', () => {
    const { entry } = resolveCountEntry({ countedPackages: 7 }, 1);
    expect(entry).toMatchObject({ countedQuantity: 7, countedPackages: 7, countedLoose: 0 });
  });

  it('splits a bare stock-unit total back into packages for display', () => {
    // 13 quarts is two jugs and three loose, and reopening the sheet should say
    // so rather than showing a number nobody wrote down.
    const { entry } = resolveCountEntry({ countedQuantity: 13 }, JUG);
    expect(entry).toMatchObject({ countedQuantity: 13, countedPackages: 2, countedLoose: 3 });
  });

  it('reads an empty entry as uncounted, not as zero', () => {
    expect(resolveCountEntry({}, JUG).entry).toBeNull();
    expect(resolveCountEntry({ countedQuantity: null }, JUG).entry).toBeNull();
    expect(resolveCountEntry({ countedPackages: '', countedLoose: '' }, JUG).entry).toBeNull();
  });

  it('reads an explicit zero as a real count of nothing', () => {
    // An empty shelf is a finding, and has to survive as one.
    const { entry } = resolveCountEntry({ countedPackages: 0 }, JUG);
    expect(entry).not.toBeNull();
    expect(entry.countedQuantity).toBe(0);
  });

  it('rejects negatives and non-numbers', () => {
    expect(resolveCountEntry({ countedPackages: -1 }, JUG).ok).toBe(false);
    expect(resolveCountEntry({ countedLoose: 'three' }, JUG).ok).toBe(false);
    expect(resolveCountEntry({ countedQuantity: -4 }, JUG).ok).toBe(false);
  });

  it('falls back to 1:1 when the packaging ratio is missing or nonsense', () => {
    expect(resolveCountEntry({ countedPackages: 4 }, 0).entry.countedQuantity).toBe(4);
    expect(resolveCountEntry({ countedPackages: 4 }, undefined).entry.countedQuantity).toBe(4);
  });
});

describe('resolveCountLine', () => {
  it('posts the difference when nothing moved during the count', () => {
    const r = resolveCountLine({ expectedQuantity: 8, countedQuantity: 6 }, 8);

    expect(r.variance).toBe(-2);
    expect(r.newQoh).toBe(6);
    expect(r.delta).toBe(-2);
    expect(r.shouldPost).toBe(true);
    expect(r.moved).toBe(false);
  });

  it('preserves consumption that happened mid-count', () => {
    // Expected 8, counted 6 on the shelf, and a tech pulled 2 for a job after
    // the sheet was cut. Both facts are real: the count found a shortage of 2,
    // AND two more legitimately left. Overwriting with the counted 6 would
    // erase the tech's consumption.
    const r = resolveCountLine({ expectedQuantity: 8, countedQuantity: 6 }, 6);

    expect(r.variance).toBe(-2);
    expect(r.newQoh).toBe(4);
    expect(r.delta).toBe(-2);
    expect(r.moved).toBe(true);
  });

  it('preserves a receipt that happened mid-count', () => {
    const r = resolveCountLine({ expectedQuantity: 4, countedQuantity: 4 }, 10);

    // Counted exactly what was expected, so there is no correction to make even
    // though stock has since gone up.
    expect(r.variance).toBe(0);
    expect(r.shouldPost).toBe(false);
    expect(r.moved).toBe(true);
    expect(r.newQoh).toBe(10);
  });

  it('writes nothing when the count matches', () => {
    const r = resolveCountLine({ expectedQuantity: 5, countedQuantity: 5 }, 5);

    expect(r.variance).toBe(0);
    expect(r.shouldPost).toBe(false);
    expect(r.delta).toBe(0);
  });

  it('flags a line whose delta would drive stock negative', () => {
    // Big drift: the count says two fewer than the eight expected, but stock is
    // already down to 1. Clamping at zero is right, but it must be visible —
    // the posted result no longer equals anything anyone counted.
    const r = resolveCountLine({ expectedQuantity: 8, countedQuantity: 6 }, 1);

    expect(r.variance).toBe(-2);
    expect(r.newQoh).toBe(0);
    expect(r.delta).toBe(-1);
    expect(r.clamped).toBe(true);
  });

  it('does not clamp a line that lands exactly on zero', () => {
    const r = resolveCountLine({ expectedQuantity: 3, countedQuantity: 0 }, 3);

    expect(r.newQoh).toBe(0);
    expect(r.clamped).toBe(false);
    expect(r.shouldPost).toBe(true);
  });

  it('posts nothing for an uncounted line', () => {
    const r = resolveCountLine({ expectedQuantity: 8, countedQuantity: null }, 8);

    expect(r.counted).toBeNull();
    expect(r.shouldPost).toBe(false);
    expect(r.delta).toBe(0);
    expect(r.newQoh).toBe(8);
  });

  it('counts a shelf found empty', () => {
    const r = resolveCountLine({ expectedQuantity: 6, countedQuantity: 0 }, 6);

    expect(r.variance).toBe(-6);
    expect(r.shouldPost).toBe(true);
    expect(r.newQoh).toBe(0);
  });
});

describe('summarizeCount', () => {
  const resolved = [
    { counted: 6, variance: -2, price: 9.2, moved: false, clamped: false },
    { counted: 7, variance: 1, price: 4.1, moved: false, clamped: false },
    { counted: 4, variance: 0, price: 3, moved: true, clamped: false },
    { counted: null, variance: 0, price: 5, moved: false, clamped: false }
  ];

  it('separates shortages, overages and untouched lines', () => {
    const s = summarizeCount(resolved);

    expect(s.lines).toBe(4);
    expect(s.counted).toBe(3);
    expect(s.uncounted).toBe(1);
    expect(s.variances).toBe(2);
    expect(s.shortages).toBe(1);
    expect(s.overages).toBe(1);
  });

  it('totals the value impact', () => {
    const s = summarizeCount(resolved);

    expect(s.netUnits).toBe(-1);
    expect(s.netValue).toBeCloseTo(-14.3, 2);
  });

  it('counts a moved line even when it had no variance', () => {
    expect(summarizeCount(resolved).moved).toBe(1);
  });

  it('handles an empty sheet', () => {
    expect(summarizeCount([])).toMatchObject({ lines: 0, counted: 0, netValue: 0 });
  });

  it('treats a missing price as zero without dropping the line', () => {
    const s = summarizeCount([{ counted: 1, variance: -1, moved: false, clamped: false }]);

    expect(s.variances).toBe(1);
    expect(s.netValue).toBe(0);
  });
});

describe('countProgress', () => {
  it('reports how much of the sheet is done', () => {
    const p = countProgress([
      { countedQuantity: 3 },
      { countedQuantity: 0 },
      { countedQuantity: null }
    ]);

    expect(p).toEqual({ total: 3, done: 2, remaining: 1, complete: false });
  });

  it('is complete only when every line carries a number', () => {
    expect(countProgress([{ countedQuantity: 1 }]).complete).toBe(true);
  });

  it('is not complete when there is nothing to count', () => {
    expect(countProgress([]).complete).toBe(false);
  });
});
