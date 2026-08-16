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

// Learned per-vendor sales-tax defaults, keyed by hostname.
router.get('/tax-rules', supplyController.getTaxRules);
router.put('/tax-rules', officeStaff, supplyController.setTaxRule);

// Label extraction — reuses the photo upload middleware (same shape: one image).
router.post('/extract-label', officeStaff, supplyController.photoUpload, supplyController.extractLabel);

router.get('/vocab', supplyController.getVocab);
router.post('/vocab', officeStaff, supplyController.createVocab);
router.patch('/vocab/:id', admin, supplyController.updateVocab);
router.delete('/vocab/:id', admin, supplyController.deleteVocab);

router.patch('/bulk', officeStaff, supplyController.bulkUpdate);

/**
 * Cycle counts.
 *
 * The split here is deliberate and is the point of the feature's permissions:
 * ENTERING counts is open to every authenticated user, because walking the
 * shelves with a phone is exactly the work worth handing to a technician.
 * Deciding what gets counted, and POSTING the variances — the step that
 * actually rewrites stock and carries the dollar impact — stays with admin and
 * management.
 *
 * Saved-scope paths come before /counts/:id so an id-shaped match can't swallow
 * them, the same rule the top of this file follows.
 */
router.get('/counts/scopes', supplyController.getCountScopes);
router.post('/counts/scopes', admin, supplyController.createCountScope);
router.patch('/counts/scopes/:id', admin, supplyController.updateCountScope);
router.delete('/counts/scopes/:id', admin, supplyController.deleteCountScope);
router.post('/counts/scopes/:id/run', admin, supplyController.runCountScope);

router.post('/counts/preview', admin, supplyController.previewCountScope);

router.get('/counts', supplyController.getCounts);
router.post('/counts', admin, supplyController.createCount);

router.get('/counts/:id', supplyController.getCount);
router.get('/counts/:id/variances', supplyController.getCountVariances);
router.delete('/counts/:id', admin, supplyController.deleteCount);

// Entry — open to anyone counting.
router.patch('/counts/:id/lines/:lineId', supplyController.setCountLine);
router.post('/counts/:id/lines', supplyController.addCountLine);
router.delete('/counts/:id/lines/:lineId', supplyController.removeCountLine);
router.post('/counts/:id/found', supplyController.addCountFoundItem);
// "I've finished counting" is the counter's call; it writes nothing to stock.
router.post('/counts/:id/review', supplyController.reviewCount);

// Corrections — admin only.
router.post('/counts/:id/reopen', admin, supplyController.reopenCount);
router.post('/counts/:id/post', admin, supplyController.postCount);
router.post('/counts/:id/cancel', admin, supplyController.cancelCount);

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
