const express = require('express');
const feedbackController = require('../controllers/feedbackController');
const router = express.Router();

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
