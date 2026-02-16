const express = require('express');
const workOrderController = require('../controllers/workOrderController');
const workOrderNotesRoutes = require('./workOrderNotesRoutes');
const authController = require('../controllers/authController');
const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Quote-specific routes
router.get('/quotes', workOrderController.getAllQuotes);
router.post('/quotes', workOrderController.createQuote);
router.post('/:id/convert-to-work-order', workOrderController.convertQuoteToWorkOrder);
router.post('/:id/generate-quote', workOrderController.generateQuoteFromWorkOrder);
router.post('/:id/archive-quote', workOrderController.archiveQuote);
router.post('/:id/unarchive-quote', workOrderController.unarchiveQuote);

// Search work orders
router.get('/search', workOrderController.searchWorkOrders);

// Get work orders awaiting scheduling (Parts Received with no future appointments)
router.get('/awaiting-scheduling', workOrderController.getWorkOrdersAwaitingScheduling);

// Get all work orders that need scheduling (for appointments page)
router.get('/needing-scheduling', workOrderController.getWorkOrdersNeedingScheduling);

// Get Service Writer's Corner data
router.get('/service-writers-corner', workOrderController.getServiceWritersCorner);

// Get active work orders by multiple statuses in a single call (Dashboard optimization)
router.get('/active-by-statuses', workOrderController.getActiveWorkOrdersByStatuses);

// Get work orders for Technician Portal (server-side filtering)
router.get('/technician-portal', workOrderController.getTechnicianWorkOrders);

// Get work orders by status
router.get('/status/:status', workOrderController.getWorkOrdersByStatus);

// Update work order status
router.patch('/:id/status', workOrderController.updateStatus);

// Add part to work order
router.post('/:id/parts', workOrderController.addPart);

// Add labor to work order
router.post('/:id/labor', workOrderController.addLabor);

// Process receipt and extract parts
router.post('/:id/process-receipt', workOrderController.processReceipt);

// Get signed URL for receipt image
router.get('/receipt-signed-url', workOrderController.getReceiptSignedUrl);

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