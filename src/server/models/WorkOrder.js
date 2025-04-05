const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Sub-schemas
const PartSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  partNumber: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  price: {
    type: Number,
    min: 0,
    default: 0
  },
  ordered: {
    type: Boolean,
    default: false
  },
  received: {
    type: Boolean,
    default: false
  }
});

const LaborSchema = new Schema({
  description: {
    type: String,
    required: true,
    trim: true
  },
  hours: {
    type: Number,
    required: true,
    min: 0
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  }
});

const MediaSchema = new Schema({
  type: {
    type: String,
    enum: ['Pre-Inspection', 'Diagnostic', 'Parts Receipt', 'Post-Inspection', 'Other'],
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true
  }
});

// Main WorkOrder Schema
const WorkOrderSchema = new Schema(
  {
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    priority: {
      type: String,
      enum: ['Low', 'Normal', 'High', 'Urgent'],
      default: 'Normal'
    },
    status: {
      type: String,
      enum: [
        'Created', 
        'Scheduled', 
        'In Progress', 
        'Inspected - Need Parts Ordered',
        'Parts Ordered',
        'Parts Received',
        'Repair In Progress',
        'Completed - Need Payment',
        'Completed - Paid',
        'On Hold',
        'Cancelled'
      ],
      default: 'Created'
    },
    serviceRequested: {
      type: String,
      required: true,
      trim: true
    },
    diagnosticNotes: {
      type: String,
      trim: true
    },
    parts: [PartSchema],
    labor: [LaborSchema],
    media: [MediaSchema],
    totalEstimate: {
      type: Number,
      min: 0,
      default: 0
    },
    totalActual: {
      type: Number,
      min: 0,
      default: 0
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment'
    }
  },
  {
    timestamps: true
  }
);

// Indexes for faster queries
WorkOrderSchema.index({ vehicle: 1 });
WorkOrderSchema.index({ customer: 1 });
WorkOrderSchema.index({ status: 1 });
WorkOrderSchema.index({ date: 1 });

// Virtual for parts cost calculation
WorkOrderSchema.virtual('partsCost').get(function() {
  return this.parts.reduce((total, part) => {
    return total + (part.price * part.quantity);
  }, 0);
});

// Virtual for labor cost calculation
WorkOrderSchema.virtual('laborCost').get(function() {
  return this.labor.reduce((total, labor) => {
    return total + (labor.hours * labor.rate);
  }, 0);
});

// Virtual for total cost calculation
WorkOrderSchema.virtual('totalCost').get(function() {
  return this.partsCost + this.laborCost;
});

// Method to update status and track status history
WorkOrderSchema.methods.updateStatus = function(newStatus, notes = '') {
  this.status = newStatus;
  
  // You could add status history tracking here if needed
  // this.statusHistory.push({ status: newStatus, date: new Date(), notes });
  
  return this.save();
};

const WorkOrder = mongoose.model('WorkOrder', WorkOrderSchema);

module.exports = WorkOrder;