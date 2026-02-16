const mongoose = require('mongoose');
const WorkOrder = require('../models/WorkOrder');
const Vehicle = require('../models/Vehicle');
const Customer = require('../models/Customer');
const Appointment = require('../models/Appointment');
const WorkOrderNote = require('../models/WorkOrderNote');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { parseLocalDate, buildDateRangeQuery, parseDateOrDefault } = require('../utils/dateUtils');
const { applyPopulation } = require('../utils/populationHelpers');
const { validateEntityExists, validateVehicleOwnership } = require('../utils/validationHelpers');
const { calculateWorkOrderTotal, getWorkOrderCostBreakdown } = require('../utils/calculationHelpers');
const twilioService = require('../services/twilioService');
const emailService = require('../services/emailService');
const cacheService = require('../services/cacheService');

// Status aliases for backward compatibility - defined once at module level
const STATUS_ALIASES = {
  'Quote': ['Quote'],
  'Work Order Created': ['Work Order Created', 'Created'],
  'Appointment Scheduled': ['Appointment Scheduled', 'Scheduled', 'Inspection/Diag Scheduled', 'Repair Scheduled'],
  'Appointment Complete': ['Appointment Complete'],
  'Inspection/Diag Complete': ['Inspection/Diag Complete', 'Inspected/Parts Ordered'],
  'Repair Complete - Awaiting Payment': ['Repair Complete - Awaiting Payment', 'Completed - Awaiting Payment'],
  'Repair Complete - Invoiced': ['Repair Complete - Invoiced', 'Invoiced'],
  'Quote - Archived': ['Quote - Archived']
};

// Get all work orders
exports.getAllWorkOrders = catchAsync(async (req, res, next) => {
  const { status, customer, vehicle, startDate, endDate, excludeStatuses } = req.query;

  // Generate cache key from query parameters
  const cacheKey = `workorders:all:${JSON.stringify({ status, customer, vehicle, startDate, endDate, excludeStatuses })}`;

  // Check cache first
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  // Build query based on filters
  const query = {};

  if (status && excludeStatuses) {
    const aliasesForStatus = STATUS_ALIASES[status] || [status];
    const statusesToExclude = excludeStatuses.split(',').map(s => s.trim());
    const allowedStatuses = aliasesForStatus.filter(s => !statusesToExclude.includes(s));
    query.status = { $in: allowedStatuses };
  } else if (status) {
    const aliasesForStatus = STATUS_ALIASES[status] || [status];
    query.status = { $in: aliasesForStatus };
  } else if (excludeStatuses) {
    const statusesToExclude = excludeStatuses.split(',').map(s => s.trim());
    query.status = { $nin: statusesToExclude };
  }

  // Always exclude "Quote" status from general work order queries
  // unless the caller explicitly requested status=Quote
  if (!status || status !== 'Quote') {
    if (query.status && query.status.$nin) {
      if (!query.status.$nin.includes('Quote')) {
        query.status.$nin.push('Quote');
      }
    } else if (query.status && query.status.$in) {
      query.status.$in = query.status.$in.filter(s => s !== 'Quote');
    } else if (!query.status) {
      query.status = { $nin: ['Quote'] };
    }
  }

  if (customer) query.customer = customer;
  if (vehicle) query.vehicle = vehicle;
  Object.assign(query, buildDateRangeQuery(startDate, endDate, 'date'));

  const workOrders = await applyPopulation(
    WorkOrder.find(query).sort({ date: -1 }),
    'workOrder',
    'standard'
  );

  const responseData = {
    status: 'success',
    results: workOrders.length,
    data: { workOrders }
  };

  // Cache the response for 5 minutes
  cacheService.set(cacheKey, responseData, 300);

  res.status(200).json(responseData);
});

// Get a single work order
exports.getWorkOrder = catchAsync(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new AppError('Invalid work order ID format', 400));
  }

  // Check cache first
  const cached = cacheService.getWorkOrderById(req.params.id);
  if (cached) {
    return res.status(200).json(cached);
  }

  const workOrder = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'detailed'
  );

  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }

  const responseData = {
    status: 'success',
    data: { workOrder }
  };

  // Cache the response for 5 minutes
  cacheService.setWorkOrderById(req.params.id, responseData);

  res.status(200).json(responseData);
});

// Create a new work order
exports.createWorkOrder = catchAsync(async (req, res, next) => {
  // Prevent creating a quote through the work order endpoint
  if (req.body.status === 'Quote') {
    return next(new AppError('Use POST /api/workorders/quotes to create quotes', 400));
  }

  // Verify that customer and vehicle exist and are related
  const vehicle = await validateEntityExists(Vehicle, req.body.vehicle, 'Vehicle');
  const customer = await validateEntityExists(Customer, req.body.customer, 'Customer');
  validateVehicleOwnership(vehicle, customer);
  
  // Handle services array if provided
  let workOrderData = { ...req.body };
  
  if (!workOrderData.services || workOrderData.services.length === 0) {
    // If no services array but serviceRequested is provided, convert to services
    if (workOrderData.serviceRequested) {
      // Split by newlines if there are any
      if (workOrderData.serviceRequested.includes('\n')) {
        workOrderData.services = workOrderData.serviceRequested
          .split('\n')
          .filter(line => line.trim())
          .map(line => ({ description: line.trim() }));
      } else {
        // Single service
        workOrderData.services = [{ description: workOrderData.serviceRequested }];
      }
    } else {
      // Empty services array if nothing provided
      workOrderData.services = [];
    }
  } else if (typeof workOrderData.services === 'string') {
    // Handle case where services might be sent as a string
    try {
      workOrderData.services = JSON.parse(workOrderData.services);
    } catch (e) {
      workOrderData.services = [{ description: workOrderData.services }];
    }
  }
  
  // Generate serviceRequested field for backward compatibility
  if (Array.isArray(workOrderData.services) && workOrderData.services.length > 0) {
    workOrderData.serviceRequested = workOrderData.services
      .map(service => service.description)
      .join('\n');
  }
  
  // Handle skip diagnostics logic and status assignment
  // Always set status based on skipDiagnostics flag, regardless of what client sends
  if (workOrderData.skipDiagnostics === true) {
    // If skip diagnostics is checked, set status to 'Inspection/Diag Complete'
    workOrderData.status = 'Inspection/Diag Complete';
  } else {
    // If skip diagnostics is not checked, set status to 'Work Order Created'
    workOrderData.status = 'Work Order Created';
  }
  
  // Calculate total estimate if parts and labor are provided
  if (!workOrderData.totalEstimate) {
    workOrderData.totalEstimate = calculateWorkOrderTotal(
      workOrderData.parts,
      workOrderData.labor
    );
  }

  // Store diagnosticNotes temporarily and remove from workOrderData before creating
  const initialNotes = workOrderData.diagnosticNotes;
  delete workOrderData.diagnosticNotes;

  const newWorkOrder = await WorkOrder.create(workOrderData);

  // Create a note from initial notes if provided
  if (initialNotes && initialNotes.trim()) {
    try {
      await WorkOrderNote.create({
        workOrder: newWorkOrder._id,
        content: initialNotes.trim(),
        isCustomerFacing: true, // Default to customer facing as requested
        createdByName: 'System' // System-generated note
      });
    } catch (noteError) {
      console.error('Error creating note from diagnostic notes:', noteError);
      // Don't fail the work order creation if note creation fails
    }
  }
  
  // Add the work order to the vehicle's service history
  vehicle.serviceHistory.push(newWorkOrder._id);
  
  // Update vehicle mileage if currentMileage is provided
  if (workOrderData.currentMileage && !isNaN(parseFloat(workOrderData.currentMileage))) {
    const mileageValue = parseFloat(workOrderData.currentMileage);
    vehicle.mileageHistory.push({
      date: parseDateOrDefault(workOrderData.date),
      mileage: mileageValue,
      source: `Work Order #${newWorkOrder.id}`
    });
    vehicle.currentMileage = mileageValue;
  }
  
  await vehicle.save({ validateBeforeSave: false });

  // Invalidate caches since new work order was created
  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();

  res.status(201).json({
    status: 'success',
    data: {
      workOrder: newWorkOrder
    }
  });
});

// Update a work order
exports.updateWorkOrder = catchAsync(async (req, res, next) => {
  // Handle services array if provided
  let workOrderData = { ...req.body };
  
  // Process services array
  if (workOrderData.services) {
    // Ensure services is in the correct format
    if (typeof workOrderData.services === 'string') {
      try {
        workOrderData.services = JSON.parse(workOrderData.services);
      } catch (e) {
        workOrderData.services = [{ description: workOrderData.services }];
      }
    }
    
    // Generate serviceRequested field for backward compatibility
    workOrderData.serviceRequested = Array.isArray(workOrderData.services) 
      ? workOrderData.services.map(s => s.description).join('\n')
      : '';
  } else if (workOrderData.serviceRequested) {
    // If serviceRequested is provided but not services, convert to services array
    if (workOrderData.serviceRequested.includes('\n')) {
      workOrderData.services = workOrderData.serviceRequested
        .split('\n')
        .filter(line => line.trim())
        .map(line => ({ description: line.trim() }));
    } else {
      workOrderData.services = [{ description: workOrderData.serviceRequested }];
    }
  }
  
  // Recalculate total estimate/actual if parts or labor changed
  if (workOrderData.parts || workOrderData.labor) {
    const workOrder = await validateEntityExists(WorkOrder, req.params.id, 'Work order');

    const parts = workOrderData.parts || workOrder.parts;
    const labor = workOrderData.labor || workOrder.labor;
    workOrderData.totalEstimate = calculateWorkOrderTotal(parts, labor);
  }
  
  
  // Handle currentMileage update for the vehicle
  if (workOrderData.currentMileage && !isNaN(parseFloat(workOrderData.currentMileage))) {
    const mileageValue = parseFloat(workOrderData.currentMileage);
    const workOrderForVehicle = await WorkOrder.findById(req.params.id).populate('vehicle');

    if (workOrderForVehicle?.vehicle) {
      const vehicleToUpdate = await Vehicle.findById(workOrderForVehicle.vehicle._id);
      if (vehicleToUpdate) {
        const entryDate = parseDateOrDefault(workOrderData.date);

        // Check if this mileage entry already exists to avoid duplicates
        const existingMileageEntry = vehicleToUpdate.mileageHistory.find(
          entry => entry.mileage === mileageValue &&
                   new Date(entry.date).toDateString() === entryDate.toDateString() &&
                   (entry.source || '').includes(`Work Order #${req.params.id}`)
        );

        if (!existingMileageEntry) {
          vehicleToUpdate.mileageHistory.push({
            date: entryDate,
            mileage: mileageValue,
            source: `Work Order #${req.params.id}`
          });
        }
        vehicleToUpdate.currentMileage = mileageValue;
        await vehicleToUpdate.save({ validateBeforeSave: false });
      }
    }
  }
  
  // If status is being updated
  if (workOrderData.status) {
    const oldWorkOrder = await WorkOrder.findById(req.params.id)
      .populate('customer')
      .populate('vehicle');
      
    if (oldWorkOrder && oldWorkOrder.status !== workOrderData.status) {
      // Send notification if status is changing to a notifiable status
      const notifiableStatuses = [
        'Inspected/Parts Ordered',
        'Parts Received',
        'Repair In Progress',
        'Repair Complete - Awaiting Payment',
        'Repair Complete - Invoiced'
      ];
      
      if (notifiableStatuses.includes(workOrderData.status) && 
          oldWorkOrder.customer && 
          oldWorkOrder.vehicle) {
        
        // Send SMS notification if customer prefers SMS
        if (oldWorkOrder.customer.communicationPreference === 'SMS' && 
            oldWorkOrder.customer.phone) {
          try {
            await twilioService.sendStatusUpdate(
              { status: workOrderData.status },
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
  
  const oldWorkOrder = await WorkOrder.findById(req.params.id); // Get current state for comparison

  // If an appointmentId is present and has a technician, ensure workOrder.assignedTechnician is synced
  if (workOrderData.appointmentId) {
    const Appointment = require('../models/Appointment'); // Ensure Appointment model is available
    const appointment = await Appointment.findById(workOrderData.appointmentId).populate('technician');
    if (appointment && appointment.technician) {
      workOrderData.assignedTechnician = appointment.technician._id;
    }
  } else if (workOrderData.hasOwnProperty('appointmentId') && workOrderData.appointmentId === null) {
    // If appointmentId is explicitly set to null, consider unassigning the technician
    // or leaving it as is, depending on desired logic. For now, we'll let assignedTechnician be managed separately if no appointment.
  }

  // If status is changing to "Parts Ordered", mark all parts as ordered
  if (workOrderData.status === 'Parts Ordered') {
    const currentWorkOrder = await WorkOrder.findById(req.params.id);
    if (currentWorkOrder && currentWorkOrder.status !== 'Parts Ordered') {
      if (currentWorkOrder.parts && currentWorkOrder.parts.length > 0) {
        workOrderData.parts = currentWorkOrder.parts.map(part => ({
          ...part.toObject(),
          ordered: true
        }));
      }
    }
  }

  // If status is changing to "Parts Received", mark all parts as received
  if (workOrderData.status === 'Parts Received') {
    const currentWorkOrder = await WorkOrder.findById(req.params.id);
    if (currentWorkOrder && currentWorkOrder.status !== 'Parts Received') {
      // Only auto-mark parts if status is actually changing to Parts Received
      if (currentWorkOrder.parts && currentWorkOrder.parts.length > 0) {
        workOrderData.parts = currentWorkOrder.parts.map(part => ({
          ...part.toObject(),
          received: true
        }));
      }
    }
  }

  // Auto-update status based on part flags (forward triggers)
  // Only apply when parts are being updated and status isn't being explicitly changed
  if (workOrderData.parts && workOrderData.parts.length > 0) {
    const currentWO = await WorkOrder.findById(req.params.id);
    const currentStatus = workOrderData.status || currentWO?.status;

    // If all parts are ordered, auto-set status to "Parts Ordered"
    const preOrderStatuses = ['Work Order Created', 'Appointment Scheduled', 'Appointment Complete', 'Inspection In Progress', 'Inspection/Diag Complete'];
    const allPartsOrdered = workOrderData.parts.every(part => part.ordered === true);
    if (allPartsOrdered && preOrderStatuses.includes(currentStatus)) {
      workOrderData.status = 'Parts Ordered';
    }

    // If all parts are received, auto-set status to "Parts Received"
    const preReceivedStatuses = ['Parts Ordered', ...preOrderStatuses];
    const allPartsReceived = workOrderData.parts.every(part => part.received === true);
    if (allPartsReceived && preReceivedStatuses.includes(currentStatus)) {
      workOrderData.status = 'Parts Received';
    }
  }

  // Check if diagnosticNotes have been updated and create a customer-facing note if they have
  // Store diagnosticNotes temporarily
  const updateNotes = workOrderData.diagnosticNotes;
  if (updateNotes && updateNotes.trim()) {
    try {
      await WorkOrderNote.create({
        workOrder: req.params.id,
        content: updateNotes.trim(),
        isCustomerFacing: true,
        createdByName: 'System' // System-generated note
      });
    } catch (noteError) {
      console.error('Error creating note from updated diagnostic notes:', noteError);
      // Don't fail the work order update if note creation fails
    }
  }
  // Always clear diagnosticNotes field - set to empty string to ensure it's cleared in DB
  workOrderData.diagnosticNotes = '';

  const updatedWorkOrderPopulated = await applyPopulation(
    WorkOrder.findByIdAndUpdate(req.params.id, workOrderData, {
      new: true,
      runValidators: true
    }),
    'workOrder',
    'detailed'
  );

  if (!updatedWorkOrderPopulated) {
    return next(new AppError('No work order found with that ID', 404));
  }
  
  // Sync assignedTechnician if appointmentId and its technician exist
  // This logic is now moved before the update to ensure workOrderData contains the correct technician
  // if (updatedWorkOrderPopulated.appointmentId && updatedWorkOrderPopulated.appointmentId.technician) {
  //   if (!updatedWorkOrderPopulated.assignedTechnician || 
  //       updatedWorkOrderPopulated.assignedTechnician._id.toString() !== updatedWorkOrderPopulated.appointmentId.technician._id.toString()) {
  //     updatedWorkOrderPopulated.assignedTechnician = updatedWorkOrderPopulated.appointmentId.technician._id;
  //     // Re-save if we updated assignedTechnician after the initial update.
  //     // This is not ideal. Better to include in the initial update.
  //     // await updatedWorkOrderPopulated.save({ validateBeforeSave: false });
  //   }
  // }
  
  res.status(200).json({
    status: 'success',
    data: {
      workOrder: updatedWorkOrderPopulated
    }
  });

  // Invalidate caches since work order was updated
  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();

  // Invalidate appointment cache if work order status changed (appointments display work order status)
  if (workOrderData.status && oldWorkOrder && oldWorkOrder.status !== workOrderData.status) {
    cacheService.invalidateAllAppointments();
  }
});

// Delete a work order
exports.deleteWorkOrder = catchAsync(async (req, res, next) => {
  const workOrder = await WorkOrder.findById(req.params.id);

  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }

  // Delete any appointments associated with this work order
  try {
    const deletedAppointments = await Appointment.deleteMany({ workOrder: req.params.id });
    if (deletedAppointments.deletedCount > 0) {
      console.log(`Deleted ${deletedAppointments.deletedCount} appointment(s) associated with work order ${req.params.id}`);
    }
  } catch (appointmentError) {
    console.error('Error deleting associated appointments:', appointmentError);
    // Continue with work order deletion even if appointment deletion fails
  }

  // Remove from vehicle's service history
  await Vehicle.findByIdAndUpdate(
    workOrder.vehicle,
    { $pull: { serviceHistory: req.params.id } }
  );

  await WorkOrder.findByIdAndDelete(req.params.id);

  // Invalidate caches since work order was deleted
  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();
  cacheService.invalidateAllAppointments();

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Update work order status
exports.updateStatus = catchAsync(async (req, res, next) => {
  const { status, holdReason, holdReasonOther } = req.body;

  if (!status) {
    return next(new AppError('Please provide a status', 400));
  }

  const workOrder = await validateEntityExists(WorkOrder, req.params.id, 'Work order');

  // Handle On Hold reason codes
  if (status === 'On Hold') {
    if (!holdReason) {
      return next(new AppError('A hold reason is required when placing a work order on hold', 400));
    }
    if (holdReason === 'Other' && !holdReasonOther) {
      return next(new AppError('Please provide a reason when selecting "Other"', 400));
    }
    workOrder.holdReason = holdReason;
    workOrder.holdReasonOther = holdReason === 'Other' ? holdReasonOther : undefined;
  } else {
    // Clear hold reason when leaving On Hold status
    if (workOrder.status === 'On Hold') {
      workOrder.holdReason = undefined;
      workOrder.holdReasonOther = undefined;
    }
  }

  workOrder.status = status;

  // If the status is "Parts Ordered", mark all parts as ordered
  if (status === 'Parts Ordered') {
    workOrder.parts.forEach(part => {
      part.ordered = true;
    });
  }

  // If the status is "Parts Received", mark all parts as received
  if (status === 'Parts Received') {
    workOrder.parts.forEach(part => {
      part.received = true;
    });
  }

  // If the status is "Invoiced", set the totalActual
  if (status === 'Repair Complete - Invoiced') {
    workOrder.totalActual = calculateWorkOrderTotal(workOrder.parts, workOrder.labor);
  }

  await workOrder.save({ validateBeforeSave: false });

  // Get populated work order
  const populatedWorkOrder = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'detailed'
  );
  
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
  
  // Invalidate caches since work order status was updated
  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();
  cacheService.invalidateAllAppointments();

  res.status(200).json({
    status: 'success',
    data: {
      workOrder: populatedWorkOrder
    }
  });
});

// Add part to work order
exports.addPart = catchAsync(async (req, res, next) => {
  const workOrder = await validateEntityExists(WorkOrder, req.params.id, 'Work order');

  workOrder.parts.push(req.body);
  workOrder.totalEstimate = calculateWorkOrderTotal(workOrder.parts, workOrder.labor);
  await workOrder.save();

  const populatedWorkOrderAfterAdd = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'detailed'
  );

  // Invalidate caches since parts were added to work order
  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();

  res.status(200).json({
    status: 'success',
    data: { workOrder: populatedWorkOrderAfterAdd }
  });
});

// Add labor to work order
exports.addLabor = catchAsync(async (req, res, next) => {
  const workOrder = await validateEntityExists(WorkOrder, req.params.id, 'Work order');

  workOrder.labor.push(req.body);
  workOrder.totalEstimate = calculateWorkOrderTotal(workOrder.parts, workOrder.labor);
  await workOrder.save();

  const populatedWorkOrderAfterAddLabor = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'detailed'
  );

  // Invalidate caches since labor was added to work order
  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();

  res.status(200).json({
    status: 'success',
    data: { workOrder: populatedWorkOrderAfterAddLabor }
  });
});

// Get work orders by status
exports.getWorkOrdersByStatus = catchAsync(async (req, res, next) => {
  const { status } = req.params;

  // Check cache first
  const cached = cacheService.getWorkOrdersByStatus(status);
  if (cached) {
    return res.status(200).json({
      status: 'success',
      results: cached.length,
      data: { workOrders: cached }
    });
  }

  const workOrders = await applyPopulation(
    WorkOrder.find({ status }).sort({ date: -1 }),
    'workOrder',
    'standard'
  );

  // Cache the work orders for 5 minutes
  cacheService.setWorkOrdersByStatus(status, workOrders);

  res.status(200).json({
    status: 'success',
    results: workOrders.length,
    data: { workOrders }
  });
});

// Generate invoice
exports.generateInvoice = catchAsync(async (req, res, next) => {
  const workOrder = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'invoice'
  );

  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }

  const { partsCost, laborCost, total: totalCost } = getWorkOrderCostBreakdown(workOrder);
  
  // In a real application, you would generate a PDF here
  // For now, we'll just return the invoice data
  
  res.status(200).json({
    status: 'success',
    data: {
      invoice: {
        workOrderId: workOrder._id,
        customer: workOrder.customer,
        vehicle: workOrder.vehicle,
        assignedTechnician: workOrder.assignedTechnician, // Include technician in invoice data
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

// Search work orders - Updated to search in services array
exports.searchWorkOrders = catchAsync(async (req, res, next) => {
  const { query } = req.query;

  if (!query) {
    return next(new AppError('Please provide a search query', 400));
  }

  const workOrders = await applyPopulation(
    WorkOrder.find({
      status: { $ne: 'Quote' },
      $or: [
        { serviceRequested: { $regex: query, $options: 'i' } },
        { 'services.description': { $regex: query, $options: 'i' } },
        { status: { $regex: query, $options: 'i' } },
        { diagnosticNotes: { $regex: query, $options: 'i' } }
      ]
    }),
    'workOrder',
    'standard'
  );

  res.status(200).json({
    status: 'success',
    results: workOrders.length,
    data: { workOrders }
  });
});

// Get work orders awaiting scheduling (Parts Received status with no future appointments)
exports.getWorkOrdersAwaitingScheduling = catchAsync(async (req, res, next) => {
  // Get all work orders with "Parts Received" status
  const partsReceivedWorkOrders = await applyPopulation(
    WorkOrder.find({ status: 'Parts Received' }),
    'workOrder',
    'standard'
  );
  
  // Get all future appointments (starting from now)
  const now = new Date();
  const futureAppointments = await Appointment.find({
    startTime: { $gte: now },
    workOrder: { $exists: true },
    status: { $nin: ['Cancelled', 'No-Show'] } // Exclude cancelled/no-show appointments
  }).select('workOrder');
  
  // Create a Set of work order IDs that have future appointments
  const scheduledWorkOrderIds = new Set(
    futureAppointments.map(apt => apt.workOrder.toString())
  );
  
  // Filter out work orders that have future appointments
  const unscheduledWorkOrders = partsReceivedWorkOrders.filter(
    wo => !scheduledWorkOrderIds.has(wo._id.toString())
  );
  
  res.status(200).json({
    status: 'success',
    results: unscheduledWorkOrders.length,
    data: {
      workOrders: unscheduledWorkOrders
    }
  });
});

// Get all work orders that need scheduling (for appointments page)
exports.getWorkOrdersNeedingScheduling = catchAsync(async (req, res, next) => {
  // Get all work orders with statuses that typically need scheduling
  const needsSchedulingStatuses = ['Created', 'Appointment Complete', 'Inspected/Parts Ordered', 'Parts Received'];
  const workOrders = await applyPopulation(
    WorkOrder.find({ status: { $in: needsSchedulingStatuses } }),
    'workOrder',
    'standard'
  );
  
  // Get all future appointments (starting from now)
  const now = new Date();
  const futureAppointments = await Appointment.find({
    startTime: { $gte: now },
    workOrder: { $exists: true },
    status: { $nin: ['Cancelled', 'No-Show'] } // Exclude cancelled/no-show appointments
  }).select('workOrder');
  
  // Create a Set of work order IDs that have future appointments
  const scheduledWorkOrderIds = new Set(
    futureAppointments.map(apt => apt.workOrder.toString())
  );
  
  // Filter out work orders that have future appointments
  const unscheduledWorkOrders = workOrders.filter(
    wo => !scheduledWorkOrderIds.has(wo._id.toString())
  );
  
  res.status(200).json({
    status: 'success',
    results: unscheduledWorkOrders.length,
    data: {
      workOrders: unscheduledWorkOrders
    }
  });
});

// Split work order
exports.splitWorkOrder = catchAsync(async (req, res, next) => {
  const originalWorkOrder = await WorkOrder.findById(req.params.id)
    .populate('customer')
    .populate('vehicle')
    .populate('assignedTechnician');
  
  if (!originalWorkOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }

  // Extract the parts and labor to move to new work order
  const { partsToMove, laborToMove, newWorkOrderTitle } = req.body;

  if (!partsToMove && !laborToMove) {
    return next(new AppError('Must specify parts or labor to move to new work order', 400));
  }

  // Validate that the parts and labor to move exist in the original work order
  const partsToMoveIds = partsToMove || [];
  const laborToMoveIds = laborToMove || [];

  // Find the actual parts and labor items to move
  const partsToMoveItems = originalWorkOrder.parts.filter(part => 
    partsToMoveIds.includes(part._id.toString())
  );
  const laborToMoveItems = originalWorkOrder.labor.filter(labor => 
    laborToMoveIds.includes(labor._id.toString())
  );

  if (partsToMoveItems.length !== partsToMoveIds.length || 
      laborToMoveItems.length !== laborToMoveIds.length) {
    return next(new AppError('Some specified parts or labor items not found', 400));
  }

  // Create new work order with moved items
  const newWorkOrder = new WorkOrder({
    customer: originalWorkOrder.customer._id,
    vehicle: originalWorkOrder.vehicle._id,
    assignedTechnician: originalWorkOrder.assignedTechnician ? originalWorkOrder.assignedTechnician._id : null,
    date: new Date(),
    priority: originalWorkOrder.priority,
    status: 'Created',
    serviceRequested: newWorkOrderTitle || `Split from WO ${originalWorkOrder._id.toString().slice(-6)}`,
    diagnosticNotes: `Split from work order ${originalWorkOrder._id.toString().slice(-6)} on ${new Date().toLocaleDateString()}`,
    parts: partsToMoveItems.map(part => ({
      name: part.name,
      partNumber: part.partNumber,
      quantity: part.quantity,
      price: part.price,
      ordered: part.ordered,
      received: part.received,
      vendor: part.vendor,
      purchaseOrderNumber: part.purchaseOrderNumber
    })),
    labor: laborToMoveItems.map(labor => ({
      description: labor.description,
      hours: labor.hours,
      rate: labor.rate
    }))
  });

  // Calculate totals for new work order
  newWorkOrder.totalEstimate = calculateWorkOrderTotal(newWorkOrder.parts, newWorkOrder.labor);

  // Remove moved items from original work order
  originalWorkOrder.parts = originalWorkOrder.parts.filter(part =>
    !partsToMoveIds.includes(part._id.toString())
  );
  originalWorkOrder.labor = originalWorkOrder.labor.filter(labor =>
    !laborToMoveIds.includes(labor._id.toString())
  );

  // Update totals for original work order
  originalWorkOrder.totalEstimate = calculateWorkOrderTotal(originalWorkOrder.parts, originalWorkOrder.labor);

  // Add note to original work order about the split
  if (!originalWorkOrder.diagnosticNotes) {
    originalWorkOrder.diagnosticNotes = '';
  }
  originalWorkOrder.diagnosticNotes += `\n\nWork order split on ${new Date().toLocaleDateString()}. Moved items to new work order.`;

  // Save both work orders
  await Promise.all([
    originalWorkOrder.save(),
    newWorkOrder.save()
  ]);

  // Populate the new work order for response
  await newWorkOrder.populate([
    { path: 'customer', select: 'name phone email' },
    { path: 'vehicle', select: 'year make model vin licensePlate' },
    { path: 'assignedTechnician', select: 'name specialization' }
  ]);

  res.status(201).json({
    status: 'success',
    data: {
      originalWorkOrder,
      newWorkOrder
    }
  });
});

// Get Service Writer's Corner data - all work orders requiring service writer action
exports.getServiceWritersCorner = catchAsync(async (req, res, next) => {
  // Check cache first
  const cached = cacheService.getServiceWritersCorner();
  if (cached) {
    return res.status(200).json(cached);
  }

  // Service writer action statuses
  const swcStatuses = [
    'Appointment Complete',
    'Inspection/Diag Complete',
    'Parts Received',
    'Repair Complete - Awaiting Payment'
  ];

  // Get only today and future appointments (not past)
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const appointments = await Appointment.find({
    workOrder: { $exists: true },
    startTime: { $gte: startOfToday },
    status: { $nin: ['Cancelled', 'No-Show'] }
  }).select('workOrder startTime status');

  // Create a map of work order IDs to their future appointments
  const workOrderAppointments = new Map();
  appointments.forEach(apt => {
    const woId = apt.workOrder.toString();
    if (!workOrderAppointments.has(woId)) {
      workOrderAppointments.set(woId, []);
    }
    workOrderAppointments.get(woId).push(apt);
  });

  // Get work order IDs that have future appointments (for Parts Received filtering)
  const scheduledWorkOrderIds = new Set(
    appointments.map(apt => apt.workOrder.toString())
  );

  // Helper function to add appointment info to work orders
  const addAppointmentInfo = (workOrders) => {
    return workOrders.map(wo => {
      const woAppointments = workOrderAppointments.get(wo._id.toString()) || [];
      const nextAppointment = woAppointments.sort((a, b) =>
        new Date(a.startTime) - new Date(b.startTime)
      )[0];

      return {
        ...wo.toObject(),
        appointmentId: nextAppointment?._id || null,
        hasAppointment: !!nextAppointment
      };
    });
  };

  // Query all SWC statuses in one shot
  const allWorkOrdersRaw = await applyPopulation(
    WorkOrder.find({ status: { $in: swcStatuses } }),
    'workOrder',
    'standard'
  );

  // Filter out Parts Received WOs that already have a future appointment scheduled
  const filtered = allWorkOrdersRaw.filter(wo => {
    if (wo.status === 'Parts Received') {
      return !scheduledWorkOrderIds.has(wo._id.toString());
    }
    return true;
  });

  const workOrders = addAppointmentInfo(filtered);

  const responseData = {
    status: 'success',
    data: {
      workOrders,
      count: workOrders.length
    }
  };

  // Cache the response for 3 minutes (shorter TTL for high-priority data)
  cacheService.setServiceWritersCorner(responseData);

  res.status(200).json(responseData);
});

// Process receipt and extract parts using AI
exports.processReceipt = catchAsync(async (req, res, next) => {
  const openAIService = require('../services/openAIService');
  const s3Service = require('../services/s3Service');
  const multer = require('multer');

  // Configure multer for memory storage
  const storage = multer.memoryStorage();
  const upload = multer({
    storage,
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB
    }
  });

  // Handle file upload using multer
  const uploadMiddleware = upload.single('receipt');

  uploadMiddleware(req, res, async (err) => {
    if (err) {
      return next(new AppError(`File upload error: ${err.message}`, 400));
    }

    try {
      const workOrderId = req.params.id;

      // Validate work order exists
      const workOrder = await WorkOrder.findById(workOrderId);
      if (!workOrder) {
        return next(new AppError('Work order not found', 404));
      }

      let receiptData, dataType, receiptUrl = null;

      // Get isOrder flag (defaults to true for backward compatibility)
      const isOrder = req.body.isOrder === 'true' || req.body.isOrder === true;

      // Check if file was uploaded or text was provided
      if (req.file) {
        // Image/file receipt
        receiptData = req.file.buffer;
        dataType = 'image';

        // Upload receipt to S3 (private)
        const uploadResult = await s3Service.uploadFile(
          req.file.buffer,
          `receipt-${workOrderId}-${Date.now()}-${req.file.originalname}`,
          req.file.mimetype
        );
        receiptUrl = uploadResult.key; // Store the S3 key instead of URL
      } else if (req.body.receiptText) {
        // Text receipt
        receiptData = req.body.receiptText;
        dataType = 'text';
      } else {
        return next(new AppError('Please provide either a receipt image or text', 400));
      }

      // Parse receipt using OpenAI
      const extractedParts = await openAIService.parseReceipt(receiptData, dataType, isOrder);

      if (!extractedParts || extractedParts.length === 0) {
        return next(new AppError('No parts could be extracted from the receipt', 400));
      }

      // Add receipt URL to each part
      const partsWithReceipt = extractedParts.map(part => ({
        ...part,
        receiptImageUrl: receiptUrl
      }));

      // Add extracted parts to work order
      workOrder.parts.push(...partsWithReceipt);

      // Check if all parts are now ordered and update status if needed (only if isOrder is true)
      if (isOrder) {
        const allPartsOrdered = workOrder.parts.every(part => part.ordered === true);
        const preOrderStatuses = [
          'Work Order Created',
          'Appointment Scheduled',
          'Inspection In Progress',
          'Inspection/Diag Complete'
        ];

        if (allPartsOrdered && preOrderStatuses.includes(workOrder.status)) {
          workOrder.status = 'Parts Ordered';
        }
      }

      await workOrder.save();

      // Clear relevant caches
      cacheService.invalidateAllWorkOrders();
      cacheService.invalidateServiceWritersCorner();

      res.status(200).json({
        status: 'success',
        message: `Successfully extracted and added ${partsWithReceipt.length} part(s)`,
        data: {
          workOrder,
          extractedParts: partsWithReceipt,
          receiptUrl
        }
      });
    } catch (error) {
      console.error('Error processing receipt:', error);
      return next(new AppError(`Failed to process receipt: ${error.message}`, 500));
    }
  });
});

// Get signed URL for receipt image
exports.getReceiptSignedUrl = catchAsync(async (req, res, next) => {
  const s3Service = require('../services/s3Service');
  const { key } = req.query;

  if (!key) {
    return next(new AppError('Receipt key is required', 400));
  }

  try {
    const signedUrl = await s3Service.getSignedUrl(key, 3600); // 1 hour expiration

    res.status(200).json({
      status: 'success',
      data: {
        signedUrl,
        expiresIn: 3600
      }
    });
  } catch (error) {
    console.error('Error generating signed URL for receipt:', error);
    return next(new AppError('Failed to generate signed URL for receipt', 500));
  }
});

// Get active work orders by multiple statuses in a single call (replaces multiple getWorkOrdersByStatus calls)
exports.getActiveWorkOrdersByStatuses = catchAsync(async (req, res, next) => {
  const { statuses } = req.query;

  if (!statuses) {
    return next(new AppError('Please provide statuses parameter', 400));
  }

  // Parse statuses (comma-separated)
  const statusList = statuses.split(',').map(s => s.trim());

  // Check cache first
  const cacheKey = `workorders:active:${statusList.sort().join(',')}`;
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  // Build query with $in for multiple statuses
  const query = { status: { $in: statusList } };

  const workOrders = await applyPopulation(
    WorkOrder.find(query).sort({ date: -1 }),
    'workOrder',
    'standard'
  );

  // Group work orders by status for easier consumption
  const groupedByStatus = {};
  statusList.forEach(status => {
    groupedByStatus[status] = workOrders.filter(wo => wo.status === status);
  });

  const responseData = {
    status: 'success',
    results: workOrders.length,
    data: {
      workOrders,
      groupedByStatus
    }
  };

  // Cache for 5 minutes
  cacheService.set(cacheKey, responseData, 300);

  res.status(200).json(responseData);
});

// Get work orders for Technician Portal (filtered at API level)
exports.getTechnicianWorkOrders = catchAsync(async (req, res, next) => {
  const { technicianId } = req.query;

  // Technician-relevant statuses
  const technicianStatuses = [
    'Appointment Scheduled',
    'Appointment Complete',
    'Inspection In Progress',
    'Inspection/Diag Complete',
    'Repair In Progress',
    'Repair Complete - Awaiting Payment'
  ];

  // Check cache first
  const cacheKey = technicianId
    ? `workorders:technician:${technicianId}`
    : 'workorders:technician:all';
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  // Build query
  const query = { status: { $in: technicianStatuses } };
  if (technicianId) {
    query.assignedTechnician = technicianId;
  }

  const workOrders = await applyPopulation(
    WorkOrder.find(query).sort({ date: -1 }),
    'workOrder',
    'standard'
  );

  const responseData = {
    status: 'success',
    results: workOrders.length,
    data: { workOrders }
  };

  // Cache for 3 minutes (shorter for frequently changing data)
  cacheService.set(cacheKey, responseData, 180);

  res.status(200).json(responseData);
});

// ==================== QUOTE ENDPOINTS ====================

// Get all quotes
exports.getAllQuotes = catchAsync(async (req, res, next) => {
  const { customer, vehicle, startDate, endDate, includeArchived } = req.query;

  const cacheKey = `quotes:all:${JSON.stringify({ customer, vehicle, startDate, endDate, includeArchived })}`;
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const query = includeArchived === 'true'
    ? { status: { $in: ['Quote', 'Quote - Archived'] } }
    : { status: 'Quote' };
  if (customer) query.customer = customer;
  if (vehicle) query.vehicle = vehicle;
  Object.assign(query, buildDateRangeQuery(startDate, endDate, 'date'));

  const quotes = await applyPopulation(
    WorkOrder.find(query).sort({ date: -1 }),
    'workOrder',
    'standard'
  );

  const responseData = {
    status: 'success',
    results: quotes.length,
    data: { quotes }
  };

  cacheService.set(cacheKey, responseData, 300);
  res.status(200).json(responseData);
});

// Create a new quote
exports.createQuote = catchAsync(async (req, res, next) => {
  const vehicle = await validateEntityExists(Vehicle, req.body.vehicle, 'Vehicle');
  const customer = await validateEntityExists(Customer, req.body.customer, 'Customer');
  validateVehicleOwnership(vehicle, customer);

  let quoteData = { ...req.body };

  // Handle services conversion
  if (!quoteData.services || quoteData.services.length === 0) {
    if (quoteData.serviceRequested) {
      if (quoteData.serviceRequested.includes('\n')) {
        quoteData.services = quoteData.serviceRequested
          .split('\n')
          .filter(line => line.trim())
          .map(line => ({ description: line.trim() }));
      } else {
        quoteData.services = [{ description: quoteData.serviceRequested }];
      }
    } else {
      quoteData.services = [];
    }
  }

  if (Array.isArray(quoteData.services) && quoteData.services.length > 0) {
    quoteData.serviceRequested = quoteData.services
      .map(service => service.description).join('\n');
  }

  // Force status to Quote
  quoteData.status = 'Quote';

  // Calculate total estimate
  if (!quoteData.totalEstimate) {
    quoteData.totalEstimate = calculateWorkOrderTotal(quoteData.parts, quoteData.labor);
  }

  // Store notes temporarily
  const initialNotes = quoteData.diagnosticNotes;
  delete quoteData.diagnosticNotes;

  const newQuote = await WorkOrder.create(quoteData);

  if (initialNotes && initialNotes.trim()) {
    try {
      await WorkOrderNote.create({
        workOrder: newQuote._id,
        content: initialNotes.trim(),
        isCustomerFacing: true,
        createdByName: 'System'
      });
    } catch (noteError) {
      console.error('Error creating note from quote notes:', noteError);
    }
  }

  // Add to vehicle service history
  vehicle.serviceHistory.push(newQuote._id);
  if (quoteData.currentMileage && !isNaN(parseFloat(quoteData.currentMileage))) {
    const mileageValue = parseFloat(quoteData.currentMileage);
    vehicle.mileageHistory.push({
      date: parseDateOrDefault(quoteData.date),
      mileage: mileageValue,
      source: `Quote #${newQuote.id}`
    });
    vehicle.currentMileage = mileageValue;
  }
  await vehicle.save({ validateBeforeSave: false });

  cacheService.invalidateAllWorkOrders();

  res.status(201).json({
    status: 'success',
    data: { quote: newQuote }
  });
});

// Convert a quote to a work order (full or partial)
exports.convertQuoteToWorkOrder = catchAsync(async (req, res, next) => {
  const quote = await WorkOrder.findById(req.params.id)
    .populate('customer')
    .populate('vehicle');

  if (!quote) {
    return next(new AppError('No quote found with that ID', 404));
  }

  if (quote.status !== 'Quote') {
    return next(new AppError('This record is not a quote', 400));
  }

  const { partsToConvert, laborToConvert } = req.body;
  const isPartialConversion = partsToConvert || laborToConvert;

  if (isPartialConversion) {
    // Partial conversion: create a new WO with selected items, remove them from the quote
    const partsToConvertIds = partsToConvert || [];
    const laborToConvertIds = laborToConvert || [];

    const partsToMove = quote.parts.filter(part =>
      partsToConvertIds.includes(part._id.toString())
    );
    const laborToMove = quote.labor.filter(labor =>
      laborToConvertIds.includes(labor._id.toString())
    );

    if (partsToMove.length === 0 && laborToMove.length === 0) {
      return next(new AppError('Must select at least one part or labor item to convert', 400));
    }

    // Check if converting everything
    const allPartsSelected = partsToConvertIds.length === quote.parts.length;
    const allLaborSelected = laborToConvertIds.length === quote.labor.length;
    const convertingAll = allPartsSelected && allLaborSelected;

    if (convertingAll) {
      // Full conversion on same document
      quote.status = 'Work Order Created';
      await quote.save();

      const populatedWorkOrder = await applyPopulation(
        WorkOrder.findById(req.params.id),
        'workOrder',
        'detailed'
      );

      cacheService.invalidateAllWorkOrders();

      return res.status(200).json({
        status: 'success',
        message: 'Quote fully converted to work order',
        data: { workOrder: populatedWorkOrder }
      });
    }

    // Create new work order with selected items
    const newWorkOrder = new WorkOrder({
      customer: quote.customer._id,
      vehicle: quote.vehicle ? quote.vehicle._id : null,
      currentMileage: quote.currentMileage,
      date: new Date(),
      priority: quote.priority,
      status: 'Work Order Created',
      services: quote.services.map(s => ({ description: s.description })),
      serviceRequested: quote.serviceRequested,
      diagnosticNotes: `Converted from Quote #${quote._id.toString().slice(-8).toUpperCase()}`,
      parts: partsToMove.map(part => ({
        name: part.name,
        partNumber: part.partNumber,
        itemNumber: part.itemNumber,
        quantity: part.quantity,
        price: part.price,
        cost: part.cost,
        vendor: part.vendor,
        supplier: part.supplier,
        purchaseOrderNumber: part.purchaseOrderNumber
      })),
      labor: laborToMove.map(labor => ({
        description: labor.description,
        hours: labor.hours,
        rate: labor.rate
      }))
    });

    newWorkOrder.totalEstimate = calculateWorkOrderTotal(newWorkOrder.parts, newWorkOrder.labor);
    await newWorkOrder.save();

    // Remove converted items from quote
    quote.parts = quote.parts.filter(part =>
      !partsToConvertIds.includes(part._id.toString())
    );
    quote.labor = quote.labor.filter(labor =>
      !laborToConvertIds.includes(labor._id.toString())
    );
    quote.totalEstimate = calculateWorkOrderTotal(quote.parts, quote.labor);

    // Archive quote if nothing remains
    if (quote.parts.length === 0 && quote.labor.length === 0) {
      quote.status = 'Quote - Archived';
    }

    await quote.save();

    const populatedNewWO = await applyPopulation(
      WorkOrder.findById(newWorkOrder._id),
      'workOrder',
      'detailed'
    );

    const populatedQuote = await applyPopulation(
      WorkOrder.findById(req.params.id),
      'workOrder',
      'detailed'
    );

    cacheService.invalidateAllWorkOrders();

    return res.status(200).json({
      status: 'success',
      message: 'Partial quote conversion successful',
      data: {
        workOrder: populatedNewWO,
        quote: populatedQuote,
        quoteArchived: quote.status === 'Quote - Archived'
      }
    });
  }

  // Full conversion (original behavior): change status on same document
  quote.status = 'Work Order Created';
  await quote.save();

  const populatedWorkOrder = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'detailed'
  );

  cacheService.invalidateAllWorkOrders();

  res.status(200).json({
    status: 'success',
    message: 'Quote converted to work order successfully',
    data: { workOrder: populatedWorkOrder }
  });
});

// Generate a quote from an existing work order
exports.generateQuoteFromWorkOrder = catchAsync(async (req, res, next) => {
  const workOrder = await WorkOrder.findById(req.params.id)
    .populate('customer')
    .populate('vehicle');

  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }

  // Determine which parts/labor to copy
  const { partsToInclude, laborToInclude } = req.body;
  const partsSource = partsToInclude
    ? workOrder.parts.filter(p => partsToInclude.includes(p._id.toString()))
    : workOrder.parts;
  const laborSource = laborToInclude
    ? workOrder.labor.filter(l => laborToInclude.includes(l._id.toString()))
    : workOrder.labor;

  const newQuote = new WorkOrder({
    customer: workOrder.customer._id,
    vehicle: workOrder.vehicle ? workOrder.vehicle._id : null,
    currentMileage: workOrder.currentMileage,
    date: new Date(),
    priority: workOrder.priority,
    status: 'Quote',
    services: workOrder.services.map(s => ({ description: s.description })),
    serviceRequested: workOrder.serviceRequested,
    diagnosticNotes: `Generated from Work Order #${workOrder._id.toString().slice(-8).toUpperCase()}`,
    parts: partsSource.map(part => ({
      name: part.name,
      partNumber: part.partNumber,
      itemNumber: part.itemNumber,
      quantity: part.quantity,
      price: part.price,
      cost: part.cost,
      vendor: part.vendor,
      supplier: part.supplier
    })),
    labor: laborSource.map(labor => ({
      description: labor.description,
      hours: labor.hours,
      rate: labor.rate
    }))
  });

  newQuote.totalEstimate = calculateWorkOrderTotal(newQuote.parts, newQuote.labor);
  await newQuote.save();

  const populatedQuote = await applyPopulation(
    WorkOrder.findById(newQuote._id),
    'workOrder',
    'detailed'
  );

  cacheService.invalidateAllWorkOrders();

  res.status(201).json({
    status: 'success',
    message: 'Quote generated from work order successfully',
    data: { quote: populatedQuote }
  });
});

// Archive a quote
exports.archiveQuote = catchAsync(async (req, res, next) => {
  const quote = await validateEntityExists(WorkOrder, req.params.id, 'Quote');

  if (quote.status !== 'Quote') {
    return next(new AppError('Only active quotes can be archived', 400));
  }

  quote.status = 'Quote - Archived';
  await quote.save();

  cacheService.invalidateAllWorkOrders();

  res.status(200).json({
    status: 'success',
    message: 'Quote archived successfully'
  });
});

// Unarchive a quote
exports.unarchiveQuote = catchAsync(async (req, res, next) => {
  const quote = await validateEntityExists(WorkOrder, req.params.id, 'Quote');

  if (quote.status !== 'Quote - Archived') {
    return next(new AppError('Only archived quotes can be unarchived', 400));
  }

  quote.status = 'Quote';
  await quote.save();

  cacheService.invalidateAllWorkOrders();

  res.status(200).json({
    status: 'success',
    message: 'Quote unarchived successfully'
  });
});
