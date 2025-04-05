const express = require('express');
const appointmentController = require('../controllers/appointmentController');
const router = express.Router();

// Get appointments for today
router.get('/today', appointmentController.getTodayAppointments);

// Get appointments by date range
router.get('/date-range/:startDate/:endDate', appointmentController.getAppointmentsByDateRange);

// Check for scheduling conflicts
router.post('/check-conflicts', appointmentController.checkConflicts);

// Send appointment reminder
router.post('/:id/send-reminder', appointmentController.sendAppointmentReminder);

// Create work order from appointment
router.post('/:id/create-work-order', appointmentController.createWorkOrderFromAppointment);

// Get appointments by customer
router.get('/customer/:customerId', appointmentController.getCustomerAppointments);

// Get appointments by vehicle
router.get('/vehicle/:vehicleId', appointmentController.getVehicleAppointments);

// Basic CRUD routes
router
  .route('/')
  .get(appointmentController.getAllAppointments)
  .post(appointmentController.createAppointment);

router
  .route('/:id')
  .get(appointmentController.getAppointment)
  .patch(appointmentController.updateAppointment)
  .delete(appointmentController.deleteAppointment);

module.exports = router;