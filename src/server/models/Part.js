const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PartSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  partNumber: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  cost: {
    type: Number,
    required: true,
    min: 0
  },
  vendor: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  category: {
    type: String,
    required: true,
    trim: true,
    enum: [
      'Engine',
      'Transmission',
      'Brakes',
      'Suspension',
      'Electrical',
      'Exhaust',
      'Cooling',
      'Fuel System',
      'Air & Filters',
      'Fluids & Chemicals',
      'Belts & Hoses',
      'Ignition',
      'Body Parts',
      'Interior',
      'Tires & Wheels',
      'Tools & Equipment',
      'Other'
    ]
  },
  brand: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  warranty: {
    type: String,
    trim: true,
    maxlength: 100
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  url: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // URL is optional
        // Basic URL validation
        try {
          new URL(v);
          return true;
        } catch (err) {
          return false;
        }
      },
      message: 'Please enter a valid URL'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true, // This automatically adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for profit margin
PartSchema.virtual('profitMargin').get(function() {
  if (this.cost > 0) {
    return ((this.price - this.cost) / this.cost * 100).toFixed(2);
  }
  return 0;
});

// Virtual for markup
PartSchema.virtual('markup').get(function() {
  return (this.price - this.cost).toFixed(2);
});

// Index for search functionality
PartSchema.index({ 
  name: 'text', 
  partNumber: 'text', 
  brand: 'text', 
  vendor: 'text',
  category: 'text'
});

// Compound index for common queries
PartSchema.index({ category: 1, isActive: 1 });
PartSchema.index({ vendor: 1, isActive: 1 });
PartSchema.index({ brand: 1, isActive: 1 });

// Pre-save middleware to update lastUpdated
PartSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastUpdated = new Date();
  }
  next();
});

// Instance method to check if part is profitable
PartSchema.methods.isProfitable = function() {
  return this.price > this.cost;
};

// Static method to find active parts
PartSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Static method to search parts
PartSchema.statics.searchParts = function(query) {
  const searchRegex = new RegExp(query, 'i');
  return this.find({
    isActive: true,
    $or: [
      { name: searchRegex },
      { partNumber: searchRegex },
      { brand: searchRegex },
      { vendor: searchRegex },
      { category: searchRegex }
    ]
  });
};

module.exports = mongoose.model('Part', PartSchema);