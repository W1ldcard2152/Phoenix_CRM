const SupplyTag = require('../models/SupplyTag');
const cacheService = require('./cacheService');
const { idOf, collectDescendantIds } = require('../utils/supplyRules');

/**
 * Read access to the shop-supplies tag tree.
 *
 * The tree is ~100 nodes and changes only when an admin edits it, so it's held
 * in memory and invalidated explicitly on every mutation. The app runs as a
 * single process ("start": "node server.js" — no PM2, no cluster, no Docker),
 * which is what makes explicit invalidation sufficient. If cluster mode is ever
 * adopted, every worker would serve a stale tree after any mutation and a short
 * TTL becomes mandatory rather than a safety net. The TTL below is that safety
 * net, not the mechanism.
 *
 * DESCENDANT RESOLUTION HAPPENS IN MEMORY. No closure table, no $graphLookup,
 * no materialized ancestors on items. Query shape is always
 * `find({ tags: { $in: descendantIds } })` against the multikey index. Because
 * ancestors are never stored on items, nothing can drift when a tag is
 * reparented — the whole class of bug is designed out.
 */

const CACHE_KEY = 'supplytags:flat';
const CACHE_TTL = 600; // seconds; belt-and-braces behind explicit invalidation

/**
 * The whole tree as a flat array, cached.
 * @returns {Promise<Array>} [{ _id, name, slug, parent, sortOrder, kind, notes }]
 */
const getFlat = async () => {
  const cached = cacheService.get(CACHE_KEY);
  if (cached) return cached;

  const tags = await SupplyTag.find({}, '_id name slug parent sortOrder kind notes')
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  cacheService.set(CACHE_KEY, tags, CACHE_TTL);
  return tags;
};

/**
 * The tree, nested. Children are ordered by sortOrder then name (inherited from
 * the flat query's sort).
 *
 * Built fresh on each call rather than cached nested, so callers can't mutate a
 * shared structure — node-cache runs with useClones:false in this app.
 *
 * @returns {Promise<Array>} top-level nodes, each with a `children` array
 */
const getTree = async () => {
  const flat = await getFlat();

  const byId = new Map();
  flat.forEach((t) => {
    byId.set(String(t._id), { ...t, children: [] });
  });

  const roots = [];
  byId.forEach((node) => {
    const parentId = idOf(node.parent);
    const parent = parentId ? byId.get(parentId) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      // A node whose parent is missing surfaces as a root rather than
      // disappearing. Losing it silently would be worse than showing it adrift.
      roots.push(node);
    }
  });

  return roots;
};

/**
 * A tag plus every descendant, for subtree filtering.
 *
 * @param {string} idOrSlug - accepts either, so URLs can carry readable slugs
 * @returns {Promise<string[]>} ids, root first; empty if the tag doesn't exist
 */
const getDescendantIds = async (idOrSlug) => {
  if (!idOrSlug) return [];

  const flat = await getFlat();
  const key = String(idOrSlug);

  const match = flat.find((t) => String(t._id) === key)
    || flat.find((t) => t.slug === key.toLowerCase());

  if (!match) return [];

  return collectDescendantIds(match._id, flat);
};

/**
 * Resolve a slug to its tag document (from cache).
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
const getBySlug = async (slug) => {
  if (!slug) return null;
  const flat = await getFlat();
  return flat.find((t) => t.slug === String(slug).toLowerCase()) || null;
};

/**
 * Drop the cached tree. Call after ANY tag mutation — create, rename, reparent,
 * reorder, delete.
 */
const invalidate = () => {
  cacheService.invalidateByPattern('supplytags:');
};

module.exports = {
  getFlat,
  getTree,
  getDescendantIds,
  getBySlug,
  invalidate
};
