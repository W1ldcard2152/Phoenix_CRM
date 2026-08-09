/**
 * Compose a supply's display name from the facts already recorded about it.
 *
 * "Mobil 1 5W-30 Engine Oil" is not a name — it is a brand, a measurement, and
 * a tag, concatenated by hand. Typing it means storing those facts twice, and
 * the hand-typed copy is the one that goes stale when the brand is renamed or
 * the viscosity corrected. So the name is derived, and what the user types is
 * only the part that ISN'T derivable: the qualifier.
 *
 *     Brand  PartNumber  Measurements  Noun  (Qualifier)
 *     Mobil 1            5W-30         Engine Oil  (full synthetic, dexos-d)
 *     Bosch  3330                      Oil Filter  (pre-filled with oil)
 *
 * Derived at read time and never stored. Storing it would reintroduce exactly
 * the drift this removes — and would mean a brand rename needed a cascade,
 * which is the machinery the vocab-as-references design exists to avoid.
 *
 * Pure and Mongoose-free so it can be unit-tested without a database.
 */

/**
 * The noun for a tag. Leaf names in the tree are written to read in CONTEXT
 * ("Oil" under Service Parts > Filters), so many don't stand alone. `noun`
 * carries the standalone phrase where they differ.
 */
const nounForTag = (tag) => {
  if (!tag) return '';
  return (tag.noun && tag.noun.trim()) || tag.name || '';
};

/**
 * Measurement values in field order, with units appended.
 * e.g. { grit: '220', diameter: '6' } -> ['220', '6in']
 */
const measurementParts = (attributes, fields) => {
  if (!attributes) return [];

  const get = (key) => (typeof attributes.get === 'function'
    ? attributes.get(key)
    : attributes[key]);

  return (fields || [])
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((field) => {
      const raw = get(field.key);
      if (raw === undefined || raw === null || String(raw).trim() === '') return null;
      const value = String(raw).trim();
      // Don't double up when the user already typed the unit ("6in", "18mm").
      const hasUnit = field.unit && value.toLowerCase().endsWith(field.unit.toLowerCase());
      return field.unit && !hasUnit ? `${value}${field.unit}` : value;
    })
    .filter(Boolean);
};

/**
 * @param {object} supply - { name, qualifier, partNumber, attributes }
 * @param {object} ctx
 * @param {string} ctx.brandLabel   - resolved brand label, or ''
 * @param {object} ctx.primaryTag   - the primary tag document, or null
 * @param {Array}  ctx.fields       - SupplyField docs applying to this item
 * @returns {string}
 */
const composeDisplayName = (supply, ctx = {}) => {
  if (!supply) return '';

  // An explicit name wins outright. Some things genuinely have a name rather
  // than a description — and every item imported from the old inventory
  // arrives with one, so this is also what keeps them readable before anyone
  // has triaged them.
  const explicit = (supply.name || '').trim();
  if (explicit) return appendQualifier(explicit, supply.qualifier);

  const parts = [
    (ctx.brandLabel || '').trim(),
    (supply.partNumber || '').trim(),
    ...measurementParts(supply.attributes, ctx.fields),
    nounForTag(ctx.primaryTag)
  ].filter(Boolean);

  if (parts.length === 0) return appendQualifier('Untitled supply', supply.qualifier);

  return appendQualifier(parts.join(' '), supply.qualifier);
};

const appendQualifier = (base, qualifier) => {
  const q = (qualifier || '').trim();
  return q ? `${base} (${q})` : base;
};

/**
 * Can this item produce a name at all? Used to reject a save that would leave
 * an item with nothing to call it — better caught at the boundary than
 * discovered as "Untitled supply" in the list.
 */
const canComposeName = (supply, ctx = {}) => {
  if ((supply.name || '').trim()) return true;
  const parts = [
    (ctx.brandLabel || '').trim(),
    (supply.partNumber || '').trim(),
    nounForTag(ctx.primaryTag)
  ].filter(Boolean);
  return parts.length > 0;
};

module.exports = { composeDisplayName, canComposeName, nounForTag, measurementParts };
