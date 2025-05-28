const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'Technician',
    required: [true, 'Feedback must belong to a technician.'],
  },
  feedbackText: {
    type: String,
    required: [true, 'Feedback text cannot be empty.'],
    trim: true,
  },
  archived: {
    type: Boolean,
    default: false,
  },
  archivedAt: Date,
}, { timestamps: true });

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;
