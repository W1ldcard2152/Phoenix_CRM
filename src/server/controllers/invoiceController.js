const Invoice = require('../models/Invoice');
const WorkOrder = require('../models/WorkOrder');
const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const emailService = require('../services/emailService');

// Get all invoices
exports.getAllInvoices = catchAsync(async (req, res, next) => {
  // Allow filtering by customer, vehicle, status, date range
  const { customer, vehicle, workOrder, status, startDate, endDate } = req.query;
  
  // Build query based on filters
  const query = {};
  
  if (customer) query.customer = customer;
  if (vehicle) query.vehicle = vehicle;
  if (workOrder) query.workOrder = workOrder;
  if (status) query.status = status;
  
  // Date range filter
  if (startDate || endDate) {
    query.invoiceDate = {};
    if (startDate) query.invoiceDate.$gte = new Date(startDate);
    if (endDate) query.invoiceDate.$lte = new Date(endDate);
  }
  
  const invoices = await Invoice.find(query)
    .populate('customer', 'name phone email')
    .populate('vehicle', 'year make model vin')
    .populate('workOrder')
    .sort({ invoiceDate: -1 });
  
  res.status(200).json({
    status: 'success',
    results: invoices.length,
    data: {
      invoices
    }
  });
});

// Get a single invoice
exports.getInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('customer', 'name phone email address')
    .populate('vehicle', 'year make model vin licensePlate')
    .populate('workOrder');
  
  if (!invoice) {
    return next(new AppError('No invoice found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      invoice
    }
  });
});

// Get invoice count (for generating invoice numbers)
exports.getInvoicesCount = catchAsync(async (req, res, next) => {
  const count = await Invoice.countDocuments();
  
  res.status(200).json({
    status: 'success',
    count
  });
});

// Create a new invoice
exports.createInvoice = catchAsync(async (req, res, next) => {
  const {
    invoiceNumber,
    customerId,
    vehicleId,
    workOrderId,
    invoiceDate,
    invoiceDueDate,
    paymentTerms,
    parts,
    labor,
    subtotal,
    taxRate,
    taxAmount,
    total,
    customerNotes,
    terms
  } = req.body;
  
  // Verify that customer and vehicle exist and are related
  const customer = await Customer.findById(customerId);
  
  if (!customer) {
    return next(new AppError('No customer found with that ID', 404));
  }
  
  const vehicle = await Vehicle.findById(vehicleId);
  
  if (!vehicle) {
    return next(new AppError('No vehicle found with that ID', 404));
  }
  
  // Verify that the vehicle belongs to the customer
  if (vehicle.customer.toString() !== customer._id.toString()) {
    return next(
      new AppError('The vehicle does not belong to this customer', 400)
    );
  }
  
  // If a work order is referenced, verify it exists
  if (workOrderId) {
    const workOrder = await WorkOrder.findById(workOrderId);
    
    if (!workOrder) {
      return next(new AppError('No work order found with that ID', 404));
    }
    
    // Update work order status and totalActual
    workOrder.status = 'Invoiced';
    
    // Calculate totalActual from the work order's parts and labor
    const partsCost = workOrder.parts.reduce((total, part) => {
      return total + (part.price * part.quantity);
    }, 0);
    
    const laborCost = workOrder.labor.reduce((total, labor) => {
      return total + (labor.hours * labor.rate);
    }, 0);
    
    workOrder.totalActual = partsCost + laborCost;
    
    await workOrder.save();
  }
  
  // Combine parts and labor into invoice items
  const items = [
    ...parts.map(part => ({
      type: 'Part',
      description: part.name || part.description,
      partNumber: part.partNumber,
      quantity: part.quantity,
      unitPrice: part.price,
      total: part.total || (part.quantity * part.price),
      taxable: true // Could be configurable
    })),
    ...labor.map(labor => ({
      type: 'Labor',
      description: labor.description,
      quantity: labor.hours,
      unitPrice: labor.rate,
      total: labor.total || (labor.hours * labor.rate),
      taxable: true // Could be configurable
    }))
  ];
  
  // Calculate due date if not provided
  let dueDate = invoiceDueDate ? new Date(invoiceDueDate) : new Date(invoiceDate || Date.now());
  
  // Adjust due date based on payment terms if due date not provided
  if (!invoiceDueDate) {
    switch (paymentTerms) {
      case 'Net 15':
        dueDate.setDate(dueDate.getDate() + 15);
        break;
      case 'Net 30':
        dueDate.setDate(dueDate.getDate() + 30);
        break;
      case 'Net 60':
        dueDate.setDate(dueDate.getDate() + 60);
        break;
      // Due on Receipt uses current date, already set above
    }
  }
  
  // Create invoice data
  const invoiceData = {
    invoiceNumber,
    customer: customerId,
    vehicle: vehicleId,
    workOrder: workOrderId,
    invoiceDate: invoiceDate || Date.now(),
    dueDate,
    items,
    subtotal,
    taxRate: taxRate || 0,
    taxAmount: taxAmount || 0,
    total,
    status: 'Issued',
    paymentTerms: paymentTerms || 'Due on Receipt',
    notes: customerNotes,
    terms,
    createdBy: req.user ? req.user.name : 'System'
  };
  
  const newInvoice = await Invoice.create(invoiceData);
  
  res.status(201).json({
    status: 'success',
    data: {
      invoice: newInvoice
    }
  });
});

// Update an invoice
exports.updateInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    return next(new AppError('No invoice found with that ID', 404));
  }
  
  // Don't allow updating certain fields if invoice is paid
  if (invoice.status === 'Paid' && 
      (req.body.items || req.body.subtotal || req.body.total || req.body.taxRate)) {
    return next(
      new AppError('Cannot modify financial details of a paid invoice', 400)
    );
  }
  
  // Add updatedBy field
  if (req.user) {
    req.body.updatedBy = req.user.name;
  }
  
  const updatedInvoice = await Invoice.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      invoice: updatedInvoice
    }
  });
});

// Delete an invoice
exports.deleteInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    return next(new AppError('No invoice found with that ID', 404));
  }
  
  // Don't allow deleting paid invoices
  if (invoice.status === 'Paid') {
    return next(
      new AppError('Cannot delete a paid invoice', 400)
    );
  }
  
  // If there's a work order attached, revert its status
  if (invoice.workOrder) {
    const workOrder = await WorkOrder.findById(invoice.workOrder);
    
    if (workOrder && workOrder.status === 'Invoiced') {
      workOrder.status = workOrder.parts.some(part => !part.received) 
        ? 'Parts Ordered' 
        : 'Parts Received';
      
      await workOrder.save();
    }
  }
  
  await Invoice.findByIdAndDelete(req.params.id);
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Add a payment to an invoice
exports.addPayment = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    return next(new AppError('No invoice found with that ID', 404));
  }
  
  const { amount, method, reference, notes } = req.body;
  
  if (!amount || amount <= 0) {
    return next(new AppError('Please provide a valid payment amount', 400));
  }
  
  // Add payment
  await invoice.addPayment({
    date: Date.now(),
    amount,
    method: method || 'Cash',
    reference,
    notes
  });
  
  // Get updated invoice with populated fields
  const updatedInvoice = await Invoice.findById(req.params.id)
    .populate('customer', 'name phone email')
    .populate('vehicle', 'year make model');
  
  res.status(200).json({
    status: 'success',
    data: {
      invoice: updatedInvoice
    }
  });
});

// Generate PDF (stub implementation)
exports.generatePDF = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('customer', 'name phone email address')
    .populate('vehicle', 'year make model vin')
    .populate('workOrder');
  
  if (!invoice) {
    return next(new AppError('No invoice found with that ID', 404));
  }
  
  // In a real implementation, this would generate a PDF
  // For now, we'll just return the invoice data
  res.status(200).json({
    status: 'success',
    message: 'PDF generation would happen here in production',
    data: {
      invoice
    }
  });
});

// Send invoice via email
exports.sendInvoiceViaEmail = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('customer', 'name phone email')
    .populate('vehicle', 'year make model');
  
  if (!invoice) {
    return next(new AppError('No invoice found with that ID', 404));
  }
  
  const { email } = req.body;
  
  // If no email provided, use customer's email
  const recipientEmail = email || invoice.customer.email;
  
  if (!recipientEmail) {
    return next(new AppError('Please provide an email address', 400));
  }
  
  // In a real implementation, this would send an email with the invoice PDF
  // For now, just update the invoice to mark it as sent
  
  // You could implement the email sending like this:
  /*
  await emailService.sendInvoice(
    recipientEmail,
    invoice,
    invoice.customer,
    invoice.vehicle,
    {} // PDF URL or data
  );
  */
  
  res.status(200).json({
    status: 'success',
    message: `Invoice would be sent to ${recipientEmail} in production`,
    data: {
      invoice
    }
  });
});

// Update invoice status
exports.updateInvoiceStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    return next(new AppError('No invoice found with that ID', 404));
  }

  // Validate status if necessary (e.g., ensure it's one of the allowed values)
  const allowedStatuses = ['Draft', 'Issued', 'Paid', 'Partial', 'Overdue', 'Cancelled', 'Refunded'];
  if (!allowedStatuses.includes(status)) {
    return next(new AppError(`Invalid status: ${status}`, 400));
  }

  invoice.status = status;
  // Add updatedBy field
  if (req.user) {
    invoice.updatedBy = req.user.name;
    invoice.updatedAt = Date.now();
  }
  await invoice.save({ validateBeforeSave: false }); // Bypassing full validation if only status changes

  res.status(200).json({
    status: 'success',
    data: {
      invoice,
    },
  });
});


// Mark invoice as paid
exports.markAsPaid = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    return next(new AppError('No invoice found with that ID', 404));
  }
  
  // Get payment data from request body
  const { amount, method, reference, notes } = req.body;
  
  // Default to the full invoice amount if not specified
  const paymentAmount = amount || invoice.total;
  
  // Add payment
  await invoice.addPayment({
    date: Date.now(),
    amount: paymentAmount,
    method: method || 'Cash',
    reference,
    notes
  });
  
  // Get updated invoice with populated fields
  const updatedInvoice = await Invoice.findById(req.params.id)
    .populate('customer', 'name phone email')
    .populate('vehicle', 'year make model');
  
  res.status(200).json({
    status: 'success',
    data: {
      invoice: updatedInvoice
    }
  });
});
