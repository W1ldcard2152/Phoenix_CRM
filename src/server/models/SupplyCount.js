const mongoose = require('mongoose');

const Schema = mongoose.Schema;

/**
 * A cycle count: one sweep of a filtered slice of the shelves.
 *
 * The scope is stored as the FILTER, not as a list of ids. That is what lets a
 * scope be saved and re-run next quarter and pick up items added since - "count
 * all Valvoline" means the brand, not the fourteen items that carried it in
 * August. The lines below are the resolved snapshot for THIS run.
 *
 * Counting is separate from correcting. Entering counts writes nothing to
 * stock; posting does, and posts a delta rather than a figure so that
 * consumption during the count survives. See utils/countRules.js.
 */

const STATUSES = [
  'counting', // sheet is open, counts being entered
  'review',   // counting finished, variances visible, nothing written yet
  'posted',   // movements written, stock corrected
  'cancelled' // abandoned; never touched stock
];

/**
 * One item on the sheet.
 *
 * `expectedQuantity` is frozen when the sheet is cut, and is the figure the
 * variance is measured against. It is NOT re-read at post time - that is the
 * whole point of a snapshot.
 */
const CountLineSchema = new Schema({
  supply: {
    type: Schema.Types.ObjectId,
    ref: 'ShopSupply',
    required: true
  },
  // Snapshot at the moment the sheet was cut. In STOCK units, like every other
  // quantity stored anywhere in this module.
  expectedQuantity: { type: Number, required: true },

  /**
   * How the shelf is counted, frozen with the sheet.
   *
   * You BUY jugs and you USE quarts, and what is physically on a shelf is jugs
   * — nobody knows they have 15 quarts of 5W-20, they know they have three
   * 5qt jugs. So the sheet asks in purchase units and converts.
   *
   * Snapshotted rather than read from the item at post time: if someone edits
   * the item from a 5qt jug to a 1qt bottle midway through a count, every
   * number already written down was counted in the old packaging, and
   * reinterpreting them with the new ratio would silently multiply the stock.
   */
  unitsPerPurchase: { type: Number, default: 1 },

  /**
   * What was counted, as counted: whole packages, plus any loose stock units
   * from an opened one. Two full jugs and three loose quarts is 2 and 3, and
   * neither number alone can express it.
   *
   * Kept alongside the resolved total so the sheet can be reopened and read
   * back in the units it was taken in.
   */
  countedPackages: { type: Number, default: null },
  countedLoose: { type: Number, default: null },

  /**
   * The resolved total in STOCK units — packages * unitsPerPurchase + loose.
   *
   * Everything downstream (variance, movements, posting) works from this, so
   * the unit conversion happens exactly once, at entry.
   *
   * Null until somebody physically counts it. Null is "not yet counted", which
   * is emphatically not the same as counted zero, so this must never default.
   */
  countedQuantity: { type: Number, default: null },
  countedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  countedAt: { type: Date, default: null },

  // Unit price at snapshot time, so the variance report can total the money
  // without a second pass over the supplies - and so a later reprice does not
  // rewrite the history of what a past count was worth.
  price: { type: Number, default: 0 },

  /**
   * Found on the shelf but not in the scope, and added during the sweep.
   *
   * Worth distinguishing: an item that keeps turning up outside its scope is
   * usually mis-located rather than miscounted, and the review screen offers to
   * fix its location precisely because this flag makes that case visible.
   */
  addedDuringCount: { type: Boolean, default: false },

  // Set at post time when live stock had moved away from the snapshot.
  movedDuringCount: { type: Boolean, default: false },
  // Set at post time when the delta would have driven stock below zero.
  clamped: { type: Boolean, default: false },
  // Quantity on hand this line actually produced. Null for lines that posted
  // nothing (uncounted, or counted with no variance).
  postedQoh: { type: Number, default: null },

  note: { type: String, trim: true }
}, { _id: true });

/**
 * The filter a count was cut from.
 *
 * Mirrors the shape listSupplies already accepts, so resolving a scope is a
 * plain call into it rather than a second query that could drift from the one
 * the supply list uses.
 */
const CountScopeSchema = new Schema({
  tag: [{ type: Schema.Types.ObjectId, ref: 'SupplyTag' }],
  brand: [{ type: Schema.Types.ObjectId, ref: 'SupplyVocab' }],
  vendor: [{ type: Schema.Types.ObjectId, ref: 'SupplyVocab' }],
  form: [{ type: Schema.Types.ObjectId, ref: 'SupplyVocab' }],
  location: [{ type: Schema.Types.ObjectId, ref: 'SupplyVocab' }],
  // Partial shelf codes: 'Stock Room 1-C' covers every shelf in that column.
  locationPrefix: [{ type: String, trim: true }],
  // { viscosity: ['5W-30', '0W-20'] }
  attributes: { type: Map, of: [String], default: () => new Map() }
}, { _id: false });

const SupplyCountSchema = new Schema({
  name: { type: String, trim: true, default: '' },
  status: { type: String, enum: STATUSES, default: 'counting', index: true },
  scope: { type: CountScopeSchema, default: () => ({}) },

  /**
   * Whether expected quantities were hidden from the counter.
   *
   * Recorded rather than assumed, because it is what makes a past count's
   * trustworthiness legible: a count taken with the expected figures on screen
   * is a spot-check, and a reader six months later cannot tell the difference
   * unless it was written down.
   *
   * There is no way to unblind an open sheet. Enforcement is a server-side
   * projection in supplyCountService, decided by the count's status and nothing
   * the client asks for - a sheet that a query string could unblind would be
   * blind by default rather than blind, which is not the same feature.
   */
  blind: { type: Boolean, default: true },

  lines: [CountLineSchema],

  /**
   * Things found on the shelf that are not supplies at all yet. Free text on
   * purpose: stopping mid-count to create a catalogue entry is how counts get
   * abandoned. Surfaced after posting as a to-do.
   */
  foundNotInSystem: [{
    description: { type: String, trim: true },
    location: { type: Schema.Types.ObjectId, ref: 'SupplyVocab', default: null },
    quantity: { type: Number, default: null },
    resolved: { type: Boolean, default: false }
  }],

  notes: { type: String, trim: true },

  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  postedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  postedAt: { type: Date, default: null }
}, {
  timestamps: true
});

// The counts list: open ones first, newest first.
SupplyCountSchema.index({ status: 1, createdAt: -1 });
SupplyCountSchema.index({ 'lines.supply': 1 });

SupplyCountSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('SupplyCount', SupplyCountSchema);
