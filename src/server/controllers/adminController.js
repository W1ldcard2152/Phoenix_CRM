const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all users (including inactive) for admin panel
exports.getAllUsers = catchAsync(async (req, res, next) => {
  // Bypass the pre-find middleware that filters inactive users
  const users = await User.find({})
    .setOptions({ includeInactive: true })
    .select('+active')
    .populate('technician', 'name email specialization isActive')
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { users }
  });
});

// Pre-authorize a new user (admin invites by email)
exports.preAuthorizeUser = catchAsync(async (req, res, next) => {
  const { email, role, technician } = req.body;

  if (!email) {
    return next(new AppError('Email is required', 400));
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('A user with this email already exists', 400));
  }

  const newUser = await User.create({
    name: email.split('@')[0], // Placeholder name from email
    email,
    role: role || 'technician',
    technician: technician || undefined,
    status: 'pending',
    // No password — they'll sign in via Google OAuth
    googleId: undefined
  });

  res.status(201).json({
    status: 'success',
    data: { user: newUser }
  });
});

// Update user (role, status, technician link)
exports.updateUser = catchAsync(async (req, res, next) => {
  const { role, status, technician, active } = req.body;

  const updateData = {};
  if (role) updateData.role = role;
  if (status) updateData.status = status;
  if (technician !== undefined) updateData.technician = technician || null;
  if (active !== undefined) updateData.active = active;

  const user = await User.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  }).populate('technician', 'name email specialization isActive');

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

// Deactivate user (soft delete)
exports.deactivateUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { active: false, status: 'disabled' },
    { new: true }
  );

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { user }
  });
});
