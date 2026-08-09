const mongoose = require('mongoose');
const { validateTagAssignment } = require('../utils/supplyRules');

const Schema = mongoose.Schema;

const vocabRef = (extra = {}) => ({
  type: Schema.Types.ObjectId,
  ref: 'SupplyVocab',
  default: null,
  ...extra
});

/**
 * A stocked shop supply.
 *
 * Lives beside InventoryItem rather than replacing it — the old table stays
 * live and wired to work orders and invoices until the wire-in phase. See
 * docs/shop-supplies-module.md §0.1.
 *
 * PRICING INVARIANT:
 *
 *     markup = Settings.partMarkupPercentage   // a PERCENTAGE, e.g. 30
 *     price  = (cost / unitsPerPurchase) * (1 + markup / 100)
 *
 * `cost` is per PURCHASE unit; `price` is per STOCK unit. `price` is written at
 * create/edit time and stored — never recomputed on read. Changing the shop
 * markup therefore does NOT retroactively move existing prices; repricing would
 * be a separate, explicit operation. `priceOverridden: true` means the user
 * typed a price directly and this item is detached from the calc entirely.
 */
const ShopSupplySchema = new Schema({
  /**
   * OPTIONAL name override.
   *
   * Most supplies don't need one: "Mobil 1 5W-30 Engine Oil" is composed from
   * brand + measurement + tag, all of which are stored anyway, so typing it
   * would store those facts twice and let the typed copy go stale. Set this
   * only for things that genuinely have a name rather than a description.
   *
   * Every item imported from the old inventory arrives with one, which is what
   * keeps them readable before anyone has triaged them.
   */
  name: {
    type: String,
    trim: true,
    default: ''
  },

  /**
   * The part of the name that ISN'T derivable — "full synthetic, dexos-d",
   * "pre-filled with oil". Rendered parenthetically after the composed name.
   */
  qualifier: {
    type: String,
    trim: true,
    default: ''
  },

  // Who makes it. Kept properly separate from partNumber — the old inventory
  // jammed the brand into the part number string so duplicate detection could
  // match on it, which is why brand corrections were never safe there (§2).
  brand: vocabRef(),

  // Who we stock it from. Distinct from brand, and load-bearing for the
  // shopping list export.
  vendor: vocabRef(),

  // Manufacturer number ONLY — no brand prefix.
  partNumber: {
    type: String,
    trim: true
  },

  // Every tag, primary included.
  tags: [{
    type: Schema.Types.ObjectId,
    ref: 'SupplyTag'
  }],

  // The canonical home. Null is the normal state for a freshly imported item;
  // see the invariant note below.
  primaryTag: {
    type: Schema.Types.ObjectId,
    ref: 'SupplyTag',
    default: null
  },

  form: vocabRef(),      // aerosol, liquid, solid, paste, gel, powder
  location: vocabRef(),  // generic shelf code, freely overridable

  quantityOnHand: {
    type: Number,
    default: 0,
    min: 0
  },
  stockUnit: vocabRef(),
  purchaseUnit: vocabRef(),
  unitsPerPurchase: {
    type: Number,
    default: 1,
    min: 1
  },

  // Stored, but nothing acts on it in Phase 1 beyond the shopping list.
  reorderPoint: {
    type: Number,
    default: 1,
    min: 0
  },

  /**
   * LANDED cost per purchase unit — what actually leaves the bank, sales tax
   * included where the vendor charges it.
   *
   * Tax is treated the way the receipt importer treats shipping: not a separate
   * line, but part of what the thing cost. Some vendors charge it and some
   * don't, while the shop charges tax on everything downstream regardless, so
   * vendor tax is a cost input rather than a pass-through.
   */
  cost: {
    type: Number,
    default: 0,
    min: 0
  },

  /**
   * Whether `cost` above has vendor tax folded into it.
   *
   * Recorded so the form can show the pre-tax figure from the invoice and let
   * the toggle be turned off again — without it, re-editing an item would
   * either double-tax the cost or silently drop the tax.
   */
  costIncludesTax: {
    type: Boolean,
    default: false
  },
  price: {
    type: Number,
    default: 0,
    min: 0
  },
  priceOverridden: {
    type: Boolean,
    default: false
  },

  /**
   * Measurements, keyed by SupplyField.key — { viscosity: '5W-30', grit: '220' }.
   *
   * Which keys are meaningful comes from the item's tags (see SupplyTag.fields),
   * so this is deliberately not a fixed set of columns. Values are stored as
   * strings even for numeric fields: they are labels for filtering, not
   * quantities to compute with, and keeping one type avoids a class of
   * "220" !== 220 filter misses.
   *
   * Writes are key-whitelisted against the registry in supplyService — an
   * unchecked key here would let a client write arbitrary dotted paths.
   */
  attributes: {
    type: Map,
    of: String,
    default: () => new Map()
  },

  sdsUrl: { type: String, trim: true },
  url: { type: String, trim: true },
  notes: { type: String, trim: true },

  // S3 object key for the item photo. Server-set ONLY — deliberately absent
  // from the writable field allow-list in supplyService. If a client could PATCH
  // this, it could point a supply at any key in the bucket and read it back
  // through the photo stream route.
  photoKey: { type: String, default: null },
  // Cache-buster for the <img> src, so replacing a photo shows the new one.
  photoUpdatedAt: { type: Date, default: null },

  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// `tags` is multikey; the descendant-walk filter queries it with $in.
ShopSupplySchema.index({ isActive: 1, tags: 1 });
ShopSupplySchema.index({ isActive: 1, location: 1 });
ShopSupplySchema.index({ isActive: 1, vendor: 1 });
// The default list sort. The old table sorted by name without an index for it.
ShopSupplySchema.index({ isActive: 1, name: 1 });

/**
 * Backstop only — NOT the primary defence.
 *
 * This is document middleware: it fires on .save()/.validate() and nothing
 * else. Every query-style write (findByIdAndUpdate, bulkWrite, and therefore
 * PATCH /:id and PATCH /bulk) sails straight past it, which is exactly the
 * paths a user is most likely to orphan a primary tag through. `runValidators`
 * does not help — it runs path validators, never a document hook.
 *
 * The real enforcement is validateTagAssignment() called explicitly on every
 * write path in the service layer, plus the permissive collection validator
 * applied by scripts/seed-supply-tags.js. See §6a.
 */
ShopSupplySchema.pre('validate', function preValidateTagInvariant() {
  const result = validateTagAssignment(this.tags, this.primaryTag);
  if (!result.ok) this.invalidate('primaryTag', result.error);
});

module.exports = mongoose.model('ShopSupply', ShopSupplySchema);
