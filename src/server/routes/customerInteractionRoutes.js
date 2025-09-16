const express = require('express');
const router = express.Router();
const customerInteractionController = require('../controllers/customerInteractionController');

// Work order specific interactions
router.get('/work-order/:workOrderId', customerInteractionController.getWorkOrderInteractions);
router.get('/work-order/:workOrderId/stats', customerInteractionController.getInteractionStats);

// Customer specific interactions
router.get('/customer/:customerId', customerInteractionController.getCustomerInteractions);

// Follow-ups
router.get('/follow-ups/pending', customerInteractionController.getPendingFollowUps);
router.put('/:id/complete-follow-up', customerInteractionController.completeFollowUp);

// CRUD operations
router.post('/', customerInteractionController.createInteraction);
router.put('/:id', customerInteractionController.updateInteraction);
router.delete('/:id', customerInteractionController.deleteInteraction);

module.exports = router;