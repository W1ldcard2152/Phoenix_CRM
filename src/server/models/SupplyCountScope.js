const mongoose = require('mongoose');

const Schema = mongoose.Schema;

/**
 * A named, re-runnable count scope - "Monday: Fluids", "Quarterly: Stock Room 2".
 *
 * Kept in its own collection rather than as a flagged SupplyCount, so that the
 * counts list stays a list of counts. A template that appeared alongside real
 * counts would need filtering out of every query that asks "what has been
 * counted lately", and would eventually be missed by one of them.
 *
 * Stores the filter, never the resolved items, for the same reason SupplyCount
 * does: re-running "all Valvoline" next quarter must pick up the Valvoline
 * bought since.
 */
const SupplyCountScopeSchema = new Schema({
  name: {
    type: String,
    required: [true, 'A saved scope needs a name'],
    trim: true
  },
  // Same shape as SupplyCount.scope and listSupplies' query.
  scope: {
    tag: [{ type: Schema.Types.ObjectId, ref: 'SupplyTag' }],
    brand: [{ type: Schema.Types.ObjectId, ref: 'SupplyVocab' }],
    vendor: [{ type: Schema.Types.ObjectId, ref: 'SupplyVocab' }],
    form: [{ type: Schema.Types.ObjectId, ref: 'SupplyVocab' }],
    location: [{ type: Schema.Types.ObjectId, ref: 'SupplyVocab' }],
    locationPrefix: [{ type: String, trim: true }],
    attributes: { type: Map, of: [String], default: () => new Map() }
  },
  lastRunAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

SupplyCountScopeSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('SupplyCountScope', SupplyCountScopeSchema);
