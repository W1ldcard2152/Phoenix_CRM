const express = require('express');
const authController = require('../controllers/authController');
const aiController = require('../controllers/aiController');

const router = express.Router();

// All AI routes require authentication
router.use(authController.protect);

// URL extraction - office staff only
router.post(
  '/extract-url',
  authController.restrictTo('admin', 'management', 'service-writer'),
  aiController.extractFromUrl
);

module.exports = router;
