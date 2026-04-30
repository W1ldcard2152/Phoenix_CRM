import React from 'react';
import { formatCurrency } from '../../utils/formatters';

const UncommittedServicesWarningModal = ({
  isOpen,
  onClose,
  uncommittedPackages = [],
  onProceedAnyway,
  onCommitPackage
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-40" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 bg-yellow-50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-yellow-900">
                <i className="fas fa-exclamation-triangle mr-2 text-yellow-600"></i>
                Uncommitted Services Found
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 min-h-0 p-5">
            {/* Warning Message */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-start space-x-3">
                <i className="fas fa-info-circle text-yellow-600 mt-0.5 text-lg"></i>
                <div className="flex-1">
                  <div className="font-semibold text-yellow-900 mb-1">
                    Service packages not pulled from inventory
                  </div>
                  <p className="text-sm text-yellow-800">
                    The following service packages have been added to this work order but have NOT been pulled from inventory yet.
                    They will NOT appear on the invoice until they are committed.
                  </p>
                </div>
              </div>
            </div>

            {/* List of Uncommitted Packages */}
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-900 text-sm mb-3">
                Uncommitted Services ({uncommittedPackages.length}):
              </h4>
              {uncommittedPackages.map((pkg, idx) => (
                <div
                  key={idx}
                  className="border-2 border-dashed border-yellow-300 bg-yellow-50/30 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{pkg.name}</div>
                      {pkg.includedItems && pkg.includedItems.length > 0 && (
                        <div className="text-sm text-gray-600 mt-1">
                          Includes: {pkg.includedItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-gray-700 text-lg ml-3">
                      {formatCurrency(pkg.price)}
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => onCommitPackage(pkg.packageIndex)}
                    className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-colors"
                  >
                    <i className="fas fa-arrow-down mr-2"></i>
                    Pull from Inventory Now
                  </button>
                </div>
              ))}
            </div>

            {/* Info Box */}
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <i className="fas fa-lightbulb text-blue-600 mt-0.5"></i>
                <div className="flex-1 text-sm text-blue-800">
                  <p className="font-medium mb-1">What does "Pull from Inventory" do?</p>
                  <p>
                    It deducts the service package's inventory items from stock and marks the service as committed.
                    Only committed services appear on invoices and affect inventory levels.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={onProceedAnyway}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-yellow-600 hover:bg-yellow-700"
              >
                <i className="fas fa-file-invoice mr-2"></i>
                Generate Invoice Without These Services
              </button>
            </div>
            <p className="text-xs text-center text-gray-500 mt-2">
              Uncommitted services will not be billed on this invoice
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UncommittedServicesWarningModal;
