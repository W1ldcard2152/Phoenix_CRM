import React, { useState } from 'react';
import aiService from '../../services/aiService';

/**
 * Inline button placed next to URL fields that extracts product details via AI.
 * Props:
 *   url       - current URL value from the form
 *   onExtracted(data) - callback with extracted fields { name, partNumber, price, cost, vendor, brand, warranty }
 *   disabled  - optional, disable the button externally
 */
const UrlExtractButton = ({ url, onExtracted, disabled }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isValidUrl = (str) => {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  const handleExtract = async () => {
    if (!url || !isValidUrl(url)) return;

    setLoading(true);
    setError(null);

    try {
      const response = await aiService.extractFromUrl(url);
      if (response.data) {
        onExtracted(response.data);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Extraction failed';
      setError(msg);
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = disabled || loading || !url || !isValidUrl(url);

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={handleExtract}
        disabled={isDisabled}
        title={isDisabled ? 'Enter a valid URL first' : 'Auto-fill fields from URL using AI'}
        className={`ml-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
          isDisabled
            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
            : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:border-purple-300'
        }`}
      >
        {loading ? (
          <>
            <i className="fas fa-spinner fa-spin text-sm" />
            <span className="hidden sm:inline">Extracting...</span>
          </>
        ) : (
          <>
            <i className="fas fa-wand-magic-sparkles text-sm" />
            <span className="hidden sm:inline">Auto-fill</span>
          </>
        )}
      </button>
      {error && (
        <div className="absolute top-full right-0 mt-1 px-2 py-1 bg-red-100 text-red-700 text-xs rounded shadow-sm whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
};

export default UrlExtractButton;
