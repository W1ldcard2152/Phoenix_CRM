const express = require('express');
const invoiceController = require('../controllers/invoiceController');
const router = express.Router();

// Get invoice count (for generating invoice numbers)
router.get('/count', invoiceController.getInvoicesCount);

// Generate PDF from invoice
router.get('/:id/pdf', invoiceController.generatePDF);

// Mark invoice as paid
router.patch('/:id/pay', invoiceController.markAsPaid);

// Add payment to invoice
router.post('/:id/payment', invoiceController.addPayment);

// Send invoice via email
router.post('/:id/send', invoiceController.sendInvoiceViaEmail);

// Update invoice status
router.patch('/:id/status', invoiceController.updateInvoiceStatus);

// Basic CRUD routes
router
  .route('/')
  .get(invoiceController.getAllInvoices)
  .post(invoiceController.createInvoice);

router
  .route('/:id')
  .get(invoiceController.getInvoice)
  .patch(invoiceController.updateInvoice)
  .delete(invoiceController.deleteInvoice);

module.exports = router;
