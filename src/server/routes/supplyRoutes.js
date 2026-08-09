const express = require('express');
const router = express.Router();
const supplyController = require('../controllers/supplyController');
const authController = require('../controllers/authController');

// All supply routes require authentication.
router.use(authController.protect);

// Office staff for item mutations; technicians get read-only access, matching
// the existing inventory router.
const officeStaff = authController.restrictTo('admin', 'management', 'service-writer');
// The tag tree and the controlled vocabularies are structure, not data. A
// service writer adding a vocab value is fine (that happens inline while
// entering an item); restructuring the tree is not.
const admin = authController.restrictTo('admin', 'management');

// ── Specific paths BEFORE /:id, or they get swallowed by it ──
router.get('/shopping-list', supplyController.getShoppingList);

router.get('/tags', supplyController.getTags);
router.post('/tags', admin, supplyController.createTag);
router.patch('/tags/:id', admin, supplyController.updateTag);
router.delete('/tags/:id', admin, supplyController.deleteTag);

router.get('/fields', supplyController.getFields);

// Label extraction — reuses the photo upload middleware (same shape: one image).
router.post('/extract-label', officeStaff, supplyController.photoUpload, supplyController.extractLabel);

router.get('/vocab', supplyController.getVocab);
router.post('/vocab', officeStaff, supplyController.createVocab);
router.patch('/vocab/:id', admin, supplyController.updateVocab);
router.delete('/vocab/:id', admin, supplyController.deleteVocab);

router.patch('/bulk', officeStaff, supplyController.bulkUpdate);

// ── Collection + item ──
router.get('/', supplyController.getAllSupplies);
router.post('/', officeStaff, supplyController.createSupply);

router.get('/:id', supplyController.getSupply);
router.patch('/:id', officeStaff, supplyController.updateSupply);
router.delete('/:id', officeStaff, supplyController.deleteSupply);
router.patch('/:id/adjust', officeStaff, supplyController.adjustQuantity);

// Photo. GET is read-only so technicians can see what they're looking for on
// the shelf; writing needs office staff like every other item mutation.
router.get('/:id/photo', supplyController.getPhoto);
router.post('/:id/photo', officeStaff, supplyController.photoUpload, supplyController.uploadPhoto);
router.delete('/:id/photo', officeStaff, supplyController.deletePhoto);

module.exports = router;
