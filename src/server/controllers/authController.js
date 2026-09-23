const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const emailService = require('../services/emailService');
const {
  SELF_SERVICE_MINUTES,
  appBaseUrl,
  issuePasswordLink,
  clearPasswordLink
} = require('../utils/passwordLink');

// Create JWT token
const signToken = id => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

// Send JWT token in HTTP-only cookie (secure by default)
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  // Set cookie options - HTTP-only prevents XSS attacks from accessing the token
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true, // Cookie cannot be accessed by JavaScript - prevents XSS token theft
    sameSite: 'strict', // Prevents CSRF attacks
    secure: process.env.NODE_ENV === 'production' // Only send over HTTPS in production
  };

  // Remove password from output
  user.password = undefined;

  // Send cookie with JWT
  res.cookie('jwt', token, cookieOptions);

  // Return user data but NOT the token in the response body
  // The token is now only accessible via HTTP-only cookie
  res.status(statusCode).json({
    status: 'success',
    data: {
      user
    }
  });
};

// Log in user
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  // Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }
  
  // Check if user exists and password is correct
  const user = await User.findOne({ email }).select('+password');
  
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  if (user.status === 'disabled') {
    return next(new AppError('Your account has been disabled. Contact your administrator.', 403));
  }

  // If everything is ok, send token to client
  createSendToken(user, 200, res);
});

// Log out user - clear the HTTP-only cookie
exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  });

  res.status(200).json({ status: 'success' });
};

// Protect routes - middleware to check if user is logged in
exports.protect = catchAsync(async (req, res, next) => {
  // 1) Get token and check if it exists
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  
  if (!token) {
    return next(
      new AppError('You are not logged in. Please log in to get access.', 401)
    );
  }
  
  // 2) Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  
  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token no longer exists.', 401)
    );
  }
  
  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password. Please log in again.', 401)
    );
  }

  // 5) Check if user account is active and not disabled
  if (currentUser.status === 'disabled') {
    return next(
      new AppError('Your account has been disabled. Contact your administrator.', 403)
    );
  }

  // Grant access to protected route
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// Restrict routes to certain user roles
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // roles is an array like ['admin', 'service-writer']
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }
    
    next();
  };
};

// How a signed-out user can recover their password on this deployment. Public:
// the forgot-password page asks before showing a form, so a shop without email
// is told to ask their admin instead of waiting for a message that never comes.
exports.getPasswordResetMethod = (req, res) => {
  res.status(200).json({
    status: 'success',
    data: { method: emailService.emailEnabled ? 'email' : 'admin' }
  });
};

// Forgot password — emails a one-time link to the reset page
exports.forgotPassword = catchAsync(async (req, res, next) => {
  if (!emailService.emailEnabled) {
    return next(new AppError(
      "This shop can't send email yet. Ask your administrator for a password link.",
      503
    ));
  }

  // Always return the same response whether or not the email exists, to avoid
  // account enumeration.
  const genericResponse = () =>
    res.status(200).json({
      status: 'success',
      message: 'If an account with that email exists, a reset link has been sent.'
    });

  const email = String(req.body.email || '').toLowerCase().trim();
  const user = email && await User.findOne({ email });
  if (!user || user.status === 'disabled') {
    return genericResponse();
  }

  const { url } = await issuePasswordLink(user, {
    ttlMinutes: SELF_SERVICE_MINUTES,
    baseUrl: appBaseUrl(req)
  });

  try {
    await emailService.sendEmail({
      to: user.email,
      subject: 'Reset your password',
      text: `Someone asked to reset the password for ${user.email}.\n\n`
        + `Choose a new password here (the link works once, for ${SELF_SERVICE_MINUTES} minutes):\n${url}\n\n`
        + "If that wasn't you, ignore this email — your password hasn't changed.",
      html: `<p>Someone asked to reset the password for <strong>${user.email}</strong>.</p>`
        + `<p><a href="${url}">Choose a new password</a></p>`
        + `<p>The link works once, for ${SELF_SERVICE_MINUTES} minutes.</p>`
        + "<p>If that wasn't you, ignore this email — your password hasn't changed.</p>"
    });

    return genericResponse();
  } catch (err) {
    await clearPasswordLink(user);
    return next(new AppError('There was an error sending the email. Try again later.', 500));
  }
});

// Reset password — consumes a one-time link from forgotPassword, an admin, or
// scripts/password-link.js, sets the password, and signs the user in.
exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('This link is invalid or has expired. Ask for a new one.', 400));
  }
  if (user.status === 'disabled') {
    return next(new AppError('Your account has been disabled. Contact your administrator.', 403));
  }
  if (!req.body.password || !req.body.passwordConfirm) {
    return next(new AppError('Enter your new password twice.', 400));
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  // An invited user who has never signed in is `pending` until their first
  // Google sign-in. Setting a password through a link is an equally good
  // first sign-in, and is the only one available at a shop without Google.
  if (user.status === 'pending') user.status = 'active';
  await user.save(); // pre-save hashes it and stamps passwordChangedAt

  createSendToken(user, 200, res);
});

// Update current user password
exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get user from collection
  const user = await User.findById(req.user.id).select('+password');

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // 2) Check if posted current password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError('Your current password is incorrect', 401));
  }

  // 3) If so, update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  // 4) Log user in, send JWT
  createSendToken(user, 200, res);
});