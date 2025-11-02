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
  'Work Order Created': ['Work Order Created', 'Created'],
  'Appointment Scheduled': ['Appointment Scheduled', 'Scheduled', 'Inspection/Diag Scheduled', 'Repair Scheduled'],
  'Inspection/Diag Complete': ['Inspection/Diag Complete', 'Inspected/Parts Ordered'],
  'Repair Complete - Awaiting Payment': ['Repair Complete - Awaiting Payment', 'Completed - Awaiting Payment'],
  'Repair Complete - Invoiced': ['Repair Complete - Invoiced', 'Invoiced']
};

// Get all work orders
exports.getAllWorkOrders = catchAsync(async (req, res, next) => {
  const { status, customer, vehicle, startDate, endDate, excludeStatuses } = req.query;

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

  if (customer) query.customer = customer;
  if (vehicle) query.vehicle = vehicle;
  Object.assign(query, buildDateRangeQuery(startDate, endDate, 'date'));

  const workOrders = await applyPopulation(
    WorkOrder.find(query).sort({ date: -1 }),
    'workOrder',
    'standard'
  );

  res.status(200).json({
    status: 'success',
    results: workOrders.length,
    data: { workOrders }
  });
});

// Get a single work order
exports.getWorkOrder = catchAsync(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new AppError('Invalid work order ID format', 400));
  }

  const workOrder = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'detailed'
  );

  if (!workOrder) {
    return next(new AppError('No work order found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { workOrder }
  });
});

// Create a new work order
exports.createWorkOrder = catchAsync(async (req, res, next) => {
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

  const workOrder = await validateEntityExists(WorkOrder, req.params.id, 'Work order');

  workOrder.status = status;

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

  await workOrder.save();

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
  
  res.status(200).json({
    status: 'success',
    data: {
      workOrder: populatedWorkOrder
    }
  });

  // Invalidate appointment cache since work order status changed (appointments display work order status)
  cacheService.invalidateAllAppointments();
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

  res.status(200).json({
    status: 'success',
    data: { workOrder: populatedWorkOrderAfterAddLabor }
  });
});

// Get work orders by status
exports.getWorkOrdersByStatus = catchAsync(async (req, res, next) => {
  const { status } = req.params;

  const workOrders = await applyPopulation(
    WorkOrder.find({ status }).sort({ date: -1 }),
    'workOrder',
    'standard'
  );

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
  const needsSchedulingStatuses = ['Created', 'Inspected/Parts Ordered', 'Parts Received'];
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
  // Get only today and future appointments (not past)
  const now = new Date();
  // Set to start of today to include appointments scheduled for today
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
      // Get the next upcoming appointment (sorted by startTime ascending)
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

  // 1. Inspection/Diag Complete - Parts need to be ordered and/or customer needs to be called
  const diagCompleteRaw = await applyPopulation(
    WorkOrder.find({ status: 'Inspection/Diag Complete' }),
    'workOrder',
    'standard'
  );
  const diagComplete = addAppointmentInfo(diagCompleteRaw);

  // 2. Parts Received - Customer needs to be called for appointments (exclude those already scheduled)
  const partsReceivedAll = await applyPopulation(
    WorkOrder.find({ status: 'Parts Received' }),
    'workOrder',
    'standard'
  );

  const partsReceivedFiltered = partsReceivedAll.filter(
    wo => !scheduledWorkOrderIds.has(wo._id.toString())
  );
  const partsReceived = addAppointmentInfo(partsReceivedFiltered);

  // 3. Repair Complete - Awaiting Payment - Customer needs to be contacted for payment and pickup
  const awaitingPaymentRaw = await applyPopulation(
    WorkOrder.find({ status: 'Repair Complete - Awaiting Payment' }),
    'workOrder',
    'standard'
  );
  const awaitingPayment = addAppointmentInfo(awaitingPaymentRaw);

  res.status(200).json({
    status: 'success',
    data: {
      diagComplete: {
        workOrders: diagComplete,
        count: diagComplete.length
      },
      partsReceived: {
        workOrders: partsReceived,
        count: partsReceived.length
      },
      awaitingPayment: {
        workOrders: awaitingPayment,
        count: awaitingPayment.length
      }
    }
  });
});
