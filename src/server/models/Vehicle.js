const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Mileage History Schema
const MileageRecordSchema = new Schema({
  date: {
    type: Date,
    required: [true, 'Mileage record date is required'],
    default: Date.now
  },
  mileage: {
    type: Number,
    required: [true, 'Mileage reading is required'],
    min: [0, 'Mileage cannot be negative']
  },
  source: { // Added source to track where the mileage entry came from
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  }
}, { _id: true, timestamps: true });

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
    currentMileage: {
      type: Number,
      min: [0, 'Mileage cannot be negative']
    },
    mileageHistory: [MileageRecordSchema],
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

// Pre-save middleware to update currentMileage from history
VehicleSchema.pre('save', function(next) {
  // If mileage history exists, update current mileage from the latest record
  if (this.mileageHistory && this.mileageHistory.length > 0) {
    // Sort by date descending
    const sortedHistory = [...this.mileageHistory].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    
    // Update current mileage if newest record is higher
    if (sortedHistory[0].mileage > (this.currentMileage || 0)) {
      this.currentMileage = sortedHistory[0].mileage;
    }
  }
  
  next();
});

// Method to get most recent work order
VehicleSchema.methods.getLatestWorkOrder = async function() {
  if (!this.serviceHistory.length) return null;
  
  return this.model('WorkOrder')
    .findOne({ _id: { $in: this.serviceHistory } })
    .sort({ createdAt: -1 });
};

// Method to add a mileage record
VehicleSchema.methods.addMileageRecord = function(mileage, date = new Date(), notes = '', source = '') {
  this.mileageHistory.push({
    date,
    mileage,
    notes,
    source // Added source
  });
  
  // Update current mileage if the new reading is higher
  if (mileage > (this.currentMileage || 0)) {
    this.currentMileage = mileage;
  }
  
  return this;
};

// Method to get mileage at a specific date (estimated if not exact)
VehicleSchema.methods.getMileageAtDate = function(date) {
  if (!this.mileageHistory || !this.mileageHistory.length) {
    return this.currentMileage || 0;
  }
  
  const targetDate = new Date(date);
  const sortedHistory = [...this.mileageHistory].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
  
  // Exact match
  const exactMatch = sortedHistory.find(record => 
    new Date(record.date).toDateString() === targetDate.toDateString()
  );
  
  if (exactMatch) {
    return exactMatch.mileage;
  }
  
  // Find closest records before and after
  const before = [...sortedHistory].reverse().find(record => 
    new Date(record.date) <= targetDate
  );
  
  const after = sortedHistory.find(record => 
    new Date(record.date) >= targetDate
  );
  
  // No records before, use first record or 0
  if (!before) {
    return after ? after.mileage : 0;
  }
  
  // No records after, use last record
  if (!after) {
    return before.mileage;
  }
  
  // Interpolate between the two closest records
  const beforeDate = new Date(before.date);
  const afterDate = new Date(after.date);
  const totalDays = (afterDate - beforeDate) / (1000 * 60 * 60 * 24);
  const daysBetween = (targetDate - beforeDate) / (1000 * 60 * 60 * 24);
  const ratio = daysBetween / totalDays;
  
  // Linear interpolation
  const estimatedMileage = before.mileage + (after.mileage - before.mileage) * ratio;
  
  return Math.round(estimatedMileage);
};

const Vehicle = mongoose.model('Vehicle', VehicleSchema);

module.exports = Vehicle;
