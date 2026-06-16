const express = require('express');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const router = express.Router();

// Auth routes
// NOTE: public self-registration is intentionally disabled. Accounts are
// created by an admin (see adminController.preAuthorizeUser / userController.createUser)
// or provisioned via Google OAuth against a pre-authorized email.
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);

// Protected routes (require authentication)
router.use(authController.protect);

router.patch('/updateMyPassword', authController.updatePassword);
router.get('/me', userController.getMe, userController.getUser);
router.patch('/updateMe', userController.updateMe);
router.delete('/deleteMe', userController.deleteMe);

// User management (create / modify / delete / role assignment) — admin only
router.use(authController.restrictTo('admin'));

router.route('/')
  .get(userController.getAllUsers)
  .post(userController.createUser);

router.route('/:id')
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

module.exports = router;