const FollowUp = require('../models/FollowUp');
const WorkOrder = require('../models/WorkOrder');
const Vehicle = require('../models/Vehicle');
const Appointment = require('../models/Appointment');
const Invoice = require('../models/Invoice');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const PRIORITY_WEIGHT = { urgent: 4, high: 3, normal: 2, low: 1 };

// Resolve hierarchy refs from entityType + entityId
const resolveHierarchy = async (entityType, entityId) => {
  const refs = {};

  switch (entityType) {
    case 'customer':
      refs.customer = entityId;
      break;

    case 'vehicle': {
      const vehicle = await Vehicle.findById(entityId).select('customer');
      if (!vehicle) throw new Error('Vehicle not found');
      refs.vehicle = entityId;
      refs.customer = vehicle.customer;
      break;
    }

    case 'workOrder':
    case 'quote': {
      const wo = await WorkOrder.findById(entityId).select('customer vehicle');
      if (!wo) throw new Error('Work order not found');
      refs.workOrder = entityId;
      refs.vehicle = wo.vehicle;
      refs.customer = wo.customer;
      break;
    }

    case 'invoice': {
      const inv = await Invoice.findById(entityId).select('workOrder customer vehicle');
      if (!inv) throw new Error('Invoice not found');
      refs.invoice = entityId;
      refs.workOrder = inv.workOrder;
      refs.vehicle = inv.vehicle;
      refs.customer = inv.customer;
      break;
    }

    case 'appointment': {
      const appt = await Appointment.findById(entityId).select('workOrder customer vehicle');
      if (!appt) throw new Error('Appointment not found');
      refs.appointment = entityId;
      refs.workOrder = appt.workOrder;
      refs.vehicle = appt.vehicle;
      refs.customer = appt.customer;
      break;
    }

    default:
      throw new Error(`Invalid entity type: ${entityType}`);
  }

  return refs;
};

const populateFollowUp = (query) => {
  return query
    .populate('customer', 'name phone email')
    .populate('vehicle', 'year make model')
    .populate('workOrder', 'status serviceRequested services date')
    .populate('appointment', 'startTime endTime serviceType')
    .populate('invoice', 'invoiceNumber')
    .populate('createdBy', 'name')
    .populate('closedBy', 'name');
};

// GET /dashboard - open follow-ups for dashboard card
exports.getDashboardFollowUps = catchAsync(async (req, res, next) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const openFollowUps = await FollowUp.find({ status: 'open' })
    .populate('customer', 'name phone')
    .populate('vehicle', 'year make model')
    .populate('workOrder', 'status')
    .lean();

  // Sort: due today first, then priority desc, then dueDate asc (nulls last), then createdAt desc
  openFollowUps.sort((a, b) => {
    const aDueToday = a.dueDate && a.dueDate >= startOfToday && a.dueDate < endOfToday ? 1 : 0;
    const bDueToday = b.dueDate && b.dueDate >= startOfToday && b.dueDate < endOfToday ? 1 : 0;
    if (bDueToday !== aDueToday) return bDueToday - aDueToday;

    const aPri = PRIORITY_WEIGHT[a.priority] || 2;
    const bPri = PRIORITY_WEIGHT[b.priority] || 2;
    if (bPri !== aPri) return bPri - aPri;

    // dueDate ascending, nulls last
    if (a.dueDate && b.dueDate) {
      if (a.dueDate.getTime() !== b.dueDate.getTime()) return a.dueDate - b.dueDate;
    } else if (a.dueDate && !b.dueDate) {
      return -1;
    } else if (!a.dueDate && b.dueDate) {
      return 1;
    }

    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Add isOverdue virtual (lean strips virtuals)
  openFollowUps.forEach(fu => {
    fu.isOverdue = fu.dueDate && fu.dueDate < now;
  });

  res.json({
    status: 'success',
    data: {
      followUps: openFollowUps.slice(0, 5),
      totalCount: openFollowUps.length
    }
  });
});

// GET /entity/:entityType/:entityId - follow-ups for a specific entity
exports.getEntityFollowUps = catchAsync(async (req, res, next) => {
  const { entityType, entityId } = req.params;

  const fieldMap = {
    customer: 'customer',
    vehicle: 'vehicle',
    workOrder: 'workOrder',
    quote: 'workOrder',
    invoice: 'invoice',
    appointment: 'appointment'
  };

  const field = fieldMap[entityType];
  if (!field) {
    return next(new AppError('Invalid entity type', 400));
  }

  const query = { [field]: entityId };
  if (entityType === 'quote') {
    query.entityType = 'quote';
  }

  const followUps = await populateFollowUp(FollowUp.find(query).sort({ status: 1, createdAt: -1 }));

  res.json({
    status: 'success',
    data: { followUps }
  });
});

// GET / - list with filters
exports.getFollowUps = catchAsync(async (req, res, next) => {
  const { status, entityType, customer, vehicle, workOrder } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (entityType) filter.entityType = entityType;
  if (customer) filter.customer = customer;
  if (vehicle) filter.vehicle = vehicle;
  if (workOrder) filter.workOrder = workOrder;

  const followUps = await populateFollowUp(
    FollowUp.find(filter).sort({ status: 1, createdAt: -1 })
  );

  res.json({
    status: 'success',
    data: { followUps }
  });
});

// GET /:id - single follow-up
exports.getFollowUp = catchAsync(async (req, res, next) => {
  const followUp = await populateFollowUp(FollowUp.findById(req.params.id));

  if (!followUp) {
    return next(new AppError('Follow-up not found', 404));
  }

  res.json({
    status: 'success',
    data: { followUp }
  });
});

// POST / - create follow-up
exports.createFollowUp = catchAsync(async (req, res, next) => {
  const { entityType, entityId, note, priority, dueDate, noteTimestamp } = req.body;

  if (!entityType || !entityId) {
    return next(new AppError('Entity type and entity ID are required', 400));
  }

  if (!note || !note.trim()) {
    return next(new AppError('Initial note is required', 400));
  }

  let refs;
  try {
    refs = await resolveHierarchy(entityType, entityId);
  } catch (err) {
    return next(new AppError(err.message, 404));
  }

  const followUp = await FollowUp.create({
    ...refs,
    entityType,
    priority: priority || 'normal',
    dueDate: dueDate || undefined,
    notes: [{
      text: note.trim(),
      timestamp: noteTimestamp ? new Date(noteTimestamp) : new Date(),
      createdBy: req.user._id,
      createdByName: req.user.name
    }],
    createdBy: req.user._id,
    createdByName: req.user.name
  });

  const populated = await populateFollowUp(FollowUp.findById(followUp._id));

  res.status(201).json({
    status: 'success',
    data: { followUp: populated }
  });
});

// PUT /:id - update priority, dueDate
exports.updateFollowUp = catchAsync(async (req, res, next) => {
  const { priority, dueDate } = req.body;
  const update = {};
  if (priority) update.priority = priority;
  if (dueDate !== undefined) update.dueDate = dueDate || null;

  const followUp = await populateFollowUp(
    FollowUp.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
  );

  if (!followUp) {
    return next(new AppError('Follow-up not found', 404));
  }

  res.json({
    status: 'success',
    data: { followUp }
  });
});

// PUT /:id/close - close with resolution note
exports.closeFollowUp = catchAsync(async (req, res, next) => {
  const { resolutionNote } = req.body;

  if (!resolutionNote || !resolutionNote.trim()) {
    return next(new AppError('Resolution note is required to close a follow-up', 400));
  }

  const followUp = await FollowUp.findById(req.params.id);
  if (!followUp) {
    return next(new AppError('Follow-up not found', 404));
  }

  if (followUp.status === 'closed') {
    return next(new AppError('Follow-up is already closed', 400));
  }

  followUp.status = 'closed';
  followUp.resolutionNote = resolutionNote.trim();
  followUp.closedAt = new Date();
  followUp.closedBy = req.user._id;
  await followUp.save();

  const populated = await populateFollowUp(FollowUp.findById(followUp._id));

  res.json({
    status: 'success',
    data: { followUp: populated }
  });
});

// PUT /:id/reopen
exports.reopenFollowUp = catchAsync(async (req, res, next) => {
  const followUp = await FollowUp.findById(req.params.id);
  if (!followUp) {
    return next(new AppError('Follow-up not found', 404));
  }

  if (followUp.status === 'open') {
    return next(new AppError('Follow-up is already open', 400));
  }

  followUp.status = 'open';
  followUp.resolutionNote = undefined;
  followUp.closedAt = undefined;
  followUp.closedBy = undefined;
  await followUp.save();

  const populated = await populateFollowUp(FollowUp.findById(followUp._id));

  res.json({
    status: 'success',
    data: { followUp: populated }
  });
});

// POST /:id/notes - add a note
exports.addNote = catchAsync(async (req, res, next) => {
  const { text, timestamp } = req.body;

  if (!text || !text.trim()) {
    return next(new AppError('Note text is required', 400));
  }

  const followUp = await FollowUp.findById(req.params.id);
  if (!followUp) {
    return next(new AppError('Follow-up not found', 404));
  }

  followUp.notes.push({
    text: text.trim(),
    timestamp: timestamp ? new Date(timestamp) : new Date(),
    createdBy: req.user._id,
    createdByName: req.user.name
  });
  await followUp.save();

  const populated = await populateFollowUp(FollowUp.findById(followUp._id));

  res.json({
    status: 'success',
    data: { followUp: populated }
  });
});

// PUT /:id/notes/:noteId - update a note
exports.updateNote = catchAsync(async (req, res, next) => {
  const { text, timestamp } = req.body;

  const followUp = await FollowUp.findById(req.params.id);
  if (!followUp) {
    return next(new AppError('Follow-up not found', 404));
  }

  const note = followUp.notes.id(req.params.noteId);
  if (!note) {
    return next(new AppError('Note not found', 404));
  }

  if (text !== undefined) note.text = text.trim();
  if (timestamp !== undefined) note.timestamp = new Date(timestamp);
  await followUp.save();

  const populated = await populateFollowUp(FollowUp.findById(followUp._id));

  res.json({
    status: 'success',
    data: { followUp: populated }
  });
});

// DELETE /:id/notes/:noteId - delete a note
exports.deleteNote = catchAsync(async (req, res, next) => {
  const followUp = await FollowUp.findById(req.params.id);
  if (!followUp) {
    return next(new AppError('Follow-up not found', 404));
  }

  if (followUp.notes.length <= 1) {
    return next(new AppError('Cannot delete the last note on a follow-up', 400));
  }

  const note = followUp.notes.id(req.params.noteId);
  if (!note) {
    return next(new AppError('Note not found', 404));
  }

  note.deleteOne();
  await followUp.save();

  const populated = await populateFollowUp(FollowUp.findById(followUp._id));

  res.json({
    status: 'success',
    data: { followUp: populated }
  });
});

// DELETE /:id - hard delete
exports.deleteFollowUp = catchAsync(async (req, res, next) => {
  const followUp = await FollowUp.findByIdAndDelete(req.params.id);
  if (!followUp) {
    return next(new AppError('Follow-up not found', 404));
  }

  res.status(204).json(null);
});
