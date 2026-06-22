const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authController = require('../controllers/authController');

// Public: stream the current company logo (used by the app header and by PDF
// generation, which need a same-origin image without auth/CORS). Registered
// before `protect` so it stays unauthenticated.
router.get('/company-logo', settingsController.getCompanyLogo);

// All remaining settings routes require authentication
router.use(authController.protect);

// Any authenticated user can read settings
router.get('/', settingsController.getSettings);

// Only admin/management can update settings
router.patch('/', authController.restrictTo('admin', 'management'), settingsController.updateSettings);

// Upload/replace the company logo (admin/management only)
router.post(
  '/company-logo',
  authController.restrictTo('admin', 'management'),
  settingsController.uploadCompanyLogoMiddleware,
  settingsController.uploadCompanyLogo
);

// Add or remove vendors/categories (admin/management only)
router.post('/vendors', authController.restrictTo('admin', 'management'), settingsController.addVendor);
router.post('/vendors/remove', authController.restrictTo('admin', 'management'), settingsController.removeVendor);
router.post('/vendor-types', authController.restrictTo('admin', 'management'), settingsController.addVendorType);
router.post('/categories', authController.restrictTo('admin', 'management'), settingsController.addCategory);
router.post('/categories/remove', authController.restrictTo('admin', 'management'), settingsController.removeCategory);
router.post('/task-categories', authController.restrictTo('admin', 'management'), settingsController.addTaskCategory);
router.post('/task-categories/remove', authController.restrictTo('admin', 'management'), settingsController.removeTaskCategory);
router.post('/inventory-categories', authController.restrictTo('admin', 'management'), settingsController.addInventoryCategory);
router.post('/inventory-categories/rename', authController.restrictTo('admin', 'management'), settingsController.renameInventoryCategory);
router.post('/inventory-categories/remove', authController.restrictTo('admin', 'management'), settingsController.removeInventoryCategory);
router.post('/package-tags', authController.restrictTo('admin', 'management'), settingsController.addPackageTag);
router.post('/package-tags/remove', authController.restrictTo('admin', 'management'), settingsController.removePackageTag);
router.post('/labor-types', authController.restrictTo('admin', 'management'), settingsController.addLaborType);
router.post('/labor-types/rename', authController.restrictTo('admin', 'management'), settingsController.renameLaborType);
router.post('/labor-types/remove', authController.restrictTo('admin', 'management'), settingsController.removeLaborType);
router.post('/brand-overrides', authController.restrictTo('admin', 'management'), settingsController.addBrandOverride);
router.post('/brand-overrides/update', authController.restrictTo('admin', 'management'), settingsController.updateBrandOverride);
router.post('/brand-overrides/remove', authController.restrictTo('admin', 'management'), settingsController.removeBrandOverride);
router.post('/brand-overrides/apply', authController.restrictTo('admin', 'management'), settingsController.applyBrandOverridesToInventory);

module.exports = router;
