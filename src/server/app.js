// src/server/app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const { xss } = require('express-xss-sanitizer');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const AppError = require('./utils/appError');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const customerRoutes = require('./routes/customerRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const workOrderRoutes = require('./routes/workOrderRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const authRoutes = require('./routes/authRoutes');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Trust proxy - this is important for rate limiting behind proxies
app.set('trust proxy', 1);

// Set security HTTP headers
app.use(helmet());

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Limit requests from same IP - modified for development vs production
if (process.env.NODE_ENV === 'production') {
  // Stricter limits for production
  const limiter = rateLimit({
    max: 100, // 100 requests
    windowMs: 60 * 60 * 1000, // 1 hour
    message: 'Too many requests from this IP, please try again in an hour!'
  });
  app.use('/api', limiter);
} else {
  // More lenient for development
  const devLimiter = rateLimit({
    max: 1000, // Much higher limit for development
    windowMs: 15 * 60 * 1000, // 15 minutes
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });
  app.use('/api', devLimiter);
}

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

// Compression middleware
app.use(compression());

// API routes
// Removed duplicate helmet middleware call
app.use('/api/users', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/workorders', workOrderRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/media', mediaRoutes);

// Basic route for testing API status
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Auto Repair CRM API is running'
  });
});

// Handle undefined routes
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handler
app.use(errorHandler);

module.exports = app;