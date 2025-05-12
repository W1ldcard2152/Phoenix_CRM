const AppError = require('../utils/appError');

// Handle cast errors (invalid MongoDB IDs)
const handleCastError = err => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

// Handle duplicate key errors
const handleDuplicateFieldsError = err => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value.`;
  return new AppError(message, 400);
};

// Handle validation errors
const handleValidationError = err => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

// Handle JWT errors
const handleJWTError = () => 
  new AppError('Invalid token. Please log in again.', 401);

const handleJWTExpiredError = () => 
  new AppError('Your token has expired. Please log in again.', 401);

// Send detailed error in development
// Find this function in your errorHandler.js
const sendErrorDev = (err, req, res) => {
  // API errors
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  }
  
  // Rendered website errors (for future frontend integration)
  console.error('ERROR 💥', err);
  
  // Change this part to avoid using res.render() which requires a view engine
  return res.status(err.statusCode).send({
    title: 'Something went wrong!',
    msg: err.message
  });
  
  // Or if you prefer to just send a JSON response:
  /*
  return res.status(err.statusCode).json({
    title: 'Something went wrong!',
    msg: err.message
  });
  */
};

// Also modify this function similarly
const sendErrorProd = (err, req, res) => {
  // API errors
  if (req.originalUrl.startsWith('/api')) {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    }
    
    // Programming or unknown error: don't leak error details
    console.error('ERROR 💥', err);
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong'
    });
  }
  
  // Rendered website errors (for future frontend integration)
  if (err.isOperational) {
    // Change this to avoid using res.render()
    return res.status(err.statusCode).send({
      title: 'Something went wrong!',
      msg: err.message
    });
  }
  
  console.error('ERROR 💥', err);
  // Change this to avoid using res.render()
  return res.status(err.statusCode).send({
    title: 'Something went wrong!',
    msg: 'Please try again later'
  });
};

// Global error handling middleware
module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };
    error.message = err.message;
    
    // Handle specific error types
    if (error.name === 'CastError') error = handleCastError(error);
    if (error.code === 11000) error = handleDuplicateFieldsError(error);
    if (error.name === 'ValidationError') error = handleValidationError(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    
    sendErrorProd(error, req, res);
  }
};