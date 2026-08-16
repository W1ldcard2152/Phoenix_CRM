import { treeLabel } from './tagTree';

/**
 * Shelf codes, read as a hierarchy.
 *
 * Locations are stored as flat vocab strings with no structure - "Stock Room
 * 1-C-2" is one opaque value, and SupplyVocab is deliberate about that, because
 * it makes bulk re-coding a plain rename with no cascade. The levels live in the
 * naming convention instead, and this file is the one place that reads them.
 *
 * Nothing is stored or migrated: the tree is derived from whatever values exist
 * each time it is built, so a new "Stock Room 2-A-1" grows the tree the moment
 * it is created. If the convention is ever abandoned, deleting this file and the
 * `locationPrefix` filter restores exact-match behaviour with no data change.
 *
 * A value with no separators (say "Parts Washer Cabinet") is simply a top-level
 * leaf. It never disappears from the picker - it just has nothing beneath it.
 */

const SEPARATOR = '-';

/** "Stock Room 1-C-2" -> ["Stock Room 1", "C", "2"] */
export const locationSegments = (value) => String(value || '')
  .split(SEPARATOR)
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Build a nested tree of location nodes from vocab entries.
 *
 * Interior nodes are prefixes that may not exist as vocab entries in their own
 * right ("Stock Room 1" is a real place, but nothing is filed directly at it).
 * Leaf nodes carry the vocab `id` that supplies actually reference.
 *
 * @param {Array} entries - vocab rows: { _id, value, label, usageCount, isActive }
 * @returns {Array} nodes: { key, prefix, label, id, itemCount, children }
 */
export const buildLocationTree = (entries = []) => {
  const roots = [];
  const byPrefix = new Map();

  const usable = entries
    .filter((e) => e.fieldKey === 'location' && e.isActive !== false)
    .sort((a, b) => String(a.value).localeCompare(String(b.value), undefined, { numeric: true }));

  usable.forEach((entry) => {
    // Segment the LABEL, which carries the casing someone typed, but key nodes
    // on the lowercased form. createVocab stores `value` lowercased and `label`
    // as entered, so keying on the label directly would split "Stock Room 1"
    // and "stock room 1" into two roots. The server matches prefixes
    // case-insensitively, so the cased prefix still resolves correctly.
    const segments = locationSegments(entry.label || entry.value);
    if (segments.length === 0) return;

    let parentChildren = roots;
    let prefix = '';

    segments.forEach((segment, depth) => {
      prefix = depth === 0 ? segment : `${prefix}${SEPARATOR}${segment}`;
      const key = prefix.toLowerCase();

      let node = byPrefix.get(key);
      if (!node) {
        node = {
          key,
          prefix,
          // The bare segment ("C"), since the parent above it already says
          // which room you are in.
          label: segment,
          id: null,
          itemCount: 0,
          children: []
        };
        byPrefix.set(key, node);
        parentChildren.push(node);
      }

      // Every level counts the items beneath it, which is what makes picking a
      // room tell you how big the count will be before you start it.
      node.itemCount += entry.usageCount || 0;

      if (depth === segments.length - 1) node.id = String(entry._id);

      parentChildren = node.children;
    });
  });

  return roots;
};

/**
 * Flatten the tree into dropdown options, indented by depth.
 *
 * Option values are tagged with what they mean, because the two are different
 * queries: `id:<objectId>` filters on an exact shelf, `prefix:<text>` covers
 * everything beneath a level. Encoding it here keeps one dropdown instead of
 * separate "room" and "shelf" controls.
 */
export const locationOptions = (entries = [], { usedOnly = false } = {}) => {
  const out = [];

  const walk = (nodes, depth) => {
    nodes.forEach((node) => {
      if (!usedOnly || node.itemCount > 0) {
        const isLeaf = node.children.length === 0;
        out.push({
          value: isLeaf && node.id ? `id:${node.id}` : `prefix:${node.prefix}`,
          label: treeLabel(node.label, depth),
          sublabel: `${node.itemCount} item${node.itemCount === 1 ? '' : 's'}`,
          keywords: node.prefix
        });
      }
      walk(node.children, depth + 1);
    });
  };

  walk(buildLocationTree(entries), 0);
  return out;
};

/**
 * Turn a tagged option value into query params for listSupplies.
 * Returns {} for no selection, so it can be spread unconditionally.
 */
export const locationParams = (value) => {
  if (!value) return {};
  if (String(value).startsWith('prefix:')) return { locationPrefix: String(value).slice(7) };
  if (String(value).startsWith('id:')) return { location: String(value).slice(3) };
  // Bare ids remain valid, so a stored scope written before the prefix filter
  // existed still resolves.
  return { location: String(value) };
};

export default buildLocationTree;
