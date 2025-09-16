// src/server/app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path'); // Import path module

// Load environment variables FIRST
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

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
const invoiceRoutes = require('./routes/invoiceRoutes');
const authRoutes = require('./routes/authRoutes');
const technicianRoutes = require('./routes/technicianRoutes'); // Import technician routes
const feedbackRoutes = require('./routes/feedbackRoutes'); // Import feedback routes
const partRoutes = require('./routes/partRoutes'); // Import part routes
const vinRoutes = require('./routes/vinRoutes'); // Import VIN routes
const registrationRoutes = require('./routes/registrationRoutes'); // Import registration routes
const searchRoutes = require('./routes/searchRoutes'); // Import search routes
const customerInteractionRoutes = require('./routes/customerInteractionRoutes'); // Import customer interaction routes
const workOrderNotesRoutes = require('./routes/workOrderNotesRoutes'); // Import work order notes routes

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
app.use(express.json({ limit: '10mb' })); // Increased for image uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Increased for image uploads
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());


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
app.use('/api/invoices', invoiceRoutes);
app.use('/api/technicians', technicianRoutes); // Use technician routes
app.use('/api/feedback', feedbackRoutes); // Use feedback routes
app.use('/api/parts', partRoutes); // Use part routes
app.use('/api/vin', vinRoutes); // Use VIN routes
app.use('/api/registration', registrationRoutes); // Use registration routes
app.use('/api/search', searchRoutes); // Use search routes
app.use('/api/interactions', customerInteractionRoutes); // Use customer interaction routes
app.use('/api/workorder-notes', workOrderNotesRoutes); // Use work order notes routes

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  // Serve the static files from the React app
  app.use(express.static(path.join(__dirname, '../client/build')));

  // Handles any requests that don't match the ones above
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
} else {
  // Basic route for testing API status in development
  app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Auto Repair CRM API is running'
  });
});
} // Add missing closing brace for the else block

// Handle undefined API routes (all other non-API GET requests are handled by serving index.html in production)
app.all('/api/*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handler
app.use(errorHandler);

module.exports = app;
