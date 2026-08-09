const mongoose = require('mongoose');

const Schema = mongoose.Schema;

/**
 * Whether a given vendor charges this shop sales tax, keyed by hostname.
 *
 * Tax status is a property of the VENDOR, not of the item — the shop is exempt
 * with some suppliers and not others, and that doesn't change bottle to bottle.
 * So rather than asking on every entry, the answer is learned: tick the tax box
 * once with a walmart.com URL in the product field and every later walmart.com
 * item defaults the same way.
 *
 * Keyed by hostname rather than by vendor vocab entry because the URL is known
 * before a vendor has been picked (often it's what identifies the vendor), and
 * because one vendor can have several storefront domains.
 *
 * A rule is a DEFAULT, never a lock: the toggle stays editable on every item,
 * and changing it re-teaches the rule.
 */
const SupplyTaxRuleSchema = new Schema({
  hostname: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  chargesTax: {
    type: Boolean,
    default: true
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SupplyTaxRule', SupplyTaxRuleSchema);
