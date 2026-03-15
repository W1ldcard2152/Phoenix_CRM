const express = require('express');
const workOrderController = require('../controllers/workOrderController');
const workOrderNotesRoutes = require('./workOrderNotesRoutes');
const authController = require('../controllers/authController');
const { restrictToOwnWorkOrder } = require('../middleware/restrictToOwn');
const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Quote-specific routes (office staff only)
router.get('/quotes', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.getAllQuotes);
router.post('/quotes', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.createQuote);
router.post('/:id/convert-to-work-order', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.convertQuoteToWorkOrder);
router.post('/:id/generate-quote', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.generateQuoteFromWorkOrder);
router.post('/:id/archive-quote', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.archiveQuote);
router.post('/:id/unarchive-quote', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.unarchiveQuote);

// Search work orders (all authenticated)
router.get('/search', workOrderController.searchWorkOrders);

// Get work orders awaiting scheduling (office staff only)
router.get('/awaiting-scheduling', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.getWorkOrdersAwaitingScheduling);

// Get all work orders that need scheduling (office staff only)
router.get('/needing-scheduling', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.getWorkOrdersNeedingScheduling);

// Get Service Writer's Corner data (office staff only)
router.get('/service-writers-corner', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.getServiceWritersCorner);

// Get active work orders by multiple statuses in a single call (all authenticated)
router.get('/active-by-statuses', workOrderController.getActiveWorkOrdersByStatuses);

// Get work orders for Technician Portal (all authenticated)
router.get('/technician-portal', workOrderController.getTechnicianWorkOrders);

// Get technician dashboard data (all authenticated - handler validates technician link)
router.get('/technician-dashboard', workOrderController.getTechnicianDashboard);

// Get work orders by status (all authenticated)
router.get('/status/:status', workOrderController.getWorkOrdersByStatus);

// Update work order status (office staff or own assigned WO)
router.patch('/:id/status', restrictToOwnWorkOrder('admin', 'management', 'service-writer'), workOrderController.updateStatus);

// Add part to work order (office staff only)
router.post('/:id/parts', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.addPart);

// Add labor to work order (office staff or own assigned WO)
router.post('/:id/labor', restrictToOwnWorkOrder('admin', 'management', 'service-writer'), workOrderController.addLabor);

// Receipt import: Step 1 - extract parts from receipt (office staff only)
router.post('/:id/extract-receipt', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.receiptUpload, workOrderController.extractReceipt);

// Receipt import: Step 2 - confirm and add selected parts (office staff only)
router.post('/:id/confirm-receipt-parts', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.confirmReceiptParts);

// Get signed URL for receipt image (office staff only)
router.get('/receipt-signed-url', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.getReceiptSignedUrl);

// Generate invoice (office staff only)
router.get('/:id/invoice', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.generateInvoice);

// Split work order (office staff only)
router.post('/:id/split', authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.splitWorkOrder);

// Work order notes routes - mount under /:workOrderId/notes
router.use('/:workOrderId/notes', workOrderNotesRoutes);

// Basic CRUD routes
router
  .route('/')
  .get(workOrderController.getAllWorkOrders)
  .post(authController.restrictTo('admin', 'management', 'service-writer'), workOrderController.createWorkOrder);

router
  .route('/:id')
  .get(workOrderController.getWorkOrder)
  .patch(restrictToOwnWorkOrder('admin', 'management', 'service-writer'), workOrderController.updateWorkOrder)
  .delete(authController.restrictTo('admin', 'management'), workOrderController.deleteWorkOrder);

module.exports = router;