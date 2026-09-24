const express = require('express');
const authController = require('../controllers/authController');
const backupController = require('../controllers/backupController');
const router = express.Router();

// Backups hold every customer record in the shop, and a restore replaces
// them all — admin only, throughout.
router.use(authController.protect);
router.use(authController.restrictTo('admin'));

router.route('/')
  .get(backupController.getOverview)
  .post(backupController.backupNow);

router.get('/job', backupController.getJob);
router.get('/download', backupController.downloadFresh);
router.post('/restore-upload', backupController.uploadMiddleware, backupController.restoreUpload);
router.get('/:id/download', backupController.downloadStored);
router.post('/:id/restore', backupController.restoreStored);

module.exports = router;
