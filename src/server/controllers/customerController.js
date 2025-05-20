const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all customers
exports.getAllCustomers = catchAsync(async (req, res, next) => {
  const customers = await Customer.find();
  
  res.status(200).json({
    status: 'success',
    results: customers.length,
    data: {
      customers
    }
  });
});

// Get a single customer
exports.getCustomer = catchAsync(async (req, res, next) => {
  const customer = await Customer.findById(req.params.id).populate('vehicles');
  
  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      customer
    }
  });
});

// Create a new customer
exports.createCustomer = catchAsync(async (req, res, next) => {
  const newCustomer = await Customer.create(req.body);
  
  res.status(201).json({
    status: 'success',
    data: {
      customer: newCustomer
    }
  });
});

// Update a customer
exports.updateCustomer = catchAsync(async (req, res, next) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      customer
    }
  });
});

// Delete a customer
exports.deleteCustomer = catchAsync(async (req, res, next) => {
  const customer = await Customer.findById(req.params.id);
  
  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }
  
  // Check if customer has any vehicles
  const vehicleCount = await Vehicle.countDocuments({ customer: req.params.id });
  
  if (vehicleCount > 0) {
    return next(
      new AppError(
        'This customer has associated vehicles. Please delete or reassign them first.',
        400
      )
    );
  }
  
  await Customer.findByIdAndDelete(req.params.id);
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Search customers
exports.searchCustomers = catchAsync(async (req, res, next) => {
  const { query } = req.query;
  
  if (!query) {
    return next(new AppError('Please provide a search query', 400));
  }
  
  const customers = await Customer.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } },
      { phone: { $regex: query, $options: 'i' } },
      { 'address.street': { $regex: query, $options: 'i' } },
      { 'address.city': { $regex: query, $options: 'i' } }
    ]
  });
  
  res.status(200).json({
    status: 'success',
    results: customers.length,
    data: {
      customers
    }
  });
});

// Check if customer exists by phone
exports.checkExistingCustomerByPhone = catchAsync(async (req, res, next) => {
  const { phone } = req.query;

  if (!phone) {
    return next(new AppError('Please provide a phone number', 400));
  }

  const customer = await Customer.findOne({ phone });

  if (!customer) {
    return res.status(200).json({
      status: 'success',
      exists: false,
      message: 'No customer found with this phone number.'
    });
  }

  res.status(200).json({
    status: 'success',
    exists: true,
    data: {
      customer
    }
  });
});

// Get customer vehicles
exports.getCustomerVehicles = catchAsync(async (req, res, next) => {
  const customer = await Customer.findById(req.params.id);
  
  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }
  
  const vehicles = await Vehicle.find({ customer: req.params.id });
  
  res.status(200).json({
    status: 'success',
    results: vehicles.length,
    data: {
      vehicles
    }
  });
});
