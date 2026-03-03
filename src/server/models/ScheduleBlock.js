const mongoose = require('mongoose');
const moment = require('moment-timezone');
const { TIMEZONE } = require('../config/timezone');
const Schema = mongoose.Schema;

const WeeklyScheduleEntrySchema = new Schema(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6 // 0 = Sunday, 6 = Saturday
    },
    startTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/ // HH:mm format
    },
    endTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/ // HH:mm format
    }
  },
  { _id: false }
);

const ExceptionSchema = new Schema(
  {
    date: {
      type: Date,
      required: true
    },
    action: {
      type: String,
      enum: ['skip', 'modify'],
      required: true
    },
    startTime: {
      type: String,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/ // HH:mm, only for 'modify'
    },
    endTime: {
      type: String,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/ // HH:mm, only for 'modify'
    }
  },
  { _id: true }
);

const ScheduleBlockSchema = new Schema(
  {
    technician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Technician',
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      trim: true,
      default: ''
    },
    blockType: {
      type: String,
      enum: ['recurring', 'one-time'],
      default: 'recurring'
    },
    // --- Recurring block fields ---
    weeklySchedule: {
      type: [WeeklyScheduleEntrySchema],
      default: [],
      validate: {
        validator: function (arr) {
          // Required only for recurring blocks
          if (this.blockType === 'recurring') return arr.length > 0;
          return true;
        },
        message: 'At least one weekly schedule entry is required for recurring blocks'
      }
    },
    effectiveFrom: {
      type: Date,
      validate: {
        validator: function (val) {
          // Required only for recurring blocks
          if (this.blockType === 'recurring') return val != null;
          return true;
        },
        message: 'Effective from date is required for recurring blocks'
      }
    },
    effectiveUntil: {
      type: Date,
      default: null
    },
    exceptions: {
      type: [ExceptionSchema],
      default: []
    },
    // --- One-time block fields ---
    oneTimeDate: {
      type: Date,
      validate: {
        validator: function (val) {
          if (this.blockType === 'one-time') return val != null;
          return true;
        },
        message: 'Date is required for one-time blocks'
      }
    },
    oneTimeStartTime: {
      type: String,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/
    },
    oneTimeEndTime: {
      type: String,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/
    },
    // --- Common fields ---
    active: {
      type: Boolean,
      default: true
    },
    color: {
      type: String,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Indexes
ScheduleBlockSchema.index({ technician: 1, active: 1 });
ScheduleBlockSchema.index({ effectiveFrom: 1, effectiveUntil: 1 });
ScheduleBlockSchema.index({ blockType: 1, oneTimeDate: 1 });

/**
 * Expand schedule blocks into concrete instances for a date range.
 * Returns an array of objects shaped like calendar events.
 *
 * @param {Date|String} rangeStart - Start of date range
 * @param {Date|String} rangeEnd - End of date range
 * @param {String} [technicianId] - Optional technician filter
 * @returns {Array} Expanded block instances
 */
ScheduleBlockSchema.statics.expandForDateRange = async function (rangeStart, rangeEnd, technicianId) {
  const startMoment = moment.tz(rangeStart, TIMEZONE).startOf('day');
  const endMoment = moment.tz(rangeEnd, TIMEZONE).endOf('day');

  // Find active blocks that could overlap with the date range
  // For recurring blocks: effectiveFrom <= rangeEnd AND (effectiveUntil >= rangeStart OR effectiveUntil is null)
  // For one-time blocks: oneTimeDate falls within the range
  const query = {
    active: true,
    $or: [
      // Recurring blocks
      {
        blockType: { $ne: 'one-time' },
        effectiveFrom: { $lte: endMoment.toDate() },
        $or: [
          { effectiveUntil: null },
          { effectiveUntil: { $gte: startMoment.toDate() } }
        ]
      },
      // One-time blocks
      {
        blockType: 'one-time',
        oneTimeDate: { $gte: startMoment.toDate(), $lte: endMoment.toDate() }
      }
    ]
  };

  if (technicianId) {
    query.technician = technicianId;
  }

  const blocks = await this.find(query).populate('technician', 'name firstName lastName specialization');

  const expanded = [];

  for (const block of blocks) {
    // Handle one-time blocks
    if (block.blockType === 'one-time') {
      const dateStr = moment.tz(block.oneTimeDate, TIMEZONE).format('YYYY-MM-DD');
      const startTime = moment.tz(`${dateStr} ${block.oneTimeStartTime}`, 'YYYY-MM-DD HH:mm', TIMEZONE).utc().toDate();
      const endTime = moment.tz(`${dateStr} ${block.oneTimeEndTime}`, 'YYYY-MM-DD HH:mm', TIMEZONE).utc().toDate();

      expanded.push({
        _id: `sb_${block._id}_${dateStr}`,
        scheduleBlockId: block._id,
        technician: block.technician,
        startTime,
        endTime,
        title: block.title,
        category: block.category,
        color: block.color,
        status: 'Schedule Block',
        isScheduleBlock: true,
        blockType: 'one-time',
        exception: null
      });
      continue;
    }

    // Handle recurring blocks
    // Build a lookup of day-of-week to schedule entries for quick access
    const dayScheduleMap = {};
    for (const entry of block.weeklySchedule) {
      dayScheduleMap[entry.dayOfWeek] = entry;
    }

    // Build a lookup of exceptions by date string
    const exceptionMap = {};
    for (const exc of block.exceptions) {
      const excDate = moment.tz(exc.date, TIMEZONE).format('YYYY-MM-DD');
      exceptionMap[excDate] = exc;
    }

    // Iterate through each day in the range
    const current = startMoment.clone();
    while (current.isSameOrBefore(endMoment, 'day')) {
      const dayOfWeek = current.day();
      const dateStr = current.format('YYYY-MM-DD');

      // Check if this day of week has a schedule entry
      const scheduleEntry = dayScheduleMap[dayOfWeek];
      if (!scheduleEntry) {
        current.add(1, 'day');
        continue;
      }

      // Check if date is within effective range
      const effectiveFrom = moment.tz(block.effectiveFrom, TIMEZONE).startOf('day');
      const effectiveUntil = block.effectiveUntil
        ? moment.tz(block.effectiveUntil, TIMEZONE).endOf('day')
        : null;

      if (current.isBefore(effectiveFrom, 'day') || (effectiveUntil && current.isAfter(effectiveUntil, 'day'))) {
        current.add(1, 'day');
        continue;
      }

      // Check for exceptions
      const exception = exceptionMap[dateStr];
      if (exception && exception.action === 'skip') {
        current.add(1, 'day');
        continue;
      }

      // Determine start/end times (use exception overrides if 'modify')
      let startTimeStr = scheduleEntry.startTime;
      let endTimeStr = scheduleEntry.endTime;

      if (exception && exception.action === 'modify') {
        if (exception.startTime) startTimeStr = exception.startTime;
        if (exception.endTime) endTimeStr = exception.endTime;
      }

      // Build concrete datetime objects
      const startTime = moment.tz(`${dateStr} ${startTimeStr}`, 'YYYY-MM-DD HH:mm', TIMEZONE).utc().toDate();
      const endTime = moment.tz(`${dateStr} ${endTimeStr}`, 'YYYY-MM-DD HH:mm', TIMEZONE).utc().toDate();

      expanded.push({
        _id: `sb_${block._id}_${dateStr}`,
        scheduleBlockId: block._id,
        technician: block.technician,
        startTime,
        endTime,
        title: block.title,
        category: block.category,
        color: block.color,
        status: 'Schedule Block',
        isScheduleBlock: true,
        blockType: 'recurring',
        exception: exception || null
      });

      current.add(1, 'day');
    }
  }

  return expanded;
};

const ScheduleBlock = mongoose.model('ScheduleBlock', ScheduleBlockSchema);

module.exports = ScheduleBlock;
