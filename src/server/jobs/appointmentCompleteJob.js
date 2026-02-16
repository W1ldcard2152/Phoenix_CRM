const cron = require('node-cron');
const moment = require('moment-timezone');
const Appointment = require('../models/Appointment');
const WorkOrder = require('../models/WorkOrder');
const cacheService = require('../services/cacheService');

const TIMEZONE = 'America/New_York';

// Statuses that should auto-transition to 'Appointment Complete' at close of business
const TRANSITIONAL_WO_STATUSES = [
  'Appointment Scheduled',
  'Inspection In Progress',
  'Repair In Progress'
];

/**
 * Finds today's appointments whose linked work orders are still in a
 * transitional status and moves them to 'Appointment Complete'.
 * Intended to run at close of business (6 PM ET) each day.
 */
const runAppointmentCompleteJob = async () => {
  const now = moment.tz(TIMEZONE);
  const startOfToday = now.clone().startOf('day').utc().toDate();
  const endOfToday = now.clone().endOf('day').utc().toDate();

  console.log(`[AppointmentCompleteJob] Running at ${now.format('YYYY-MM-DD HH:mm:ss z')}`);

  try {
    // Find today's appointments that are not cancelled/no-show and have a linked work order
    const appointments = await Appointment.find({
      startTime: { $gte: startOfToday, $lte: endOfToday },
      status: { $nin: ['Cancelled', 'No-Show'] },
      workOrder: { $exists: true, $ne: null }
    });

    if (appointments.length === 0) {
      console.log('[AppointmentCompleteJob] No eligible appointments found for today.');
      return { transitioned: 0 };
    }

    let transitionedCount = 0;

    for (const appointment of appointments) {
      const workOrder = await WorkOrder.findById(appointment.workOrder);

      if (!workOrder || !TRANSITIONAL_WO_STATUSES.includes(workOrder.status)) {
        continue;
      }

      const previousStatus = workOrder.status;
      workOrder.status = 'Appointment Complete';
      await workOrder.save();

      // Also mark the appointment itself as Completed
      if (appointment.status !== 'Completed') {
        appointment.status = 'Completed';
        await appointment.save();
      }

      transitionedCount++;
      console.log(
        `[AppointmentCompleteJob] WO ${workOrder._id}: "${previousStatus}" -> "Appointment Complete" ` +
        `(Appointment ${appointment._id})`
      );
    }

    if (transitionedCount > 0) {
      cacheService.invalidateAllWorkOrders();
      cacheService.invalidateServiceWritersCorner();
      cacheService.invalidateAllAppointments();
    }

    console.log(`[AppointmentCompleteJob] Done. Transitioned ${transitionedCount} work order(s).`);
    return { transitioned: transitionedCount };
  } catch (err) {
    console.error('[AppointmentCompleteJob] Error:', err);
    throw err;
  }
};

/**
 * Starts the cron scheduler. Call once after MongoDB is connected and the server is listening.
 * Runs daily at 6:00 PM Eastern.
 */
const startScheduler = () => {
  // '0 18 * * *' = minute 0, hour 18 (6 PM), every day
  cron.schedule('0 18 * * *', () => {
    runAppointmentCompleteJob().catch(err => {
      console.error('[AppointmentCompleteJob] Unhandled error in scheduled run:', err);
    });
  }, {
    timezone: TIMEZONE
  });

  console.log('[AppointmentCompleteJob] Scheduler started — runs daily at 6:00 PM ET');
};

module.exports = { runAppointmentCompleteJob, startScheduler };
