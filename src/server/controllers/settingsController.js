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
