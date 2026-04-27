const express = require('express');
const router = express.Router();
const followUpController = require('../controllers/followUpController');
const authController = require('../controllers/authController');

// All routes require authentication
router.use(authController.protect);

// Restrict to service-writer and above
router.use(authController.restrictTo('admin', 'management', 'service-writer'));

// Special endpoints first
router.get('/dashboard', followUpController.getDashboardFollowUps);
router.get('/entity/:entityType/:entityId', followUpController.getEntityFollowUps);

// CRUD
router.route('/')
  .get(followUpController.getFollowUps)
  .post(followUpController.createFollowUp);

router.route('/:id')
  .get(followUpController.getFollowUp)
  .put(followUpController.updateFollowUp)
  .delete(followUpController.deleteFollowUp);

// Status changes
router.put('/:id/close', followUpController.closeFollowUp);
router.put('/:id/reopen', followUpController.reopenFollowUp);

// Notes sub-resource
router.post('/:id/notes', followUpController.addNote);
router.route('/:id/notes/:noteId')
  .put(followUpController.updateNote)
  .delete(followUpController.deleteNote);

module.exports = router;
