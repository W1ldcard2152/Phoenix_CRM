const User = require('../models/User');
const Technician = require('../models/Technician');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const VALID_ROLES =
  User.schema?.path('role')?.enumValues ||
  ['admin', 'management', 'service-writer', 'technician'];
const VALID_STATUSES =
  User.schema?.path('status')?.enumValues || ['pending', 'active', 'disabled'];

const validateRoleAndStatus = (body, next) => {
  if (body.role !== undefined && !VALID_ROLES.includes(body.role)) {
    next(new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400));
    return false;
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    next(new AppError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400));
    return false;
  }
  return true;
};

// Guard against removing the last remaining active admin (lockout protection)
const wouldRemoveLastAdmin = async (targetUser, change) => {
  if (!targetUser || targetUser.role !== 'admin') return false;
  const losesAdmin =
    (change.role !== undefined && change.role !== 'admin') ||
    change.status === 'disabled' ||
    change.active === false;
  if (!losesAdmin) return false;
  const activeAdmins = await User.countDocuments({
    role: 'admin',
    status: { $ne: 'disabled' }
  });
  return activeAdmins <= 1;
};

// Get all users (including inactive) for admin panel
exports.getAllUsers = catchAsync(async (req, res, next) => {
  // Bypass the pre-find middleware that filters inactive users
  const users = await User.find({})
    .setOptions({ includeInactive: true })
    .select('+active')
    .populate('technician', 'name displayName email specialization isActive')
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

  if (!validateRoleAndStatus(req.body, next)) return;

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

// Update user (role, status, technician link, displayName)
exports.updateUser = catchAsync(async (req, res, next) => {
  const { role, status, technician, active, displayName } = req.body;

  if (!validateRoleAndStatus(req.body, next)) return;

  const updateData = {};
  if (role) updateData.role = role;
  if (status) updateData.status = status;
  if (technician !== undefined) updateData.technician = technician || null;
  if (active !== undefined) updateData.active = active;
  if (displayName !== undefined) updateData.displayName = displayName || null;

  const target = await User.findById(req.params.id).setOptions({ includeInactive: true });
  if (!target) {
    return next(new AppError('No user found with that ID', 404));
  }

  if (await wouldRemoveLastAdmin(target, updateData)) {
    return next(
      new AppError('Cannot remove or disable the last remaining admin account.', 400)
    );
  }

  const user = await User.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  }).populate('technician', 'name displayName email specialization isActive');

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  // Sync displayName to linked Technician record
  if (displayName !== undefined && user.technician) {
    const techId = user.technician._id || user.technician;
    await Technician.findByIdAndUpdate(techId, { displayName: displayName || null });
  }

  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

// Deactivate user (soft delete)
exports.deactivateUser = catchAsync(async (req, res, next) => {
  const target = await User.findById(req.params.id).setOptions({ includeInactive: true });
  if (!target) {
    return next(new AppError('No user found with that ID', 404));
  }

  if (await wouldRemoveLastAdmin(target, { active: false })) {
    return next(
      new AppError('Cannot disable the last remaining admin account.', 400)
    );
  }

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
