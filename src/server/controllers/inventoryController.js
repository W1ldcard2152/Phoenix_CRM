const multer = require('multer');
const InventoryItem = require('../models/InventoryItem');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const escapeRegex = require('../utils/escapeRegex');
const { receiptFilter } = require('../utils/uploadFilters');

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: receiptFilter // images + PDF only
}).single('receipt');
exports.receiptUpload = receiptUpload;

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
    // Escape regex metacharacters + cap length to prevent ReDoS / injection
    const searchRegex = new RegExp(escapeRegex(String(search).slice(0, 100)), 'i');
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

// Parse a receipt image/text and find duplicate matches in existing inventory
exports.extractInventoryReceipt = catchAsync(async (req, res, next) => {
  const aiService = require('../services/aiService');

  let receiptData, dataType, mimeType = 'image/png';

  if (req.file) {
    mimeType = req.file.mimetype;
    if (req.file.mimetype === 'application/pdf') {
      const { pdfToPng } = require('pdf-to-png-converter');
      const pngPages = await pdfToPng(req.file.buffer, {
        viewportScale: 2.0,
        disableFontFace: false,
        verbosityLevel: 0
      });
      receiptData = pngPages.map(p => p.content);
      dataType = 'image';
      mimeType = 'image/png';
    } else {
      receiptData = req.file.buffer;
      dataType = 'image';
    }
  } else if (req.body.receiptText) {
    receiptData = req.body.receiptText;
    dataType = 'text';
  } else {
    return next(new AppError('Please provide either a receipt file or text', 400));
  }

  const { parts, shippingTotal } = await aiService.parseReceipt(receiptData, dataType, mimeType);

  if (!parts || parts.length === 0) {
    return next(new AppError('No items could be extracted from the receipt', 400));
  }

  const existingItems = await InventoryItem.find({ isActive: true })
    .select('_id name partNumber brand quantityOnHand')
    .lean();

  let duplicates = [];
  if (existingItems.length > 0) {
    const rawMatches = await aiService.findDuplicates(parts, existingItems);
    const byId = {};
    existingItems.forEach(i => { byId[i._id.toString()] = i; });
    duplicates = rawMatches.map(m => ({
      parsedIndex: m.parsedIndex,
      existingId: m.existingId,
      existingName: byId[m.existingId]?.name || '',
      existingPartNumber: byId[m.existingId]?.partNumber || '',
      existingBrand: byId[m.existingId]?.brand || '',
      existingQoh: byId[m.existingId]?.quantityOnHand ?? 0,
      reason: m.reason
    }));
  }

  res.status(200).json({ status: 'success', data: { parts, shippingTotal, duplicates } });
});

// Apply confirmed inventory receipt import actions
exports.confirmInventoryReceipt = catchAsync(async (req, res, next) => {
  const Settings = require('../models/Settings');

  const { confirmedItems, shippingTotal, totalAllUnits } = req.body;

  if (!confirmedItems || !Array.isArray(confirmedItems) || confirmedItems.length === 0) {
    return next(new AppError('confirmedItems array is required', 400));
  }

  const settings = await Settings.getSettings();
  const markupPercentage = settings.partMarkupPercentage || 30;
  const multiplier = 1 + markupPercentage / 100;

  const nonSkipped = confirmedItems.filter(i => i.type !== 'skip');
  const divisor = totalAllUnits || nonSkipped.reduce((sum, i) => sum + (i.parsedItem?.quantity || 1), 0);
  const shippingPerItem = divisor > 0 ? (parseFloat(shippingTotal) || 0) / divisor : 0;

  const newItemPrefills = [];

  for (const item of confirmedItems) {
    if (item.type === 'skip') continue;

    const { parsedItem, type, existingId, mergedFields } = item;
    const baseCost = parseFloat(parsedItem.price) || 0;
    const cost = parseFloat((baseCost + shippingPerItem).toFixed(2));

    if (type === 'add_to_existing' && existingId) {
      const existing = await InventoryItem.findById(existingId);
      if (!existing) continue;

      const previousQty = existing.quantityOnHand;
      const unitsPerPurchase = existing.unitsPerPurchase || 1;
      const newQty = previousQty + (parsedItem.quantity || 1) * unitsPerPurchase;

      // Resolve cost: merged value wins if provided; else fall back to amortized cost.
      // If the merged cost equals incoming, recompute price normally; if it equals existing,
      // keep existing price untouched (don't surprise the user with a sudden markup change).
      const merged = mergedFields || {};
      const has = (k) => Object.prototype.hasOwnProperty.call(merged, k);

      let finalCost = cost;
      let finalPrice;
      if (has('cost')) {
        finalCost = Number(merged.cost) || 0;
        if (Number(merged.cost) === Number(cost)) {
          finalPrice = parseFloat(((finalCost / unitsPerPurchase) * multiplier).toFixed(2));
        } else {
          finalPrice = existing.price;
        }
      } else {
        finalPrice = parseFloat(((cost / unitsPerPurchase) * multiplier).toFixed(2));
      }

      const update = {
        quantityOnHand: newQty,
        name: has('name') ? merged.name : parsedItem.name,
        cost: finalCost,
        price: finalPrice
      };
      const vendorVal = has('vendor') ? merged.vendor : parsedItem.vendor;
      if (vendorVal !== undefined && vendorVal !== '') update.vendor = vendorVal;
      const partNumberVal = has('partNumber') ? merged.partNumber : parsedItem.itemNumber;
      if (partNumberVal !== undefined && partNumberVal !== '') update.partNumber = partNumberVal;
      if (has('brand')) update.brand = merged.brand;
      if (has('notes')) update.notes = merged.notes;

      await InventoryItem.findByIdAndUpdate(existingId, {
        $set: update,
        $push: {
          adjustmentLog: {
            adjustedBy: req.user._id,
            previousQty,
            newQty,
            reason: 'Restocked (receipt import)'
          }
        }
      });
    } else if (type === 'create_new') {
      const brandModel = [parsedItem.brand, parsedItem.itemNumber].filter(Boolean).join(' ');
      // New items default to unitsPerPurchase=1, so price equals cost * markup at this stage.
      // If the user bumps unitsPerPurchase in the form, the auto-calc will divide accordingly.
      const price = parseFloat((cost * multiplier).toFixed(2));
      newItemPrefills.push({
        name: parsedItem.name,
        partNumber: brandModel,
        vendor: parsedItem.vendor || '',
        cost,
        price,
        quantityOnHand: parsedItem.quantity || 1,
        unit: 'each',
        unitsPerPurchase: 1,
        purchaseUnit: '',
        packageTag: '',
        category: '',
        reorderPoint: 1,
        warranty: '90 days',
        url: '',
        notes: ''
      });
    }
  }

  res.status(200).json({ status: 'success', data: { newItemPrefills } });
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
