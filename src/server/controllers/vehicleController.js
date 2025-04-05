const Vehicle = require('../models/Vehicle');
const Customer = require('../models/Customer');
const WorkOrder = require('../models/WorkOrder');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all vehicles
exports.getAllVehicles = catchAsync(async (req, res, next) => {
  // Allow filtering by customer
  const { customer, make, model } = req.query;
  
  // Build query based on filters
  const query = {};
  
  if (customer) query.customer = customer;
  if (make) query.make = { $regex: make, $options: 'i' };
  if (model) query.model = { $regex: model, $options: 'i' };
  
  const vehicles = await Vehicle.find(query)
    .populate('customer', 'name phone email')
    .sort({ updatedAt: -1 });
  
  res.status(200).json({
    status: 'success',
    results: vehicles.length,
    data: {
      vehicles
    }
  });
});

// Get a single vehicle
exports.getVehicle = catchAsync(async (req, res, next) => {
  const vehicle = await Vehicle.findById(req.params.id)
    .populate('customer', 'name phone email')
    .populate({
      path: 'serviceHistory',
      options: { sort: { date: -1 } },
      select: 'date status serviceRequested totalEstimate totalActual'
    });
  
  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      vehicle
    }
  });
});

// Create a new vehicle
exports.createVehicle = catchAsync(async (req, res, next) => {
  // Verify that the customer exists
  const customer = await Customer.findById(req.body.customer);
  
  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }
  
  const newVehicle = await Vehicle.create(req.body);
  
  // Add the vehicle to the customer's vehicles array
  customer.vehicles.push(newVehicle._id);
  await customer.save({ validateBeforeSave: false });
  
  res.status(201).json({
    status: 'success',
    data: {
      vehicle: newVehicle
    }
  });
});

// Update a vehicle
exports.updateVehicle = catchAsync(async (req, res, next) => {
  const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  }).populate('customer', 'name');
  
  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      vehicle
    }
  });
});

// Delete a vehicle
exports.deleteVehicle = catchAsync(async (req, res, next) => {
  const vehicle = await Vehicle.findById(req.params.id);
  
  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }
  
  // Check if vehicle has any work orders
  const workOrderCount = await WorkOrder.countDocuments({ vehicle: req.params.id });
  
  if (workOrderCount > 0) {
    return next(
      new AppError(
        'This vehicle has associated work orders. Please delete them first.',
        400
      )
    );
  }
  
  // Remove the vehicle from the customer's vehicles array
  await Customer.findByIdAndUpdate(
    vehicle.customer,
    { $pull: { vehicles: req.params.id } }
  );
  
  await Vehicle.findByIdAndDelete(req.params.id);
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Search vehicles
exports.searchVehicles = catchAsync(async (req, res, next) => {
  const { query } = req.query;
  
  if (!query) {
    return next(new AppError('Please provide a search query', 400));
  }
  
  const vehicles = await Vehicle.find({
    $or: [
      { make: { $regex: query, $options: 'i' } },
      { model: { $regex: query, $options: 'i' } },
      { vin: { $regex: query, $options: 'i' } },
      { licensePlate: { $regex: query, $options: 'i' } }
    ]
  }).populate('customer', 'name phone email');
  
  res.status(200).json({
    status: 'success',
    results: vehicles.length,
    data: {
      vehicles
    }
  });
});

// Get vehicle service history
exports.getVehicleServiceHistory = catchAsync(async (req, res, next) => {
  const vehicle = await Vehicle.findById(req.params.id);
  
  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }
  
  const workOrders = await WorkOrder.find({ vehicle: req.params.id })
    .sort({ date: -1 });
  
  res.status(200).json({
    status: 'success',
    results: workOrders.length,
    data: {
      vehicle,
      serviceHistory: workOrders
    }
  });
});