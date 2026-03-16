const express = require('express');
const servicePackageController = require('../controllers/servicePackageController');
const authController = require('../controllers/authController');
const router = express.Router();

router.use(authController.protect);

router
  .route('/')
  .get(servicePackageController.getAllPackages)
  .post(authController.restrictTo('admin', 'management'), servicePackageController.createPackage);

router
  .route('/:id')
  .get(servicePackageController.getPackage)
  .patch(authController.restrictTo('admin', 'management'), servicePackageController.updatePackage)
  .delete(authController.restrictTo('admin', 'management'), servicePackageController.deletePackage);

module.exports = router;
