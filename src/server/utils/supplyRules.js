/**
 * Pure rules for the shop-supplies tag tree.
 *
 * Deliberately free of any Mongoose import: every function here takes plain
 * objects and returns plain results, so the rules can be unit-tested without a
 * database (the server test harness mocks all models — see
 * docs/shop-supplies-module.md §9.1).
 *
 * Ids are compared as strings throughout. Callers may pass ObjectIds, strings,
 * or populated documents interchangeably.
 */

// Depth ceiling, counting judgment ancestors only. Phase 2 derived leaves are
// allowed to sit below this — see §3.1.
const MAX_JUDGMENT_TIERS = 3;

// Cycle guard for parent walks. The tree is ~100 nodes across 3 tiers; anything
// approaching this is a corrupted chain, not a legitimately deep branch.
const MAX_WALK = 64;

/**
 * Normalize anything id-shaped to a string.
 * Handles ObjectId, string, and populated docs ({ _id }).
 */
const idOf = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v._id !== undefined) return String(v._id);
  return String(v);
};

/**
 * Index an array of nodes by string id.
 * @param {Array} nodes - [{ _id, parent, kind }]
 * @returns {Map<string, object>}
 */
const indexById = (nodes) => {
  const map = new Map();
  (nodes || []).forEach((n) => {
    const key = idOf(n && n._id);
    if (key) map.set(key, n);
  });
  return map;
};

/**
 * Walk from a node up to the root, yielding ancestors nearest-first.
 * Excludes the node itself. Terminates on a missing parent, a repeat visit
 * (cycle), or MAX_WALK hops.
 *
 * @param {*} nodeId
 * @param {Map<string, object>} nodeById
 * @returns {{ chain: Array, cycle: boolean }}
 */
const ancestorChain = (nodeId, nodeById) => {
  const chain = [];
  const seen = new Set();
  let currentId = idOf(nodeId);
  if (currentId) seen.add(currentId);

  for (let hops = 0; hops < MAX_WALK; hops += 1) {
    const node = nodeById.get(currentId);
    const parentId = idOf(node && node.parent);
    if (!parentId) return { chain, cycle: false };
    if (seen.has(parentId)) return { chain, cycle: true };

    seen.add(parentId);
    const parent = nodeById.get(parentId);
    // An unresolvable parent means a partial map, not a cycle. Stop cleanly and
    // let the caller decide — the depth check treats it as "cannot prove a
    // violation" rather than inventing one.
    if (!parent) return { chain, cycle: false, unresolved: parentId };

    chain.push(parent);
    currentId = parentId;
  }

  return { chain, cycle: true };
};

/**
 * How many judgment-kind ancestors a node has. Derived ancestors don't count —
 * the ceiling is about how deep a human-maintained judgment hierarchy goes, and
 * Phase 2 derived nodes are computed, not maintained.
 *
 * @param {*} nodeId
 * @param {Map<string, object>} nodeById
 * @returns {number}
 */
const judgmentAncestorCount = (nodeId, nodeById) => {
  const { chain } = ancestorChain(nodeId, nodeById);
  return chain.filter((n) => (n.kind || 'judgment') === 'judgment').length;
};

/**
 * Validate a node's placement in the tree.
 *
 * @param {object} node - { _id, parent, kind }
 * @param {Map<string, object>} nodeById - must contain `node` itself
 * @returns {{ ok: boolean, error?: string }}
 */
const validateTagPlacement = (node, nodeById) => {
  const selfId = idOf(node && node._id);
  const parentId = idOf(node && node.parent);

  if (parentId && selfId && parentId === selfId) {
    return { ok: false, error: 'A tag cannot be its own parent.' };
  }

  const { chain, cycle } = ancestorChain(selfId, nodeById);
  if (cycle) {
    return { ok: false, error: 'That parent would create a cycle in the tag tree.' };
  }

  const kind = (node && node.kind) || 'judgment';
  if (kind !== 'judgment') return { ok: true };

  const judgmentAncestors = chain.filter((n) => (n.kind || 'judgment') === 'judgment').length;
  if (judgmentAncestors >= MAX_JUDGMENT_TIERS) {
    return {
      ok: false,
      error: `Judgment tags may be at most ${MAX_JUDGMENT_TIERS} tiers deep; this would be tier ${judgmentAncestors + 1}. `
        + 'If this distinction is a measurement rather than a judgment, it belongs in a field, not a tag.'
    };
  }

  return { ok: true };
};

/**
 * Validate a node's placement AND its whole subtree's.
 *
 * validateTagPlacement alone is not enough for a reparent: moving a tier-1
 * branch that already has two tiers beneath it under a tier-2 node leaves the
 * moved node itself legal at tier 3 while silently pushing its leaves to tier
 * 5. Reparenting is precisely what the tag manager exists to do, so the depth
 * ceiling has to be checked against everything that moves, not just the node
 * the user grabbed.
 *
 * @param {object} node - { _id, parent, kind }, carrying the PENDING parent
 * @param {Map<string, object>} nodeById - must already reflect the pending state
 * @returns {{ ok: boolean, error?: string }}
 */
const validateSubtreePlacement = (node, nodeById) => {
  const own = validateTagPlacement(node, nodeById);
  if (!own.ok) return own;

  const allNodes = Array.from(nodeById.values());
  const selfId = idOf(node && node._id);
  const descendantIds = collectDescendantIds(selfId, allNodes);

  for (const descendantId of descendantIds) {
    if (descendantId === selfId) continue;
    const descendant = nodeById.get(descendantId);
    if (!descendant) continue;
    if ((descendant.kind || 'judgment') !== 'judgment') continue;

    const depth = judgmentAncestorCount(descendantId, nodeById) + 1;
    if (depth > MAX_JUDGMENT_TIERS) {
      return {
        ok: false,
        error: `That move would push "${descendant.name || descendantId}" to judgment tier ${depth}, `
          + `past the ${MAX_JUDGMENT_TIERS}-tier ceiling. Move or flatten the branch below it first.`
      };
    }
  }

  return { ok: true };
};

/**
 * Every descendant of `rootId`, inclusive of the root itself.
 * Cycle-safe: a node is expanded at most once.
 *
 * @param {*} rootId
 * @param {Array} nodes - [{ _id, parent }] — the whole tree
 * @returns {string[]} ids, root first
 */
const collectDescendantIds = (rootId, nodes) => {
  const start = idOf(rootId);
  if (!start) return [];

  const childrenByParent = new Map();
  (nodes || []).forEach((n) => {
    const parentId = idOf(n && n.parent);
    if (!parentId) return;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(idOf(n._id));
  });

  const out = [];
  const seen = new Set();
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);
    const children = childrenByParent.get(current);
    if (children) children.forEach((c) => { if (!seen.has(c)) queue.push(c); });
  }

  return out;
};

/**
 * The tag invariant (§6a).
 *
 * Two strengths, deliberately:
 *   strict (default) — the application rule. Also rejects tags-without-primary,
 *     because such an item is invisible to every rollup.
 *   permissive       — mirrors the collection validator. Only checks that a set
 *     primaryTag appears in tags, so `{ tags: [], primaryTag: null }` (the
 *     normal state of every imported item) passes.
 *
 * Never auto-promotes a survivor to primary — see §6a for why.
 *
 * @param {Array} tags
 * @param {*} primaryTag
 * @param {{ strict?: boolean }} [options]
 * @returns {{ ok: boolean, code?: string, error?: string }}
 */
const validateTagAssignment = (tags, primaryTag, options = {}) => {
  const { strict = true } = options;

  const tagIds = (tags || []).map(idOf).filter(Boolean);
  const primaryId = idOf(primaryTag);

  if (primaryId && !tagIds.includes(primaryId)) {
    return {
      ok: false,
      code: 'PRIMARY_NOT_IN_TAGS',
      error: 'The primary tag must also be present in the item\'s tags.'
    };
  }

  if (strict && tagIds.length > 0 && !primaryId) {
    return {
      ok: false,
      code: 'MISSING_PRIMARY',
      error: 'A tagged item needs a primary tag — pick which one is its canonical home.'
    };
  }

  return { ok: true };
};

/**
 * Compute what a bulk tag change would do to each item, and which items it
 * would break.
 *
 * PATCH /bulk must preflight the WHOLE batch before writing anything (§6a).
 * Failing on the first offender leaves the user guessing which of forty
 * selected rows was the problem; applying partially is worse still, because
 * half the batch silently succeeded. So this returns every violation at once
 * and the caller writes nothing unless the list is empty.
 *
 * Pure — takes plain item states, does no I/O.
 *
 * @param {Array} items - [{ _id, name, tags, primaryTag }]
 * @param {object} set - { addTags?, removeTags?, primaryTag? }
 * @returns {{ results: Array, violations: Array }}
 */
const previewBulkTagChanges = (items, set = {}) => {
  const addTags = (set.addTags || []).map(idOf).filter(Boolean);
  const removeTags = new Set((set.removeTags || []).map(idOf).filter(Boolean));
  // `primaryTag` present but null is an explicit "clear it"; absent means
  // "leave it alone". Those are different intents and must not collapse.
  const primaryTagProvided = Object.prototype.hasOwnProperty.call(set, 'primaryTag');
  const nextPrimaryProvided = primaryTagProvided ? idOf(set.primaryTag) : undefined;

  const results = [];
  const violations = [];

  (items || []).forEach((item) => {
    const currentTags = (item.tags || []).map(idOf).filter(Boolean);
    const kept = currentTags.filter((t) => !removeTags.has(t));
    const nextTags = Array.from(new Set([...kept, ...addTags]));

    const currentPrimary = idOf(item.primaryTag);
    let nextPrimary = primaryTagProvided ? nextPrimaryProvided : currentPrimary;

    // A removed tag that was the primary orphans it. Never auto-promote a
    // survivor — array order would silently decide the canonical home.
    if (!primaryTagProvided && currentPrimary && removeTags.has(currentPrimary)) {
      nextPrimary = null;
    }

    const check = validateTagAssignment(nextTags, nextPrimary);
    if (!check.ok) {
      violations.push({
        _id: idOf(item._id),
        name: item.name || '',
        code: check.code,
        error: check.error
      });
      return;
    }

    results.push({ _id: idOf(item._id), tags: nextTags, primaryTag: nextPrimary });
  });

  return { results, violations };
};

module.exports = {
  MAX_JUDGMENT_TIERS,
  idOf,
  indexById,
  ancestorChain,
  judgmentAncestorCount,
  validateTagPlacement,
  validateSubtreePlacement,
  collectDescendantIds,
  validateTagAssignment,
  previewBulkTagChanges
};
