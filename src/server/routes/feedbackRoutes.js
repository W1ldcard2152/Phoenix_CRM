const express = require('express');
const feedbackController = require('../controllers/feedbackController');
const authController = require('../controllers/authController');
const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Create feedback - open to all authenticated users
router.post('/', feedbackController.createFeedback);

// All remaining feedback routes require admin only
router.use(authController.restrictTo('admin'));

router.get('/', feedbackController.getAllFeedback);

router
  .route('/:id')
  .get(feedbackController.getFeedback)
  .patch(feedbackController.updateFeedback)
  .delete(feedbackController.deleteFeedback);

router.patch('/:id/archive', feedbackController.archiveFeedback);

module.exports = router;
