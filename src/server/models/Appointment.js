const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AppointmentSchema = new Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true
    },
    serviceType: {
      type: String,
      required: true,
      trim: true
    },
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date,
      required: true
    },
    technician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Technician',
      // required: false // A technician might not be assigned immediately
    },
    notes: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['Scheduled', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'No-Show'],
      default: 'Scheduled'
    },
    workOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkOrder'
    },
    reminder: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date
    },
    followUp: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date
    }
  },
  {
    timestamps: true
  }
);

// Indexes for faster queries
AppointmentSchema.index({ startTime: 1, endTime: 1 });
AppointmentSchema.index({ customer: 1 });
AppointmentSchema.index({ vehicle: 1 });
AppointmentSchema.index({ status: 1 });
// Technician index might need to be re-evaluated or removed if not frequently queried directly
// AppointmentSchema.index({ technician: 1 }); 

// Virtual for duration in hours
AppointmentSchema.virtual('durationHours').get(function() {
  return (this.endTime - this.startTime) / (1000 * 60 * 60);
});

// Method to check for appointment conflicts
AppointmentSchema.statics.checkConflicts = async function(startTime, endTime, technician, excludeId = null) {
  const query = {
    $or: [
      // Case 1: New appointment starts during an existing one
      { 
        startTime: { $lte: startTime },
        endTime: { $gt: startTime }
      },
      // Case 2: New appointment ends during an existing one
      {
        startTime: { $lt: endTime },
        endTime: { $gte: endTime }
      },
      // Case 3: New appointment contains an existing one
      {
        startTime: { $gte: startTime },
        endTime: { $lte: endTime }
      }
    ],
    status: { $nin: ['Cancelled', 'Completed', 'No-Show'] }
  };
  
  if (technician) {
    query.technician = technician;
  }
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  return await this.find(query);
};

// Method to create a work order from an appointment
AppointmentSchema.methods.createWorkOrder = async function() {
  const WorkOrder = mongoose.model('WorkOrder');
  
  const workOrderData = {
    vehicle: this.vehicle,
    customer: this.customer,
    date: this.startTime,
    serviceRequested: this.serviceType,
    status: 'Scheduled', // Or derive from appointment status if needed
    appointmentId: this._id,
  };

  if (this.technician) {
    workOrderData.assignedTechnician = this.technician; // Pass technician to WorkOrder
  }
  
  const workOrder = new WorkOrder(workOrderData);
  const savedWorkOrder = await workOrder.save();
  this.workOrder = savedWorkOrder._id;
  
  return this.save();
};

const Appointment = mongoose.model('Appointment', AppointmentSchema);

module.exports = Appointment;
