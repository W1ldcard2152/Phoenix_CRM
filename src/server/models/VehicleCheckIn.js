const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * A vehicle a technician scanned that isn't on file yet. Technicians don't
 * see or create customers, so the scan waits here until someone in the
 * office works out whose car it is and turns it into a vehicle (resolved),
 * or throws it away (dismissed).
 *
 * `scan` is the interpreted scan result (vehicleScanInterpreter output),
 * trimmed to known keys by the controller before it is stored.
 */
const VehicleCheckInSchema = new Schema({
  // Not `required`: Mongoose minimizes an empty object away, which would then
  // fail validation on every later save (e.g. resolving the check-in).
  scan: {
    type: Schema.Types.Mixed
  },
  vin: {
    type: String,
    trim: true,
    uppercase: true
  },
  // "2007 GMC Envoy", for lists — the scan may not have decoded all three.
  vehicleSummary: {
    type: String,
    trim: true
  },
  mileage: {
    type: Number,
    min: 0
  },
  mileageFromPhoto: {
    type: Boolean,
    default: false
  },
  note: {
    type: String,
    trim: true,
    maxlength: 500
  },

  technician: {
    type: Schema.Types.ObjectId,
    ref: 'Technician'
  },
  submittedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  submittedByName: {
    type: String,
    trim: true
  },
  // The technician's service writer at submit time; unset → anyone in the office.
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },

  status: {
    type: String,
    enum: ['open', 'resolved', 'dismissed'],
    default: 'open'
  },
  vehicle: {
    type: Schema.Types.ObjectId,
    ref: 'Vehicle'
  },
  resolvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

VehicleCheckInSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('VehicleCheckIn', VehicleCheckInSchema);
