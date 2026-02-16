const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide your name'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Please provide your email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
    },
    password: {
      type: String,
      minlength: 8,
      select: false,
      // Password is required only for non-OAuth and non-pending users
      required: [function() { return !this.googleId && this.status !== 'pending'; }, 'Please provide a password']
    },
    passwordConfirm: {
      type: String,
      // Only required when password is being set
      required: [function() { return this.password && this.isModified('password'); }, 'Please confirm your password'],
      validate: {
        validator: function(val) {
          return val === this.password;
        },
        message: 'Passwords do not match'
      }
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    avatar: {
      type: String
    },
    technician: {
      type: Schema.Types.ObjectId,
      ref: 'Technician',
      sparse: true
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'disabled'],
      default: 'active'
    },
    role: {
      type: String,
      enum: ['admin', 'management', 'service-writer', 'technician'],
      default: 'technician'
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    active: {
      type: Boolean,
      default: true,
      select: false
    }
  },
  {
    timestamps: true
  }
);

// Pre-save middleware to hash the password
UserSchema.pre('save', async function(next) {
  // Skip if password was not modified or doesn't exist (OAuth users)
  if (!this.isModified('password') || !this.password) return next();

  // Hash the password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);

  // Delete passwordConfirm field
  this.passwordConfirm = undefined;

  // Update passwordChangedAt if password is being changed (not on new user)
  if (!this.isNew) {
    this.passwordChangedAt = Date.now() - 1000;
  }

  next();
});

// Pre-query middleware to exclude inactive users
// Set option { includeInactive: true } to bypass this filter (admin queries)
UserSchema.pre(/^find/, function(next) {
  if (!this.getOptions().includeInactive) {
    this.find({ active: { $ne: false } });
  }
  next();
});

// Instance method to check if password is correct
UserSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Check if user changed password after token was issued
UserSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  
  // False means NOT changed
  return false;
};

// Generate password reset token
UserSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

const User = mongoose.model('User', UserSchema);

module.exports = User;