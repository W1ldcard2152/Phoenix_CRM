const ScheduleBlock = require('../models/ScheduleBlock');
const Technician = require('../models/Technician');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const cacheService = require('../services/cacheService');
const moment = require('moment-timezone');
const { TIMEZONE } = require('../config/timezone');

// Get all schedule blocks
exports.getAllScheduleBlocks = catchAsync(async (req, res, next) => {
  const { technician, active } = req.query;

  const cacheKey = `scheduleblocks:all:${JSON.stringify({ technician, active })}`;
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const query = {};
  if (technician) query.technician = technician;
  if (active !== undefined) query.active = active === 'true';

  const scheduleBlocks = await ScheduleBlock.find(query)
    .populate('technician', 'name firstName lastName specialization')
    .populate('createdBy', 'name')
    .sort({ title: 1 });

  const responseData = {
    status: 'success',
    results: scheduleBlocks.length,
    data: { scheduleBlocks }
  };

  cacheService.set(cacheKey, responseData, 300);
  res.status(200).json(responseData);
});

// Get a single schedule block
exports.getScheduleBlock = catchAsync(async (req, res, next) => {
  const scheduleBlock = await ScheduleBlock.findById(req.params.id)
    .populate('technician', 'name firstName lastName specialization')
    .populate('createdBy', 'name');

  if (!scheduleBlock) {
    return next(new AppError('No schedule block found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { scheduleBlock }
  });
});

// Create a schedule block
exports.createScheduleBlock = catchAsync(async (req, res, next) => {
  const { technician, title, category, blockType, weeklySchedule, effectiveFrom, effectiveUntil, oneTimeDate, oneTimeStartTime, oneTimeEndTime, color } = req.body;

  // Validate technician exists
  const techExists = await Technician.findById(technician);
  if (!techExists) {
    return next(new AppError('No technician found with that ID', 404));
  }

  const blockData = {
    technician,
    title,
    category,
    blockType: blockType || 'recurring',
    color,
    createdBy: req.user._id
  };

  if (blockData.blockType === 'one-time') {
    // One-time block fields
    if (!oneTimeDate) {
      return next(new AppError('Date is required for one-time blocks', 400));
    }
    if (!oneTimeStartTime || !oneTimeEndTime) {
      return next(new AppError('Start and end times are required for one-time blocks', 400));
    }
    // oneTimeDate already converted to UTC start-of-day by convertDates middleware
    blockData.oneTimeDate = oneTimeDate;
    blockData.oneTimeStartTime = oneTimeStartTime;
    blockData.oneTimeEndTime = oneTimeEndTime;
  } else {
    // Recurring block fields (effectiveFrom/effectiveUntil already converted by convertDates middleware)
    blockData.weeklySchedule = weeklySchedule;
    blockData.effectiveFrom = effectiveFrom;
    if (effectiveUntil) {
      blockData.effectiveUntil = effectiveUntil;
    }
  }

  const newBlock = await ScheduleBlock.create(blockData);

  const populated = await ScheduleBlock.findById(newBlock._id)
    .populate('technician', 'name firstName lastName specialization')
    .populate('createdBy', 'name');

  cacheService.invalidateByPattern('scheduleblocks:');

  res.status(201).json({
    status: 'success',
    data: { scheduleBlock: populated }
  });
});

// Update a schedule block
exports.updateScheduleBlock = catchAsync(async (req, res, next) => {
  const scheduleBlock = await ScheduleBlock.findById(req.params.id);
  if (!scheduleBlock) {
    return next(new AppError('No schedule block found with that ID', 404));
  }

  // If technician is being changed, validate new tech exists
  if (req.body.technician && req.body.technician !== scheduleBlock.technician.toString()) {
    const techExists = await Technician.findById(req.body.technician);
    if (!techExists) {
      return next(new AppError('No technician found with that ID', 404));
    }
  }

  // Date fields (effectiveFrom, effectiveUntil, oneTimeDate) already converted by convertDates middleware

  const updated = await ScheduleBlock.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  })
    .populate('technician', 'name firstName lastName specialization')
    .populate('createdBy', 'name');

  cacheService.invalidateByPattern('scheduleblocks:');

  res.status(200).json({
    status: 'success',
    data: { scheduleBlock: updated }
  });
});

// Delete a schedule block
exports.deleteScheduleBlock = catchAsync(async (req, res, next) => {
  const scheduleBlock = await ScheduleBlock.findById(req.params.id);
  if (!scheduleBlock) {
    return next(new AppError('No schedule block found with that ID', 404));
  }

  await ScheduleBlock.findByIdAndDelete(req.params.id);
  cacheService.invalidateByPattern('scheduleblocks:');

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Get expanded blocks for a date range (concrete instances for calendar display)
exports.getExpandedBlocks = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.params;

  if (!startDate || !endDate) {
    return next(new AppError('Please provide both start and end dates', 400));
  }

  const cacheKey = `scheduleblocks:expanded:${startDate}_${endDate}`;
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const expanded = await ScheduleBlock.expandForDateRange(startDate, endDate);

  const responseData = {
    status: 'success',
    results: expanded.length,
    data: { scheduleBlocks: expanded }
  };

  cacheService.set(cacheKey, responseData, 300);
  res.status(200).json(responseData);
});

// Add an exception to a schedule block
exports.addException = catchAsync(async (req, res, next) => {
  const { date, action, startTime, endTime } = req.body;

  if (!date || !action) {
    return next(new AppError('Please provide a date and action (skip or modify)', 400));
  }

  if (action === 'modify' && (!startTime && !endTime)) {
    return next(new AppError('For modify exceptions, provide at least a startTime or endTime', 400));
  }

  const scheduleBlock = await ScheduleBlock.findById(req.params.id);
  if (!scheduleBlock) {
    return next(new AppError('No schedule block found with that ID', 404));
  }

  const exceptionDate = moment.tz(date, TIMEZONE).startOf('day').utc().toDate();

  // Check if an exception already exists for this date
  const existingIndex = scheduleBlock.exceptions.findIndex(
    (exc) => moment.tz(exc.date, TIMEZONE).format('YYYY-MM-DD') === moment.tz(date, TIMEZONE).format('YYYY-MM-DD')
  );

  const exceptionData = { date: exceptionDate, action };
  if (action === 'modify') {
    if (startTime) exceptionData.startTime = startTime;
    if (endTime) exceptionData.endTime = endTime;
  }

  if (existingIndex >= 0) {
    // Replace existing exception
    scheduleBlock.exceptions[existingIndex] = exceptionData;
  } else {
    scheduleBlock.exceptions.push(exceptionData);
  }

  await scheduleBlock.save();
  cacheService.invalidateByPattern('scheduleblocks:');

  const populated = await ScheduleBlock.findById(scheduleBlock._id)
    .populate('technician', 'name firstName lastName specialization')
    .populate('createdBy', 'name');

  res.status(200).json({
    status: 'success',
    data: { scheduleBlock: populated }
  });
});

// Remove an exception from a schedule block
exports.removeException = catchAsync(async (req, res, next) => {
  const { exceptionId } = req.params;

  const scheduleBlock = await ScheduleBlock.findById(req.params.id);
  if (!scheduleBlock) {
    return next(new AppError('No schedule block found with that ID', 404));
  }

  scheduleBlock.exceptions = scheduleBlock.exceptions.filter(
    (exc) => exc._id.toString() !== exceptionId
  );

  await scheduleBlock.save();
  cacheService.invalidateByPattern('scheduleblocks:');

  const populated = await ScheduleBlock.findById(scheduleBlock._id)
    .populate('technician', 'name firstName lastName specialization')
    .populate('createdBy', 'name');

  res.status(200).json({
    status: 'success',
    data: { scheduleBlock: populated }
  });
});
