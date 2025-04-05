const WorkOrder = require('../models/WorkOrder');
const Vehicle = require('../models/Vehicle');
const Customer = require('../models/Customer');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const twilioService = require('../services/twilioService');
const emailService = require('../services/emailService');

// Get all work orders
exports.getAllWorkOrders = catchAsync(async (req, res, next) => {
  // Allow filtering by status, customer, vehicle, date range
  const { status, customer, vehicle, startDate, endDate } = req.query;
  
  // Build query based on filters
  const query = {};
  
  if (status) query.status = status;
  if (customer) query.customer = customer;
  if (vehicle) query.vehicle = vehicle;
  
  // Date range filter
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }
  
  const workOrders = await WorkOrder.find(query)
    .populate('customer', 'name phone email')
    .populate('vehicle', 'year make model vin licensePlate')
    .sort({ date: -1 });
  
  res.status(200).json({
    status: 'success',
    results: workOrders.length,
    data: {
      workOrders
    }
  });
});

// Get a single work order
exports.getWorkOrder = catchAsync(async (req, res, next) => {
  const workOrder = await WorkOrder.findById(req.params.id)
    .populate('customer', 'name phone email')
    .populate('vehicle', 'year make model vin licensePlate')
    .populate('appointmentId');
  
  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      workOrder
    }
  });
});

// Create a new work order
exports.createWorkOrder = catchAsync(async (req, res, next) => {
  // Verify that customer and vehicle exist and are related
  const vehicle = await Vehicle.findById(req.body.vehicle);
  
  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }
  
  const customer = await Customer.findById(req.body.customer);
  
  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }
  
  // Verify that the vehicle belongs to the customer
  if (vehicle.customer.toString() !== customer._id.toString()) {
    return next(
      new AppError('The vehicle does not belong to this customer', 400)
    );
  }
  
  // Calculate total estimate if parts and labor are provided
  if (req.body.parts && req.body.parts.length > 0) {
    const partsCost = req.body.parts.reduce((total, part) => {
      return total + (part.price * part.quantity);
    }, 0);
    
    if (!req.body.totalEstimate) {
      req.body.totalEstimate = partsCost;
    }
  }
  
  if (req.body.labor && req.body.labor.length > 0) {
    const laborCost = req.body.labor.reduce((total, labor) => {
      return total + (labor.hours * labor.rate);
    }, 0);
    
    if (!req.body.totalEstimate) {
      req.body.totalEstimate = (req.body.totalEstimate || 0) + laborCost;
    }
  }
  
  const newWorkOrder = await WorkOrder.create(req.body);
  
  // Add the work order to the vehicle's service history
  vehicle.serviceHistory.push(newWorkOrder._id);
  await vehicle.save({ validateBeforeSave: false });
  
  res.status(201).json({
    status: 'success',
    data: {
      workOrder: newWorkOrder
    }
  });
});

// Update a work order
exports.updateWorkOrder = catchAsync(async (req, res, next) => {
  // Recalculate total estimate/actual if parts or labor changed
  if (req.body.parts || req.body.labor) {
    const workOrder = await WorkOrder.findById(req.params.id);
    
    if (!workOrder) {
      return next(new AppError('No work order found with that ID', 404));
    }
    
    if (req.body.parts) {
      const partsCost = req.body.parts.reduce((total, part) => {
        return total + (part.price * part.quantity);
      }, 0);
      
      // Only update totalEstimate if it's not explicitly provided
      if (!req.body.totalEstimate) {
        // Calculate labor cost from existing data if not updated
        const laborCost = req.body.labor 
          ? req.body.labor.reduce((total, labor) => {
              return total + (labor.hours * labor.rate);
            }, 0)
          : workOrder.labor.reduce((total, labor) => {
              return total + (labor.hours * labor.rate);
            }, 0);
            
        req.body.totalEstimate = partsCost + laborCost;
      }
    }
    
    if (req.body.labor) {
      const laborCost = req.body.labor.reduce((total, labor) => {
        return total + (labor.hours * labor.rate);
      }, 0);
      
      // Only update totalEstimate if it's not explicitly provided
      if (!req.body.totalEstimate) {
        // Calculate parts cost from existing data if not updated
        const partsCost = req.body.parts 
          ? req.body.parts.reduce((total, part) => {
              return total + (part.price * part.quantity);
            }, 0)
          : workOrder.parts.reduce((total, part) => {
              return total + (part.price * part.quantity);
            }, 0);
            
        req.body.totalEstimate = partsCost + laborCost;
      }
    }
  }
  
  // If status is being updated
  if (req.body.status) {
    const oldWorkOrder = await WorkOrder.findById(req.params.id)
      .populate('customer')
      .populate('vehicle');
      
    if (oldWorkOrder && oldWorkOrder.status !== req.body.status) {
      // Send notification if status is changing to a notifiable status
      const notifiableStatuses = [
        'Inspected - Need Parts Ordered',
        'Parts Received',
        'Repair In Progress',
        'Completed - Need Payment',
        'Completed - Paid'
      ];
      
      if (notifiableStatuses.includes(req.body.status) && 
          oldWorkOrder.customer && 
          oldWorkOrder.vehicle) {
        
        // Send SMS notification if customer prefers SMS
        if (oldWorkOrder.customer.communicationPreference === 'SMS' && 
            oldWorkOrder.customer.phone) {
          try {
            await twilioService.sendStatusUpdate(
              { status: req.body.status },
              oldWorkOrder.customer,
              oldWorkOrder.vehicle
            );
          } catch (err) {
            console.error('Failed to send SMS notification:', err);
            // Don't fail the update if notification fails
          }
        }
        
        // Send email notification if customer prefers Email
        if (oldWorkOrder.customer.communicationPreference === 'Email' && 
            oldWorkOrder.customer.email) {
          try {
            // This would require implementing a specific email template for status updates
            // await emailService.sendStatusUpdate(...);
          } catch (err) {
            console.error('Failed to send email notification:', err);
            // Don't fail the update if notification fails
          }
        }
      }
    }
  }
  
  const workOrder = await WorkOrder.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      workOrder
    }
  });
});

// Delete a work order
exports.deleteWorkOrder = catchAsync(async (req, res, next) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  
  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }
  
  // Remove from vehicle's service history
  await Vehicle.findByIdAndUpdate(
    workOrder.vehicle,
    { $pull: { serviceHistory: req.params.id } }
  );
  
  await WorkOrder.findByIdAndDelete(req.params.id);
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Update work order status
exports.updateStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  
  if (!status) {
    return next(new AppError('Please provide a status', 400));
  }
  
  const workOrder = await WorkOrder.findById(req.params.id);
  
  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }
  
  // Update the status
  workOrder.status = status;
  
  // If the status is "Completed - Paid", set the totalActual
  if (status === 'Completed - Paid' && !workOrder.totalActual) {
    // Calculate total from parts and labor
    const partsCost = workOrder.parts.reduce((total, part) => {
      return total + (part.price * part.quantity);
    }, 0);
    
    const laborCost = workOrder.labor.reduce((total, labor) => {
      return total + (labor.hours * labor.rate);
    }, 0);
    
    workOrder.totalActual = partsCost + laborCost;
  }
  
  await workOrder.save();
  
  // Get populated work order
  const populatedWorkOrder = await WorkOrder.findById(req.params.id)
    .populate('customer', 'name phone email communicationPreference')
    .populate('vehicle', 'year make model');
  
  // Send notification if customer has communication preference set
  if (populatedWorkOrder.customer && 
      populatedWorkOrder.customer.communicationPreference !== 'None') {
    
    // For SMS notification
    if (populatedWorkOrder.customer.communicationPreference === 'SMS' && 
        populatedWorkOrder.customer.phone) {
      try {
        await twilioService.sendStatusUpdate(
          populatedWorkOrder,
          populatedWorkOrder.customer,
          populatedWorkOrder.vehicle
        );
      } catch (err) {
        console.error('Failed to send SMS notification:', err);
        // Don't fail the update if notification fails
      }
    }
    
    // For Email notification
    // This would require implementing a specific email template for status updates
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      workOrder: populatedWorkOrder
    }
  });
});

// Add part to work order
exports.addPart = catchAsync(async (req, res, next) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  
  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }
  
  // Add the part
  workOrder.parts.push(req.body);
  
  // Recalculate total estimate
  const partsCost = workOrder.parts.reduce((total, part) => {
    return total + (part.price * part.quantity);
  }, 0);
  
  const laborCost = workOrder.labor.reduce((total, labor) => {
    return total + (labor.hours * labor.rate);
  }, 0);
  
  workOrder.totalEstimate = partsCost + laborCost;
  
  await workOrder.save();
  
  res.status(200).json({
    status: 'success',
    data: {
      workOrder
    }
  });
});

// Add labor to work order
exports.addLabor = catchAsync(async (req, res, next) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  
  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }
  
  // Add the labor
  workOrder.labor.push(req.body);
  
  // Recalculate total estimate
  const partsCost = workOrder.parts.reduce((total, part) => {
    return total + (part.price * part.quantity);
  }, 0);
  
  const laborCost = workOrder.labor.reduce((total, labor) => {
    return total + (labor.hours * labor.rate);
  }, 0);
  
  workOrder.totalEstimate = partsCost + laborCost;
  
  await workOrder.save();
  
  res.status(200).json({
    status: 'success',
    data: {
      workOrder
    }
  });
});

// Get work orders by status
exports.getWorkOrdersByStatus = catchAsync(async (req, res, next) => {
  const { status } = req.params;
  
  const workOrders = await WorkOrder.find({ status })
    .populate('customer', 'name phone email')
    .populate('vehicle', 'year make model vin licensePlate')
    .sort({ date: -1 });
  
  res.status(200).json({
    status: 'success',
    results: workOrders.length,
    data: {
      workOrders
    }
  });
});

// Generate invoice
exports.generateInvoice = catchAsync(async (req, res, next) => {
  const workOrder = await WorkOrder.findById(req.params.id)
    .populate('customer', 'name email phone address')
    .populate('vehicle', 'year make model vin');
  
  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }
  
  // Calculate totals
  const partsCost = workOrder.parts.reduce((total, part) => {
    return total + (part.price * part.quantity);
  }, 0);
  
  const laborCost = workOrder.labor.reduce((total, labor) => {
    return total + (labor.hours * labor.rate);
  }, 0);
  
  const totalCost = partsCost + laborCost;
  
  // In a real application, you would generate a PDF here
  // For now, we'll just return the invoice data
  
  res.status(200).json({
    status: 'success',
    data: {
      invoice: {
        workOrderId: workOrder._id,
        customer: workOrder.customer,
        vehicle: workOrder.vehicle,
        date: workOrder.date,
        parts: workOrder.parts,
        labor: workOrder.labor,
        partsCost,
        laborCost,
        totalCost,
        status: workOrder.status
      }
    }
  });
});

// Search work orders
exports.searchWorkOrders = catchAsync(async (req, res, next) => {
  const { query } = req.query;
  
  if (!query) {
    return next(new AppError('Please provide a search query', 400));
  }
  
  // Search work orders by service requested, status, or diagnostic notes
  const workOrders = await WorkOrder.find({
    $or: [
      { serviceRequested: { $regex: query, $options: 'i' } },
      { status: { $regex: query, $options: 'i' } },
      { diagnosticNotes: { $regex: query, $options: 'i' } }
    ]
  })
  .populate('customer', 'name phone email')
  .populate('vehicle', 'year make model vin licensePlate');
  
  res.status(200).json({
    status: 'success',
    results: workOrders.length,
    data: {
      workOrders
    }
  });
});