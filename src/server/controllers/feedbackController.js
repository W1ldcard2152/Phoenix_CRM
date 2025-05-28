const Feedback = require('../models/Feedback');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all feedback
exports.getAllFeedback = catchAsync(async (req, res, next) => {
  const feedback = await Feedback.find().populate({
    path: 'user',
    select: 'name email' // Only select name and email from the technician
  });
  
  res.status(200).json({
    status: 'success',
    results: feedback.length,
    data: {
      feedback
    }
  });
});

// Get a single feedback entry
exports.getFeedback = catchAsync(async (req, res, next) => {
  const feedback = await Feedback.findById(req.params.id).populate({
    path: 'user',
    select: 'name email'
  });
  
  if (!feedback) {
    return next(new AppError('No feedback entry found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      feedback
    }
  });
});

// Create a new feedback entry
exports.createFeedback = catchAsync(async (req, res, next) => {
  const newFeedback = await Feedback.create(req.body);
  
  res.status(201).json({
    status: 'success',
    data: {
      feedback: newFeedback
    }
  });
});

// Update a feedback entry
exports.updateFeedback = catchAsync(async (req, res, next) => {
  const feedback = await Feedback.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  if (!feedback) {
    return next(new AppError('No feedback entry found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      feedback
    }
  });
});

// Delete a feedback entry
exports.deleteFeedback = catchAsync(async (req, res, next) => {
  const feedback = await Feedback.findByIdAndDelete(req.params.id);
  
  if (!feedback) {
    return next(new AppError('No feedback entry found with that ID', 404));
  }
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Archive a feedback entry
exports.archiveFeedback = catchAsync(async (req, res, next) => {
  const feedback = await Feedback.findByIdAndUpdate(
    req.params.id,
    { archived: true, archivedAt: new Date() },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!feedback) {
    return next(new AppError('No feedback entry found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      feedback,
    },
  });
});
