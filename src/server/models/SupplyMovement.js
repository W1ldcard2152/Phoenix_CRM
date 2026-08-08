const mongoose = require('mongoose');

const Schema = mongoose.Schema;

/**
 * An append-only record of every quantity change to a ShopSupply.
 *
 * Replaces InventoryItem's embedded `adjustmentLog`, which was an unbounded
 * array inside each item document, carried stringly-typed reasons
 * ('Restocked', 'Used', 'Manual adjustment'), had no foreign key to the work
 * order that consumed the stock, and recorded no unit — so a log entry reading
 * "-2" couldn't tell you two quarts from two cases. A clean slate is the only
 * cheap moment to fix all four.
 *
 * Movements only. No auto-reorder, no analytics, no rollups. This model is the
 * designated cut line for Phase 1 (§3.4): if the build runs long, drop it and
 * the /adjust endpoint and write quantities directly. Nothing else depends on
 * it.
 */
const MOVEMENT_TYPES = [
  'count',    // physical recount — quantity is the delta to reach the counted figure
  'receive',  // stock arriving
  'consume',  // stock used on a job
  'adjust',   // manual correction
  'return',   // stock coming back from a job
  'import'    // one-time load from InventoryItem; provenance for the opening figure
];

const SupplyMovementSchema = new Schema({
  supply: {
    type: Schema.Types.ObjectId,
    ref: 'ShopSupply',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: MOVEMENT_TYPES,
    required: true
  },
  // Signed, and expressed in `unit` — not necessarily the item's stock unit.
  quantity: {
    type: Number,
    required: true
  },
  // Records what was actually counted, so a movement stays interpretable even
  // if the item's stockUnit changes later.
  unit: {
    type: Schema.Types.ObjectId,
    ref: 'SupplyVocab',
    default: null
  },
  // Quantity on hand after this movement was applied, in the item's stock unit.
  resultingQoh: {
    type: Number
  },
  // Nullable FK to whatever caused the movement — a WorkOrder, typically.
  // Left as a loose (model, id) pair rather than a refPath because Phase 1
  // never populates it; wire-in decides what it points at.
  sourceModel: {
    type: String,
    default: null
  },
  sourceId: {
    type: Schema.Types.ObjectId,
    default: null
  },
  note: {
    type: String,
    trim: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// The item's movement history, newest first.
SupplyMovementSchema.index({ supply: 1, createdAt: -1 });

SupplyMovementSchema.statics.MOVEMENT_TYPES = MOVEMENT_TYPES;

module.exports = mongoose.model('SupplyMovement', SupplyMovementSchema);
