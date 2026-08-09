/**
 * Client-side helpers for the supply tag tree.
 *
 * The API serves a flat array plus parent ids and the client builds the tree —
 * the whole tree is ~100 nodes, so shipping it whole and shaping it here is
 * cheaper than any server-side nesting, and it keeps the descendant walk
 * available for instant filtering without a round trip.
 */

export const idOf = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v._id !== undefined) return String(v._id);
  return String(v);
};

/** Index a flat tag array by string id. */
export const indexTags = (flat = []) => {
  const map = {};
  flat.forEach((t) => { map[idOf(t._id)] = t; });
  return map;
};

/** Build the nested tree. Nodes with a missing parent surface as roots. */
export const buildTree = (flat = []) => {
  const nodes = {};
  flat.forEach((t) => { nodes[idOf(t._id)] = { ...t, children: [] }; });

  const roots = [];
  Object.values(nodes).forEach((node) => {
    const parent = node.parent ? nodes[idOf(node.parent)] : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const sortRec = (list) => {
    list.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);

  return roots;
};

/** Ancestors nearest-last, e.g. ['Refinish & Body', 'Masking'] for Tape. */
export const ancestorNames = (tagId, byId) => {
  const out = [];
  let current = byId[idOf(tagId)];
  const seen = new Set();
  while (current && current.parent) {
    const parentId = idOf(current.parent);
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId[parentId];
    if (!parent) break;
    out.unshift(parent.name);
    current = parent;
  }
  return out;
};

/** "Refinish & Body › Masking › Tape" — the path is what disambiguates a leaf. */
export const tagPath = (tagId, byId) => {
  const tag = byId[idOf(tagId)];
  if (!tag) return '';
  return [...ancestorNames(tagId, byId), tag.name].join(' › ');
};

/** A tag plus every descendant. Mirrors the server's collectDescendantIds. */
export const descendantIds = (rootId, flat = []) => {
  const start = idOf(rootId);
  if (!start) return [];

  const childrenOf = {};
  flat.forEach((t) => {
    const p = idOf(t.parent);
    if (!p) return;
    (childrenOf[p] = childrenOf[p] || []).push(idOf(t._id));
  });

  const out = [];
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);
    (childrenOf[current] || []).forEach((c) => queue.push(c));
  }
  return out;
};
