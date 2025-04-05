const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();
const bucketName = process.env.S3_BUCKET_NAME;

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - The file data
 * @param {String} fileName - Original file name
 * @param {String} mimeType - File MIME type
 * @returns {Promise<Object>} Upload result with file URL
 */
exports.uploadFile = async (fileBuffer, fileName, mimeType) => {
  // Generate a unique file name to prevent conflicts
  const uniqueFileName = `${uuidv4()}-${fileName}`;
  
  const params = {
    Bucket: bucketName,
    Key: uniqueFileName,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: 'private' // Set to 'public-read' if you want files to be publicly accessible
  };
  
  const result = await s3.upload(params).promise();
  
  return {
    fileUrl: result.Location,
    key: result.Key
  };
};

/**
 * Generate a signed URL for temporary access to a private file
 * @param {String} key - S3 object key
 * @param {Number} expiresIn - URL expiration time in seconds (default: 3600 seconds = 1 hour)
 * @returns {String} Signed URL
 */
exports.getSignedUrl = (key, expiresIn = 3600) => {
  const params = {
    Bucket: bucketName,
    Key: key,
    Expires: expiresIn
  };
  
  return s3.getSignedUrl('getObject', params);
};

/**
 * Delete a file from S3
 * @param {String} key - S3 object key
 * @returns {Promise} Delete result
 */
exports.deleteFile = async (key) => {
  const params = {
    Bucket: bucketName,
    Key: key
  };
  
  return s3.deleteObject(params).promise();
};

/**
 * Copy a file within S3
 * @param {String} sourceKey - Source S3 object key
 * @param {String} destinationKey - Destination S3 object key
 * @returns {Promise} Copy result
 */
exports.copyFile = async (sourceKey, destinationKey) => {
  const params = {
    Bucket: bucketName,
    CopySource: `${bucketName}/${sourceKey}`,
    Key: destinationKey
  };
  
  return s3.copyObject(params).promise();
};