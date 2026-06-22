const Settings = require('../models/Settings');
const WorkOrder = require('../models/WorkOrder');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const s3Service = require('../services/s3Service');
const multer = require('multer');

// Accept image uploads only (company logo)
const imageOnlyFilter = (req, file, cb) => {
  if ((file.mimetype || '').toLowerCase().startsWith('image/')) return cb(null, true);
  cb(new AppError('Unsupported file type. Please upload an image.', 400), false);
};

// In-memory upload for the company logo (images only, 5MB cap)
const companyLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageOnlyFilter
});
exports.uploadCompanyLogoMiddleware = companyLogoUpload.single('logo');

// Capitalize the first letter of every word, leave the rest alone.
// Preserves intentional caps (R&R, ABS) — only nudges the first letter of each word.
const toLaborTypeCase = (str) => (str || '').trim().replace(/\b\w/g, c => c.toUpperCase());

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
  if (req.body.defaultLaborRate !== undefined) {
    settings.defaultLaborRate = req.body.defaultLaborRate;
  }
  if (req.body.taxRate !== undefined) {
    settings.taxRate = req.body.taxRate;
  }
  if (req.body.customVendors !== undefined) {
    settings.customVendors = req.body.customVendors;
    // Keep the legacy vendorHostnames map (used by the part-modal URL detection)
    // in sync with the per-vendor hostnames so both detection paths agree.
    settings.vendorHostnames = (req.body.customVendors || []).flatMap((v) =>
      (v.hostnames || []).map((h) => ({ hostname: h, vendor: v.name }))
    );
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
  if (req.body.shopHours !== undefined) {
    settings.shopHours = req.body.shopHours;
  }
  // Company / tenant identity (logo is managed via the dedicated upload route)
  const companyFields = [
    'companyName', 'companyAddressLine1', 'companyAddressLine2',
    'companyPhone', 'companyEmail', 'companyWebsite'
  ];
  companyFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      settings[field] = req.body[field];
    }
  });

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
  const { vendor, hostname, usedFor } = req.body;
  if (!vendor || !vendor.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Vendor name is required' });
  }

  const settings = await Settings.getSettings();
  const trimmed = vendor.trim();

  // customVendors are tagged objects now; match/insert on the name.
  const exists = settings.customVendors.some(
    v => (v.name || '').toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ status: 'fail', message: 'This vendor already exists in the list' });
  }

  const cleanHostname = (hostname && hostname.trim())
    ? hostname.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '')
    : null;

  const validUsedFor = Array.isArray(usedFor)
    ? usedFor.filter(u => ['parts', 'inventory'].includes(u))
    : [];

  settings.customVendors.push({
    name: trimmed,
    hostnames: cleanHostname ? [cleanHostname] : [],
    makes: ['all'],
    usedFor: validUsedFor.length ? validUsedFor : ['parts'],
    type: '',
    speedTier: 0,
    costTier: 0,
    sortOrder: settings.customVendors.length
  });

  // Keep the legacy hostname map in sync for the part-modal URL auto-detection.
  if (cleanHostname) {
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
  settings.customVendors = settings.customVendors.filter(v => v.name !== vendor);

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

exports.addVendorType = catchAsync(async (req, res) => {
  const { vendorType } = req.body;
  if (!vendorType || !vendorType.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Vendor type is required' });
  }

  const settings = await Settings.getSettings();
  const normalized = vendorType.trim();

  const exists = (settings.vendorTypes || []).some(
    t => t.toLowerCase() === normalized.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ status: 'fail', message: 'This vendor type already exists' });
  }

  settings.vendorTypes = [...(settings.vendorTypes || []), normalized];
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.addLaborType = catchAsync(async (req, res) => {
  const { laborType } = req.body;
  if (!laborType || !laborType.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Labor type name is required' });
  }

  const settings = await Settings.getSettings();
  const normalized = toLaborTypeCase(laborType);

  const exists = (settings.laborTypes || []).some(
    t => t.toLowerCase() === normalized.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ status: 'fail', message: 'This labor type already exists' });
  }

  settings.laborTypes = [...(settings.laborTypes || []), normalized];
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.renameLaborType = catchAsync(async (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName || !newName.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Both oldName and newName are required' });
  }

  const normalized = toLaborTypeCase(newName);
  if (oldName === normalized) {
    return res.status(400).json({ status: 'fail', message: 'New name is the same as the old name' });
  }

  const settings = await Settings.getSettings();
  const list = settings.laborTypes || [];

  if (!list.includes(oldName)) {
    return res.status(404).json({ status: 'fail', message: 'Labor type not found' });
  }

  const conflict = list.some(t => t !== oldName && t.toLowerCase() === normalized.toLowerCase());
  if (conflict) {
    return res.status(400).json({ status: 'fail', message: 'A labor type with that name already exists' });
  }

  settings.laborTypes = list.map(t => t === oldName ? normalized : t);
  await settings.save();

  res.status(200).json({ status: 'success', data: { settings } });
});

exports.removeLaborType = catchAsync(async (req, res) => {
  const { laborType } = req.body;
  if (!laborType) {
    return res.status(400).json({ status: 'fail', message: 'Labor type name is required' });
  }

  const settings = await Settings.getSettings();
  settings.laborTypes = (settings.laborTypes || []).filter(t => t !== laborType);
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

// Upload a new company logo to S3 and point companyLogoUrl at the public stream
// route. Replaces (and deletes) any previously uploaded logo.
exports.uploadCompanyLogo = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload a logo image', 400));
  }

  const uploadResult = await s3Service.uploadFile(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype
  );
  if (!uploadResult.key) {
    return next(new AppError('Logo upload failed (storage not configured)', 500));
  }

  const settings = await Settings.getSettings();
  const previousKey = settings.companyLogoKey;

  settings.companyLogoKey = uploadResult.key;
  // Stable, same-origin URL (avoids signed-URL expiry / CORS in PDFs).
  // Cache-bust with the key so the header/PDF pick up the new image.
  settings.companyLogoUrl = `/api/settings/company-logo?v=${encodeURIComponent(uploadResult.key)}`;
  await settings.save();

  // Best-effort cleanup of the prior logo object
  if (previousKey) {
    try { await s3Service.deleteFile(previousKey); } catch (err) {
      console.error('Failed to delete previous company logo:', err.message);
    }
  }

  res.status(200).json({ status: 'success', data: { settings } });
});

// Public (no-auth) stream of the current company logo so it loads same-origin
// in the app header, on the login-adjacent header, and in generated PDFs.
exports.getCompanyLogo = catchAsync(async (req, res) => {
  const settings = await Settings.getSettings();

  // No uploaded logo → fall back to the bundled default public asset
  if (!settings.companyLogoKey) {
    return res.redirect('/phxLogo.png');
  }

  const file = await s3Service.getFileStream(settings.companyLogoKey);
  if (!file || !file.body) {
    return res.redirect('/phxLogo.png');
  }

  res.set('Content-Type', file.contentType || 'image/png');
  if (file.contentLength) res.set('Content-Length', String(file.contentLength));
  res.set('Cache-Control', 'public, max-age=86400');
  file.body.pipe(res);
});
