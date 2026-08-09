/**
 * Display-name composition. Pure — no database. See §9.2.
 */
const { composeDisplayName, canComposeName, nounForTag } = require('../../utils/supplyNaming');

const engineOil = { name: 'Engine Oil' };
const oilFilter = { name: 'Oil', noun: 'Oil Filter' };
const viscosity = { key: 'viscosity', sortOrder: 10 };
const grit = { key: 'grit', sortOrder: 60 };
const diameter = { key: 'diameter', unit: 'in', sortOrder: 70 };

describe('nounForTag', () => {
  it('prefers the standalone noun', () => {
    expect(nounForTag(oilFilter)).toBe('Oil Filter');
  });

  it('falls back to the tree name when no noun is set', () => {
    expect(nounForTag(engineOil)).toBe('Engine Oil');
  });

  it('is empty for a missing tag rather than throwing', () => {
    expect(nounForTag(null)).toBe('');
  });
});

describe('composeDisplayName', () => {
  it('composes brand + measurement + noun + qualifier', () => {
    expect(composeDisplayName(
      { attributes: { viscosity: '5W-30' }, qualifier: 'full synthetic, dexos-d' },
      { brandLabel: 'Mobil 1', primaryTag: engineOil, fields: [viscosity] }
    )).toBe('Mobil 1 5W-30 Engine Oil (full synthetic, dexos-d)');
  });

  it('composes brand + part number + noun', () => {
    expect(composeDisplayName(
      { partNumber: '3330', qualifier: 'pre-filled with oil' },
      { brandLabel: 'Bosch', primaryTag: oilFilter, fields: [] }
    )).toBe('Bosch 3330 Oil Filter (pre-filled with oil)');
  });

  it('omits the parenthetical entirely when there is no qualifier', () => {
    expect(composeDisplayName(
      { partNumber: '3330' },
      { brandLabel: 'Bosch', primaryTag: oilFilter, fields: [] }
    )).toBe('Bosch 3330 Oil Filter');
  });

  it('orders measurements by field sortOrder, not object key order', () => {
    expect(composeDisplayName(
      { attributes: { diameter: '6', grit: '220' } },
      { brandLabel: '', primaryTag: { name: 'Sanding Disc' }, fields: [diameter, grit] }
    )).toBe('220 6in Sanding Disc');
  });

  it('appends the unit, but not twice when the user typed it', () => {
    expect(composeDisplayName(
      { attributes: { diameter: '6in' } },
      { primaryTag: { name: 'Disc' }, fields: [diameter] }
    )).toBe('6in Disc');
  });

  it('skips blank measurements rather than leaving gaps', () => {
    expect(composeDisplayName(
      { attributes: { viscosity: '', grit: '220' } },
      { brandLabel: '3M', primaryTag: { name: 'Disc' }, fields: [viscosity, grit] }
    )).toBe('3M 220 Disc');
  });

  it('reads a Mongoose Map as readily as a plain object', () => {
    expect(composeDisplayName(
      { attributes: new Map([['viscosity', '5W-30']]) },
      { brandLabel: 'Mobil 1', primaryTag: engineOil, fields: [viscosity] }
    )).toBe('Mobil 1 5W-30 Engine Oil');
  });

  it('lets an explicit name override composition entirely', () => {
    expect(composeDisplayName(
      { name: 'Shop Towels', partNumber: '3330' },
      { brandLabel: 'Bosch', primaryTag: oilFilter, fields: [] }
    )).toBe('Shop Towels');
  });

  it('still appends the qualifier to an explicit name', () => {
    expect(composeDisplayName(
      { name: 'Shop Towels', qualifier: 'blue, 200ct' }, {}
    )).toBe('Shop Towels (blue, 200ct)');
  });

  it('composes from a tag alone', () => {
    // An imported item, tagged but with nothing else filled in yet.
    expect(composeDisplayName({}, { primaryTag: engineOil, fields: [] })).toBe('Engine Oil');
  });

  it('degrades to a visible placeholder rather than an empty string', () => {
    // Should be unreachable — canComposeName gates the write — but a blank row
    // in the list would be worse than an obviously wrong one.
    expect(composeDisplayName({}, {})).toBe('Untitled supply');
  });

  it('handles a null supply', () => {
    expect(composeDisplayName(null, {})).toBe('');
  });
});

describe('canComposeName', () => {
  it('accepts an explicit name', () => {
    expect(canComposeName({ name: 'Shop Towels' }, {})).toBe(true);
  });

  it('accepts a brand and a tag', () => {
    expect(canComposeName({}, { brandLabel: 'Bosch', primaryTag: oilFilter })).toBe(true);
  });

  it('accepts a part number alone', () => {
    expect(canComposeName({ partNumber: '3330' }, {})).toBe(true);
  });

  it('rejects an item with only a qualifier', () => {
    // "(pre-filled with oil)" is not a name.
    expect(canComposeName({ qualifier: 'pre-filled with oil' }, {})).toBe(false);
  });

  it('rejects an item with only measurements', () => {
    // Measurements alone can't identify an item, and an untagged item has no
    // fields anyway — this is the state the import leaves rows in.
    expect(canComposeName({ attributes: { viscosity: '5W-30' } }, {})).toBe(false);
  });

  it('treats whitespace as absent', () => {
    expect(canComposeName({ name: '   ' }, {})).toBe(false);
  });
});
