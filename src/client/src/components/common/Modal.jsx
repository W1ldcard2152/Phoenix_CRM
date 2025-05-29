import React from 'react';
import Button from './Button'; // Assuming Button component is available

const Modal = ({ isOpen, onClose, title, children, actions }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
      <div className="relative p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="text-center">
          {title && <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">{title}</h3>}
          <div className="mt-2 px-7 py-3">
            {children}
          </div>
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
        </div>
      </div>
    </div>
  );
};

export default Modal;
