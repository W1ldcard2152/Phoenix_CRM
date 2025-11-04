import React, { useState, useEffect } from 'react';
import Button from './Button';

const FileThumbnail = ({ file }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const loadThumbnail = async () => {
      if (!isImageFile(file.fileName)) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/media/${file._id}/signed-url`);
        const data = await response.json();
        if (data.status === 'success') {
          setThumbnailUrl(data.data.signedUrl);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Failed to load thumbnail:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadThumbnail();
  }, [file._id, file.fileName]);

  const isImageFile = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension);
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    switch (extension) {
      case 'pdf':
        return '📄';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return '🖼️';
      case 'txt':
        return '📝';
      case 'doc':
      case 'docx':
        return '📘';
      case 'xls':
      case 'xlsx':
        return '📊';
      default:
        return '📎';
    }
  };

  if (loading && isImageFile(file.fileName)) {
    return (
      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
      </div>
    );
  }

  if (thumbnailUrl && !error && isImageFile(file.fileName)) {
    return (
      <img 
        src={thumbnailUrl} 
        alt={file.fileName}
        className="w-12 h-12 object-cover rounded-lg border border-gray-200"
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center text-xl">
      {getFileIcon(file.fileName)}
    </div>
  );
};

const FileList = ({ files, onDelete, onShare, onView, loading = false }) => {
  const [sharingFile, setSharingFile] = useState(null);
  const [shareEmail, setShareEmail] = useState('');

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isImageFile = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension);
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'Pre-Inspection':
        return 'bg-blue-100 text-blue-800';
      case 'Diagnostic':
        return 'bg-yellow-100 text-yellow-800';
      case 'Parts Receipt':
        return 'bg-green-100 text-green-800';
      case 'Post-Inspection':
        return 'bg-purple-100 text-purple-800';
      case 'Customer Document':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleShare = async (fileId) => {
    if (!shareEmail) {
      alert('Please enter an email address');
      return;
    }
    
    try {
      await onShare(fileId, shareEmail);
      setSharingFile(null);
      setShareEmail('');
      alert('File shared successfully!');
    } catch (error) {
      console.error('Share failed:', error);
      alert('Failed to share file. Please try again.');
    }
  };

  const handleView = async (fileId, fileName) => {
    // If custom onView handler provided, use it (for modal viewing)
    if (onView) {
      onView(fileId, fileName);
      return;
    }

    // Otherwise, default behavior - open in new tab
    try {
      // Get signed URL for viewing
      const response = await fetch(`/api/media/${fileId}/signed-url`);
      const data = await response.json();

      if (data.status === 'success') {
        // Open all file types in new tab
        window.open(data.data.signedUrl, '_blank');
      } else {
        throw new Error('Failed to get file URL');
      }
    } catch (error) {
      console.error('View failed:', error);
      alert('Failed to view file. Please try again.');
    }
  };

  const handleDownload = async (fileId, fileName) => {
    try {
      // Get signed URL for download
      const response = await fetch(`/api/media/${fileId}/signed-url`);
      const data = await response.json();
      
      if (data.status === 'success') {
        // Force download by creating link with download attribute
        const link = document.createElement('a');
        link.href = data.data.signedUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        throw new Error('Failed to get download URL');
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download file. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        <span className="ml-2 text-gray-600">Loading files...</span>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="mt-2">No files attached</p>
        <p className="text-sm">Upload documents to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {files.map((file) => (
        <div key={file._id} className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <FileThumbnail file={file} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="font-medium text-gray-900 truncate">{file.fileName}</h4>
                  <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${getTypeColor(file.type)}`}>
                    {file.type}
                  </span>
                </div>
                <div className="text-sm text-gray-500 space-y-1">
                  <p>{formatFileSize(file.fileSize)}</p>
                  <p>Uploaded: {new Date(file.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</p>
                  {file.uploadedBy && <p>By: {file.uploadedBy}</p>}
                  {file.notes && <p className="text-gray-700 mt-1">"{file.notes}"</p>}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col space-y-2 ml-4">
              <Button
                onClick={() => handleView(file._id, file.fileName)}
                variant="outline"
                size="sm"
              >
                View
              </Button>
              <Button
                onClick={() => handleDownload(file._id, file.fileName)}
                variant="outline"
                size="sm"
              >
                Download
              </Button>
              <Button
                onClick={() => setSharingFile(file._id)}
                variant="outline"
                size="sm"
              >
                Share
              </Button>
              {onDelete && (
                <Button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete this file?')) {
                      onDelete(file._id);
                    }
                  }}
                  variant="danger"
                  size="sm"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>

          {file.isShared && file.sharedWith && file.sharedWith.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Shared with:</p>
              <div className="flex flex-wrap gap-1">
                {file.sharedWith.map((share, index) => (
                  <span key={index} className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                    {share.email}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Share Modal */}
      {sharingFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Share File</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="Enter email address..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                variant="light"
                onClick={() => {
                  setSharingFile(null);
                  setShareEmail('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleShare(sharingFile)}
                disabled={!shareEmail}
              >
                Share File
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileList;