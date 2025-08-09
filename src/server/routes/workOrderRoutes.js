const express = require('express');
const workOrderController = require('../controllers/workOrderController');
const workOrderNotesRoutes = require('./workOrderNotesRoutes');
const router = express.Router();

// Search work orders
router.get('/search', workOrderController.searchWorkOrders);

// Get work orders by status
router.get('/status/:status', workOrderController.getWorkOrdersByStatus);

// Update work order status
router.patch('/:id/status', workOrderController.updateStatus);

// Add part to work order
router.post('/:id/parts', workOrderController.addPart);

// Add labor to work order
router.post('/:id/labor', workOrderController.addLabor);

// Generate invoice
router.get('/:id/invoice', workOrderController.generateInvoice);

// Work order notes routes - mount under /:workOrderId/notes
router.use('/:workOrderId/notes', workOrderNotesRoutes);

// Basic CRUD routes
router
  .route('/')
  .get(workOrderController.getAllWorkOrders)
  .post(workOrderController.createWorkOrder);

router
  .route('/:id')
  .get(workOrderController.getWorkOrder)
  .patch(workOrderController.updateWorkOrder)
  .delete(workOrderController.deleteWorkOrder);

module.exports = router;