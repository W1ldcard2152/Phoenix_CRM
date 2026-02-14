const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const partController = require('../controllers/partController');
const authController = require('../controllers/authController');

// Protect all routes - require authentication
router.use(authController.protect);

// Validation middleware
const partValidation = [
  body('name')
    .notEmpty()
    .withMessage('Part name is required')
    .isLength({ max: 200 })
    .withMessage('Part name cannot exceed 200 characters')
    .trim(),
  body('partNumber')
    .notEmpty()
    .withMessage('Part number is required')
    .trim(),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('cost')
    .isFloat({ min: 0 })
    .withMessage('Cost must be a positive number'),
  body('vendor')
    .notEmpty()
    .withMessage('Vendor is required')
    .isLength({ max: 100 })
    .withMessage('Vendor name cannot exceed 100 characters')
    .trim(),
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn([
      'Engine',
      'Transmission',
      'Brakes',
      'Suspension',
      'Electrical',
      'Exhaust',
      'Cooling',
      'Fuel System',
      'Air & Filters',
      'Fluids & Chemicals',
      'Belts & Hoses',
      'Ignition',
      'Body Parts',
      'Interior',
      'Tires & Wheels',
      'Tools & Equipment',
      'Other'
    ])
    .withMessage('Invalid category'),
  body('brand')
    .notEmpty()
    .withMessage('Brand is required')
    .isLength({ max: 50 })
    .withMessage('Brand cannot exceed 50 characters')
    .trim(),
  body('warranty')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Warranty cannot exceed 100 characters')
    .trim(),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
    .trim(),
  body('url')
    .optional({ nullable: true, checkFalsy: true })
    .isURL({ require_protocol: true })
    .withMessage('Please enter a valid URL (including http:// or https://)')
    .trim(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// Routes
router.get('/', partController.getAllParts);
router.get('/search', partController.searchParts);
router.get('/categories', partController.getCategories);
router.get('/vendors', partController.getVendors);
router.get('/brands', partController.getBrands);
router.get('/:id', partController.getPartById);
router.post('/', partValidation, partController.createPart);
router.put('/:id', partValidation, partController.updatePart);
router.delete('/:id', partController.deletePart);

module.exports = router;