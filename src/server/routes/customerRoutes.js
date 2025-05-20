const express = require('express');
const customerController = require('../controllers/customerController');
const router = express.Router();

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
  .delete(customerController.deleteCustomer);

module.exports = router;
