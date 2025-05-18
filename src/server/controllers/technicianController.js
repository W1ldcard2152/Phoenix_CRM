const Technician = require('../models/Technician');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Create a new technician
exports.createTechnician = catchAsync(async (req, res, next) => {
  const newTechnician = await Technician.create(req.body);
  res.status(201).json({
    status: 'success',
    data: {
      technician: newTechnician,
    },
  });
});

// Get all technicians
exports.getAllTechnicians = catchAsync(async (req, res, next) => {
  // Allow filtering by isActive status, defaults to true
  const query = { isActive: req.query.isActive === 'false' ? false : true };
  
  const technicians = await Technician.find(query).sort({ name: 1 }); // Sort by name

  res.status(200).json({
    status: 'success',
    results: technicians.length,
    data: {
      technicians,
    },
  });
});

// Get a single technician by ID
exports.getTechnicianById = catchAsync(async (req, res, next) => {
  const technician = await Technician.findById(req.params.id);

  if (!technician) {
    return next(new AppError('No technician found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      technician,
    },
  });
});

// Update a technician
exports.updateTechnician = catchAsync(async (req, res, next) => {
  const technician = await Technician.findByIdAndUpdate(req.params.id, req.body, {
    new: true, // Return the modified document rather than the original
    runValidators: true, // Ensure that updates adhere to schema validation
  });

  if (!technician) {
    return next(new AppError('No technician found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      technician,
    },
  });
});

// Delete a technician (soft delete by setting isActive to false)
exports.deleteTechnician = catchAsync(async (req, res, next) => {
  const technician = await Technician.findByIdAndUpdate(req.params.id, { isActive: false }, {
    new: true,
  });

  if (!technician) {
    return next(new AppError('No technician found with that ID to deactivate', 404));
  }

  res.status(200).json({ // Changed to 200 as it's an update, not a full deletion
    status: 'success',
    message: 'Technician deactivated successfully',
    data: {
        technician
    }
  });
});

// To permanently delete a technician (optional, use with caution)
// exports.permanentlyDeleteTechnician = catchAsync(async (req, res, next) => {
//   const technician = await Technician.findByIdAndDelete(req.params.id);
//   if (!technician) {
//     return next(new AppError('No technician found with that ID', 404));
//   }
//   res.status(204).json({
//     status: 'success',
//     data: null,
//   });
// });
