const express = require('express');
const mediaController = require('../controllers/mediaController');
const router = express.Router();

// Upload media
router.post(
  '/upload',
  mediaController.uploadMedia,
  mediaController.createMedia
);

// Get signed URL for media
router.get('/:id/signed-url', mediaController.getSignedUrl);

// Share media via email
router.post('/:id/share', mediaController.shareMediaViaEmail);

// Batch endpoint for getting attachment counts for multiple work orders
router.post('/batch-counts', mediaController.getBatchAttachmentCounts);

// Basic CRUD routes
router
  .route('/')
  .get(mediaController.getAllMedia);

router
  .route('/:id')
  .get(mediaController.getMedia)
  .delete(mediaController.deleteMedia);

module.exports = router;
