import React, { useState, useRef } from 'react';
import Button from '../common/Button';
import Card from '../common/Card';

const RegistrationScanner = ({ onDataExtracted, onError }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      processRegistrationImage(file);
    }
  };

  const handleCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Create video element to capture frame
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      // Wait for video to be ready
      video.addEventListener('loadedmetadata', () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Stop the camera stream
        stream.getTracks().forEach(track => track.stop());
        
        // Convert canvas to blob and process
        canvas.toBlob((blob) => {
          processRegistrationImage(blob);
        }, 'image/jpeg', 0.8);
      });
    } catch (error) {
      console.error('Camera access error:', error);
      onError?.('Unable to access camera. Please try uploading an image instead.');
    }
  };

  const processRegistrationImage = async (imageFile) => {
    if (!imageFile) return;

    setIsScanning(true);
    setScanResult(null);

    try {
      console.log('Processing image:', {
        name: imageFile.name,
        size: imageFile.size,
        type: imageFile.type,
        userAgent: navigator.userAgent
      });

      // Create preview
      const imageUrl = URL.createObjectURL(imageFile);
      setPreviewImage(imageUrl);

      // Check file size before sending
      if (imageFile.size > 10 * 1024 * 1024) {
        throw new Error('Image file is too large. Please use an image smaller than 10MB.');
      }

      // For mobile, compress image if it's very large
      let fileToUpload = imageFile;
      if (imageFile.size > 5 * 1024 * 1024) {
        console.log('Compressing large image for mobile...');
        fileToUpload = await compressImage(imageFile);
      }

      // Prepare form data for API call
      const formData = new FormData();
      formData.append('registration', fileToUpload);

      console.log('Sending request to server...');

      // Call backend API to process with OpenAI
      const response = await fetch('/api/registration/scan', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      console.log('Server response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error response:', errorText);
        throw new Error(`Server error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      console.log('Server response:', result);

      if (result.success) {
        setScanResult(result.data);
        
        // Call parent callback with extracted data
        onDataExtracted?.(result.data);
      } else {
        throw new Error(result.error || 'Failed to scan registration');
      }

    } catch (error) {
      console.error('Registration scan error:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to scan registration. Please try again.';
      
      if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message.includes('too large')) {
        errorMessage = error.message;
      } else if (error.message.includes('Server error')) {
        errorMessage = 'Server error. Please try again or contact support.';
      }
      
      onError?.(errorMessage);
    } finally {
      setIsScanning(false);
    }
  };

  // Helper function to compress images for mobile
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions (max 1920px width)
        const maxWidth = 1920;
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          console.log('Image compressed:', {
            originalSize: file.size,
            compressedSize: compressedFile.size,
            ratio: (compressedFile.size / file.size).toFixed(2)
          });
          resolve(compressedFile);
        }, 'image/jpeg', 0.8);
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  const clearResults = () => {
    setPreviewImage(null);
    setScanResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="bg-blue-50 border-blue-200">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            Registration Scanner
          </h3>
          <div className="text-sm text-gray-600">
            📱 Scan registration to auto-fill vehicle info
          </div>
        </div>

        <div className="text-sm text-gray-700">
          Take a photo or upload an image of the vehicle registration to automatically extract the VIN, license plate, and license plate state.
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={handleCameraCapture}
            disabled={isScanning}
            variant="primary"
            size="sm"
            className="flex items-center"
          >
            📷 Take Photo
          </Button>
          
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            variant="secondary"
            size="sm"
            className="flex items-center"
          >
            📁 Upload Image
          </Button>

          {(previewImage || scanResult) && (
            <Button
              type="button"
              onClick={clearResults}
              disabled={isScanning}
              variant="light"
              size="sm"
            >
              Clear
            </Button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Loading State */}
        {isScanning && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center space-x-3">
              <svg className="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-blue-600 font-medium">Scanning registration...</span>
            </div>
          </div>
        )}

        {/* Preview Image */}
        {previewImage && !isScanning && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700">Scanned Image:</div>
            <img
              src={previewImage}
              alt="Registration preview"
              className="max-w-full h-auto max-h-64 rounded border border-gray-300 shadow-sm"
            />
          </div>
        )}

        {/* Scan Results */}
        {scanResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <h4 className="text-sm font-medium text-green-800">
                Registration Scanned Successfully!
              </h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {scanResult.vin && (
                <div>
                  <span className="font-medium text-gray-700">VIN:</span>
                  <div className="font-mono text-gray-900 bg-white px-2 py-1 rounded border">
                    {scanResult.vin}
                  </div>
                </div>
              )}
              
              {scanResult.licensePlate && (
                <div>
                  <span className="font-medium text-gray-700">License Plate:</span>
                  <div className="font-mono text-gray-900 bg-white px-2 py-1 rounded border">
                    {scanResult.licensePlate}
                  </div>
                </div>
              )}
              
              {scanResult.licensePlateState && (
                <div>
                  <span className="font-medium text-gray-700">License Plate State:</span>
                  <div className="text-gray-900">{scanResult.licensePlateState}</div>
                </div>
              )}
            </div>

            {scanResult.confidence && (
              <div className="mt-3 text-xs text-gray-600">
                Confidence: {Math.round(scanResult.confidence * 100)}%
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default RegistrationScanner;