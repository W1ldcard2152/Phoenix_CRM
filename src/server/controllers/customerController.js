const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const cacheService = require('../services/cacheService');

// Helper function to normalize phone numbers (remove non-digits)
const normalizePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return '';
  return phoneNumber.replace(/[^\d]/g, '');
};

// Get all customers
exports.getAllCustomers = catchAsync(async (req, res, next) => {
  const cacheKey = 'customers:all';

  // Check cache first
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const customers = await Customer.find();

  const responseData = {
    status: 'success',
    results: customers.length,
    data: {
      customers
    }
  };

  // Cache for 10 minutes
  cacheService.set(cacheKey, responseData, 600);

  res.status(200).json(responseData);
});

// Get a single customer
exports.getCustomer = catchAsync(async (req, res, next) => {
  // Check cache first
  const cached = cacheService.getCustomerById(req.params.id);
  if (cached) {
    return res.status(200).json(cached);
  }

  const customer = await Customer.findById(req.params.id).populate('vehicles');

  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }

  const responseData = {
    status: 'success',
    data: {
      customer
    }
  };

  // Cache for 10 minutes
  cacheService.setCustomerById(req.params.id, responseData);

  res.status(200).json(responseData);
});

// Create a new customer
exports.createCustomer = catchAsync(async (req, res, next) => {
  // Phone number will be saved as received from client (with dashes)
  const newCustomer = await Customer.create(req.body);

  // Invalidate customer cache
  cacheService.invalidateAllCustomers();

  res.status(201).json({
    status: 'success',
    data: {
      customer: newCustomer
    }
  });
});

// Update a customer
exports.updateCustomer = catchAsync(async (req, res, next) => {
  const { phone } = req.body;

  // 1. Fetch the existing customer to get their current phone number
  const existingCustomer = await Customer.findById(req.params.id);

  if (!existingCustomer) {
    return next(new AppError('No customer found with that ID', 404));
  }

  // 2. Normalize both the existing and new phone numbers
  const normalizedExistingPhone = normalizePhoneNumber(existingCustomer.phone);
  const normalizedNewPhone = normalizePhoneNumber(phone);

  // 3. If the new phone number is different from the existing one, check for duplicates
  if (normalizedNewPhone && normalizedNewPhone !== normalizedExistingPhone) {
    // Create an array of phone number variations to check against
    const phoneVariations = [phone];
    // If the incoming phone number contains dashes, also check for the normalized version
    if (phone.includes('-')) {
      phoneVariations.push(normalizePhoneNumber(phone));
    } else { // If it does not contain dashes, also check for the formatted version
      const formattedPhone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6, 10)}`;
      if (formattedPhone.length === 12) { // Ensure it's a valid 10-digit number formatted
        phoneVariations.push(formattedPhone);
      }
    }

    // Find a customer whose phone number matches any of the variations, excluding the current customer
    const duplicateCustomer = await Customer.findOne({
      _id: { $ne: req.params.id }, // Exclude the current customer
      phone: { $in: phoneVariations }
    });

    if (duplicateCustomer) {
      return next(new AppError('A customer with this phone number already exists.', 400));
    }
  }

  // Phone number will be updated as received from client (with dashes)
  const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }

  // Invalidate customer cache
  cacheService.invalidateAllCustomers();

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

  // Invalidate customer cache
  cacheService.invalidateAllCustomers();

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

  // Create an array of phone number variations to search for
  const phoneSearchQueries = [query];
  // If the query contains dashes, also search for the normalized version
  if (query.includes('-')) {
    phoneSearchQueries.push(normalizePhoneNumber(query));
  } else { // If the query does not contain dashes, also search for the formatted version
    const formattedQuery = `${query.slice(0, 3)}-${query.slice(3, 6)}-${query.slice(6, 10)}`;
    if (formattedQuery.length === 12) { // Ensure it's a valid 10-digit number formatted
      phoneSearchQueries.push(formattedQuery);
    }
  }

  const customers = await Customer.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } },
      // Search for all phone number variations
      { phone: { $in: phoneSearchQueries.map(p => new RegExp(p, 'i')) } },
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

  // Create an array of phone number variations to check against
  const phoneVariations = [phone];
  // If the incoming phone number contains dashes, also check for the normalized version
  if (phone.includes('-')) {
    phoneVariations.push(normalizePhoneNumber(phone));
  } else { // If it does not contain dashes, also check for the formatted version
    const formattedPhone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6, 10)}`;
    if (formattedPhone.length === 12) { // Ensure it's a valid 10-digit number formatted
      phoneVariations.push(formattedPhone);
    }
  }

  // Find a customer whose phone number matches any of the variations
  const customer = await Customer.findOne({ phone: { $in: phoneVariations } });

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
