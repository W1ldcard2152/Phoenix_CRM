const mongoose = require('mongoose');
const Schema = mongoose.Schema;

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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Assuming you'll have a User model eventually
      required: true
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
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Ensure virtuals are included when converting to JSON
WorkOrderNoteSchema.set('toJSON', { virtuals: true });

const WorkOrderNote = mongoose.model('WorkOrderNote', WorkOrderNoteSchema);

module.exports = WorkOrderNote;