const express = require('express');
const vehicleController = require('../controllers/vehicleController');
const router = express.Router();

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
  .delete(vehicleController.deleteVehicle);

module.exports = router;