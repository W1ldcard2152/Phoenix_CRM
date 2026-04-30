const mongoose = require('mongoose');
const WorkOrder = require('../models/WorkOrder');
const Vehicle = require('../models/Vehicle');
const Customer = require('../models/Customer');
const Appointment = require('../models/Appointment');
const WorkOrderNote = require('../models/WorkOrderNote');
const InventoryItem = require('../models/InventoryItem');
const ServicePackage = require('../models/ServicePackage');
const Settings = require('../models/Settings');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { parseLocalDate, buildDateRangeQuery, parseDateOrDefault, todayInTz, startOfTodayInTz, getDayBoundaries } = require('../utils/dateUtils');
const { applyPopulation } = require('../utils/populationHelpers');
const { validateEntityExists, validateVehicleOwnership } = require('../utils/validationHelpers');
const { calculateWorkOrderTotal, getWorkOrderCostBreakdown } = require('../utils/calculationHelpers');
const twilioService = require('../services/twilioService');
const emailService = require('../services/emailService');
const cacheService = require('../services/cacheService');
const { formatDate, TIMEZONE } = require('../config/timezone');

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
  workOrderData.createdBy = req.user._id;

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
      workOrderData.labor,
      workOrderData.servicePackages
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
    const servicePackages = workOrderData.servicePackages || workOrder.servicePackages;
    workOrderData.totalEstimate = calculateWorkOrderTotal(parts, labor, servicePackages);
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
                   formatDate(entry.date, 'YYYY-MM-DD') === formatDate(entryDate, 'YYYY-MM-DD') &&
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
    // Exclude 'Appointment Scheduled' — that status takes priority over parts tracking
    const preReceivedStatuses = ['Parts Ordered', ...preOrderStatuses].filter(s => s !== 'Appointment Scheduled');
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
    workOrder.totalActual = calculateWorkOrderTotal(workOrder.parts, workOrder.labor, workOrder.servicePackages);
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
  workOrder.totalEstimate = calculateWorkOrderTotal(workOrder.parts, workOrder.labor, workOrder.servicePackages);
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

// Add part from inventory to work order (deducts inventory QOH)
exports.addPartFromInventory = catchAsync(async (req, res, next) => {
  const { inventoryItemId, quantity } = req.body;
  if (!inventoryItemId || !quantity || quantity < 1) {
    return next(new AppError('inventoryItemId and quantity (>= 1) are required', 400));
  }

  const workOrder = await validateEntityExists(WorkOrder, req.params.id, 'Work order');
  const item = await InventoryItem.findById(inventoryItemId);
  if (!item || !item.isActive) {
    return next(new AppError('Inventory item not found or inactive', 404));
  }

  if (item.quantityOnHand < quantity) {
    return next(new AppError(`Insufficient stock: ${item.quantityOnHand} ${item.unit} available, ${quantity} requested`, 400));
  }

  const settings = await Settings.getSettings();
  const markup = settings.partMarkupPercentage || 30;
  const price = parseFloat((item.cost * (1 + markup / 100)).toFixed(2));

  // Deduct inventory atomically
  const previousQty = item.quantityOnHand;
  const newQty = previousQty - quantity;
  const updated = await InventoryItem.findOneAndUpdate(
    { _id: inventoryItemId, quantityOnHand: { $gte: quantity } },
    {
      $set: { quantityOnHand: newQty },
      $push: {
        adjustmentLog: {
          adjustedBy: req.user._id,
          previousQty,
          newQty,
          reason: `Used on WO #${workOrder._id}`
        }
      }
    },
    { new: true }
  );
  if (!updated) {
    return next(new AppError('Insufficient stock (concurrent update)', 409));
  }

  // Add part line to work order
  workOrder.parts.push({
    name: item.name,
    partNumber: item.partNumber || '',
    quantity,
    price,
    cost: item.cost,
    vendor: item.vendor || '',
    warranty: item.warranty || '',
    url: item.url || '',
    category: item.category || '',
    inventoryItemId: item._id,
    ordered: true,
    received: true
  });
  workOrder.totalEstimate = calculateWorkOrderTotal(workOrder.parts, workOrder.labor, workOrder.servicePackages);
  await workOrder.save();

  const populatedWorkOrder = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'detailed'
  );

  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();

  const response = {
    status: 'success',
    data: { workOrder: populatedWorkOrder }
  };

  if (newQty <= updated.reorderPoint) {
    response.lowStockWarning = {
      itemName: updated.name,
      currentQoh: newQty,
      unit: updated.unit,
      reorderPoint: updated.reorderPoint
    };
  }

  res.status(200).json(response);
});

// Add service package to work order (labor line + $0 included parts + inventory deductions)
// Add service package as draft (no inventory deduction yet)
exports.addServicePackage = catchAsync(async (req, res, next) => {
  const { servicePackageId, selections } = req.body;
  if (!servicePackageId) {
    return next(new AppError('servicePackageId is required', 400));
  }

  const workOrder = await validateEntityExists(WorkOrder, req.params.id, 'Work order');
  const pkg = await ServicePackage.findById(servicePackageId);
  if (!pkg || !pkg.isActive) {
    return next(new AppError('Service package not found or inactive', 404));
  }

  // selections = [{ includedItemId, inventoryItemId }]
  const selectionMap = {};
  if (selections && Array.isArray(selections)) {
    for (const sel of selections) {
      selectionMap[sel.includedItemId] = sel.inventoryItemId;
    }
  }

  // Validate selected items exist and match tags (but don't check QOH yet)
  const packageIncludedItems = [];
  for (const included of pkg.includedItems) {
    const inventoryItemId = selectionMap[included._id.toString()];
    if (inventoryItemId) {
      const inv = await InventoryItem.findById(inventoryItemId);
      if (!inv || !inv.isActive) {
        return next(new AppError(`Inventory item for "${included.label}" is not found or inactive`, 400));
      }
      if (inv.packageTag !== included.packageTag) {
        return next(new AppError(`Selected item "${inv.name}" does not match required tag "${included.packageTag}"`, 400));
      }
      packageIncludedItems.push({
        inventoryItemId: inv._id,
        name: inv.name,
        partNumber: inv.partNumber || '',
        brand: inv.brand || '',
        quantity: included.quantity,
        cost: inv.cost,
        unit: inv.unit || ''
      });
    } else {
      packageIncludedItems.push({
        name: `${included.label} (${included.packageTag})`,
        quantity: included.quantity,
        cost: 0
      });
    }
  }

  // Add as uncommitted draft — no inventory deducted
  workOrder.servicePackages.push({
    servicePackageId: pkg._id,
    name: pkg.name,
    price: pkg.price,
    committed: false,
    includedItems: packageIncludedItems
  });

  workOrder.totalEstimate = calculateWorkOrderTotal(workOrder.parts, workOrder.labor, workOrder.servicePackages);
  await workOrder.save();

  const populatedWorkOrder = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'detailed'
  );

  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();

  res.status(200).json({
    status: 'success',
    data: { workOrder: populatedWorkOrder }
  });
});

// Commit a service package — deduct inventory
exports.commitServicePackage = catchAsync(async (req, res, next) => {
  const workOrder = await validateEntityExists(WorkOrder, req.params.id, 'Work order');
  const { packageIndex } = req.body;

  if (packageIndex === undefined || packageIndex < 0 || packageIndex >= (workOrder.servicePackages || []).length) {
    return next(new AppError('Invalid package index', 400));
  }

  const pkg = workOrder.servicePackages[packageIndex];
  if (pkg.committed) {
    return next(new AppError('This service package is already committed', 400));
  }

  // Pre-validate all inventory items have sufficient QOH
  for (const item of pkg.includedItems) {
    if (item.inventoryItemId) {
      const inv = await InventoryItem.findById(item.inventoryItemId);
      if (!inv || !inv.isActive) {
        return next(new AppError(`Inventory item "${item.name}" is not found or inactive`, 400));
      }
      if (inv.quantityOnHand < item.quantity) {
        return next(new AppError(`Insufficient stock for "${item.name}": ${inv.quantityOnHand} ${inv.unit} available, ${item.quantity} needed`, 400));
      }
    }
  }

  // Deduct inventory
  const lowStockWarnings = [];
  for (const item of pkg.includedItems) {
    if (item.inventoryItemId) {
      const inv = await InventoryItem.findById(item.inventoryItemId);
      const previousQty = inv.quantityOnHand;
      const newQty = previousQty - item.quantity;

      const updated = await InventoryItem.findOneAndUpdate(
        { _id: inv._id, quantityOnHand: { $gte: item.quantity } },
        {
          $set: { quantityOnHand: newQty },
          $push: {
            adjustmentLog: {
              adjustedBy: req.user._id,
              previousQty,
              newQty,
              reason: `Service "${pkg.name}" on WO #${workOrder._id}`
            }
          }
        },
        { new: true }
      );

      if (!updated) {
        return next(new AppError(`Failed to deduct inventory for "${item.name}" (concurrent update)`, 409));
      }

      if (newQty <= updated.reorderPoint) {
        lowStockWarnings.push({
          itemName: updated.name,
          currentQoh: newQty,
          unit: updated.unit,
          reorderPoint: updated.reorderPoint
        });
      }
    }
  }

  workOrder.servicePackages[packageIndex].committed = true;
  workOrder.markModified('servicePackages');
  await workOrder.save();

  const populatedWorkOrder = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'detailed'
  );

  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();

  const response = {
    status: 'success',
    data: { workOrder: populatedWorkOrder }
  };

  if (lowStockWarnings.length > 0) {
    response.lowStockWarnings = lowStockWarnings;
  }

  res.status(200).json(response);
});

// Remove a service package from work order (does NOT return inventory)
exports.removeServicePackage = catchAsync(async (req, res, next) => {
  const workOrder = await validateEntityExists(WorkOrder, req.params.id, 'Work order');
  const { packageIndex, returnToInventory } = req.body;

  if (packageIndex === undefined || packageIndex < 0 || packageIndex >= (workOrder.servicePackages || []).length) {
    return next(new AppError('Invalid package index', 400));
  }

  const removedPkg = workOrder.servicePackages[packageIndex];

  // Return items to inventory if requested
  if (returnToInventory && removedPkg.includedItems) {
    for (const item of removedPkg.includedItems) {
      if (item.inventoryItemId) {
        const inv = await InventoryItem.findById(item.inventoryItemId);
        if (inv) {
          const previousQty = inv.quantityOnHand;
          const newQty = previousQty + item.quantity;
          await InventoryItem.findByIdAndUpdate(item.inventoryItemId, {
            $set: { quantityOnHand: newQty },
            $push: {
              adjustmentLog: {
                adjustedBy: req.user._id,
                previousQty,
                newQty,
                reason: `Returned from removed service "${removedPkg.name}" on WO #${workOrder._id}`
              }
            }
          });
        }
      }
    }
  }

  workOrder.servicePackages.splice(packageIndex, 1);
  workOrder.totalEstimate = calculateWorkOrderTotal(workOrder.parts, workOrder.labor, workOrder.servicePackages);
  await workOrder.save();

  const populatedWorkOrder = await applyPopulation(
    WorkOrder.findById(req.params.id),
    'workOrder',
    'detailed'
  );

  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();

  res.status(200).json({
    status: 'success',
    data: { workOrder: populatedWorkOrder }
  });
});

// Add labor to work order
exports.addLabor = catchAsync(async (req, res, next) => {
  const workOrder = await validateEntityExists(WorkOrder, req.params.id, 'Work order');

  workOrder.labor.push(req.body);
  workOrder.totalEstimate = calculateWorkOrderTotal(workOrder.parts, workOrder.labor, workOrder.servicePackages);
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
    date: todayInTz(),
    priority: originalWorkOrder.priority,
    status: 'Created',
    serviceRequested: newWorkOrderTitle || `Split from WO ${originalWorkOrder._id.toString().slice(-6)}`,
    diagnosticNotes: `Split from work order ${originalWorkOrder._id.toString().slice(-6)} on ${formatDate(todayInTz())}`,
    parts: partsToMoveItems.map(part => {
      const { _id, ...partData } = part.toObject ? part.toObject() : part;
      return partData;
    }),
    labor: laborToMoveItems.map(labor => ({
      description: labor.description,
      billingType: labor.billingType || 'hourly',
      quantity: labor.quantity || labor.hours,
      rate: labor.rate
    }))
  });

  // Calculate totals for new work order
  newWorkOrder.totalEstimate = calculateWorkOrderTotal(newWorkOrder.parts, newWorkOrder.labor, newWorkOrder.servicePackages);

  // Remove moved items from original work order
  originalWorkOrder.parts = originalWorkOrder.parts.filter(part =>
    !partsToMoveIds.includes(part._id.toString())
  );
  originalWorkOrder.labor = originalWorkOrder.labor.filter(labor =>
    !laborToMoveIds.includes(labor._id.toString())
  );

  // Update totals for original work order
  originalWorkOrder.totalEstimate = calculateWorkOrderTotal(originalWorkOrder.parts, originalWorkOrder.labor, originalWorkOrder.servicePackages);

  // Add note to original work order about the split
  if (!originalWorkOrder.diagnosticNotes) {
    originalWorkOrder.diagnosticNotes = '';
  }
  originalWorkOrder.diagnosticNotes += `\n\nWork order split on ${formatDate(todayInTz())}. Moved items to new work order.`;

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
    'Work Order Created',
    'Appointment Complete',
    'Inspection/Diag Complete',
    'Parts Received',
    'Repair Complete - Awaiting Payment',
    'On Hold',
    'No-Show'
  ];

  // Get only today and future appointments (not past)
  const startOfToday = startOfTodayInTz();

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

// Step 1: Extract parts from receipt using AI (returns raw parts for user review)
// Multer setup for receipt upload (used as route-level middleware)
const multer = require('multer');
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
}).single('receipt');
exports.receiptUpload = receiptUpload;

exports.extractReceipt = catchAsync(async (req, res, next) => {
  const aiService = require('../services/aiService');
  const s3Service = require('../services/s3Service');
  const Media = require('../models/Media');

  const workOrderId = req.params.id;

  const workOrder = await WorkOrder.findById(workOrderId);
  if (!workOrder) {
    return next(new AppError('Work order not found', 404));
  }

  let receiptData, dataType, mimeType = 'image/png', mediaDoc = null;

  if (req.file) {
    mimeType = req.file.mimetype;

    // Upload receipt to S3
    const uploadResult = await s3Service.uploadFile(
      req.file.buffer,
      `receipt-${workOrderId}-${Date.now()}-${req.file.originalname}`,
      req.file.mimetype
    );

    // Create Media document so receipt appears in Attached Files
    mediaDoc = await Media.create({
      workOrder: workOrderId,
      vehicle: workOrder.vehicle,
      customer: workOrder.customer,
      type: 'Parts Receipt',
      fileUrl: uploadResult.fileUrl,
      s3Key: uploadResult.key,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      notes: 'Receipt uploaded - pending part selection',
      uploadedBy: req.user ? `${req.user.firstName} ${req.user.lastName}` : 'System'
    });

    if (req.file.mimetype === 'application/pdf') {
      // Convert PDF pages to images for vision API
      const { pdfToPng } = require('pdf-to-png-converter');
      const pngPages = await pdfToPng(req.file.buffer, {
        viewportScale: 2.0,
        disableFontFace: false,
        verbosityLevel: 0
      });
      console.log(`[extractReceipt] PDF converted to ${pngPages.length} page image(s)`);
      // Send page images to AI — parseReceipt handles single or multi-page
      receiptData = pngPages.map(p => p.content);
      dataType = 'image';
      mimeType = 'image/png';
    } else {
      receiptData = req.file.buffer;
      dataType = 'image';
    }
  } else if (req.body.receiptText) {
    receiptData = req.body.receiptText;
    dataType = 'text';
  } else {
    return next(new AppError('Please provide either a receipt file or text', 400));
  }

  // Extract raw parts (no markup, no shipping amortization yet)
  const { parts, shippingTotal } = await aiService.parseReceipt(receiptData, dataType, mimeType);

  if (!parts || parts.length === 0) {
    return next(new AppError('No parts could be extracted from the receipt', 400));
  }

  // Duplicate detection: check against WO parts, parts catalog, and inventory
  const Part = require('../models/Part');
  const [catalogParts, inventoryItems] = await Promise.all([
    Part.find({ isActive: true }).select('_id name partNumber').lean(),
    InventoryItem.find({ isActive: true }).select('_id name partNumber').lean()
  ]);

  const allExisting = [
    ...workOrder.parts.map(p => ({ _id: `wo:${p._id}`, name: p.name, partNumber: p.partNumber || p.itemNumber || '' })),
    ...catalogParts.map(p => ({ _id: `catalog:${p._id}`, name: p.name, partNumber: p.partNumber || '' })),
    ...inventoryItems.map(p => ({ _id: `inv:${p._id}`, name: p.name, partNumber: p.partNumber || '' }))
  ];

  let duplicates = [];
  if (allExisting.length > 0) {
    const rawMatches = await aiService.findDuplicates(parts, allExisting);

    const woById = {};
    workOrder.parts.forEach(p => { woById[p._id.toString()] = p; });
    const catById = {};
    catalogParts.forEach(p => { catById[p._id.toString()] = p; });
    const invById = {};
    inventoryItems.forEach(p => { invById[p._id.toString()] = p; });

    duplicates = rawMatches.map(m => {
      const colonIdx = m.existingId.indexOf(':');
      const source = m.existingId.substring(0, colonIdx);
      const rawId = m.existingId.substring(colonIdx + 1);
      let existingName = '';
      if (source === 'wo') existingName = woById[rawId]?.name || '';
      else if (source === 'catalog') existingName = catById[rawId]?.name || '';
      else if (source === 'inv') existingName = invById[rawId]?.name || '';
      return { parsedIndex: m.parsedIndex, source, rawId, existingName, reason: m.reason };
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      parts,
      shippingTotal,
      mediaId: mediaDoc ? mediaDoc._id : null,
      mediaS3Key: mediaDoc ? mediaDoc.s3Key : null,
      duplicates
    }
  });
});

// Step 2: Add user-selected parts to work order (with shipping amortization + markup)
exports.confirmReceiptParts = catchAsync(async (req, res, next) => {
  const aiService = require('../services/aiService');
  const Media = require('../models/Media');

  const workOrderId = req.params.id;
  const { selectedParts, shippingTotal, totalAllUnits, isOrder, mediaId, mediaS3Key, catalogActions, duplicateResolutions = {} } = req.body;

  if (!selectedParts || !Array.isArray(selectedParts) || selectedParts.length === 0) {
    return next(new AppError('No parts selected', 400));
  }

  const workOrder = await WorkOrder.findById(workOrderId);
  if (!workOrder) {
    return next(new AppError('Work order not found', 404));
  }

  // Apply shipping amortization and markup to selected parts
  const settings = await Settings.getSettings();
  const finalizedParts = aiService.finalizeParts(selectedParts, shippingTotal || 0, isOrder, settings.partMarkupPercentage, totalAllUnits);

  // Link receipt media to each part
  const partsWithReceipt = finalizedParts.map(part => ({
    ...part,
    receiptImageUrl: mediaS3Key || null
  }));

  // Add new parts or overwrite existing WO parts based on duplicate resolutions
  for (let i = 0; i < partsWithReceipt.length; i++) {
    const part = partsWithReceipt[i];
    const resolution = duplicateResolutions[i] || {};

    if (resolution.woAction === 'overwrite' && resolution.woMatchId) {
      const existingPart = workOrder.parts.id(resolution.woMatchId);
      if (existingPart) {
        existingPart.name = part.name;
        if (part.itemNumber) existingPart.partNumber = part.itemNumber;
        if (part.vendor) existingPart.vendor = part.vendor;
        if (part.supplier) existingPart.supplier = part.supplier;
        existingPart.quantity = part.quantity;
        existingPart.cost = part.cost;
        existingPart.price = part.price;
        existingPart.ordered = part.ordered;
        if (part.receiptImageUrl) existingPart.receiptImageUrl = part.receiptImageUrl;
        continue;
      }
    }
    workOrder.parts.push(part);
  }

  // Auto-advance status if all parts ordered
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

  // Add parts to catalog/inventory if requested (best-effort)
  if (catalogActions && typeof catalogActions === 'object') {
    const Part = require('../models/Part');

    for (const [indexStr, action] of Object.entries(catalogActions)) {
      const i = parseInt(indexStr);
      const part = partsWithReceipt[i];
      if (!part || !action) continue;

      const resolution = duplicateResolutions[i] || {};

      try {
        if (action === 'catalog') {
          if (resolution.catalogAction === 'update_price' && resolution.catalogMatchId) {
            // Same part found in catalog — update price/cost only, no new entry
            await Part.findByIdAndUpdate(resolution.catalogMatchId, {
              cost: part.cost || 0,
              price: part.price || 0
            });
          } else {
            const partNumber = part.itemNumber || `IMPORT-${Date.now()}-${indexStr}`;
            await Part.findOneAndUpdate(
              { partNumber },
              {
                name: part.name,
                partNumber,
                vendor: part.vendor || 'Unknown',
                brand: part.vendor || 'Unknown',
                category: 'Other',
                cost: part.cost || 0,
                price: part.price || 0,
                warranty: '',
                url: ''
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          }
        } else if (action === 'inventory') {
          if (resolution.inventoryAction === 'add_to_existing' && resolution.inventoryMatchId) {
            // Same item found in inventory — add to QOH and update cost/price
            const existing = await InventoryItem.findById(resolution.inventoryMatchId);
            if (existing) {
              const previousQty = existing.quantityOnHand;
              const newQty = previousQty + (part.quantity || 1);
              const update = { quantityOnHand: newQty, name: part.name, cost: part.cost || 0, price: part.price || 0 };
              if (part.vendor) update.vendor = part.vendor;
              if (part.itemNumber) update.partNumber = part.itemNumber;
              await InventoryItem.findByIdAndUpdate(resolution.inventoryMatchId, {
                $set: update,
                $push: {
                  adjustmentLog: {
                    adjustedBy: req.user._id,
                    previousQty,
                    newQty,
                    reason: 'Restocked (receipt import)'
                  }
                }
              });
            }
          } else {
            await InventoryItem.findOneAndUpdate(
              { name: part.name, partNumber: part.itemNumber || '' },
              {
                name: part.name,
                partNumber: part.itemNumber || '',
                vendor: part.vendor || '',
                cost: part.cost || 0,
                price: part.price || 0,
                quantityOnHand: part.quantity || 1
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          }
        }
      } catch (catalogErr) {
        console.error(`[Receipt] Failed to process part "${part.name}" for ${action}:`, catalogErr.message);
      }
    }
  }

  // Update media doc notes with final count
  if (mediaId) {
    try {
      const mediaDoc = await Media.findById(mediaId);
      if (mediaDoc) {
        mediaDoc.notes = `AI-imported ${isOrder ? 'receipt' : 'quote'} - ${partsWithReceipt.length} part(s) added`;
        await mediaDoc.save();
      }
    } catch (e) {
      console.error('Error updating media notes:', e);
    }
  }

  cacheService.invalidateAllWorkOrders();
  cacheService.invalidateServiceWritersCorner();

  res.status(200).json({
    status: 'success',
    message: `Successfully added ${partsWithReceipt.length} part(s)`,
    data: {
      workOrder,
      addedParts: partsWithReceipt
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

// Get technician dashboard data (work orders + today's schedule + stats)
exports.getTechnicianDashboard = catchAsync(async (req, res, next) => {
  const technicianId = req.user.technician;
  if (!technicianId) {
    return next(new AppError('No technician profile linked to this account', 400));
  }

  const cacheKey = `workorders:tech-dashboard:${technicianId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const technicianStatuses = [
    'Appointment Scheduled',
    'Appointment Complete',
    'Inspection In Progress',
    'Inspection/Diag Complete',
    'Repair In Progress',
    'Repair Complete - Awaiting Payment'
  ];

  const workOrders = await applyPopulation(
    WorkOrder.find({
      assignedTechnician: technicianId,
      status: { $in: technicianStatuses }
    }).sort({ date: -1 }),
    'workOrder',
    'techDashboard'
  );

  // Extract today's appointments from populated work orders
  const { startOfDay, endOfDay } = getDayBoundaries(new Date());
  const todaysSchedule = [];

  for (const wo of workOrders) {
    const allAppointments = [
      ...(wo.appointments || []),
      ...(wo.appointmentId && wo.appointmentId.startTime ? [wo.appointmentId] : [])
    ];
    // Deduplicate by _id
    const seen = new Set();
    for (const appt of allAppointments) {
      if (!appt || !appt.startTime || seen.has(String(appt._id))) continue;
      seen.add(String(appt._id));
      if (appt.startTime >= startOfDay && appt.startTime <= endOfDay &&
          appt.status !== 'Cancelled' && appt.status !== 'No-Show') {
        todaysSchedule.push({
          appointmentId: appt._id,
          workOrderId: wo._id,
          startTime: appt.startTime,
          endTime: appt.endTime,
          status: appt.status,
          serviceType: appt.serviceType,
          vehicle: wo.vehicle,
          customer: wo.customer,
          workOrderStatus: wo.status,
          priority: wo.priority,
          services: wo.services
        });
      }
    }
  }

  todaysSchedule.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const stats = {
    total: workOrders.length,
    inspecting: workOrders.filter(wo => wo.status === 'Inspection In Progress').length,
    repairing: workOrders.filter(wo => wo.status === 'Repair In Progress').length,
    todayCount: todaysSchedule.length,
    awaitingAction: workOrders.filter(wo =>
      ['Appointment Complete', 'Appointment Scheduled'].includes(wo.status)
    ).length
  };

  const activeJob = workOrders.find(wo =>
    wo.status === 'Inspection In Progress' || wo.status === 'Repair In Progress'
  ) || null;

  const responseData = {
    status: 'success',
    data: {
      workOrders,
      todaysSchedule,
      stats,
      activeJob: activeJob ? activeJob._id : null
    }
  };

  cacheService.set(cacheKey, responseData, 120);
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
  quoteData.createdBy = req.user._id;

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
    quoteData.totalEstimate = calculateWorkOrderTotal(quoteData.parts, quoteData.labor, quoteData.servicePackages);
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
      date: todayInTz(),
      priority: quote.priority,
      status: 'Work Order Created',
      services: quote.services.map(s => ({ description: s.description })),
      serviceRequested: quote.serviceRequested,
      diagnosticNotes: `Converted from Quote #${quote._id.toString().slice(-8).toUpperCase()}`,
      parts: partsToMove.map(part => {
        const { _id, ...partData } = part.toObject ? part.toObject() : part;
        return partData;
      }),
      labor: laborToMove.map(labor => ({
        description: labor.description,
        billingType: labor.billingType || 'hourly',
        quantity: labor.quantity || labor.hours,
        rate: labor.rate
      }))
    });

    newWorkOrder.totalEstimate = calculateWorkOrderTotal(newWorkOrder.parts, newWorkOrder.labor, newWorkOrder.servicePackages);
    await newWorkOrder.save();

    // Remove converted items from quote
    quote.parts = quote.parts.filter(part =>
      !partsToConvertIds.includes(part._id.toString())
    );
    quote.labor = quote.labor.filter(labor =>
      !laborToConvertIds.includes(labor._id.toString())
    );
    quote.totalEstimate = calculateWorkOrderTotal(quote.parts, quote.labor, quote.servicePackages);

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
    date: todayInTz(),
    priority: workOrder.priority,
    status: 'Quote',
    services: workOrder.services.map(s => ({ description: s.description })),
    serviceRequested: workOrder.serviceRequested,
    diagnosticNotes: `Generated from Work Order #${workOrder._id.toString().slice(-8).toUpperCase()}`,
    parts: partsSource.map(part => {
      const { _id, ordered, received, receiptImageUrl, ...partData } = part.toObject ? part.toObject() : part;
      return partData;
    }),
    labor: laborSource.map(labor => ({
      description: labor.description,
      billingType: labor.billingType || 'hourly',
      quantity: labor.quantity || labor.hours,
      rate: labor.rate
    }))
  });

  newQuote.totalEstimate = calculateWorkOrderTotal(newQuote.parts, newQuote.labor, newQuote.servicePackages);
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
