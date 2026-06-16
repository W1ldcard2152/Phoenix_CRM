const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Filter object to only allow specific fields
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach(el => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

// Allowed enum values, sourced from the schema so they can't drift.
// Fall back to literals when the model is mocked (e.g. in unit tests).
const VALID_ROLES =
  User.schema?.path('role')?.enumValues ||
  ['admin', 'management', 'service-writer', 'technician'];
const VALID_STATUSES =
  User.schema?.path('status')?.enumValues || ['pending', 'active', 'disabled'];

// Reject role/status values that aren't in the schema enum (clear 400 instead
// of a generic mongoose validation error, and prevents silently-ignored input)
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

// Guard against removing the last remaining admin (lockout protection).
// `change` describes the pending change to the target user.
const wouldRemoveLastAdmin = async (targetUser, change) => {
  if (!targetUser || targetUser.role !== 'admin') return false;
  const losesAdmin =
    (change.role !== undefined && change.role !== 'admin') ||
    change.status === 'disabled' ||
    change.active === false;
  if (!losesAdmin) return false;
  // countDocuments is not affected by the pre-find `active` filter, so the
  // status guard alone is what excludes disabled admins here.
  const activeAdmins = await User.countDocuments({ role: 'admin', status: { $ne: 'disabled' } });
  return activeAdmins <= 1;
};

// Get all users
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const users = await User.find();
  
  res.status(200).json({
    status: 'success',
    results: users.length,
    data: {
      users
    }
  });
});

// Get current user
exports.getMe = (req, res, next) => {
  req.params.id = req.user.id;
  next();
};

// Update current user data (not password)
exports.updateMe = catchAsync(async (req, res, next) => {
  // 1) Create error if user tries to update password
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /updateMyPassword.',
        400
      )
    );
  }
  
  // 2) Filter unwanted fields that are not allowed to be updated
  const filteredBody = filterObj(req.body, 'name', 'email');
  
  // 3) Update user document
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser
    }
  });
});

// Deactivate current user (soft delete)
exports.deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { active: false });
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Get user by ID
exports.getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .populate('technician', 'name email specialization isActive');

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

// Create new user (admin only)
exports.createUser = catchAsync(async (req, res, next) => {
  if (!validateRoleAndStatus(req.body, next)) return;

  // Whitelist fields so callers can't inject arbitrary schema fields
  const filteredBody = filterObj(
    req.body,
    'name',
    'email',
    'password',
    'passwordConfirm',
    'role',
    'status',
    'technician',
    'displayName'
  );

  const newUser = await User.create(filteredBody);

  res.status(201).json({
    status: 'success',
    data: {
      user: newUser
    }
  });
});

// Update user (admin only)
exports.updateUser = catchAsync(async (req, res, next) => {
  // Don't allow password updates through this route
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /resetPassword.',
        400
      )
    );
  }

  if (!validateRoleAndStatus(req.body, next)) return;

  // Whitelist fields — never trust req.body to set role/status/active directly
  const filteredBody = filterObj(
    req.body,
    'name',
    'email',
    'role',
    'status',
    'active',
    'technician',
    'displayName'
  );

  const target = await User.findById(req.params.id).setOptions({ includeInactive: true });
  if (!target) {
    return next(new AppError('No user found with that ID', 404));
  }

  if (await wouldRemoveLastAdmin(target, filteredBody)) {
    return next(
      new AppError('Cannot remove or disable the last remaining admin account.', 400)
    );
  }

  const user = await User.findByIdAndUpdate(req.params.id, filteredBody, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

// Delete user (admin only - hard delete)
exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);
  
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});