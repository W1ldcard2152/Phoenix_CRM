import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/formatters';
import InventoryService from '../../services/inventoryService';

const PartCommitModal = ({ isOpen, onClose, onConfirm, part, isLoading }) => {
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (!isOpen || !part) {
      setValidation(null);
      return;
    }

    const validateStock = async () => {
      setValidating(true);
      try {
        if (!part.inventoryItemId) {
          setValidation({
            status: 'error',
            message: 'No inventory item linked',
            needed: part.quantity,
            available: 0
          });
          return;
        }

        const response = await InventoryService.getItem(part.inventoryItemId);
        const invItem = response.data?.item;

        if (!invItem || !invItem.isActive) {
          setValidation({
            status: 'error',
            message: 'Item not found or inactive',
            needed: part.quantity,
            available: 0,
            unit: ''
          });
          return;
        }

        const hasEnough = invItem.quantityOnHand >= part.quantity;
        setValidation({
          status: hasEnough ? 'ok' : 'insufficient',
          message: hasEnough ? 'Stock available' : 'Insufficient stock',
          needed: part.quantity,
          available: invItem.quantityOnHand,
          unit: invItem.unit || '',
          inventoryItemId: invItem._id
        });
      } catch (err) {
        console.error('Error validating stock:', err);
        setValidation({
          status: 'error',
          message: 'Failed to validate stock levels',
          needed: 0,
          available: 0
        });
      } finally {
        setValidating(false);
      }
    };

    validateStock();
  }, [isOpen, part]);

  if (!isOpen) return null;

  const canCommit = validation && !validating && validation.status === 'ok';

  const getStatusColor = (status) => {
    switch (status) {
      case 'ok': return 'text-green-700 bg-green-50 border-green-200';
      case 'insufficient': return 'text-red-700 bg-red-50 border-red-200';
      case 'error': return 'text-red-700 bg-red-50 border-red-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ok': return 'fa-check-circle';
      case 'insufficient': return 'fa-exclamation-triangle';
      case 'error': return 'fa-times-circle';
      default: return 'fa-question-circle';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-40" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                <i className="fas fa-box-open mr-2 text-purple-600"></i>
                Pull from Inventory
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 min-h-0 p-5">
            {/* Part Info */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-purple-900">{part?.name}</div>
                  {part?.partNumber && (
                    <div className="text-xs text-purple-700 mt-0.5">PN: {part.partNumber}</div>
                  )}
                  <div className="text-sm text-purple-600 mt-1">
                    Quantity: {part?.quantity}
                  </div>
                </div>
                <div className="font-bold text-purple-700 text-lg">
                  {formatCurrency((part?.price || 0) * (part?.quantity || 0))}
                </div>
              </div>
            </div>

            {/* Validation Status */}
            {validating ? (
              <div className="text-center py-8">
                <i className="fas fa-spinner fa-spin text-purple-600 text-2xl mb-2"></i>
                <p className="text-gray-600">Checking inventory levels...</p>
              </div>
            ) : validation ? (
              <div className={`border rounded-lg p-3 ${getStatusColor(validation.status)}`}>
                <div className="flex items-start space-x-3 flex-1">
                  <i className={`fas ${getStatusIcon(validation.status)} mt-0.5`}></i>
                  <div className="flex-1">
                    <div className="font-medium">{part?.name}</div>
                    <div className="text-sm mt-1">
                      {validation.status === 'insufficient' ? (
                        <>
                          <span className="font-semibold">Need:</span> {validation.needed} {validation.unit} ·
                          <span className="font-semibold ml-1">Available:</span> {validation.available} {validation.unit}
                          <div className="mt-1 font-medium">
                            Short by: {validation.needed - validation.available} {validation.unit}
                          </div>
                        </>
                      ) : validation.status === 'ok' ? (
                        <>
                          <span className="font-semibold">Need:</span> {validation.needed} {validation.unit} ·
                          <span className="font-semibold ml-1">Available:</span> {validation.available} {validation.unit}
                        </>
                      ) : (
                        <span>{validation.message}</span>
                      )}
                    </div>
                  </div>
                </div>
                {validation.status === 'insufficient' && validation.inventoryItemId && (
                  <div className="mt-2 pt-2 border-t border-current border-opacity-20">
                    <a
                      href={`/inventory/${validation.inventoryItemId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline inline-flex items-center"
                    >
                      <i className="fas fa-external-link-alt mr-1"></i>
                      View in Inventory
                    </a>
                  </div>
                )}
              </div>
            ) : null}

            {/* Warning Message */}
            {validation && (validation.status === 'error' || validation.status === 'insufficient') && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <i className="fas fa-exclamation-circle text-red-600 mt-0.5"></i>
                  <div className="flex-1">
                    <div className="font-semibold text-red-900">Cannot Pull from Inventory</div>
                    <p className="text-sm text-red-700 mt-1">
                      {validation.status === 'insufficient'
                        ? 'This item has insufficient stock. Restock before pulling.'
                        : 'This item cannot be pulled from inventory. Check the inventory record.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm()}
                disabled={!canCommit || isLoading}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <><i className="fas fa-spinner fa-spin mr-1"></i>Committing...</>
                ) : (
                  <><i className="fas fa-arrow-down mr-1"></i>Confirm & Pull from Inventory</>
                )}
              </button>
            </div>
            {canCommit && (
              <p className="text-xs text-center text-gray-500 mt-2">
                Clicking confirm will deduct this part from inventory and cannot be easily undone.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartCommitModal;
