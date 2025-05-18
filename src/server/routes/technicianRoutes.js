const express = require('express');
const technicianController = require('../controllers/technicianController');
const authController = require('../controllers/authController'); // Assuming you have auth middleware

const router = express.Router();

// Protect all routes after this middleware (if needed, adjust as per your auth strategy)
// router.use(authController.protect); 
// router.use(authController.restrictTo('admin', 'manager')); // Example: Restrict to certain roles

router
  .route('/')
  .get(technicianController.getAllTechnicians)
  .post(technicianController.createTechnician);

router
  .route('/:id')
  .get(technicianController.getTechnicianById)
  .patch(technicianController.updateTechnician) // Using PATCH for partial updates, PUT for full replacement
  .put(technicianController.updateTechnician)   // Alias for PATCH
  .delete(technicianController.deleteTechnician); // Soft delete

// Example for a permanent delete route (if you decide to implement it)
// router.delete('/:id/permanent', technicianController.permanentlyDeleteTechnician);

module.exports = router;
