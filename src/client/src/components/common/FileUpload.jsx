import React, { useState } from 'react';
import Button from './Button';

const FileUpload = ({ 
  onFileUpload, 
  workOrderId, 
  vehicleId, 
  customerId, 
  accept = "*/*", 
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  allowedTypes = ['Pre-Inspection', 'Diagnostic', 'Parts Receipt', 'Post-Inspection', 'Customer Document', 'Other']
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [notes, setNotes] = useState('');
  const [type, setType] = useState('Other');

  const generateThumbnail = (file) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFilePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleFileSelect = (file) => {
    if (file.size > maxFileSize) {
      alert(`File size must be less than ${Math.round(maxFileSize / 1024 / 1024)}MB`);
      return;
    }
    setSelectedFile(file);
    generateThumbnail(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('workOrder', workOrderId);
      formData.append('vehicle', vehicleId);
      formData.append('customer', customerId);
      formData.append('type', type);
      formData.append('notes', notes);
      formData.append('uploadedBy', 'User'); // You might want to get this from auth context

      await onFileUpload(formData);
      
      // Reset form
      setSelectedFile(null);
      setFilePreview(null);
      setNotes('');
      setType('Other');
      
      // Reset file input
      const fileInput = document.getElementById('file-input');
      if (fileInput) fileInput.value = '';
      
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

  return (
    <div className="space-y-4">
      {/* File Drop Zone */}
      <div
        className={`
          border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${dragOver 
            ? 'border-primary-500 bg-primary-50' 
            : 'border-gray-300 hover:border-gray-400'
          }
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          id="file-input"
          type="file"
          className="hidden"
          onChange={handleFileInputChange}
          accept={accept}
        />
        
        {selectedFile ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center space-x-3">
              {filePreview ? (
                <img 
                  src={filePreview} 
                  alt="File preview" 
                  className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                />
              ) : (
                <span className="text-2xl">{getFileIcon(selectedFile.name)}</span>
              )}
              <div className="text-left">
                <p className="font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedFile(null);
                setFilePreview(null);
                document.getElementById('file-input').value = '';
              }}
            >
              Remove File
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-medium text-gray-900">Drop files here, or</p>
              <Button
                variant="outline"
                onClick={() => document.getElementById('file-input').click()}
              >
                Browse Files
              </Button>
            </div>
            <p className="text-sm text-gray-500">
              Maximum file size: {Math.round(maxFileSize / 1024 / 1024)}MB
            </p>
          </div>
        )}
      </div>

      {/* File Details Form */}
      {selectedFile && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            >
              {allowedTypes.map((typeOption) => (
                <option key={typeOption} value={typeOption}>
                  {typeOption}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a description..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
      )}

      {/* Upload Button */}
      {selectedFile && (
        <div className="flex justify-end">
          <Button
            onClick={handleUpload}
            disabled={uploading}
            variant="primary"
          >
            {uploading ? 'Uploading...' : 'Upload Document'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default FileUpload;