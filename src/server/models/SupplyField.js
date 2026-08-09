const mongoose = require('mongoose');

const Schema = mongoose.Schema;

/**
 * A measurement a supply can carry — viscosity, grit, DOT rating.
 *
 * Fields hold the answer to "what IS this?", which every person entering the
 * item would write identically. Tags hold "what is this FOR?", which is a
 * judgment. Keeping them apart is the whole point of the design: a `5W-30` tag
 * node would duplicate by hand a fact the item already states, and the
 * hand-maintained copy drifts.
 *
 * Definitions are GLOBAL and referenced by tag nodes, not owned by them. That
 * is deliberate: grit belongs to Discs, Sheets & Rolls, and Pads & Scuff, and
 * collapsing those by id rather than by name means filtering "grit = 220"
 * spans all three without knowing they're related.
 *
 * `select` is the type that earns its keep — a fixed option list is what stops
 * 5W-30 / 5w30 / 5W30 becoming three values. Use `text` only where the space of
 * answers genuinely isn't enumerable (thread pitch, bulb number).
 */
const SupplyFieldSchema = new Schema({
  key: {
    type: String,
    required: [true, 'Field key is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  label: {
    type: String,
    required: [true, 'Field label is required'],
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'number', 'select'],
    default: 'text'
  },
  // Only meaningful for type 'select'. Plain strings rather than vocab refs:
  // these are physical constants ("DOT 4", "5W-30") that get added to, not
  // renamed, so the rename-propagation that vocab refs buy has nothing to do
  // here — and a fixed list already prevents the fragmentation that matters.
  options: {
    type: [String],
    default: []
  },
  // Display suffix for numeric fields, e.g. 'in', 'A'. Not a conversion.
  unit: {
    type: String,
    trim: true,
    default: ''
  },
  placeholder: {
    type: String,
    trim: true,
    default: ''
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SupplyField', SupplyFieldSchema);
