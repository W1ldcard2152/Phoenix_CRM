const express = require('express');
const customerController = require('../controllers/customerController');
const authController = require('../controllers/authController');
const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Restrict all customer routes to office staff (admin, management, service-writer)
router.use(authController.restrictTo('admin', 'management', 'service-writer'));

// Search customers
router.get('/search', customerController.searchCustomers);

// Check if customer exists by phone
router.get('/check-phone', customerController.checkExistingCustomerByPhone);

// Get customer vehicles
router.get('/:id/vehicles', customerController.getCustomerVehicles);

// Basic CRUD routes
router
  .route('/')
  .get(customerController.getAllCustomers)
  .post(customerController.createCustomer);

router
  .route('/:id')
  .get(customerController.getCustomer)
  .patch(customerController.updateCustomer)
  .delete(
    authController.restrictTo('admin', 'management'),
    customerController.deleteCustomer
  );

module.exports = router;
