/**
 * Unit tests for the shop-supplies tag rules.
 *
 * These are pure — no database, no model mocks. That's deliberate: the server
 * test harness mocks every Mongoose model and has no live connection, so the
 * load-bearing logic was extracted into a Mongoose-free module precisely so it
 * could be tested for real. See docs/shop-supplies-module.md §9.1-9.2.
 */

const mongoose = require('mongoose');
const {
  MAX_JUDGMENT_TIERS,
  idOf,
  indexById,
  validateTagPlacement,
  validateSubtreePlacement,
  collectDescendantIds,
  validateTagAssignment,
  previewBulkTagChanges,
  resolveFieldsForItem
} = require('../../utils/supplyRules');

const oid = () => new mongoose.Types.ObjectId();

describe('idOf', () => {
  it('normalizes ObjectIds, strings and populated docs to the same string', () => {
    const id = oid();
    expect(idOf(id)).toBe(String(id));
    expect(idOf(String(id))).toBe(String(id));
    expect(idOf({ _id: id, name: 'populated' })).toBe(String(id));
  });

  it('returns null for null and undefined', () => {
    expect(idOf(null)).toBeNull();
    expect(idOf(undefined)).toBeNull();
  });
});

describe('validateTagAssignment', () => {
  const a = oid();
  const b = oid();
  const c = oid();

  it('accepts the normal post-import state: no tags, no primary', () => {
    expect(validateTagAssignment([], null).ok).toBe(true);
  });

  it('accepts a primary that is present in tags', () => {
    expect(validateTagAssignment([a, b], a).ok).toBe(true);
  });

  it('rejects a primary that is absent from tags', () => {
    const result = validateTagAssignment([a, b], c);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PRIMARY_NOT_IN_TAGS');
  });

  it('rejects tags with no primary under the strict rule', () => {
    const result = validateTagAssignment([a, b], null);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('MISSING_PRIMARY');
  });

  it('allows tags with no primary under the permissive rule', () => {
    // Mirrors the collection validator, which must not reject the import's
    // own output.
    expect(validateTagAssignment([a, b], null, { strict: false }).ok).toBe(true);
  });

  it('rejects a primary with no tags at all', () => {
    const result = validateTagAssignment([], a);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PRIMARY_NOT_IN_TAGS');
  });

  it('compares by id value, not object identity', () => {
    // A PATCH body arrives as strings; the stored doc holds ObjectIds. If these
    // were compared by identity every update would look like an orphaning.
    expect(validateTagAssignment([String(a), String(b)], a).ok).toBe(true);
    expect(validateTagAssignment([a, b], String(a)).ok).toBe(true);
    expect(validateTagAssignment([{ _id: a }], String(a)).ok).toBe(true);
  });

  it('never auto-promotes a survivor to primary', () => {
    // The contract is "reject", not "repair" — promoting an arbitrary survivor
    // would let array order silently decide the canonical home.
    const result = validateTagAssignment([a, b], null);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('primaryTag');
  });
});

describe('tag tree placement', () => {
  // root
  //  └── mid          (judgment, tier 2)
  //       └── leaf    (judgment, tier 3 — the ceiling)
  let root;
  let mid;
  let leaf;
  let nodes;

  beforeEach(() => {
    root = { _id: oid(), parent: null, kind: 'judgment' };
    mid = { _id: oid(), parent: root._id, kind: 'judgment' };
    leaf = { _id: oid(), parent: mid._id, kind: 'judgment' };
    nodes = [root, mid, leaf];
  });

  it('allows judgment nodes up to the ceiling', () => {
    const byId = indexById(nodes);
    expect(validateTagPlacement(root, byId).ok).toBe(true);
    expect(validateTagPlacement(mid, byId).ok).toBe(true);
    expect(validateTagPlacement(leaf, byId).ok).toBe(true);
  });

  it('rejects a 4th judgment tier', () => {
    const tooDeep = { _id: oid(), parent: leaf._id, kind: 'judgment' };
    const byId = indexById([...nodes, tooDeep]);

    const result = validateTagPlacement(tooDeep, byId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tier 4/);
  });

  it('allows a derived node at tier 4', () => {
    // Phase 2 derived leaves (Abrasives > Discs > 80/120/220) must stay legal
    // below the judgment ceiling — that is why `kind` exists in Phase 1.
    const derived = { _id: oid(), parent: leaf._id, kind: 'derived' };
    const byId = indexById([...nodes, derived]);

    expect(validateTagPlacement(derived, byId).ok).toBe(true);
  });

  it('allows a derived node under two judgment tiers', () => {
    const derived = { _id: oid(), parent: mid._id, kind: 'derived' };
    const byId = indexById([...nodes, derived]);

    expect(validateTagPlacement(derived, byId).ok).toBe(true);
  });

  it('does not count derived ancestors toward the judgment ceiling', () => {
    const derived = { _id: oid(), parent: mid._id, kind: 'derived' };
    // A judgment node under a derived node sits at judgment-tier 3, not 4.
    const under = { _id: oid(), parent: derived._id, kind: 'judgment' };
    const byId = indexById([...nodes, derived, under]);

    expect(validateTagPlacement(under, byId).ok).toBe(true);
  });

  it('treats a missing kind as judgment', () => {
    const tooDeep = { _id: oid(), parent: leaf._id };
    const byId = indexById([...nodes, tooDeep]);

    expect(validateTagPlacement(tooDeep, byId).ok).toBe(false);
  });

  it('rejects a node parented to itself', () => {
    const self = { _id: oid(), kind: 'judgment' };
    self.parent = self._id;
    const byId = indexById([self]);

    const result = validateTagPlacement(self, byId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/own parent/);
  });

  it('rejects a reparent that would create a cycle, without hanging', () => {
    // Reparenting root under its own grandchild.
    const cyclicRoot = { ...root, parent: leaf._id };
    const byId = indexById([cyclicRoot, mid, leaf]);

    const result = validateTagPlacement(cyclicRoot, byId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cycle/);
  });

  it('does not invent a violation when an ancestor is missing from the map', () => {
    const orphan = { _id: oid(), parent: oid(), kind: 'judgment' };
    const byId = indexById([orphan]);

    expect(validateTagPlacement(orphan, byId).ok).toBe(true);
  });

  it('exposes the ceiling as a constant rather than a magic number', () => {
    expect(MAX_JUDGMENT_TIERS).toBe(3);
  });
});

describe('validateSubtreePlacement', () => {
  // A standalone branch two tiers deep, plus a tree to move it into.
  //   movable ── movableChild        (both judgment)
  //   host ── hostChild              (both judgment)
  let movable;
  let movableChild;
  let host;
  let hostChild;

  const mapOf = (...nodes) => indexById(nodes);

  beforeEach(() => {
    movable = { _id: oid(), name: 'Abrasives', parent: null, kind: 'judgment' };
    movableChild = { _id: oid(), name: 'Discs', parent: movable._id, kind: 'judgment' };
    host = { _id: oid(), name: 'Refinish', parent: null, kind: 'judgment' };
    hostChild = { _id: oid(), name: 'Surface Prep', parent: host._id, kind: 'judgment' };
  });

  it('allows a move that keeps the whole subtree within the ceiling', () => {
    // movable(2) + movableChild(3) — lands exactly on the ceiling.
    movable.parent = host._id;
    const byId = mapOf(movable, movableChild, host, hostChild);

    expect(validateSubtreePlacement(movable, byId).ok).toBe(true);
  });

  it('rejects a move that pushes a DESCENDANT past the ceiling', () => {
    // movable would be legal at tier 3, but movableChild lands at tier 4.
    // validateTagPlacement alone waves this through — that is the hole.
    movable.parent = hostChild._id;
    const byId = mapOf(movable, movableChild, host, hostChild);

    expect(validateTagPlacement(movable, byId).ok).toBe(true);

    const result = validateSubtreePlacement(movable, byId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tier 4/);
  });

  it('names the offending descendant so the error is actionable', () => {
    movable.parent = hostChild._id;
    const byId = mapOf(movable, movableChild, host, hostChild);

    expect(validateSubtreePlacement(movable, byId).error).toMatch(/Discs/);
  });

  it('ignores derived descendants when measuring the subtree', () => {
    // The exact move rejected above, with the child flipped to derived.
    // movable lands at judgment tier 3 (legal) and its derived child sits below
    // the ceiling by design, so the whole move is fine.
    movableChild.kind = 'derived';
    movable.parent = hostChild._id;
    const byId = mapOf(movable, movableChild, host, hostChild);

    expect(validateSubtreePlacement(movable, byId).ok).toBe(true);
  });

  it('does not let a derived node launder depth for a judgment node below it', () => {
    // movable(3) > derived child > judgment grandchild. The grandchild's
    // judgment ancestors are host, hostChild and movable — tier 4, illegal.
    movableChild.kind = 'derived';
    movable.parent = hostChild._id;
    const grandchild = {
      _id: oid(), name: '80 Grit Detail', parent: movableChild._id, kind: 'judgment'
    };
    const byId = mapOf(movable, movableChild, host, hostChild, grandchild);

    const result = validateSubtreePlacement(movable, byId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/80 Grit Detail/);
  });

  it('still catches the node itself being too deep', () => {
    const deep = { _id: oid(), name: 'Too Deep', parent: hostChild._id, kind: 'judgment' };
    const deeper = { _id: oid(), name: 'Deeper', parent: deep._id, kind: 'judgment' };
    const byId = mapOf(host, hostChild, deep, deeper);

    expect(validateSubtreePlacement(deep, byId).ok).toBe(false);
  });

  it('allows promoting a deep branch to top-level', () => {
    // The reverse move must stay legal — this is how you fix an over-deep tree.
    const orphaned = { _id: oid(), name: 'Freed', parent: null, kind: 'judgment' };
    const child = { _id: oid(), name: 'Child', parent: orphaned._id, kind: 'judgment' };
    const byId = mapOf(orphaned, child, host, hostChild);

    expect(validateSubtreePlacement(orphaned, byId).ok).toBe(true);
  });

  it('does not hang on a cyclic subtree', () => {
    const x = { _id: oid(), name: 'X', kind: 'judgment' };
    const y = { _id: oid(), name: 'Y', parent: x._id, kind: 'judgment' };
    x.parent = y._id;
    const byId = mapOf(x, y);

    const result = validateSubtreePlacement(x, byId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cycle/);
  });
});

describe('previewBulkTagChanges', () => {
  let tagA;
  let tagB;
  let tagC;
  let items;

  beforeEach(() => {
    tagA = oid();
    tagB = oid();
    tagC = oid();
    items = [
      { _id: oid(), name: 'Brake Cleaner', tags: [tagA, tagB], primaryTag: tagA },
      { _id: oid(), name: 'Shop Towels', tags: [tagB], primaryTag: tagB }
    ];
  });

  it('adds tags without disturbing the primary', () => {
    const { results, violations } = previewBulkTagChanges(items, { addTags: [tagC] });

    expect(violations).toHaveLength(0);
    expect(results[0].tags).toEqual(expect.arrayContaining([String(tagA), String(tagB), String(tagC)]));
    expect(results[0].primaryTag).toBe(String(tagA));
  });

  it('does not duplicate a tag the item already has', () => {
    const { results } = previewBulkTagChanges(items, { addTags: [tagB] });
    expect(results[0].tags).toHaveLength(2);
  });

  it('flags an item whose primary tag would be removed', () => {
    const { results, violations } = previewBulkTagChanges(items, { removeTags: [tagA] });

    // Item 1 loses its primary; item 2 is untouched by this removal.
    expect(violations).toHaveLength(1);
    expect(violations[0].name).toBe('Brake Cleaner');
    expect(violations[0].code).toBe('MISSING_PRIMARY');
    expect(results).toHaveLength(1);
    expect(results[0].primaryTag).toBe(String(tagB));
  });

  it('accepts the same removal when a replacement primary is supplied', () => {
    const { results, violations } = previewBulkTagChanges(items, {
      removeTags: [tagA],
      primaryTag: tagB
    });

    expect(violations).toHaveLength(0);
    expect(results).toHaveLength(2);
    expect(results[0].primaryTag).toBe(String(tagB));
  });

  it('reports every offender, not just the first', () => {
    // Both items keep a tag but lose their primary. Failing on the first would
    // leave the user guessing which of a long selection was the problem.
    const batch = [
      { _id: oid(), name: 'Brake Cleaner', tags: [tagA, tagB], primaryTag: tagA },
      { _id: oid(), name: 'Shop Towels', tags: [tagA, tagC], primaryTag: tagA }
    ];
    const { results, violations } = previewBulkTagChanges(batch, { removeTags: [tagA] });

    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.name)).toEqual(['Brake Cleaner', 'Shop Towels']);
    expect(results).toHaveLength(0);
  });

  it('allows stripping every tag — that returns the item to the untagged pool', () => {
    // Not a violation: no tags and no primary is the legitimate untagged state,
    // and the Untagged filter is how such an item gets found again. Only a
    // half-tagged item (tags but no primary) is invisible to everything.
    const { results, violations } = previewBulkTagChanges(items, {
      removeTags: [tagA, tagB]
    });

    expect(violations).toHaveLength(0);
    expect(results).toHaveLength(2);
    expect(results[0].tags).toEqual([]);
    expect(results[0].primaryTag).toBeNull();
  });

  it('rejects a replacement primary that is not among the resulting tags', () => {
    const { violations } = previewBulkTagChanges(items, { primaryTag: tagC });

    expect(violations).toHaveLength(2);
    expect(violations[0].code).toBe('PRIMARY_NOT_IN_TAGS');
  });

  it('distinguishes an explicit primaryTag:null from an absent one', () => {
    // Explicit null means "clear it" and must be rejected for a tagged item...
    expect(previewBulkTagChanges(items, { primaryTag: null }).violations).toHaveLength(2);
    // ...while omitting the key entirely leaves each item's primary alone.
    expect(previewBulkTagChanges(items, { addTags: [tagC] }).violations).toHaveLength(0);
  });

  it('never auto-promotes a survivor when the primary is removed', () => {
    const { results, violations } = previewBulkTagChanges(
      [{ _id: oid(), name: 'Two Tags', tags: [tagA, tagB, tagC], primaryTag: tagA }],
      { removeTags: [tagA] }
    );

    // tagB and tagC both survive. Picking one would let array order decide the
    // canonical home, so the whole item is rejected instead.
    expect(results).toHaveLength(0);
    expect(violations).toHaveLength(1);
  });

  it('handles an untagged item receiving its first tag and primary', () => {
    const untagged = [{ _id: oid(), name: 'Fresh Import', tags: [], primaryTag: null }];
    const { results, violations } = previewBulkTagChanges(untagged, {
      addTags: [tagA],
      primaryTag: tagA
    });

    expect(violations).toHaveLength(0);
    expect(results[0].tags).toEqual([String(tagA)]);
    expect(results[0].primaryTag).toBe(String(tagA));
  });

  it('leaves untagged items alone when only a location is being set', () => {
    const untagged = [{ _id: oid(), name: 'Fresh Import', tags: [], primaryTag: null }];
    expect(previewBulkTagChanges(untagged, {}).violations).toHaveLength(0);
  });
});

describe('resolveFieldsForItem', () => {
  // Chemicals & Fluids
  //   └── Service Fluids            [fields: spec]
  //        ├── Engine Oil           [fields: viscosity]
  //        └── Brake Fluid          [fields: dotRating]
  // Refinish & Body
  //   └── Abrasives
  //        └── Discs                [fields: grit]
  const viscosity = oid();
  const dotRating = oid();
  const spec = oid();
  const grit = oid();

  const phase = { _id: oid(), parent: null, fields: [] };
  const serviceFluids = { _id: oid(), parent: phase._id, fields: [spec] };
  const engineOil = { _id: oid(), parent: serviceFluids._id, fields: [viscosity] };
  const brakeFluid = { _id: oid(), parent: serviceFluids._id, fields: [dotRating] };
  const refinish = { _id: oid(), parent: null, fields: [] };
  const abrasives = { _id: oid(), parent: refinish._id, fields: [] };
  const discs = { _id: oid(), parent: abrasives._id, fields: [grit] };

  const byId = indexById([phase, serviceFluids, engineOil, brakeFluid, refinish, abrasives, discs]);

  it('returns the primary tag\'s own fields as required', () => {
    const { required } = resolveFieldsForItem(
      { tags: [engineOil._id], primaryTag: engineOil._id }, byId
    );
    expect(required).toContain(String(viscosity));
  });

  it('inherits fields from ancestors of the primary tag', () => {
    // spec lives on Service Fluids, one tier up from Engine Oil.
    const { required } = resolveFieldsForItem(
      { tags: [engineOil._id], primaryTag: engineOil._id }, byId
    );
    expect(required).toEqual(expect.arrayContaining([String(viscosity), String(spec)]));
  });

  it('does not pick up sibling fields', () => {
    const { all } = resolveFieldsForItem(
      { tags: [engineOil._id], primaryTag: engineOil._id }, byId
    );
    expect(all).not.toContain(String(dotRating));
  });

  it('treats secondary tags\' fields as optional, not required', () => {
    // The brake-cleaner shape: primary in one branch, secondary in another.
    // Tagging an item into a second door must not tax it with new obligations.
    const { required, optional } = resolveFieldsForItem(
      { tags: [engineOil._id, discs._id], primaryTag: engineOil._id }, byId
    );

    expect(required).toEqual(expect.arrayContaining([String(viscosity), String(spec)]));
    expect(required).not.toContain(String(grit));
    expect(optional).toEqual([String(grit)]);
  });

  it('collapses a field shared by primary and secondary into required only', () => {
    const { required, optional } = resolveFieldsForItem(
      { tags: [engineOil._id, brakeFluid._id], primaryTag: engineOil._id }, byId
    );

    // `spec` is inherited by both; it must not appear twice or land in optional.
    expect(required.filter((f) => f === String(spec))).toHaveLength(1);
    expect(optional).not.toContain(String(spec));
    expect(optional).toEqual([String(dotRating)]);
  });

  it('returns nothing for an untagged item', () => {
    const { required, optional, all } = resolveFieldsForItem({ tags: [], primaryTag: null }, byId);
    expect(required).toEqual([]);
    expect(optional).toEqual([]);
    expect(all).toEqual([]);
  });

  it('returns no required fields when tags exist but no primary is set', () => {
    // Shouldn't happen (the invariant forbids it), but the resolver must not
    // invent obligations from a state it can be handed.
    const { required } = resolveFieldsForItem({ tags: [engineOil._id], primaryTag: null }, byId);
    expect(required).toEqual([]);
  });

  it('is unaffected by an unknown tag id', () => {
    const { required } = resolveFieldsForItem(
      { tags: [oid()], primaryTag: engineOil._id }, byId
    );
    expect(required).toEqual(expect.arrayContaining([String(viscosity), String(spec)]));
  });

  it('does not hang on a cyclic parent chain', () => {
    const a = { _id: oid(), fields: [] };
    const b = { _id: oid(), parent: a._id, fields: [grit] };
    a.parent = b._id;
    const cyclic = indexById([a, b]);

    const { required } = resolveFieldsForItem({ tags: [b._id], primaryTag: b._id }, cyclic);
    expect(required).toContain(String(grit));
  });
});

describe('collectDescendantIds', () => {
  // phase
  //  ├── branchA
  //  │    ├── leaf1
  //  │    └── leaf2
  //  └── branchB
  // otherPhase
  const phase = { _id: oid(), parent: null };
  const branchA = { _id: oid(), parent: phase._id };
  const branchB = { _id: oid(), parent: phase._id };
  const leaf1 = { _id: oid(), parent: branchA._id };
  const leaf2 = { _id: oid(), parent: branchA._id };
  const otherPhase = { _id: oid(), parent: null };
  const nodes = [phase, branchA, branchB, leaf1, leaf2, otherPhase];

  it('returns a tier-1 node plus every descendant', () => {
    const ids = collectDescendantIds(phase._id, nodes);

    expect(ids).toHaveLength(5);
    expect(ids).toEqual(expect.arrayContaining(
      [phase, branchA, branchB, leaf1, leaf2].map((n) => String(n._id))
    ));
  });

  it('excludes unrelated branches', () => {
    const ids = collectDescendantIds(phase._id, nodes);
    expect(ids).not.toContain(String(otherPhase._id));
  });

  it('includes the root itself first, so subtree browse counts it', () => {
    expect(collectDescendantIds(branchA._id, nodes)[0]).toBe(String(branchA._id));
  });

  it('returns just the node for a leaf', () => {
    expect(collectDescendantIds(leaf1._id, nodes)).toEqual([String(leaf1._id)]);
  });

  it('accepts a string id as readily as an ObjectId', () => {
    expect(collectDescendantIds(String(branchA._id), nodes))
      .toEqual(collectDescendantIds(branchA._id, nodes));
  });

  it('returns empty for a null id', () => {
    expect(collectDescendantIds(null, nodes)).toEqual([]);
    expect(collectDescendantIds(undefined, nodes)).toEqual([]);
  });

  it('returns an unknown id unchanged rather than empty', () => {
    // A tag id that isn't in the tree has no descendants but is still a legal
    // filter term: $in:[unknownId] matches nothing, which is the right answer
    // for "filter by a tag that no longer exists". Resolving unknown ids to []
    // would instead mean "no filter", silently widening the query to everything.
    const unknown = oid();
    expect(collectDescendantIds(unknown, nodes)).toEqual([String(unknown)]);
  });

  it('terminates on a cyclic parent chain', () => {
    const x = { _id: oid() };
    const y = { _id: oid(), parent: x._id };
    x.parent = y._id;

    const ids = collectDescendantIds(x._id, [x, y]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
