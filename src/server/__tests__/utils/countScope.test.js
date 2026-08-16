const { scopeToQuery, normalizeScope } = require('../../services/supplyCountService');

/**
 * Scope normalization.
 *
 * A count's scope makes two round trips through different shapes: a plain
 * object from the request body, and a Mongoose document (with `attributes` as a
 * Map) when a saved scope is re-run. Both have to produce the same query, and
 * the Map case fails SILENTLY when handled wrong — Object.entries on a Map
 * returns an empty array rather than throwing, so a re-run scope would quietly
 * count more items than it was asked to.
 */

describe('scopeToQuery', () => {
  it('reads attributes from a plain object', () => {
    const q = scopeToQuery({ attributes: { grit: ['220', '320'] } });
    expect(q.attr).toEqual({ grit: ['220', '320'] });
  });

  it('reads attributes from a Map, as a stored scope supplies them', () => {
    const q = scopeToQuery({ attributes: new Map([['viscosity', ['5W-30']]]) });
    expect(q.attr).toEqual({ viscosity: ['5W-30'] });
  });

  it('passes reference filters through as lists', () => {
    const q = scopeToQuery({ brand: ['b1', 'b2'], locationPrefix: ['Stock Room 1-C'] });
    expect(q.brand).toEqual(['b1', 'b2']);
    expect(q.locationPrefix).toEqual(['Stock Room 1-C']);
  });

  it('omits empty filters entirely rather than sending blanks', () => {
    // An empty array must mean "no constraint". Sending `brand: []` would match
    // nothing, turning an unset filter into an empty count.
    const q = scopeToQuery({ brand: [], vendor: '', tag: null, attributes: { grit: [] } });
    expect(q).toEqual({});
  });

  it('accepts a single value where a list is allowed', () => {
    expect(scopeToQuery({ tag: 't1' }).tag).toEqual(['t1']);
  });
});

describe('normalizeScope', () => {
  it('fills every field so a partial scope is still well-formed', () => {
    expect(normalizeScope({})).toEqual({
      tag: [], brand: [], vendor: [], form: [], location: [],
      locationPrefix: [], attributes: {}
    });
  });

  it('trims location prefixes and drops blank ones', () => {
    const s = normalizeScope({ locationPrefix: ['  Stock Room 1-C  ', '', '   '] });
    expect(s.locationPrefix).toEqual(['Stock Room 1-C']);
  });

  it('lowercases attribute keys to match the field registry', () => {
    const s = normalizeScope({ attributes: { Viscosity: ['5W-30'] } });
    expect(s.attributes).toEqual({ viscosity: ['5W-30'] });
  });

  it('survives a Map round trip without losing the filters', () => {
    const stored = normalizeScope({ attributes: new Map([['grit', ['220']]]) });
    expect(stored.attributes).toEqual({ grit: ['220'] });
  });

  it('drops unknown fields rather than passing them to the query', () => {
    const s = normalizeScope({ tag: ['t1'], sneaky: 'value' });
    expect(s.sneaky).toBeUndefined();
  });
});
