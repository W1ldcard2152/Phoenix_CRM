const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const authController = require('../controllers/authController');

// All inventory routes require authentication
router.use(authController.protect);

// Shopping list must come before /:id to avoid route conflict
router.get('/shopping-list', inventoryController.getShoppingList);

router.get('/', inventoryController.getAllItems);
router.post('/', inventoryController.createItem);

router.get('/:id', inventoryController.getItem);
router.patch('/:id', inventoryController.updateItem);
router.delete('/:id', inventoryController.deleteItem);
router.patch('/:id/adjust', inventoryController.adjustQuantity);

module.exports = router;
