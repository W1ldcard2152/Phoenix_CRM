const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { formatDateTime } = require('../config/timezone');

const WorkOrderNoteSchema = new Schema(
  {
    workOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkOrder',
      required: true,
      index: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    isCustomerFacing: {
      type: Boolean,
      default: false
    },
    noteType: {
      type: String,
      enum: ['customer-facing', 'internal', 'interaction'],
      default: function() {
        // For backward compatibility: if isCustomerFacing is true, default to 'customer-facing', else 'internal'
        return this.isCustomerFacing ? 'customer-facing' : 'internal';
      }
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Assuming you'll have a User model eventually
      required: false // Allow system-generated notes without a user
    },
    createdByName: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true // This automatically adds createdAt and updatedAt
  }
);

// Indexes for better query performance
WorkOrderNoteSchema.index({ workOrder: 1, createdAt: -1 });
WorkOrderNoteSchema.index({ workOrder: 1, isCustomerFacing: 1 });

// Virtual for getting formatted creation date
WorkOrderNoteSchema.virtual('formattedCreatedAt').get(function() {
  return formatDateTime(this.createdAt);
});

// Ensure virtuals are included when converting to JSON
WorkOrderNoteSchema.set('toJSON', { virtuals: true });

// Pre-save hook to keep isCustomerFacing and noteType in sync bidirectionally
WorkOrderNoteSchema.pre('save', function(next) {
  const noteTypeModified = this.isModified('noteType');
  const isCustomerFacingModified = this.isModified('isCustomerFacing');

  if (noteTypeModified) {
    // noteType was explicitly set — sync isCustomerFacing from it
    this.isCustomerFacing = this.noteType === 'customer-facing';
  } else if (isCustomerFacingModified) {
    // isCustomerFacing was explicitly set — sync noteType from it
    this.noteType = this.isCustomerFacing ? 'customer-facing' : 'internal';
  }
  next();
});

const WorkOrderNote = mongoose.model('WorkOrderNote', WorkOrderNoteSchema);

module.exports = WorkOrderNote;