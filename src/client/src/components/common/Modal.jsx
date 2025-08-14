import React from 'react';
import Button from './Button'; // Assuming Button component is available

const Modal = ({ isOpen, onClose, title, children, actions, size = 'md' }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'w-96',
    md: 'w-96',
    lg: 'w-[800px] max-w-4xl',
    xl: 'w-[1000px] max-w-6xl'
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center p-4">
      <div className={`relative p-5 border ${sizeClasses[size]} shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto`}>
        <div className="text-left">
          {title && <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">{title}</h3>}
          <div className="mt-2 px-7 py-3">
            {children}
          </div>
          {actions && actions.length > 0 && (
            <div className="mt-4 flex justify-end space-x-3">
              {actions.map((action, index) => (
                <Button
                  key={index}
                  type="button"
                  variant={action.variant || 'light'}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;
