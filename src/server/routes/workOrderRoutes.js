const express = require('express');
const workOrderController = require('../controllers/workOrderController');
const workOrderNotesRoutes = require('./workOrderNotesRoutes');
const router = express.Router();

// Search work orders
router.get('/search', workOrderController.searchWorkOrders);

// Get work orders awaiting scheduling (Parts Received with no future appointments)
router.get('/awaiting-scheduling', workOrderController.getWorkOrdersAwaitingScheduling);

// Get all work orders that need scheduling (for appointments page)
router.get('/needing-scheduling', workOrderController.getWorkOrdersNeedingScheduling);

// Get Service Writer's Corner data
router.get('/service-writers-corner', workOrderController.getServiceWritersCorner);

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

// Split work order
router.post('/:id/split', workOrderController.splitWorkOrder);

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