const express = require('express');
const scheduleBlockController = require('../controllers/scheduleBlockController');
const authController = require('../controllers/authController');

const router = express.Router();

// All routes require authentication
router.use(authController.protect);
router.use(authController.restrictTo('admin', 'management', 'service-writer'));

// Specific routes first (before /:id)
router.get('/expanded/:startDate/:endDate', scheduleBlockController.getExpandedBlocks);

// Exception management
router.post('/:id/exceptions', scheduleBlockController.addException);
router.delete('/:id/exceptions/:exceptionId', scheduleBlockController.removeException);

// Basic CRUD
router
  .route('/')
  .get(scheduleBlockController.getAllScheduleBlocks)
  .post(scheduleBlockController.createScheduleBlock);

router
  .route('/:id')
  .get(scheduleBlockController.getScheduleBlock)
  .patch(scheduleBlockController.updateScheduleBlock)
  .delete(scheduleBlockController.deleteScheduleBlock);

module.exports = router;
