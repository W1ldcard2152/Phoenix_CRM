import React from 'react';
import { formatCurrency } from '../../utils/formatters';

const PartRemovalModal = ({ isOpen, onClose, onConfirm, part }) => {
  if (!isOpen || !part) return null;

  // Restock option applies whenever stock was actually deducted: the part is linked to
  // an inventory item AND is not an uncommitted draft. (Treats pre-migration parts
  // without a `committed` field as committed, since stock was deducted at add-time.)
  const canRestock = !!part.inventoryItemId && part.committed !== false;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-40" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 bg-red-50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-red-900">
                <i className="fas fa-trash-alt mr-2 text-red-600"></i>
                Remove Part
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Part Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{part.name}</div>
                  {part.partNumber && (
                    <div className="text-xs text-gray-500 mt-0.5">PN: {part.partNumber}</div>
                  )}
                  <div className="text-sm text-gray-600 mt-1">
                    Qty {part.quantity} · {formatCurrency(part.price)} each
                  </div>
                </div>
                <div className="font-bold text-gray-700 ml-3">
                  {formatCurrency((part.price || 0) * (part.quantity || 0))}
                </div>
              </div>
            </div>

            {canRestock ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-2">
                <div className="flex items-start space-x-3">
                  <i className="fas fa-info-circle text-blue-600 mt-0.5"></i>
                  <div className="flex-1 text-sm text-blue-800">
                    <p className="font-medium mb-1">This part has been pulled from inventory.</p>
                    <p>
                      You can restock it back to inventory, or remove it without affecting stock levels.
                    </p>
                  </div>
                </div>
              </div>
            ) : part.inventoryItemId ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-2">
                <div className="flex items-start space-x-3">
                  <i className="fas fa-info-circle text-yellow-600 mt-0.5"></i>
                  <div className="flex-1 text-sm text-yellow-800">
                    <p>This part has not been pulled from inventory, so no stock will be affected.</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 bg-gray-50">
            {canRestock ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onConfirm(true)}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700"
                >
                  <i className="fas fa-undo mr-2"></i>
                  Remove &amp; Restock
                </button>
                <button
                  onClick={() => onConfirm(false)}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
                >
                  <i className="fas fa-trash mr-2"></i>
                  Remove &amp; Don't Restock
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onConfirm(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
                >
                  <i className="fas fa-trash mr-2"></i>
                  Remove Part
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartRemovalModal;
