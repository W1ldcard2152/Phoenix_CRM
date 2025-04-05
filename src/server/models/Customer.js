const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CustomerSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zip: { type: String, trim: true }
    },
    vehicles: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Vehicle' 
    }],
    communicationPreference: {
      type: String,
      enum: ['SMS', 'Email', 'Phone', 'None'],
      default: 'SMS'
    },
    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Index for faster queries
CustomerSchema.index({ name: 1 });
CustomerSchema.index({ email: 1 });
CustomerSchema.index({ phone: 1 });

// Virtual for full address
CustomerSchema.virtual('fullAddress').get(function() {
  const { street, city, state, zip } = this.address;
  return [street, city, state, zip].filter(Boolean).join(', ');
});

// Method to get customer's most recent vehicle
CustomerSchema.methods.getMostRecentVehicle = async function() {
  if (!this.vehicles.length) return null;
  
  return this.model('Vehicle')
    .findOne({ _id: { $in: this.vehicles } })
    .sort({ createdAt: -1 });
};

const Customer = mongoose.model('Customer', CustomerSchema);

module.exports = Customer;