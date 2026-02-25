const express = require('express');
const mediaController = require('../controllers/mediaController');
const authController = require('../controllers/authController');
const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Upload media - all authenticated users
router.post(
  '/upload',
  mediaController.uploadMedia,
  mediaController.createMedia
);

// Get signed URL for media - all authenticated users
router.get('/:id/signed-url', mediaController.getSignedUrl);

// Share media via email - office staff only
router.post('/:id/share', authController.restrictTo('admin', 'management', 'service-writer'), mediaController.shareMediaViaEmail);

// Batch endpoint for getting attachment counts - all authenticated users
router.post('/batch-counts', mediaController.getBatchAttachmentCounts);

// Basic CRUD routes
router
  .route('/')
  .get(mediaController.getAllMedia);

router
  .route('/:id')
  .get(mediaController.getMedia)
  .delete(authController.restrictTo('admin', 'management', 'service-writer'), mediaController.deleteMedia);

module.exports = router;
