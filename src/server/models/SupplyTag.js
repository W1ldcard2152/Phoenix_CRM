const mongoose = require('mongoose');
const { indexById, validateSubtreePlacement } = require('../utils/supplyRules');

const Schema = mongoose.Schema;

/**
 * A node in the shop-supplies tag tree.
 *
 * Tags hold JUDGMENTS — "what is this for?" — and nothing else. Anything a
 * person entering the item would write identically (brand, grit, viscosity,
 * size) is a field, not a tag. See docs/shop-supplies-module.md §1.
 *
 * Deliberately has no `isActive`. Deactivating a node that has items on it
 * makes those items invisible in both directions: absent from tree browse, and
 * absent from the Untagged filter because they DO have tags.
 * Delete-if-childless-and-unused is the only control.
 */
const SupplyTagSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Tag name is required'],
    trim: true
  },
  slug: {
    type: String,
    required: [true, 'Tag slug is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  parent: {
    type: Schema.Types.ObjectId,
    ref: 'SupplyTag',
    default: null // null = top-level job phase
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  // 'derived' is reserved for Phase 2 field-computed leaves. It exists now so
  // the depth rule below needs no schema change later: derived nodes are
  // allowed to sit below the judgment ceiling.
  kind: {
    type: String,
    enum: ['judgment', 'derived'],
    default: 'judgment'
  },
  // Measurements items under this node carry (e.g. viscosity on Engine Oil).
  // Fields are global definitions referenced here, not owned here, so grit on
  // Discs and grit on Sheets & Rolls are the same field and filter together.
  //
  // Inherited DOWN the tree: a field on Service Fluids applies to Engine Oil
  // too. Ancestors are walked, never stored on the item, so re-parenting a node
  // changes which fields apply without any migration — the same property that
  // makes the tag descendant walk safe.
  fields: [{
    type: Schema.Types.ObjectId,
    ref: 'SupplyField'
  }],

  // Human-readable hint shown under the node name. Generated from `fields` by
  // the seed script so the two cannot drift.
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

SupplyTagSchema.index({ parent: 1, sortOrder: 1 });

/**
 * Hard-block the depth ceiling and reparenting cycles.
 *
 * Loads the whole tree (~100 docs) rather than walking parent-by-parent: it's
 * one query instead of N, and it hands the pure rule a complete map so the
 * check can't be fooled by a partial chain. Only runs when placement actually
 * changes.
 *
 * Checks the subtree, not just this node: a reparent that leaves this node
 * legal can still push its own descendants past the ceiling.
 *
 * Note this does NOT return early on a top-level move. Promoting a node to
 * top-level can't breach the ceiling for the node itself, but the same save
 * still has to re-check the branch hanging off it.
 */
SupplyTagSchema.pre('validate', async function preValidatePlacement() {
  if (!this.isNew && !this.isModified('parent') && !this.isModified('kind')) return;

  const others = await this.constructor
    .find({}, '_id name parent kind')
    .lean();

  // Overlay the pending state — for a new doc it isn't in `others` at all, and
  // for a reparent the stored copy still has the old parent.
  const nodeById = indexById(others);
  const pending = { _id: this._id, name: this.name, parent: this.parent, kind: this.kind };
  nodeById.set(String(this._id), pending);

  const result = validateSubtreePlacement(pending, nodeById);

  if (!result.ok) this.invalidate('parent', result.error);
});

module.exports = mongoose.model('SupplyTag', SupplyTagSchema);
