const Settings = require('../models/Settings');
const WorkOrder = require('../models/WorkOrder');
const catchAsync = require('../utils/catchAsync');

exports.getSettings = catchAsync(async (req, res) => {
  const settings = await Settings.getSettings();
  res.status(200).json({
    status: 'success',
    data: { settings }
  });
});

exports.updateSettings = catchAsync(async (req, res) => {
  const settings = await Settings.getSettings();
  const oldMarkup = settings.partMarkupPercentage;

  // Update allowed fields
  if (req.body.partMarkupPercentage !== undefined) {
    settings.partMarkupPercentage = req.body.partMarkupPercentage;
  }
  if (req.body.customVendors !== undefined) {
    settings.customVendors = req.body.customVendors;
  }
  if (req.body.customCategories !== undefined) {
    settings.customCategories = req.body.customCategories;
  }
  if (req.body.taskCategories !== undefined) {
    settings.taskCategories = req.body.taskCategories;
  }
  if (req.body.showServiceAdvisorOnInvoice !== undefined) {
    settings.showServiceAdvisorOnInvoice = req.body.showServiceAdvisorOnInvoice;
  }

  await settings.save();

  // If markup changed, batch-recalculate retail prices on all WOs/quotes without a saved invoice
  if (req.body.partMarkupPercentage !== undefined && req.body.partMarkupPercentage !== oldMarkup) {
    const newMultiplier = 1 + settings.partMarkupPercentage / 100;

    // Find all work orders (including quotes) that don't have a linked invoice
    const workOrders = await WorkOrder.find({
      invoice: { $exists: false }
    }).select('parts');

    // Also find ones where invoice is explicitly null
    const workOrdersNull = await WorkOrder.find({
      invoice: null
    }).select('parts');

    // Combine and deduplicate
    const allIds = new Set();
    const allWorkOrders = [];
    [...workOrders, ...workOrdersNull].forEach(wo => {
      const idStr = wo._id.toString();
      if (!allIds.has(idStr)) {
        allIds.add(idStr);
        allWorkOrders.push(wo);
      }
    });

    const bulkOps = [];
    for (const wo of allWorkOrders) {
      if (!wo.parts || wo.parts.length === 0) continue;

      let changed = false;
      const updatedParts = wo.parts.map(part => {
        if (part.cost > 0) {
          const newPrice = parseFloat((part.cost * newMultiplier).toFixed(2));
          if (newPrice !== part.price) {
            changed = true;
            return { ...part.toObject(), price: newPrice };
          }
        }
        return part.toObject();
      });

      if (changed) {
        bulkOps.push({
          updateOne: {
            filter: { _id: wo._id },
            update: { $set: { parts: updatedParts } }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await WorkOrder.bulkWrite(bulkOps);
    }

    res.status(200).json({
      status: 'success',
      data: { settings },
      message: `Markup updated to ${settings.partMarkupPercentage}%. Recalculated prices on ${bulkOps.length} work orders/quotes.`
    });
  } else {
    res.status(200).json({
      status: 'success',
      data: { settings }
    });
  }
});

exports.addVendor = catchAsync(async (req, res) => {
  const { vendor, hostname } = req.body;
  if (!vendor || !vendor.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Vendor name is required' });
  }

  const settings = await Settings.getSettings();
  const trimmed = vendor.trim();

  const exists = settings.customVendors.some(
    v => v.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ status: 'fail', message: 'This vendor already exists in the list' });
  }

  settings.customVendors.push(trimmed);

  // Store hostname mapping for URL auto-detection
  if (hostname && hostname.trim()) {
    const cleanHostname = hostname.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
    // Remove existing mapping for this hostname if any, then add
    settings.vendorHostnames = settings.vendorHostnames.filter(h => h.hostname !== cleanHostname);
    settings.vendorHostnames.push({ hostname: cleanHostname, vendor: trimmed });
  }

  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.removeVendor = catchAsync(async (req, res) => {
  const { vendor } = req.body;
  if (!vendor) {
    return res.status(400).json({ status: 'fail', message: 'Vendor name is required' });
  }

  const settings = await Settings.getSettings();
  settings.customVendors = settings.customVendors.filter(v => v !== vendor);

  // Also remove any hostname mappings for this vendor
  settings.vendorHostnames = settings.vendorHostnames.filter(h => h.vendor !== vendor);

  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.addTaskCategory = catchAsync(async (req, res) => {
  const { category } = req.body;
  if (!category || !category.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Category name is required' });
  }

  const settings = await Settings.getSettings();
  const trimmed = category.trim();

  const exists = settings.taskCategories.some(
    c => c.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ status: 'fail', message: 'This task category already exists' });
  }

  settings.taskCategories.push(trimmed);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.removeTaskCategory = catchAsync(async (req, res) => {
  const { category } = req.body;
  if (!category) {
    return res.status(400).json({ status: 'fail', message: 'Category name is required' });
  }

  const settings = await Settings.getSettings();
  settings.taskCategories = settings.taskCategories.filter(c => c !== category);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.addInventoryCategory = catchAsync(async (req, res) => {
  const { category } = req.body;
  if (!category || !category.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Category name is required' });
  }

  const settings = await Settings.getSettings();
  const trimmed = category.trim();

  const exists = settings.inventoryCategories.some(
    c => c.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ status: 'fail', message: 'This inventory category already exists' });
  }

  settings.inventoryCategories.push(trimmed);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.renameInventoryCategory = catchAsync(async (req, res) => {
  const InventoryItem = require('../models/InventoryItem');
  const { oldName, newName } = req.body;

  if (!oldName || !newName || !newName.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Both oldName and newName are required' });
  }

  const trimmed = newName.trim();
  if (oldName === trimmed) {
    return res.status(400).json({ status: 'fail', message: 'New name is the same as the old name' });
  }

  const settings = await Settings.getSettings();

  if (!settings.inventoryCategories.includes(oldName)) {
    return res.status(404).json({ status: 'fail', message: 'Category does not exist' });
  }

  const conflict = settings.inventoryCategories.some(
    c => c !== oldName && c.toLowerCase() === trimmed.toLowerCase()
  );
  if (conflict) {
    return res.status(400).json({ status: 'fail', message: 'A category with that name already exists' });
  }

  settings.inventoryCategories = settings.inventoryCategories.map(c => c === oldName ? trimmed : c);
  await settings.save();

  await InventoryItem.updateMany({ category: oldName }, { $set: { category: trimmed } });

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.removeInventoryCategory = catchAsync(async (req, res) => {
  const { category } = req.body;
  if (!category) {
    return res.status(400).json({ status: 'fail', message: 'Category name is required' });
  }

  const settings = await Settings.getSettings();
  settings.inventoryCategories = settings.inventoryCategories.filter(c => c !== category);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.addBrandOverride = catchAsync(async (req, res) => {
  const { brand } = req.body;
  if (!brand || !brand.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Brand name is required' });
  }

  const settings = await Settings.getSettings();
  const trimmed = brand.trim();

  const exists = (settings.brandOverrides || []).some(
    b => b.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ status: 'fail', message: 'This brand override already exists' });
  }

  settings.brandOverrides = [...(settings.brandOverrides || []), trimmed];
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.updateBrandOverride = catchAsync(async (req, res) => {
  const { oldBrand, newBrand } = req.body;
  if (!oldBrand || !newBrand || !newBrand.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Both oldBrand and newBrand are required' });
  }

  const trimmed = newBrand.trim();
  const settings = await Settings.getSettings();
  const list = settings.brandOverrides || [];

  if (!list.includes(oldBrand)) {
    return res.status(404).json({ status: 'fail', message: 'Brand override not found' });
  }

  const conflict = list.some(b => b !== oldBrand && b.toLowerCase() === trimmed.toLowerCase());
  if (conflict) {
    return res.status(400).json({ status: 'fail', message: 'Another brand override with that name already exists' });
  }

  settings.brandOverrides = list.map(b => b === oldBrand ? trimmed : b);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.applyBrandOverridesToInventory = catchAsync(async (req, res) => {
  const InventoryItem = require('../models/InventoryItem');
  const { brand, applyAll } = req.body;

  const settings = await Settings.getSettings();
  const allOverrides = settings.brandOverrides || [];

  let overridesToApply;
  if (applyAll) {
    overridesToApply = allOverrides;
  } else if (brand) {
    if (!allOverrides.includes(brand)) {
      return res.status(404).json({ status: 'fail', message: 'Brand override not found' });
    }
    overridesToApply = [brand];
  } else {
    return res.status(400).json({ status: 'fail', message: 'Either brand or applyAll is required' });
  }

  if (overridesToApply.length === 0) {
    return res.status(200).json({ status: 'success', data: { updatedCount: 0 } });
  }

  const overridesMap = {};
  overridesToApply.forEach(b => { overridesMap[b.toLowerCase()] = b; });

  // Scan all items with non-empty partNumber (the "Brand / Model" field)
  const items = await InventoryItem.find({
    partNumber: { $exists: true, $nin: [null, ''] }
  }).select('_id partNumber').lean();

  const updates = [];
  for (const item of items) {
    const next = item.partNumber.replace(/[A-Za-z]+/g, (word) => {
      const override = overridesMap[word.toLowerCase()];
      return override || word;
    });
    if (next !== item.partNumber) {
      updates.push({ _id: item._id, partNumber: next });
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates.map(u =>
      InventoryItem.findByIdAndUpdate(u._id, { partNumber: u.partNumber })
    ));
  }

  res.status(200).json({ status: 'success', data: { updatedCount: updates.length } });
});

exports.removeBrandOverride = catchAsync(async (req, res) => {
  const { brand } = req.body;
  if (!brand) {
    return res.status(400).json({ status: 'fail', message: 'Brand name is required' });
  }

  const settings = await Settings.getSettings();
  settings.brandOverrides = (settings.brandOverrides || []).filter(b => b !== brand);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.addPackageTag = catchAsync(async (req, res) => {
  const { tag } = req.body;
  if (!tag || !tag.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Tag name is required' });
  }

  const settings = await Settings.getSettings();
  const trimmed = tag.trim();

  const exists = settings.packageTags.some(
    t => t.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ status: 'fail', message: 'This package tag already exists' });
  }

  settings.packageTags.push(trimmed);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.removePackageTag = catchAsync(async (req, res) => {
  const { tag } = req.body;
  if (!tag) {
    return res.status(400).json({ status: 'fail', message: 'Tag name is required' });
  }

  const settings = await Settings.getSettings();
  settings.packageTags = settings.packageTags.filter(t => t !== tag);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.addCategory = catchAsync(async (req, res) => {
  const { category } = req.body;
  if (!category || !category.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Category name is required' });
  }

  const settings = await Settings.getSettings();
  const trimmed = category.trim();

  const exists = settings.customCategories.some(
    c => c.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ status: 'fail', message: 'This category already exists in the list' });
  }

  settings.customCategories.push(trimmed);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.removeCategory = catchAsync(async (req, res) => {
  const { category } = req.body;
  if (!category) {
    return res.status(400).json({ status: 'fail', message: 'Category name is required' });
  }

  const settings = await Settings.getSettings();
  settings.customCategories = settings.customCategories.filter(c => c !== category);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});
