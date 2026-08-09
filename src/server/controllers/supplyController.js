const multer = require('multer');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const supplyService = require('../services/supplyService');
const { imageFilter } = require('../utils/uploadFilters');

// Photos arrive either as a picked file or as a pasted clipboard blob; both are
// plain multipart uploads by the time they reach here.
exports.photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter
}).single('photo');

/**
 * Shop supplies (new module). Lives beside inventoryController, which is
 * untouched and still serves /api/inventory.
 *
 * Every query lives in supplyService — see the note at the top of that file for
 * why. This layer only translates HTTP to service calls and back.
 */

/**
 * SupplyError carries structured details (which items would be orphaned, how
 * many children a tag has) that the UI needs to write a useful message.
 *
 * The global error handler deliberately strips everything but `message` in
 * production, which is the right default for unexpected errors but loses the
 * payload here. Rather than widen that shared middleware, these known-shape
 * errors are answered directly.
 */
const handleSupplyError = (err, res, next) => {
  if (!err || !err.isSupplyError) return next(err);
  return res.status(err.statusCode).json({
    status: `${err.statusCode}`.startsWith('4') ? 'fail' : 'error',
    message: err.message,
    ...(err.details || {})
  });
};

const run = (handler) => catchAsync(async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    handleSupplyError(err, res, next);
  }
});

// ───────────────────────────────── Supplies ─────────────────────────────────

exports.getAllSupplies = run(async (req, res) => {
  const [supplies, untaggedCount] = await Promise.all([
    supplyService.listSupplies(req.query),
    supplyService.countUntagged()
  ]);

  res.status(200).json({
    status: 'success',
    results: supplies.length,
    data: { supplies, untaggedCount }
  });
});

exports.getSupply = run(async (req, res, next) => {
  const supply = await supplyService.getSupply(req.params.id);
  if (!supply) return next(new AppError('No supply found with that ID', 404));

  const movements = await supplyService.getMovements(req.params.id);
  res.status(200).json({ status: 'success', data: { supply, movements } });
});

exports.createSupply = run(async (req, res) => {
  const supply = await supplyService.createSupply(req.body, req.user._id);
  res.status(201).json({ status: 'success', data: { supply } });
});

exports.updateSupply = run(async (req, res, next) => {
  const supply = await supplyService.updateSupply(req.params.id, req.body);
  if (!supply) return next(new AppError('No supply found with that ID', 404));
  res.status(200).json({ status: 'success', data: { supply } });
});

exports.deleteSupply = run(async (req, res, next) => {
  const supply = await supplyService.deleteSupply(req.params.id);
  if (!supply) return next(new AppError('No supply found with that ID', 404));
  res.status(204).json({ status: 'success', data: null });
});

exports.adjustQuantity = run(async (req, res, next) => {
  const supply = await supplyService.adjustQuantity(req.params.id, req.body, req.user._id);
  if (!supply) return next(new AppError('No supply found with that ID', 404));
  res.status(200).json({ status: 'success', data: { supply } });
});

exports.uploadPhoto = run(async (req, res, next) => {
  if (!req.file) return next(new AppError('Please provide an image', 400));

  const supply = await supplyService.setPhoto(req.params.id, req.file);
  if (!supply) return next(new AppError('No supply found with that ID', 404));
  res.status(200).json({ status: 'success', data: { supply } });
});

/**
 * Stream the photo back same-origin rather than handing out a presigned S3 URL.
 *
 * The client talks to /api through a proxy, so an <img src="/api/supplies/:id/photo">
 * carries the auth cookie automatically — which a cross-origin S3 URL could not
 * do — and the src never expires, so a page left open overnight still renders.
 * Mirrors the company-logo route, except this one stays behind `protect`.
 */
exports.getPhoto = run(async (req, res, next) => {
  const file = await supplyService.getPhotoStream(req.params.id);
  if (!file || !file.body) return next(new AppError('No photo for that supply', 404));

  res.set('Content-Type', file.contentType || 'image/png');
  if (file.contentLength) res.set('Content-Length', String(file.contentLength));
  // Private: it's behind auth, so let the browser cache it but not any shared proxy.
  res.set('Cache-Control', 'private, max-age=86400');
  file.body.pipe(res);
});

exports.deletePhoto = run(async (req, res, next) => {
  const supply = await supplyService.clearPhoto(req.params.id);
  if (!supply) return next(new AppError('No supply found with that ID', 404));
  res.status(200).json({ status: 'success', data: { supply } });
});

exports.bulkUpdate = run(async (req, res) => {
  const result = await supplyService.bulkUpdate(req.body);
  res.status(200).json({ status: 'success', data: result });
});

exports.getShoppingList = run(async (req, res) => {
  const supplies = await supplyService.getShoppingList();
  res.status(200).json({ status: 'success', results: supplies.length, data: { supplies } });
});

// ─────────────────────────────────── Tags ───────────────────────────────────

exports.getTags = run(async (req, res) => {
  const [tags, usage] = await Promise.all([
    supplyService.listTags(),
    supplyService.getTagUsage()
  ]);
  res.status(200).json({ status: 'success', results: tags.length, data: { tags, usage } });
});

exports.createTag = run(async (req, res) => {
  const tag = await supplyService.createTag(req.body);
  res.status(201).json({ status: 'success', data: { tag } });
});

exports.updateTag = run(async (req, res, next) => {
  const tag = await supplyService.updateTag(req.params.id, req.body);
  if (!tag) return next(new AppError('No tag found with that ID', 404));
  res.status(200).json({ status: 'success', data: { tag } });
});

exports.deleteTag = run(async (req, res, next) => {
  const tag = await supplyService.deleteTag(req.params.id);
  if (!tag) return next(new AppError('No tag found with that ID', 404));
  res.status(204).json({ status: 'success', data: null });
});

// ────────────────────────────────── Vocab ──────────────────────────────────

exports.getVocab = run(async (req, res) => {
  const vocab = await supplyService.listVocab();
  res.status(200).json({ status: 'success', results: vocab.length, data: { vocab } });
});

exports.createVocab = run(async (req, res) => {
  const entry = await supplyService.createVocab(req.body);
  res.status(201).json({ status: 'success', data: { entry } });
});

exports.updateVocab = run(async (req, res, next) => {
  const entry = await supplyService.updateVocab(req.params.id, req.body);
  if (!entry) return next(new AppError('No vocabulary entry found with that ID', 404));
  res.status(200).json({ status: 'success', data: { entry } });
});

exports.deleteVocab = run(async (req, res, next) => {
  const entry = await supplyService.deleteVocab(req.params.id);
  if (!entry) return next(new AppError('No vocabulary entry found with that ID', 404));
  res.status(204).json({ status: 'success', data: null });
});
