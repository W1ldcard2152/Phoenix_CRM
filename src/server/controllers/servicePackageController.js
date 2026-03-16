const ServicePackage = require('../models/ServicePackage');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.getAllPackages = catchAsync(async (req, res) => {
  const filter = req.query.active === 'false' ? {} : { isActive: true };
  const packages = await ServicePackage.find(filter)
    .sort('name')
    .lean();

  res.status(200).json({
    status: 'success',
    results: packages.length,
    data: { packages }
  });
});

exports.getPackage = catchAsync(async (req, res, next) => {
  const pkg = await ServicePackage.findById(req.params.id);
  if (!pkg) return next(new AppError('Service package not found', 404));

  res.status(200).json({
    status: 'success',
    data: { package: pkg }
  });
});

exports.createPackage = catchAsync(async (req, res) => {
  const { name, description, price, includedItems } = req.body;
  const pkg = await ServicePackage.create({ name, description, price, includedItems });

  res.status(201).json({
    status: 'success',
    data: { package: pkg }
  });
});

exports.updatePackage = catchAsync(async (req, res, next) => {
  const { name, description, price, includedItems, isActive } = req.body;
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (price !== undefined) updateData.price = price;
  if (includedItems !== undefined) updateData.includedItems = includedItems;
  if (isActive !== undefined) updateData.isActive = isActive;

  const pkg = await ServicePackage.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  });
  if (!pkg) return next(new AppError('Service package not found', 404));

  res.status(200).json({
    status: 'success',
    data: { package: pkg }
  });
});

exports.deletePackage = catchAsync(async (req, res, next) => {
  const pkg = await ServicePackage.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!pkg) return next(new AppError('Service package not found', 404));

  res.status(204).json({ status: 'success', data: null });
});
