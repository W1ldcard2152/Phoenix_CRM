const mongoose = require('mongoose');

const technicianSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Technician name is required.'],
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
    // Basic phone validation (optional, can be more complex)
    // match: [/^[+]?[(]?[0-9]{3}[)]?[-s.]?[0-9]{3}[-s.]?[0-9]{4,6}$/, 'Please fill a valid phone number']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true, // Allows multiple documents to have a null email, but unique if email is present
    // Basic email validation
    // match: [/\S+@\S+\.\S+/, 'Please fill a valid email address']
  },
  specialization: {
    type: String,
    trim: true,
  },
  hourlyRate: {
    type: Number,
    min: [0, 'Hourly rate cannot be negative.'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  notes: {
    type: String,
    trim: true,
  },
}, { timestamps: true });

// Index for searching by name (optional, improves query performance)
technicianSchema.index({ name: 'text' });

const Technician = mongoose.model('Technician', technicianSchema);

module.exports = Technician;
