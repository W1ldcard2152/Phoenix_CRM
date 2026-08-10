const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * One consumable a package draws, specified by WHAT KIND rather than by which
 * product.
 *
 * `supplyTag` points at a node in the shop-supply tag tree, and the supplies
 * that satisfy the line are everything tagged at or beneath it — the same
 * descendant walk the supplies list filter uses. A line tagged "Engine Oil"
 * accepts any engine oil; one tagged "Service Fluids" would accept anything
 * beneath that.
 *
 * This replaces `packageTag`, a parallel free-text vocabulary in
 * `Settings.packageTags` that existed only because the old inventory had no
 * taxonomy to point at. Referencing the tree instead means no second vocabulary
 * to maintain, referential integrity, and retagging a supply automatically
 * changes which packages can draw it.
 */
const IncludedItemSchema = new Schema({
  supplyTag: {
    type: Schema.Types.ObjectId,
    ref: 'SupplyTag'
  },

  /**
   * Legacy free-text tag from the InventoryItem era.
   *
   * Retained read-only so a package that predates the migration still renders
   * rather than showing a blank line. Nothing writes it; the migration in
   * scripts/migrate-packages-to-supplies.js converts it to `supplyTag`.
   */
  packageTag: {
    type: String,
    trim: true
  },

  label: {
    type: String,
    required: [true, 'Label is required'],
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 1
  }
});

const ServicePackageSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Package name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'Package price is required'],
    min: 0
  },
  includedItems: [IncludedItemSchema],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

ServicePackageSchema.index({ isActive: 1 });

module.exports = mongoose.model('ServicePackage', ServicePackageSchema);
