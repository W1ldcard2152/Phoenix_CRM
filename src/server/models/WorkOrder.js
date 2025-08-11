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
  },
  vendor: { // Or purchaseLocation
    type: String,
    trim: true
  },
  purchaseOrderNumber: { // Or orderNumber
    type: String,
    trim: true
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

// Service Schema (new addition)
const ServiceSchema = new Schema({
  description: {
    type: String,
    required: true,
    trim: true
  }
});

// Main WorkOrder Schema
const WorkOrderSchema = new Schema(
  {
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: false
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    currentMileage: { // Added currentMileage
      type: Number,
      min: 0
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
        'Inspection In Progress', 
        'Inspected/Parts Ordered',
        'Parts Received',
        'Repair In Progress',
        'Completed - Awaiting Payment',
        'Invoiced',
        'On Hold',
        'Cancelled'
      ],
      default: 'Created'
    },
    // Replace single serviceRequested with services array
    services: [ServiceSchema],
    // Keep serviceRequested for backward compatibility
    serviceRequested: {
      type: String,
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
    },
    assignedTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Technician'
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

// Middleware to handle backward compatibility
WorkOrderSchema.pre('save', function(next) {
  // If serviceRequested exists but services is empty, migrate it
  if (this.serviceRequested && (!this.services || this.services.length === 0)) {
    this.services = [{ description: this.serviceRequested }];
  }
  
  // If services exists, update serviceRequested for backward compatibility
  if (this.services && this.services.length > 0) {
    // Join all service descriptions with linebreaks for display in single field
    this.serviceRequested = this.services.map(service => service.description).join('\n');
  }
  
  next();
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
