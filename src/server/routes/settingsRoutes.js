const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authController = require('../controllers/authController');

// All settings routes require authentication
router.use(authController.protect);

// Any authenticated user can read settings
router.get('/', settingsController.getSettings);

// Only admin/management can update settings
router.patch('/', authController.restrictTo('admin', 'management'), settingsController.updateSettings);

// Add or remove vendors/categories (admin/management only)
router.post('/vendors', authController.restrictTo('admin', 'management'), settingsController.addVendor);
router.post('/vendors/remove', authController.restrictTo('admin', 'management'), settingsController.removeVendor);
router.post('/categories', authController.restrictTo('admin', 'management'), settingsController.addCategory);
router.post('/categories/remove', authController.restrictTo('admin', 'management'), settingsController.removeCategory);
router.post('/task-categories', authController.restrictTo('admin', 'management'), settingsController.addTaskCategory);
router.post('/task-categories/remove', authController.restrictTo('admin', 'management'), settingsController.removeTaskCategory);
router.post('/inventory-categories', authController.restrictTo('admin', 'management'), settingsController.addInventoryCategory);
router.post('/inventory-categories/remove', authController.restrictTo('admin', 'management'), settingsController.removeInventoryCategory);
router.post('/package-tags', authController.restrictTo('admin', 'management'), settingsController.addPackageTag);
router.post('/package-tags/remove', authController.restrictTo('admin', 'management'), settingsController.removePackageTag);

module.exports = router;
