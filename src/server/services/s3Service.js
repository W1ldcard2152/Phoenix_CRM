const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: getPresignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

// Validate required environment variables
const region = process.env.AWS_REGION;
const bucketName = process.env.S3_BUCKET_NAME;

if (!region || !/^[a-z]{2}-[a-z]+-\d{1}$/.test(region)) {
  console.warn('AWS_REGION is not set or invalid. S3 operations will be disabled.');
}

// Configure AWS SDK v3 client
const s3Client = region ? new S3Client({
  region: region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
}) : null;

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - The file data
 * @param {String} fileName - Original file name
 * @param {String} mimeType - File MIME type
 * @param {String} acl - Optional ACL setting (default: 'private', can be 'public-read')
 * @returns {Promise<Object>} Upload result with file URL
 */
exports.uploadFile = async (fileBuffer, fileName, mimeType, acl = 'private') => {
  if (!s3Client) {
    console.warn('S3 service is not configured. File upload skipped.');
    return { fileUrl: null, key: null };
  }

  // Generate a unique file name to prevent conflicts
  const uniqueFileName = `${uuidv4()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: uniqueFileName,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: acl
  });

  await s3Client.send(command);

  // Construct the file URL
  const fileUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${uniqueFileName}`;

  return {
    fileUrl: fileUrl,
    key: uniqueFileName
  };
};

/**
 * Generate a signed URL for temporary access to a private file
 * @param {String} key - S3 object key
 * @param {Number} expiresIn - URL expiration time in seconds (default: 3600 seconds = 1 hour)
 * @returns {Promise<String>} Signed URL
 */
exports.getSignedUrl = async (key, expiresIn = 3600) => {
  if (!s3Client) {
    console.warn('S3 service is not configured. Cannot generate signed URL.');
    return null;
  }

  try {
    if (!key) {
      throw new Error('S3 key is required to generate a signed URL');
    }

    // Decode the key if it's URL encoded (for backwards compatibility)
    const decodedKey = decodeURIComponent(key);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: decodedKey
    });

    return await getPresignedUrl(s3Client, command, { expiresIn });
  } catch (err) {
    console.error('Error generating signed URL:', err);
    throw new Error(`Failed to generate signed URL: ${err.message}`);
  }
};

/**
 * Delete a file from S3
 * @param {String} key - S3 object key
 * @returns {Promise} Delete result
 */
exports.deleteFile = async (key) => {
  if (!s3Client) {
    console.warn('S3 service is not configured. File deletion skipped.');
    return Promise.resolve();
  }

  // Decode the key if it's URL encoded (for backwards compatibility)
  const decodedKey = decodeURIComponent(key);

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: decodedKey
  });

  return s3Client.send(command);
};

/**
 * Copy a file within S3
 * @param {String} sourceKey - Source S3 object key
 * @param {String} destinationKey - Destination S3 object key
 * @returns {Promise} Copy result
 */
exports.copyFile = async (sourceKey, destinationKey) => {
  if (!s3Client) {
    console.warn('S3 service is not configured. File copy skipped.');
    return Promise.resolve();
  }

  const command = new CopyObjectCommand({
    Bucket: bucketName,
    CopySource: `${bucketName}/${sourceKey}`,
    Key: destinationKey
  });

  return s3Client.send(command);
};
