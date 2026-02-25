const express = require('express');
const vehicleController = require('../controllers/vehicleController');
const authController = require('../controllers/authController');
const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Mileage routes - open to all authenticated roles (technicians record mileage)
router.get('/:id/mileage-history', vehicleController.getMileageHistory);
router.post('/:id/mileage', vehicleController.addMileageRecord);
router.get('/:id/mileage-at-date', vehicleController.getMileageAtDate);

// All remaining vehicle routes require office staff
router.use(authController.restrictTo('admin', 'management', 'service-writer'));

// Check if VIN exists
router.get('/check-vin', vehicleController.checkVinExists);

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
