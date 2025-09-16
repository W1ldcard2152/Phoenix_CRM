const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CustomerInteractionSchema = new Schema(
  {
    workOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkOrder',
      required: true,
      index: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true
    },
    contactType: {
      type: String,
      enum: ['Phone Call', 'Text Message', 'Email', 'In Person', 'Voicemail', 'Other'],
      required: true
    },
    direction: {
      type: String,
      enum: ['Incoming', 'Outgoing'],
      default: 'Outgoing'
    },
    reason: {
      type: String,
      enum: [
        'Initial Contact',
        'Estimate Provided',
        'Estimate Approval',
        'Estimate Declined',
        'Parts Update',
        'Schedule Appointment',
        'Status Update',
        'Payment Discussion',
        'Additional Work Found',
        'Completion Notification',
        'Follow Up',
        'Customer Question',
        'Other'
      ],
      required: true
    },
    outcome: {
      type: String,
      enum: [
        'Spoke with Customer',
        'Left Voicemail',
        'No Answer',
        'Email Sent',
        'Text Sent',
        'Approved',
        'Declined',
        'Callback Requested',
        'Rescheduled',
        'Payment Received',
        'Awaiting Response',
        'Other'
      ],
      required: true
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    followUpRequired: {
      type: Boolean,
      default: false
    },
    followUpDate: {
      type: Date
    },
    followUpNotes: {
      type: String,
      trim: true,
      maxlength: 500
    },
    contactPerson: {
      type: String,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    completedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
CustomerInteractionSchema.index({ workOrder: 1, createdAt: -1 });
CustomerInteractionSchema.index({ customer: 1, createdAt: -1 });
CustomerInteractionSchema.index({ followUpRequired: 1, followUpDate: 1 });
CustomerInteractionSchema.index({ createdAt: -1 });

// Virtual for formatted dates
CustomerInteractionSchema.virtual('formattedCreatedAt').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

CustomerInteractionSchema.virtual('formattedFollowUpDate').get(function() {
  if (!this.followUpDate) return null;
  return this.followUpDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
});

// Check if follow-up is overdue
CustomerInteractionSchema.virtual('isOverdue').get(function() {
  if (!this.followUpRequired || !this.followUpDate || this.completedAt) {
    return false;
  }
  return new Date() > this.followUpDate;
});

// Method to mark follow-up as complete
CustomerInteractionSchema.methods.completeFollowUp = function(userId) {
  this.followUpRequired = false;
  this.completedAt = new Date();
  this.completedBy = userId;
  return this.save();
};

// Ensure virtuals are included when converting to JSON
CustomerInteractionSchema.set('toJSON', { virtuals: true });

const CustomerInteraction = mongoose.model('CustomerInteraction', CustomerInteractionSchema);

module.exports = CustomerInteraction;