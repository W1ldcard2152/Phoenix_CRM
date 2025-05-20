const Appointment = require('../models/Appointment');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const WorkOrder = require('../models/WorkOrder');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const twilioService = require('../services/twilioService');
const emailService = require('../services/emailService');

// Get all appointments
exports.getAllAppointments = catchAsync(async (req, res, next) => {
  // Allow filtering by date range, status, technician
  const { startDate, endDate, status, technician } = req.query;
  
  // Build query based on filters
  const query = {};
  
  if (status) query.status = status;
  if (technician) query.technician = technician;
  
  // Date range filter
  if (startDate || endDate) {
    if (startDate) {
      query.startTime = { $gte: new Date(startDate) };
    }
    if (endDate) {
      if (!query.startTime) query.startTime = {};
      query.startTime.$lte = new Date(endDate);
    }
  }
  
  const appointments = await Appointment.find(query)
  .populate('customer', 'name phone email')
  .populate('vehicle', 'year make model')
  .populate('technician', 'name specialization') // Populate technician
  .populate({ path: 'workOrder', select: 'status' }) // Populate workOrder status
  .sort({ startTime: 1 });
  
  res.status(200).json({
    status: 'success',
    results: appointments.length,
    data: {
      appointments
    }
  });
});

// Get a single appointment
exports.getAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('customer', 'name phone email')
    .populate('vehicle', 'year make model vin')
    .populate('workOrder')
    .populate('technician', 'name specialization'); // Populate technician
  
  if (!appointment) {
    return next(new AppError('No appointment found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      appointment
    }
  });
});

// Create a new appointment
exports.createAppointment = catchAsync(async (req, res, next) => {
  // Verify customer and vehicle exist and are related
  const customer = await Customer.findById(req.body.customer);
  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }
  
  const vehicle = await Vehicle.findById(req.body.vehicle);
  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }
  
  // Verify that the vehicle belongs to the customer
  if (vehicle.customer.toString() !== customer._id.toString()) {
    return next(
      new AppError('The vehicle does not belong to this customer', 400)
    );
  }
  
  // Check for scheduling conflicts
  if (req.body.technician) {
    const conflicts = await Appointment.checkConflicts(
      new Date(req.body.startTime),
      new Date(req.body.endTime),
      req.body.technician
    );
    
    if (conflicts.length > 0) {
      return next(
        new AppError('There is a scheduling conflict with another appointment', 400)
      );
    }
  }
  
  const appointmentData = { ...req.body };

  // If linking to an existing workOrderId, ensure createWorkOrder is not also true.
  // Typically, UI would prevent this, but good to be safe.
  if (appointmentData.workOrderId && appointmentData.createWorkOrder) {
    // Prioritize linking to existing work order if both are somehow sent.
    delete appointmentData.createWorkOrder;
    // Or return an error:
    // return next(new AppError('Cannot both link to an existing work order and create a new one simultaneously.', 400));
  }

  const newAppointment = await Appointment.create(appointmentData);
  
  // Handle work order association
  if (newAppointment.workOrder) { 
    // This means appointmentData.workOrderId was provided and saved on newAppointment.
    // This appointment is being linked to an EXISTING work order.
    // We need to update that existing work order.
    const workOrderToUpdate = await WorkOrder.findById(newAppointment.workOrder);
    if (workOrderToUpdate) {
      let woNeedsSave = false;
      if (workOrderToUpdate.appointmentId?.toString() !== newAppointment._id.toString()) {
        workOrderToUpdate.appointmentId = newAppointment._id;
        woNeedsSave = true;
      }
      if (newAppointment.technician && workOrderToUpdate.assignedTechnician?.toString() !== newAppointment.technician.toString()) {
        workOrderToUpdate.assignedTechnician = newAppointment.technician;
        woNeedsSave = true;
      }
      // Optionally, update work order status if it's in a basic 'Created' state
      if (workOrderToUpdate.status === 'Created') {
        workOrderToUpdate.status = 'Scheduled'; 
        woNeedsSave = true;
      }
      if (woNeedsSave) {
        await workOrderToUpdate.save();
        console.log('DEBUG: workOrderToUpdate after save in createAppointment:', workOrderToUpdate); // DEBUG LOG
      }
    }
  } else if (appointmentData.createWorkOrder === true || appointmentData.createWorkOrder === 'true') { 
    // No existing workOrderId provided, and createWorkOrder is true.
    // This calls the model method which creates a NEW work order and links it.
    // The newAppointment instance is updated and saved within createWorkOrder().
    await newAppointment.createWorkOrder(); 
  }
  
  // Send confirmation based on customer preferences
  // Ensure customer is populated for communicationPreference
  const populatedCustomerForNotif = await Customer.findById(newAppointment.customer);

  if (populatedCustomerForNotif && populatedCustomerForNotif.communicationPreference === 'SMS' && populatedCustomerForNotif.phone) {
    try {
      await twilioService.sendAppointmentReminder(
        newAppointment, // newAppointment should have times and serviceType
        populatedCustomerForNotif,
        vehicle // vehicle was fetched earlier
      );
    } catch (err) {
      console.error('Failed to send SMS confirmation:', err);
    }
  } else if (populatedCustomerForNotif && populatedCustomerForNotif.communicationPreference === 'Email' && populatedCustomerForNotif.email) {
    try {
      await emailService.sendAppointmentConfirmation(
        newAppointment,
        populatedCustomerForNotif,
        vehicle
      );
    } catch (err) {
      console.error('Failed to send email confirmation:', err);
    }
  }
  
  // Repopulate newAppointment fully before sending the response
  const fullyPopulatedAppointment = await Appointment.findById(newAppointment._id)
    .populate('customer', 'name phone email')
    .populate('vehicle', 'year make model vin') // Added vin
    .populate('technician', 'name specialization')
    .populate({ // Populate workOrder and its relevant fields
      path: 'workOrder',
      populate: [
        { path: 'assignedTechnician', select: 'name specialization' },
        { path: 'customer', select: 'name' }, // Example, add more as needed
        { path: 'vehicle', select: 'year make model' } // Example
      ]
    });
  
  res.status(201).json({
    status: 'success',
    data: {
      appointment: fullyPopulatedAppointment
    }
  });
  // The following block was duplicated and caused an error.
  // if (customer.communicationPreference === 'SMS' && customer.phone) {
  //   try {
  //     await twilioService.sendAppointmentReminder(
  //       newAppointment,
  //       customer,
  //       vehicle
  //     );
  //   } catch (err) {
  //     console.error('Failed to send SMS confirmation:', err);
  //     // Don't fail the appointment creation if notification fails
  //   }
  // } else if (customer.communicationPreference === 'Email' && customer.email) {
  //   try {
  //     await emailService.sendAppointmentConfirmation(
  //       newAppointment,
  //       customer,
  //       vehicle
  //     );
  //   } catch (err) {
  //     console.error('Failed to send email confirmation:', err);
  //     // Don't fail the appointment creation if notification fails
  //   }
  // }
  
  // res.status(201).json({
  //   status: 'success',
  //   data: {
  //     appointment: newAppointment // This was sending the unpopulated appointment
  //   }
  // });
});

// Update an appointment
exports.updateAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);
  
  if (!appointment) {
    return next(new AppError('No appointment found with that ID', 404));
  }
  
  // Check for scheduling conflicts if time or technician is changing
  if ((req.body.startTime || req.body.endTime || req.body.technician) && 
      appointment.status !== 'Cancelled' && 
      appointment.status !== 'Completed') {
    
    const startTime = req.body.startTime 
      ? new Date(req.body.startTime) 
      : appointment.startTime;
      
    const endTime = req.body.endTime 
      ? new Date(req.body.endTime) 
      : appointment.endTime;
      
    const technician = req.body.technician || appointment.technician;
    
    const conflicts = await Appointment.checkConflicts(
      startTime,
      endTime,
      technician,
      req.params.id // Exclude this appointment from conflict check
    );
    
    if (conflicts.length > 0) {
      return next(
        new AppError('There is a scheduling conflict with another appointment', 400)
      );
    }
  }
  
  // If status is changing to 'Completed', check/update related work order
  if (req.body.status === 'Completed' && appointment.status !== 'Completed') {
    if (appointment.workOrder) {
      await WorkOrder.findByIdAndUpdate(
        appointment.workOrder,
        { status: 'In Progress' },
        { new: true }
      );
    }
  }
  
  // If status is changing to 'Cancelled', check/update related work order
  if (req.body.status === 'Cancelled' && appointment.status !== 'Cancelled') {
    if (appointment.workOrder) {
      await WorkOrder.findByIdAndUpdate(
        appointment.workOrder,
        { status: 'Cancelled' },
        { new: true, runValidators: true } // Added runValidators
      );
    }
  }

  // If appointment status is 'Scheduled' or 'Confirmed', ensure linked WorkOrder is 'Scheduled'
  if (
    (req.body.status === 'Scheduled' || req.body.status === 'Confirmed') &&
    appointment.workOrder
  ) {
    const workOrder = await WorkOrder.findById(appointment.workOrder);
    // Only update if work order exists and is in a more preliminary state
    if (workOrder && (workOrder.status === 'Created' || workOrder.status === 'On Hold')) {
      await WorkOrder.findByIdAndUpdate(
        appointment.workOrder,
        { status: 'Scheduled' },
        { new: true, runValidators: true } // Added runValidators
      );
    }
  }
  
  const updatedAppointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true
    }
  ).populate('customer', 'name phone email communicationPreference')
   .populate('vehicle', 'year make model')
   .populate('technician', 'name specialization'); // Populate technician

  // If technician was changed and there's an associated work order, update it
  if (req.body.technician && updatedAppointment.workOrder) {
    // Check if the technician actually changed to avoid unnecessary updates
    const oldTechnicianId = appointment.technician ? appointment.technician.toString() : null;
    const newTechnicianId = req.body.technician;

    if (oldTechnicianId !== newTechnicianId) {
      await WorkOrder.findByIdAndUpdate(
        updatedAppointment.workOrder,
        { assignedTechnician: newTechnicianId },
        { new: true, runValidators: true } // Added runValidators
      );
    }
  }
  
  // Send notification if status changed and customer has communication preference
  if (req.body.status && 
      req.body.status !== appointment.status && 
      updatedAppointment.customer && 
      updatedAppointment.customer.communicationPreference !== 'None') {
    
    // Status update notification logic
    if (updatedAppointment.customer.communicationPreference === 'SMS' && 
        updatedAppointment.customer.phone) {
      try {
        // This would be implemented with specific notification templates for each status
        // For example:
        // if (req.body.status === 'Confirmed') {
        //   await twilioService.sendAppointmentConfirmation(...);
        // }
      } catch (err) {
        console.error('Failed to send SMS notification:', err);
      }
    } else if (updatedAppointment.customer.communicationPreference === 'Email' && 
               updatedAppointment.customer.email) {
      try {
        // Similar email notification logic
      } catch (err) {
        console.error('Failed to send email notification:', err);
      }
    }
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      appointment: updatedAppointment
    }
  });
});

// Delete an appointment
exports.deleteAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);
  
  if (!appointment) {
    return next(new AppError('No appointment found with that ID', 404));
  }
  
  // Update related work order if it exists
  if (appointment.workOrder) {
    await WorkOrder.findByIdAndUpdate(
      appointment.workOrder,
      { appointmentId: null },
      { new: true }
    );
  }
  
  await Appointment.findByIdAndDelete(req.params.id);
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Create work order from appointment
exports.createWorkOrderFromAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('customer')
    .populate('vehicle');
  
  if (!appointment) {
    return next(new AppError('No appointment found with that ID', 404));
  }
  
  // Check if work order already exists
  if (appointment.workOrder) {
    return next(
      new AppError('A work order already exists for this appointment', 400)
    );
  }
  
  const result = await appointment.createWorkOrder();
  
  // Get the newly created work order
  const workOrder = await WorkOrder.findById(appointment.workOrder);
  
  res.status(201).json({
    status: 'success',
    data: {
      appointment,
      workOrder
    }
  });
});

// Get appointments by date range
exports.getAppointmentsByDateRange = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.params;
  
  if (!startDate || !endDate) {
    return next(
      new AppError('Please provide both start date and end date', 400)
    );
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return next(
      new AppError('Please provide valid dates in ISO format (YYYY-MM-DD)', 400)
    );
  }
  
  // Set end date to end of day
  end.setHours(23, 59, 59, 999);
  
  const appointments = await Appointment.find({
    startTime: { $gte: start, $lte: end }
  })
  .populate('customer', 'name phone email')
  .populate('vehicle', 'year make model')
  .populate('technician', 'name specialization') // Populate technician
  .populate({ path: 'workOrder', select: 'status' }) // Populate workOrder status
  .sort({ startTime: 1 });
  
  res.status(200).json({
    status: 'success',
    results: appointments.length,
    data: {
      appointments
    }
  });
});

// Send appointment reminder
exports.sendAppointmentReminder = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('customer', 'name phone email communicationPreference')
    .populate('vehicle', 'year make model');
  
  if (!appointment) {
    return next(new AppError('No appointment found with that ID', 404));
  }
  
  if (appointment.customer.communicationPreference === 'SMS' && 
      appointment.customer.phone) {
    await twilioService.sendAppointmentReminder(
      appointment,
      appointment.customer,
      appointment.vehicle
    );
    
    // Update appointment to mark reminder as sent
    appointment.reminder.sent = true;
    appointment.reminder.sentAt = new Date();
    await appointment.save({ validateBeforeSave: false });
    
  } else if (appointment.customer.communicationPreference === 'Email' && 
             appointment.customer.email) {
    await emailService.sendAppointmentConfirmation(
      appointment,
      appointment.customer,
      appointment.vehicle
    );
    
    // Update appointment to mark reminder as sent
    appointment.reminder.sent = true;
    appointment.reminder.sentAt = new Date();
    await appointment.save({ validateBeforeSave: false });
  } else {
    return next(
      new AppError('Customer has no valid communication preference set', 400)
    );
  }
  
  res.status(200).json({
    status: 'success',
    message: 'Appointment reminder sent successfully',
    data: {
      appointment
    }
  });
});

// Check for scheduling conflicts
exports.checkConflicts = catchAsync(async (req, res, next) => {
  const { startTime, endTime, technician } = req.body;
  
  if (!startTime || !endTime) {
    return next(
      new AppError('Please provide both start time and end time', 400)
    );
  }
  
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return next(
      new AppError('Please provide valid dates in ISO format', 400)
    );
  }
  
  // Optional appointmentId to exclude from conflict check (for updates)
  const { appointmentId } = req.query;
  
  const conflicts = await Appointment.checkConflicts(
    start,
    end,
    technician,
    appointmentId
  );
  
  res.status(200).json({
    status: 'success',
    results: conflicts.length,
    data: {
      hasConflicts: conflicts.length > 0,
      conflicts
    }
  });
});

// Get today's appointments
exports.getTodayAppointments = catchAsync(async (req, res, next) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const appointments = await Appointment.find({
    startTime: { $gte: today, $lt: tomorrow }
  })
  .populate('customer', 'name phone email')
  .populate('vehicle', 'year make model')
  .populate('technician', 'name specialization') // Populate technician
  .sort({ startTime: 1 });
  
  res.status(200).json({
    status: 'success',
    results: appointments.length,
    data: {
      appointments
    }
  });
});

// Get appointments by customer
exports.getCustomerAppointments = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;
  
  const customer = await Customer.findById(customerId);
  
  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }
  
  const appointments = await Appointment.find({ customer: customerId })
    .populate('vehicle', 'year make model')
    .populate('technician', 'name specialization') // Populate technician
    .sort({ startTime: -1 });
  
  res.status(200).json({
    status: 'success',
    results: appointments.length,
    data: {
      customer,
      appointments
    }
  });
});

// Get appointments by vehicle
exports.getVehicleAppointments = catchAsync(async (req, res, next) => {
  const { vehicleId } = req.params;
  
  const vehicle = await Vehicle.findById(vehicleId).populate('customer', 'name');
  
  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }
  
  const appointments = await Appointment.find({ vehicle: vehicleId })
    .populate('technician', 'name specialization') // Populate technician
    .sort({ startTime: -1 });
  
  res.status(200).json({
    status: 'success',
    results: appointments.length,
    data: {
      vehicle,
      appointments
    }
  });
});
