const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const IncludedItemSchema = new Schema({
  packageTag: {
    type: String,
    required: [true, 'Package tag is required'],
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
