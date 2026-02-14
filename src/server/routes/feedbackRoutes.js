const express = require('express');
const feedbackController = require('../controllers/feedbackController');
const authController = require('../controllers/authController');
const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

router
  .route('/')
  .get(feedbackController.getAllFeedback)
  .post(feedbackController.createFeedback);

router
  .route('/:id')
  .get(feedbackController.getFeedback)
  .patch(feedbackController.updateFeedback)
  .delete(feedbackController.deleteFeedback);

router.patch('/:id/archive', feedbackController.archiveFeedback);

module.exports = router;
