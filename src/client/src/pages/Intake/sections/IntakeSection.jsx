import React from 'react';

const IntakeSection = ({ title, icon, stepNumber, isLocked, isSaved, isExpanded, onToggle, summary, error, children }) => {
  const handleHeaderClick = () => {
    if (!isLocked) {
      onToggle();
    }
  };

  return (
    <div className={`rounded-lg border transition-all duration-200 ${
      isLocked
        ? 'border-gray-200 bg-gray-50 opacity-60'
        : isSaved
          ? 'border-green-200 bg-white shadow-sm'
          : isExpanded
            ? 'border-primary-300 bg-white shadow-md'
            : 'border-gray-200 bg-white shadow-sm'
    }`}>
      {/* Header */}
      <div
        onClick={handleHeaderClick}
        className={`flex items-center justify-between px-5 py-4 ${
          isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
        } ${!isLocked && !isExpanded ? 'hover:bg-gray-50' : ''} transition-colors duration-150`}
      >
        <div className="flex items-center space-x-3">
          {/* Step indicator */}
          {isLocked ? (
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gray-200 text-gray-400">
              <i className="fas fa-lock text-xs"></i>
            </div>
          ) : isSaved ? (
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-500 text-white">
              <i className="fas fa-check text-sm"></i>
            </div>
          ) : (
            <div className={`flex items-center justify-center h-8 w-8 rounded-full text-white text-sm font-semibold ${
              isExpanded ? 'bg-primary-600' : 'bg-gray-400'
            }`}>
              {stepNumber}
            </div>
          )}

          {/* Title and icon */}
          <div className="flex items-center space-x-2">
            <i className={`${icon} ${
              isLocked ? 'text-gray-400' : isSaved ? 'text-green-600' : isExpanded ? 'text-primary-600' : 'text-gray-500'
            }`}></i>
            <h3 className={`font-semibold ${
              isLocked ? 'text-gray-400' : isSaved ? 'text-green-800' : 'text-gray-900'
            }`}>
              {title}
            </h3>
          </div>
        </div>

        {/* Summary or expand indicator */}
        <div className="flex items-center space-x-2">
          {isSaved && summary && !isExpanded && (
            <span className="text-sm text-gray-600 mr-2">{summary}</span>
          )}
          {!isLocked && (
            <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-gray-400 text-sm`}></i>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
          <i className="fas fa-exclamation-circle mr-2"></i>
          {error}
        </div>
      )}

      {/* Content */}
      {isExpanded && !isLocked && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          {children}
        </div>
      )}
    </div>
  );
};

export default IntakeSection;
