const InventoryItem = require('../models/InventoryItem');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all active inventory items (excludes adjustment log for performance)
exports.getAllItems = catchAsync(async (req, res, next) => {
  const { category, search, active, packageTag } = req.query;
  const filter = {};

  if (active === 'false') {
    filter.isActive = false;
  } else {
    filter.isActive = true;
  }

  if (category) {
    filter.category = category;
  }

  if (packageTag) {
    filter.packageTag = packageTag;
  }

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filter.$or = [
      { name: searchRegex },
      { partNumber: searchRegex },
      { vendor: searchRegex },
      { brand: searchRegex },
      { packageTag: searchRegex }
    ];
  }

  const items = await InventoryItem.find(filter)
    .select('-adjustmentLog')
    .sort({ name: 1 })
    .lean();

  res.status(200).json({
    status: 'success',
    results: items.length,
    data: { items }
  });
});

// Get a single item with full adjustment log
exports.getItem = catchAsync(async (req, res, next) => {
  const item = await InventoryItem.findById(req.params.id)
    .populate('adjustmentLog.adjustedBy', 'name displayName');

  if (!item) {
    return next(new AppError('No inventory item found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { item }
  });
});

// Create a new inventory item
exports.createItem = catchAsync(async (req, res, next) => {
  const { name, partNumber, category, quantityOnHand, unit, unitsPerPurchase,
          purchaseUnit, reorderPoint, price, cost, vendor, brand, warranty, url, notes, packageTag } = req.body;

  const itemData = { name, partNumber, category, unit, unitsPerPurchase,
    purchaseUnit, reorderPoint, price, cost, vendor, brand, warranty, url, notes, packageTag };
  itemData.quantityOnHand = quantityOnHand || 0;

  if (itemData.quantityOnHand > 0) {
    itemData.adjustmentLog = [{
      adjustedBy: req.user._id,
      previousQty: 0,
      newQty: itemData.quantityOnHand,
      reason: 'Initial stock'
    }];
  }

  const item = await InventoryItem.create(itemData);

  res.status(201).json({
    status: 'success',
    data: { item }
  });
});

// Update item metadata (not QOH - use adjustQuantity for that)
exports.updateItem = catchAsync(async (req, res, next) => {
  const { name, partNumber, category, unit, unitsPerPurchase, purchaseUnit,
          reorderPoint, price, cost, vendor, brand, warranty, url, notes, isActive, packageTag } = req.body;
  const updateData = {};

  if (name !== undefined) updateData.name = name;
  if (partNumber !== undefined) updateData.partNumber = partNumber;
  if (category !== undefined) updateData.category = category;
  if (unit !== undefined) updateData.unit = unit;
  if (unitsPerPurchase !== undefined) updateData.unitsPerPurchase = unitsPerPurchase;
  if (purchaseUnit !== undefined) updateData.purchaseUnit = purchaseUnit;
  if (packageTag !== undefined) updateData.packageTag = packageTag;
  if (reorderPoint !== undefined) updateData.reorderPoint = reorderPoint;
  if (price !== undefined) updateData.price = price;
  if (cost !== undefined) updateData.cost = cost;
  if (vendor !== undefined) updateData.vendor = vendor;
  if (brand !== undefined) updateData.brand = brand;
  if (warranty !== undefined) updateData.warranty = warranty;
  if (url !== undefined) updateData.url = url;
  if (notes !== undefined) updateData.notes = notes;
  if (isActive !== undefined) updateData.isActive = isActive;

  const item = await InventoryItem.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  ).select('-adjustmentLog');

  if (!item) {
    return next(new AppError('No inventory item found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { item }
  });
});

// Adjust quantity (increment/decrement with log entry)
exports.adjustQuantity = catchAsync(async (req, res, next) => {
  const { adjustment, reason } = req.body;

  if (adjustment === undefined || adjustment === 0) {
    return next(new AppError('Adjustment amount is required and cannot be zero', 400));
  }

  const item = await InventoryItem.findById(req.params.id);
  if (!item) {
    return next(new AppError('No inventory item found with that ID', 404));
  }

  const previousQty = item.quantityOnHand;
  const newQty = Math.max(0, previousQty + adjustment);

  await InventoryItem.findByIdAndUpdate(req.params.id, {
    $set: { quantityOnHand: newQty },
    $push: {
      adjustmentLog: {
        adjustedBy: req.user._id,
        previousQty,
        newQty,
        reason: reason || (adjustment > 0 ? 'Restocked' : 'Used')
      }
    }
  });

  // Return the updated item without the full log
  const updated = await InventoryItem.findById(req.params.id).select('-adjustmentLog').lean();

  res.status(200).json({
    status: 'success',
    data: { item: updated }
  });
});

// Get shopping list (items at or below reorder point)
exports.getShoppingList = catchAsync(async (req, res, next) => {
  const items = await InventoryItem.find({
    isActive: true,
    $expr: { $lte: ['$quantityOnHand', '$reorderPoint'] }
  })
    .select('-adjustmentLog')
    .sort({ category: 1, name: 1 })
    .lean();

  res.status(200).json({
    status: 'success',
    results: items.length,
    data: { items }
  });
});

// Soft delete an inventory item
exports.deleteItem = catchAsync(async (req, res, next) => {
  const item = await InventoryItem.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );

  if (!item) {
    return next(new AppError('No inventory item found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});
