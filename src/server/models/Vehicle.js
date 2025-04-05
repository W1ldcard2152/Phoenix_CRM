const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VehicleSchema = new Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required']
    },
    year: {
      type: Number,
      required: [true, 'Vehicle year is required'],
      min: [1900, 'Year must be at least 1900'],
      max: [new Date().getFullYear() + 1, `Year cannot be in the future`]
    },
    make: {
      type: String,
      required: [true, 'Vehicle make is required'],
      trim: true
    },
    model: {
      type: String,
      required: [true, 'Vehicle model is required'],
      trim: true
    },
    vin: {
      type: String,
      trim: true,
      minlength: [11, 'VIN must be at least 11 characters'],
      maxlength: [17, 'VIN cannot exceed 17 characters']
    },
    licensePlate: {
      type: String,
      trim: true
    },
    serviceHistory: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkOrder'
    }],
    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for faster queries
VehicleSchema.index({ customer: 1 });
VehicleSchema.index({ vin: 1 });
VehicleSchema.index({ licensePlate: 1 });
VehicleSchema.index({ make: 1, model: 1 });

// Virtual for vehicle display name
VehicleSchema.virtual('displayName').get(function() {
  return `${this.year} ${this.make} ${this.model}`;
});

// Method to get most recent work order
VehicleSchema.methods.getLatestWorkOrder = async function() {
  if (!this.serviceHistory.length) return null;
  
  return this.model('WorkOrder')
    .findOne({ _id: { $in: this.serviceHistory } })
    .sort({ createdAt: -1 });
};

const Vehicle = mongoose.model('Vehicle', VehicleSchema);

module.exports = Vehicle;