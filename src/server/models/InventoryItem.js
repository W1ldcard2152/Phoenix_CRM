const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AdjustmentLogSchema = new Schema({
  adjustedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  previousQty: { type: Number, required: true },
  newQty: { type: Number, required: true },
  reason: { type: String, default: 'Manual adjustment' },
  createdAt: { type: Date, default: Date.now }
});

const InventoryItemSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true
  },
  partNumber: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    trim: true,
    default: ''
  },
  price: {
    type: Number,
    min: 0,
    default: 0
  },
  cost: {
    type: Number,
    min: 0,
    default: 0
  },
  vendor: {
    type: String,
    trim: true
  },
  brand: {
    type: String,
    trim: true
  },
  warranty: {
    type: String,
    trim: true
  },
  url: {
    type: String,
    trim: true
  },
  quantityOnHand: {
    type: Number,
    default: 0,
    min: 0
  },
  unit: {
    type: String,
    default: 'each',
    trim: true
  },
  unitsPerPurchase: {
    type: Number,
    default: 1,
    min: 1
  },
  purchaseUnit: {
    type: String,
    trim: true,
    default: ''
  },
  reorderPoint: {
    type: Number,
    default: 1,
    min: 0
  },
  packageTag: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  adjustmentLog: [AdjustmentLogSchema]
}, {
  timestamps: true
});

InventoryItemSchema.index({ isActive: 1, category: 1 });
InventoryItemSchema.index({ isActive: 1, quantityOnHand: 1 });

module.exports = mongoose.model('InventoryItem', InventoryItemSchema);
