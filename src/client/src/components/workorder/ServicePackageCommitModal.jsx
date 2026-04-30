import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/formatters';
import InventoryService from '../../services/inventoryService';

const ServicePackageCommitModal = ({ isOpen, onClose, onConfirm, servicePackage, isLoading }) => {
  const [stockValidation, setStockValidation] = useState(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (!isOpen || !servicePackage) {
      setStockValidation(null);
      return;
    }

    const validateStock = async () => {
      setValidating(true);
      try {
        const validationResults = [];

        for (const item of servicePackage.includedItems || []) {
          if (item.inventoryItemId) {
            const response = await InventoryService.getItem(item.inventoryItemId);
            const invItem = response.data?.item;

            if (!invItem || !invItem.isActive) {
              validationResults.push({
                name: item.name,
                status: 'error',
                message: 'Item not found or inactive',
                needed: item.quantity,
                available: 0,
                unit: item.unit || ''
              });
            } else {
              const hasEnough = invItem.quantityOnHand >= item.quantity;
              validationResults.push({
                name: item.name,
                status: hasEnough ? 'ok' : 'insufficient',
                message: hasEnough ? 'Stock available' : 'Insufficient stock',
                needed: item.quantity,
                available: invItem.quantityOnHand,
                unit: invItem.unit || '',
                inventoryItemId: invItem._id
              });
            }
          } else {
            validationResults.push({
              name: item.name,
              status: 'warning',
              message: 'No inventory item linked',
              needed: item.quantity,
              available: 'N/A',
              unit: item.unit || ''
            });
          }
        }

        setStockValidation(validationResults);
      } catch (err) {
        console.error('Error validating stock:', err);
        setStockValidation([{
          name: 'Validation Error',
          status: 'error',
          message: 'Failed to validate stock levels',
          needed: 0,
          available: 0
        }]);
      } finally {
        setValidating(false);
      }
    };

    validateStock();
  }, [isOpen, servicePackage]);

  if (!isOpen) return null;

  const hasErrors = stockValidation?.some(item => item.status === 'error' || item.status === 'insufficient');
  const canCommit = stockValidation && !validating && !stockValidation.some(item => item.status === 'error' || item.status === 'insufficient');

  const getStatusColor = (status) => {
    switch (status) {
      case 'ok': return 'text-green-700 bg-green-50 border-green-200';
      case 'insufficient': return 'text-red-700 bg-red-50 border-red-200';
      case 'error': return 'text-red-700 bg-red-50 border-red-200';
      case 'warning': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ok': return 'fa-check-circle';
      case 'insufficient': return 'fa-exclamation-triangle';
      case 'error': return 'fa-times-circle';
      case 'warning': return 'fa-info-circle';
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
            {/* Service Package Info */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-purple-900">{servicePackage?.name}</div>
                  <div className="text-sm text-purple-600 mt-1">
                    This will deduct the following items from inventory:
                  </div>
                </div>
                <div className="font-bold text-purple-700 text-lg">
                  {formatCurrency(servicePackage?.price)}
                </div>
              </div>
            </div>

            {/* Validation Status */}
            {validating ? (
              <div className="text-center py-8">
                <i className="fas fa-spinner fa-spin text-purple-600 text-2xl mb-2"></i>
                <p className="text-gray-600">Checking inventory levels...</p>
              </div>
            ) : stockValidation ? (
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 text-sm mb-3">Inventory Check:</h4>
                {stockValidation.map((item, idx) => (
                  <div
                    key={idx}
                    className={`border rounded-lg p-3 ${getStatusColor(item.status)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <i className={`fas ${getStatusIcon(item.status)} mt-0.5`}></i>
                        <div className="flex-1">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-sm mt-1">
                            {item.status === 'insufficient' ? (
                              <>
                                <span className="font-semibold">Need:</span> {item.needed} {item.unit} ·
                                <span className="font-semibold ml-1">Available:</span> {item.available} {item.unit}
                                <div className="mt-1 font-medium">
                                  Short by: {item.needed - item.available} {item.unit}
                                </div>
                              </>
                            ) : item.status === 'ok' ? (
                              <>
                                <span className="font-semibold">Need:</span> {item.needed} {item.unit} ·
                                <span className="font-semibold ml-1">Available:</span> {item.available} {item.unit}
                              </>
                            ) : (
                              <span>{item.message}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {item.status === 'insufficient' && item.inventoryItemId && (
                      <div className="mt-2 pt-2 border-t border-current border-opacity-20">
                        <a
                          href={`/inventory/${item.inventoryItemId}`}
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
                ))}
              </div>
            ) : null}

            {/* Warning Message */}
            {hasErrors && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <i className="fas fa-exclamation-circle text-red-600 mt-0.5"></i>
                  <div className="flex-1">
                    <div className="font-semibold text-red-900">Cannot Commit Service Package</div>
                    <p className="text-sm text-red-700 mt-1">
                      One or more items have insufficient stock. Please restock the items before committing this service package.
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
                Clicking confirm will deduct items from inventory and cannot be easily undone.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServicePackageCommitModal;
