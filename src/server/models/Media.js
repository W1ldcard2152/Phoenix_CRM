const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MediaSchema = new Schema(
  {
    workOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkOrder'
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle'
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer'
    },
    type: {
      type: String,
      enum: ['Pre-Inspection', 'Diagnostic', 'Parts Receipt', 'Post-Inspection', 'Customer Document', 'Other'],
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
    fileType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain', 'other'],
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    notes: {
      type: String,
      trim: true
    },
    isShared: {
      type: Boolean,
      default: false
    },
    sharedWith: [{
      email: String,
      sharedAt: {
        type: Date,
        default: Date.now
      }
    }],
    uploadedBy: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for faster queries
MediaSchema.index({ workOrder: 1 });
MediaSchema.index({ vehicle: 1 });
MediaSchema.index({ customer: 1 });
MediaSchema.index({ type: 1 });
MediaSchema.index({ createdAt: 1 });

// Generate a public sharing link
MediaSchema.methods.generateSharingLink = function(expirationHours = 24) {
  // This would be implemented with your chosen authentication method
  // For demonstration purposes only
  const expirationTime = new Date();
  expirationTime.setHours(expirationTime.getHours() + expirationHours);
  
  return {
    url: `${process.env.API_URL}/media/shared/${this._id}`,
    expiresAt: expirationTime
  };
};

// Method to share media with a customer via email
MediaSchema.methods.shareViaEmail = async function(email) {
  this.isShared = true;
  
  // Check if already shared with this email
  const alreadyShared = this.sharedWith.some(share => share.email === email);
  
  if (!alreadyShared) {
    this.sharedWith.push({
      email,
      sharedAt: new Date()
    });
  }
  
  // Here you would implement the email sending logic
  // For example:
  // await sendMediaSharingEmail(email, this.generateSharingLink());
  
  return this.save();
};

const Media = mongoose.model('Media', MediaSchema);

module.exports = Media;