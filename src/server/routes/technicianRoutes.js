const express = require('express');
const technicianController = require('../controllers/technicianController');
const authController = require('../controllers/authController');

const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Read operations - available to all authenticated users
router.get('/', technicianController.getAllTechnicians);
router.get('/:id', technicianController.getTechnicianById);

// Write operations - restricted to admin and manager roles
router.post(
  '/',
  authController.restrictTo('admin', 'manager'),
  technicianController.createTechnician
);

router.patch(
  '/:id',
  authController.restrictTo('admin', 'manager'),
  technicianController.updateTechnician
);

router.put(
  '/:id',
  authController.restrictTo('admin', 'manager'),
  technicianController.updateTechnician
);

router.delete(
  '/:id',
  authController.restrictTo('admin', 'manager'),
  technicianController.deleteTechnician
);

module.exports = router;
