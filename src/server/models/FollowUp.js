const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NoteEntrySchema = new Schema({
  text: {
    type: String,
    required: [true, 'Note text is required'],
    trim: true,
    maxlength: 2000
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  createdByName: {
    type: String,
    trim: true
  }
}, { _id: true });

const FollowUpSchema = new Schema({
  // Hierarchy refs - populated based on creation level
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    index: true
  },
  vehicle: {
    type: Schema.Types.ObjectId,
    ref: 'Vehicle',
    index: true
  },
  workOrder: {
    type: Schema.Types.ObjectId,
    ref: 'WorkOrder',
    index: true
  },
  appointment: {
    type: Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  invoice: {
    type: Schema.Types.ObjectId,
    ref: 'Invoice'
  },

  // The level at which this follow-up was created
  entityType: {
    type: String,
    enum: ['customer', 'vehicle', 'workOrder', 'appointment', 'invoice', 'quote'],
    required: [true, 'Entity type is required']
  },

  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },

  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },

  dueDate: {
    type: Date
  },

  // Notes array - first entry is the initial note
  notes: {
    type: [NoteEntrySchema],
    validate: {
      validator: function(arr) {
        return arr.length >= 1;
      },
      message: 'At least one note is required'
    }
  },

  // Resolution
  resolutionNote: {
    type: String,
    trim: true
  },
  closedAt: {
    type: Date
  },
  closedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },

  // Audit
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByName: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
FollowUpSchema.index({ status: 1, dueDate: 1 });
FollowUpSchema.index({ customer: 1, status: 1 });
FollowUpSchema.index({ workOrder: 1, status: 1 });

// Virtual: isOverdue
FollowUpSchema.virtual('isOverdue').get(function() {
  return !!(this.status === 'open' && this.dueDate && this.dueDate < new Date());
});

FollowUpSchema.set('toJSON', { virtuals: true });
FollowUpSchema.set('toObject', { virtuals: true });

const FollowUp = mongoose.model('FollowUp', FollowUpSchema);

module.exports = FollowUp;
