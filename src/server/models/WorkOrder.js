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
  itemNumber: { // Vendor SKU/Item number
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
  cost: { // Actual cost paid (before markup)
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
  vendor: { // Or purchaseLocation (marketplace/retailer)
    type: String,
    trim: true
  },
  supplier: { // Actual seller on marketplace (e.g., specific eBay seller)
    type: String,
    trim: true
  },
  purchaseOrderNumber: { // Or orderNumber
    type: String,
    trim: true
  },
  receiptImageUrl: { // Link to receipt in S3
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

// Checklist Item Schema - for tracking individual checklist items
const ChecklistItemSchema = new Schema({
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  value: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  syncedFromInspection: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Inspection Checklist Schema
const InspectionChecklistSchema = new Schema({
  // Pre-Inspection Setup
  mileage: ChecklistItemSchema,
  startVehicle: ChecklistItemSchema,
  runningVoltage: ChecklistItemSchema,
  keyOffVoltage: ChecklistItemSchema,
  preInspectionSmartScan: ChecklistItemSchema,

  // Physical Inspection
  leaksUnderVehicle: ChecklistItemSchema,
  tiresFront: ChecklistItemSchema,
  tiresRear: ChecklistItemSchema,
  brakesFront: ChecklistItemSchema,
  brakesRear: ChecklistItemSchema,
  engineOil: ChecklistItemSchema,
  brakeFluid: ChecklistItemSchema,
  coolant: ChecklistItemSchema,
  ballJoints: ChecklistItemSchema,
  tieRodEnds: ChecklistItemSchema,
  axleShafts: ChecklistItemSchema,
  shocksStruts: ChecklistItemSchema,
  wheelBearings: ChecklistItemSchema,
  controlArmBushings: ChecklistItemSchema,
  swayBarEndLinks: ChecklistItemSchema,
  accessoryBelt: ChecklistItemSchema,
  exhaust: ChecklistItemSchema,

  // Documentation
  preScanUploaded: ChecklistItemSchema,
  inspectionNotes: ChecklistItemSchema,

  lastModified: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Repair Checklist Schema
const RepairChecklistSchema = new Schema({
  // Pre-Repair Setup
  getKeys: ChecklistItemSchema,
  mileage: ChecklistItemSchema,
  startVehicle: ChecklistItemSchema,
  runningVoltage: ChecklistItemSchema,
  preRepairSmartScan: ChecklistItemSchema,
  testDrive: ChecklistItemSchema,
  driveIntoBay: ChecklistItemSchema,
  keyOffVoltage: ChecklistItemSchema,
  liftVehicle: ChecklistItemSchema,
  positionTools: ChecklistItemSchema,

  // Physical Pre-Inspection (same items as inspection)
  leaksUnderVehicle: ChecklistItemSchema,
  tiresFront: ChecklistItemSchema,
  tiresRear: ChecklistItemSchema,
  brakesFront: ChecklistItemSchema,
  brakesRear: ChecklistItemSchema,
  engineOil: ChecklistItemSchema,
  brakeFluid: ChecklistItemSchema,
  coolant: ChecklistItemSchema,
  ballJoints: ChecklistItemSchema,
  tieRodEnds: ChecklistItemSchema,
  axleShafts: ChecklistItemSchema,
  shocksStruts: ChecklistItemSchema,
  wheelBearings: ChecklistItemSchema,
  controlArmBushings: ChecklistItemSchema,
  swayBarEndLinks: ChecklistItemSchema,
  accessoryBelt: ChecklistItemSchema,
  exhaust: ChecklistItemSchema,

  // Repair Work
  repairComplete: ChecklistItemSchema,

  // Post-Repair Checklist
  checkUnderVehicle: ChecklistItemSchema,
  checkSuspensionBolts: ChecklistItemSchema,
  lowerVehicle: ChecklistItemSchema,
  torqueLugNuts: ChecklistItemSchema,
  checkInteriorUnderHood: ChecklistItemSchema,
  verifyRepair: ChecklistItemSchema,
  moduleReset: ChecklistItemSchema,
  postRepairSmartScan: ChecklistItemSchema,
  postRepairTestDrive: ChecklistItemSchema,
  parkVehicle: ChecklistItemSchema,

  // Documentation
  preScanUploaded: ChecklistItemSchema,
  postScanUploaded: ChecklistItemSchema,
  voltageRecorded: ChecklistItemSchema,
  mileageRecorded: ChecklistItemSchema,
  postRepairNotes: ChecklistItemSchema,

  lastModified: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

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
        'Quote',
        'Work Order Created',
        'Appointment Scheduled',
        'Appointment Complete',
        'Inspection In Progress',
        'Inspection/Diag Complete',
        'Parts Ordered',
        'Parts Received',
        'Repair In Progress',
        'Repair Complete - Awaiting Payment',
        'Repair Complete - Invoiced',
        'On Hold',
        'Cancelled',
        'Quote - Archived'
      ],
      default: 'Work Order Created'
    },
    statusChangedAt: {
      type: Date,
      default: Date.now
    },
    holdReason: {
      type: String,
      enum: [
        'Waiting for Parts',
        'Waiting for Customer Approval',
        'Waiting for Insurance',
        'Customer Requested Delay',
        'Shop Capacity',
        'Backordered Parts',
        'Vehicle Storage',
        'Other'
      ],
    },
    holdReasonOther: {
      type: String,
      trim: true
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
    // New appointments array for one-to-many relationship
    // Kept appointmentId above for backward compatibility
    appointments: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment'
    }],
    assignedTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Technician'
    },
    skipDiagnostics: {
      type: Boolean,
      default: false
    },
    // Checklists for technician workflow
    inspectionChecklist: InspectionChecklistSchema,
    repairChecklist: RepairChecklistSchema
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

// Middleware to handle backward compatibility and status change tracking
WorkOrderSchema.pre('save', function(next) {
  // Track when status changes for age-based dashboard indicators
  if (this.isModified('status')) {
    this.statusChangedAt = new Date();
  }

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
