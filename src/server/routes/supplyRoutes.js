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

module.exports = router;
