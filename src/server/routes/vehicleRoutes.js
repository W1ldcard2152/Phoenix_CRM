const express = require('express');
const vehicleController = require('../controllers/vehicleController');
const authController = require('../controllers/authController');
const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Check if VIN exists
router.get('/check-vin', vehicleController.checkVinExists);

// Search vehicles
router.get('/search', vehicleController.searchVehicles);

// Get vehicle service history
router.get('/:id/service-history', vehicleController.getVehicleServiceHistory);

// Get vehicle mileage history
router.get('/:id/mileage-history', vehicleController.getMileageHistory);

// Add mileage record
router.post('/:id/mileage', vehicleController.addMileageRecord);

// Get estimated mileage at a specific date
router.get('/:id/mileage-at-date', vehicleController.getMileageAtDate);

// Basic CRUD routes
router
  .route('/')
  .get(vehicleController.getAllVehicles)
  .post(vehicleController.createVehicle);

router
  .route('/:id')
  .get(vehicleController.getVehicle)
  .patch(vehicleController.updateVehicle)
  .delete(vehicleController.deleteVehicle);

module.exports = router;