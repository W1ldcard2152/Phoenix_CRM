const cron = require('node-cron');
const moment = require('moment-timezone');
const Appointment = require('../models/Appointment');
const WorkOrder = require('../models/WorkOrder');
const cacheService = require('../services/cacheService');
const { TIMEZONE } = require('../config/timezone');

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
 *
 * Groups appointments by work order so that each WO is transitioned once
 * and ALL of its appointments for that day are marked Completed.
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

    // Group appointments by work order ID so each WO is processed once
    const appointmentsByWorkOrder = new Map();
    for (const appointment of appointments) {
      const woId = appointment.workOrder.toString();
      if (!appointmentsByWorkOrder.has(woId)) {
        appointmentsByWorkOrder.set(woId, []);
      }
      appointmentsByWorkOrder.get(woId).push(appointment);
    }

    let transitionedCount = 0;
    let appointmentsCompletedCount = 0;

    for (const [woId, woAppointments] of appointmentsByWorkOrder) {
      const workOrder = await WorkOrder.findById(woId);

      if (!workOrder || !TRANSITIONAL_WO_STATUSES.includes(workOrder.status)) {
        // Even if the WO isn't in a transitional status, still mark today's
        // appointments as Completed so they don't linger in 'Scheduled'
        for (const appointment of woAppointments) {
          if (appointment.status !== 'Completed') {
            appointment.status = 'Completed';
            await appointment.save();
            appointmentsCompletedCount++;
          }
        }
        continue;
      }

      const previousStatus = workOrder.status;
      workOrder.status = 'Appointment Complete';
      await workOrder.save();
      transitionedCount++;

      console.log(
        `[AppointmentCompleteJob] WO ${workOrder._id}: "${previousStatus}" -> "Appointment Complete" ` +
        `(${woAppointments.length} appointment(s))`
      );

      // Mark ALL of this work order's appointments for today as Completed
      for (const appointment of woAppointments) {
        if (appointment.status !== 'Completed') {
          appointment.status = 'Completed';
          await appointment.save();
          appointmentsCompletedCount++;
        }
      }
    }

    if (transitionedCount > 0 || appointmentsCompletedCount > 0) {
      cacheService.invalidateAllWorkOrders();
      cacheService.invalidateServiceWritersCorner();
      cacheService.invalidateAllAppointments();
    }

    console.log(
      `[AppointmentCompleteJob] Done. Transitioned ${transitionedCount} work order(s), ` +
      `completed ${appointmentsCompletedCount} appointment(s).`
    );
    return { transitioned: transitionedCount, appointmentsCompleted: appointmentsCompletedCount };
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
