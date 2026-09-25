const express = require('express');
const vehicleController = require('../controllers/vehicleController');
const checkInController = require('../controllers/vehicleCheckInController');
const authController = require('../controllers/authController');
const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Mileage routes - open to all authenticated roles (technicians record mileage)
router.get('/:id/mileage-history', vehicleController.getMileageHistory);
router.post('/:id/mileage', vehicleController.addMileageRecord);
router.get('/:id/mileage-at-date', vehicleController.getMileageAtDate);

// Vehicle scan - open to technicians, who check vehicles in from the lot. These
// return vehicles without their owner and accept only scanned fields.
router.get('/scan-lookup', checkInController.scanLookup);
router.post('/check-ins', checkInController.createCheckIn);
router.post('/:id/scan-update', checkInController.scanUpdate);

// All remaining vehicle routes require office staff
router.use(authController.restrictTo('admin', 'management', 'service-writer'));

// Check-ins waiting for the office to find the owner
router.get('/check-ins', checkInController.listCheckIns);
router.get('/check-ins/:id', checkInController.getCheckIn);
router.patch('/check-ins/:id', checkInController.resolveCheckIn);

// Check if VIN exists
router.get('/check-vin', vehicleController.checkVinExists);

// Vehicles matching year/make/model that have no VIN yet — merge candidates for a scan
router.get('/vinless-matches', vehicleController.findVinlessMatches);

// Search vehicles
router.get('/search', vehicleController.searchVehicles);

// Get vehicle service history
router.get('/:id/service-history', vehicleController.getVehicleServiceHistory);

// Basic CRUD routes
router
  .route('/')
  .get(vehicleController.getAllVehicles)
  .post(vehicleController.createVehicle);

router
  .route('/:id')
  .get(vehicleController.getVehicle)
  .patch(vehicleController.updateVehicle)
  .delete(
    authController.restrictTo('admin', 'management'),
    vehicleController.deleteVehicle
  );

module.exports = router;
