const Media = require('../models/Media');
const s3Service = require('../services/s3Service');
const emailService = require('../services/emailService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const multer = require('multer');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Multer middleware
exports.uploadMedia = upload.single('file');

// Upload a file to S3 and create a media record
exports.createMedia = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload a file', 400));
  }
  
  // Upload to S3
  const uploadResult = await s3Service.uploadFile(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype
  );
  
  // Create media record
  const newMedia = await Media.create({
    workOrder: req.body.workOrder,
    vehicle: req.body.vehicle,
    customer: req.body.customer,
    type: req.body.type,
    fileUrl: uploadResult.fileUrl,
    s3Key: uploadResult.key,
    fileName: req.file.originalname,
    fileType: req.file.mimetype,
    fileSize: req.file.size,
    notes: req.body.notes,
    uploadedBy: req.body.uploadedBy || 'System'
  });
  
  res.status(201).json({
    status: 'success',
    data: {
      media: newMedia
    }
  });
});

// Get all media
exports.getAllMedia = catchAsync(async (req, res, next) => {
  const { workOrder, vehicle, customer, type } = req.query;
  
  // Build query based on filters
  const query = {};
  
  if (workOrder) query.workOrder = workOrder;
  if (vehicle) query.vehicle = vehicle;
  if (customer) query.customer = customer;
  if (type) query.type = type;
  
  const media = await Media.find(query);
  
  res.status(200).json({
    status: 'success',
    results: media.length,
    data: {
      media
    }
  });
});

// Get a single media item
exports.getMedia = catchAsync(async (req, res, next) => {
  const media = await Media.findById(req.params.id);
  
  if (!media) {
    return next(new AppError('No media found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      media
    }
  });
});

// Delete media
exports.deleteMedia = catchAsync(async (req, res, next) => {
  const media = await Media.findById(req.params.id);
  
  if (!media) {
    return next(new AppError('No media found with that ID', 404));
  }
  
  // Use the stored S3 key or extract from URL as fallback
  let key = media.s3Key;
  
  if (!key && media.fileUrl) {
    // Fallback: extract key from URL for older records
    const urlParts = media.fileUrl.split('/');
    if (urlParts.length > 0) {
      key = urlParts[urlParts.length - 1];
    }
  }
  
  if (!key) {
    // If no key available, just delete the database record
    await Media.findByIdAndDelete(req.params.id);
    
    return res.status(204).json({
      status: 'success',
      data: null
    });
  }
  
  try {
    // Delete from S3
    await s3Service.deleteFile(key);
    
    // Delete from database
    await Media.findByIdAndDelete(req.params.id);
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    console.error('Error deleting media file:', err);
    return next(new AppError('Failed to delete media file from storage', 500));
  }
});

// Get a signed URL for a media item
exports.getSignedUrl = catchAsync(async (req, res, next) => {
  const media = await Media.findById(req.params.id);
  
  if (!media) {
    return next(new AppError('No media found with that ID', 404));
  }
  
  // Use the stored S3 key or extract from URL as fallback
  let key = media.s3Key;
  
  if (!key && media.fileUrl) {
    // Fallback: extract key from URL for older records
    const urlParts = media.fileUrl.split('/');
    if (urlParts.length > 0) {
      key = urlParts[urlParts.length - 1];
    }
  }
  
  if (!key) {
    return next(new AppError('Media file key is missing', 400));
  }
  
  // Get a signed URL with error handling
  try {
    const signedUrl = await s3Service.getSignedUrl(key, 3600); // 1 hour expiration
    
    res.status(200).json({
      status: 'success',
      data: {
        signedUrl,
        expiresIn: 3600
      }
    });
  } catch (err) {
    console.error('Error generating signed URL:', err);
    return next(new AppError('Failed to generate signed URL for media file', 500));
  }
});

// Get attachment counts for multiple work orders in a single call (batch endpoint)
exports.getBatchAttachmentCounts = catchAsync(async (req, res, next) => {
  const { workOrderIds } = req.body;

  if (!workOrderIds || !Array.isArray(workOrderIds)) {
    return next(new AppError('Please provide workOrderIds array', 400));
  }

  // Limit to 100 work orders per request to prevent abuse
  if (workOrderIds.length > 100) {
    return next(new AppError('Maximum 100 work orders per request', 400));
  }

  // Use aggregation for efficient counting
  const counts = await Media.aggregate([
    { $match: { workOrder: { $in: workOrderIds.map(id => require('mongoose').Types.ObjectId.createFromHexString(id)) } } },
    { $group: { _id: '$workOrder', count: { $sum: 1 } } }
  ]);

  // Convert to object keyed by workOrder ID
  const countMap = {};
  workOrderIds.forEach(id => {
    countMap[id] = 0; // Initialize all to 0
  });
  counts.forEach(item => {
    countMap[item._id.toString()] = item.count;
  });

  res.status(200).json({
    status: 'success',
    data: {
      counts: countMap
    }
  });
});

// Share media with a customer via email
exports.shareMediaViaEmail = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  
  if (!email) {
    return next(new AppError('Please provide an email address', 400));
  }
  
  const media = await Media.findById(req.params.id);
  
  if (!media) {
    return next(new AppError('No media found with that ID', 404));
  }
  
  // Use the stored S3 key or extract from URL as fallback
  let key = media.s3Key;
  
  if (!key && media.fileUrl) {
    // Fallback: extract key from URL for older records
    const urlParts = media.fileUrl.split('/');
    if (urlParts.length > 0) {
      key = urlParts[urlParts.length - 1];
    }
  }
  
  if (!key) {
    return next(new AppError('Media file key is missing', 400));
  }
  
  // Get a signed URL with longer expiration (24 hours) and error handling
  let signedUrl;
  try {
    signedUrl = await s3Service.getSignedUrl(key, 86400);
  } catch (err) {
    console.error('Error generating signed URL for sharing:', err);
    return next(new AppError('Failed to generate signed URL for sharing', 500));
  }
  
  // Create a sharingLink object similar to what the model method would return
  const sharingLink = {
    url: signedUrl,
    expiresAt: new Date(Date.now() + 86400 * 1000)
  };
  
  // Update the media record
  media.isShared = true;
  media.sharedWith.push({
    email,
    sharedAt: new Date()
  });
  
  await media.save();
  
  // Send the email
  // Note: In a real application, you would need to fetch the customer and vehicle details
  // Here we're just using placeholder data
  await emailService.shareMedia(
    media,
    { name: 'Customer' }, // This should be the actual customer
    { year: '2023', make: 'Unknown', model: 'Unknown' }, // This should be the actual vehicle
    sharingLink
  );
  
  res.status(200).json({
    status: 'success',
    message: 'Media shared successfully',
    data: {
      media
    }
  });
});
