const express = require('express');
const adminController = require('../controllers/adminController');
const authController = require('../controllers/authController');
const router = express.Router();

// All admin routes require authentication + admin role
router.use(authController.protect);
router.use(authController.restrictTo('admin', 'management'));

router.route('/users')
  .get(adminController.getAllUsers)
  .post(adminController.preAuthorizeUser);

router.route('/users/:id')
  .patch(adminController.updateUser)
  .delete(adminController.deactivateUser);

module.exports = router;
