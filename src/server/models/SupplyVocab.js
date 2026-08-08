const mongoose = require('mongoose');

const Schema = mongoose.Schema;

/**
 * Controlled vocabulary for the measurement-shaped fields on a ShopSupply.
 *
 * Items reference these by ObjectId rather than storing strings, which buys two
 * things the old free-text inventory couldn't have:
 *   - renaming a value propagates instantly to every item, so bulk shelf
 *     re-coding is a plain document rename with no cascade machinery;
 *   - `Valvoline` / `valvoline` / `Valvoline Inc` fragmentation is structurally
 *     impossible.
 *
 * Serve the whole vocab as one cached payload and join client-side rather than
 * populating per query — it's a few hundred rows total.
 *
 * Unlike SupplyTag, `isActive` IS kept here: retiring a vocab value is harmless
 * because items referencing it stay visible and keep resolving.
 */
const FIELD_KEYS = ['brand', 'vendor', 'form', 'unit', 'location'];

const SupplyVocabSchema = new Schema({
  fieldKey: {
    type: String,
    required: [true, 'fieldKey is required'],
    enum: FIELD_KEYS
  },
  // Stable machine value. Locations carry no row/column semantics — 'B3' is
  // just 'B3' — which is what makes bulk re-coding a rename.
  value: {
    type: String,
    required: [true, 'value is required'],
    trim: true
  },
  // Display form. Falls back to `value` when absent.
  label: {
    type: String,
    trim: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

SupplyVocabSchema.index({ fieldKey: 1, value: 1 }, { unique: true });
SupplyVocabSchema.index({ fieldKey: 1, isActive: 1, sortOrder: 1 });

SupplyVocabSchema.statics.FIELD_KEYS = FIELD_KEYS;

module.exports = mongoose.model('SupplyVocab', SupplyVocabSchema);
