const Vehicle = require('../models/Vehicle');
const Customer = require('../models/Customer');
const WorkOrder = require('../models/WorkOrder');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { parseLocalDate } = require('../utils/dateUtils');
const cacheService = require('../services/cacheService');

// Get all vehicles
exports.getAllVehicles = catchAsync(async (req, res, next) => {
  // Allow filtering by customer
  const { customer, make, model } = req.query;

  // Generate cache key from query parameters
  const cacheKey = `vehicles:all:${JSON.stringify({ customer, make, model })}`;

  // Check cache first
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  // Build query based on filters
  const query = {};

  if (customer) query.customer = customer;
  if (make) query.make = { $regex: make, $options: 'i' };
  if (model) query.model = { $regex: model, $options: 'i' };

  const vehicles = await Vehicle.find(query)
    .populate('customer', 'name phone email')
    .sort({ updatedAt: -1 });

  const responseData = {
    status: 'success',
    results: vehicles.length,
    data: {
      vehicles
    }
  };

  // Cache for 10 minutes
  cacheService.set(cacheKey, responseData, 600);

  res.status(200).json(responseData);
});

// Get a single vehicle
exports.getVehicle = catchAsync(async (req, res, next) => {
  // Check cache first
  const cached = cacheService.getVehicleById(req.params.id);
  if (cached) {
    return res.status(200).json(cached);
  }

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

  const responseData = {
    status: 'success',
    data: {
      vehicle
    }
  };

  // Cache for 10 minutes
  cacheService.setVehicleById(req.params.id, responseData);

  res.status(200).json(responseData);
});

// Create a new vehicle
exports.createVehicle = catchAsync(async (req, res, next) => {
  try {
    // Verify that the customer exists
    const customer = await Customer.findById(req.body.customer);

    if (!customer) {
      return next(new AppError('No customer found with that ID', 404));
    }

    // Check for duplicate VIN if VIN is provided and not "N/A"
    if (req.body.vin && req.body.vin.trim() !== '' && req.body.vin.trim().toUpperCase() !== 'N/A') {
      const normalizedVin = req.body.vin.trim().toUpperCase();

      // Search for existing vehicle with this VIN
      const existingVehicle = await Vehicle.findOne({
        vin: { $regex: new RegExp(`^${normalizedVin}$`, 'i') }
      }).populate('customer', 'name phone email _id');

      if (existingVehicle) {
        // Return a 409 Conflict status with details about the existing vehicle
        return res.status(409).json({
          status: 'fail',
          message: 'A vehicle with this VIN already exists in the system.',
          data: {
            existingVehicle: {
              _id: existingVehicle._id,
              year: existingVehicle.year,
              make: existingVehicle.make,
              model: existingVehicle.model,
              vin: existingVehicle.vin,
              customer: existingVehicle.customer
            }
          }
        });
      }
    }

    const newVehicle = await Vehicle.create(req.body);

    // Add the vehicle to the customer's vehicles array
    customer.vehicles.push(newVehicle._id);
    await customer.save({ validateBeforeSave: false });

    // Invalidate vehicle and customer caches
    cacheService.invalidateAllVehicles();
    cacheService.invalidateAllCustomers();

    res.status(201).json({
      status: 'success',
      data: {
        vehicle: newVehicle
      }
    });
  } catch (error) {
    console.error('Error creating vehicle:', error);
    return next(error);
  }
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

  // Invalidate vehicle and customer caches
  cacheService.invalidateAllVehicles();
  cacheService.invalidateAllCustomers();

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
        `Cannot delete this vehicle because it has ${workOrderCount} associated work order${workOrderCount === 1 ? '' : 's'}. You must delete or reassign all associated work orders before deleting this vehicle.`,
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

  // Invalidate vehicle and customer caches
  cacheService.invalidateAllVehicles();
  cacheService.invalidateAllCustomers();

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
  const Appointment = require('../models/Appointment');

  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }

  const workOrders = await WorkOrder.find({ vehicle: req.params.id })
    .sort({ date: -1 });

  // For each work order, find the most recent appointment date
  const workOrdersWithAppointmentDates = await Promise.all(
    workOrders.map(async (workOrder) => {
      // Find all appointments that reference this work order
      const appointments = await Appointment.find({ workOrder: workOrder._id })
        .sort({ startTime: -1 })
        .limit(1);

      // Convert to plain object so we can add properties
      const workOrderObj = workOrder.toObject();

      // Add the most recent appointment date if it exists
      if (appointments.length > 0) {
        workOrderObj.mostRecentAppointmentDate = appointments[0].startTime;
      }

      return workOrderObj;
    })
  );

  // Sort by most recent appointment date (or work order date if no appointment)
  workOrdersWithAppointmentDates.sort((a, b) => {
    const dateA = a.mostRecentAppointmentDate || a.date;
    const dateB = b.mostRecentAppointmentDate || b.date;
    return new Date(dateB) - new Date(dateA);
  });

  res.status(200).json({
    status: 'success',
    results: workOrdersWithAppointmentDates.length,
    data: {
      vehicle,
      serviceHistory: workOrdersWithAppointmentDates
    }
  });
});

// Add a mileage record to a vehicle
exports.addMileageRecord = catchAsync(async (req, res, next) => {
  const { mileage, date, notes } = req.body;

  // Validate that mileage is provided
  if (!mileage) {
    return next(new AppError('Please provide a mileage reading', 400));
  }

  // Validate mileage is a positive number
  if (mileage < 0) {
    return next(new AppError('Mileage cannot be negative', 400));
  }

  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }

  // Add mileage record using the model method
  vehicle.addMileageRecord(
    mileage,
    date ? parseLocalDate(date) : new Date(),
    notes || ''
  );

  // Save the updated vehicle
  await vehicle.save();

  res.status(200).json({
    status: 'success',
    data: {
      vehicle
    }
  });
});

// Get estimated mileage at a specific date
exports.getMileageAtDate = catchAsync(async (req, res, next) => {
  const { date } = req.query;

  if (!date) {
    return next(new AppError('Please provide a date', 400));
  }

  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }

  // Use the model method to estimate mileage at the given date
  const estimatedMileage = vehicle.getMileageAtDate(parseLocalDate(date));

  res.status(200).json({
    status: 'success',
    data: {
      date,
      estimatedMileage,
      isExact: vehicle.mileageHistory.some(record =>
        parseLocalDate(record.date).toDateString() === parseLocalDate(date).toDateString()
      )
    }
  });
});

// Get mileage history
exports.getMileageHistory = catchAsync(async (req, res, next) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }

  // Return mileage history sorted by date (newest first)
  const mileageHistory = [...vehicle.mileageHistory].sort((a, b) =>
    new Date(b.date) - new Date(a.date)
  );

  res.status(200).json({
    status: 'success',
    results: mileageHistory.length,
    data: {
      currentMileage: vehicle.currentMileage,
      mileageHistory
    }
  });
});

// Check if VIN exists
exports.checkVinExists = catchAsync(async (req, res, next) => {
  const { vin } = req.query;

  if (!vin || vin.trim() === '' || vin.trim().toUpperCase() === 'N/A') {
    return res.status(200).json({
      status: 'success',
      data: {
        exists: false
      }
    });
  }

  const normalizedVin = vin.trim().toUpperCase();

  // Search for existing vehicle with this VIN
  const existingVehicle = await Vehicle.findOne({
    vin: { $regex: new RegExp(`^${normalizedVin}$`, 'i') }
  }).populate('customer', 'name phone email _id');

  if (existingVehicle) {
    return res.status(200).json({
      status: 'success',
      data: {
        exists: true,
        vehicle: {
          _id: existingVehicle._id,
          year: existingVehicle.year,
          make: existingVehicle.make,
          model: existingVehicle.model,
          vin: existingVehicle.vin,
          customer: existingVehicle.customer
        }
      }
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      exists: false
    }
  });
});
