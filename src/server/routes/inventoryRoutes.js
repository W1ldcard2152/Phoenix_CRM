const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const authController = require('../controllers/authController');

// All inventory routes require authentication
router.use(authController.protect);

// Office staff only for any inventory mutation (technicians get read-only access)
const officeStaff = authController.restrictTo('admin', 'management', 'service-writer');

// Shopping list must come before /:id to avoid route conflict
router.get('/shopping-list', inventoryController.getShoppingList);

// Receipt import (must come before /:id)
router.post('/extract-receipt', officeStaff, inventoryController.receiptUpload, inventoryController.extractInventoryReceipt);
router.post('/confirm-receipt', officeStaff, inventoryController.confirmInventoryReceipt);

router.get('/', inventoryController.getAllItems);
router.post('/', officeStaff, inventoryController.createItem);

router.get('/:id', inventoryController.getItem);
router.patch('/:id', officeStaff, inventoryController.updateItem);
router.delete('/:id', officeStaff, inventoryController.deleteItem);
router.patch('/:id/adjust', officeStaff, inventoryController.adjustQuantity);

module.exports = router;
