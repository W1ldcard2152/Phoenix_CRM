import React, { useState } from 'react';

const ResponsiveTable = ({ 
  children, 
  className = '',
  mobileBreakpoint = 'md' // 'sm', 'md', 'lg'
}) => {
  return (
    <div className="w-full">
      {/* Desktop Table */}
      <div className={`hidden ${mobileBreakpoint}:block overflow-x-auto`}>
        <div className="min-w-full inline-block align-middle">
          <div className="border border-gray-200 rounded-lg shadow overflow-hidden">
            <table className={`min-w-full divide-y divide-gray-200 ${className}`}>
              {children}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// Mobile Card Component for replacing table rows
export const MobileCard = ({ 
  children, 
  className = '',
  onClick,
  ...props 
}) => {
  return (
    <div 
      className={`bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
};

// Mobile Section Component for organizing card content
export const MobileSection = ({ 
  label, 
  children, 
  className = '' 
}) => {
  return (
    <div className={`mb-3 last:mb-0 ${className}`}>
      {label && (
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
          {label}
        </div>
      )}
      <div className="text-sm text-gray-900">
        {children}
      </div>
    </div>
  );
};

// Mobile Container for cards
export const MobileContainer = ({ 
  children, 
  className = '',
  mobileBreakpoint = 'md'
}) => {
  return (
    <div className={`block ${mobileBreakpoint}:hidden space-y-3 ${className}`}>
      {children}
    </div>
  );
};

export default ResponsiveTable;