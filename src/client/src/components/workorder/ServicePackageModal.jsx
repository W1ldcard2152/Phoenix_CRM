import React, { useState, useEffect } from 'react';
import ServicePackageService from '../../services/servicePackageService';
import InventoryService from '../../services/inventoryService';
import { formatCurrency } from '../../utils/formatters';

const ServicePackageModal = ({ isOpen, onClose, onConfirm, isLoading }) => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);

  // Step 2: picking inventory items for a selected package
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [selections, setSelections] = useState({}); // { includedItemId: inventoryItemId }
  const [inventoryByTag, setInventoryByTag] = useState({}); // { tag: [items] }
  const [loadingTags, setLoadingTags] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPkg(null);
    setSelections({});
    setInventoryByTag({});
    const fetchPackages = async () => {
      setLoading(true);
      try {
        const res = await ServicePackageService.getAllPackages();
        setPackages(res.data?.packages || []);
      } catch (err) {
        console.error('Error fetching service packages:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPackages();
  }, [isOpen]);

  // When a package is selected, fetch inventory for each unique tag
  const selectPackage = async (pkg) => {
    setSelectedPkg(pkg);
    setSelections({});

    const uniqueTags = [...new Set(pkg.includedItems.map(i => i.packageTag))];
    const newInventory = {};
    setLoadingTags(uniqueTags.reduce((acc, t) => ({ ...acc, [t]: true }), {}));

    await Promise.all(uniqueTags.map(async (tag) => {
      try {
        const res = await InventoryService.getAllItems({ packageTag: tag });
        newInventory[tag] = res.data?.items || [];
      } catch (err) {
        console.error(`Error fetching inventory for tag "${tag}":`, err);
        newInventory[tag] = [];
      }
    }));

    setInventoryByTag(newInventory);
    setLoadingTags({});
  };

  const handleConfirm = () => {
    if (!selectedPkg) return;

    const selectionArray = selectedPkg.includedItems.map(item => ({
      includedItemId: item._id,
      inventoryItemId: selections[item._id] || null
    })).filter(s => s.inventoryItemId);

    onConfirm({
      servicePackageId: selectedPkg._id,
      selections: selectionArray
    });
  };

  const allSlotsFilled = selectedPkg?.includedItems.every(
    item => selections[item._id]
  );

  const getSelectedItem = (includedItemId) => {
    const invId = selections[includedItemId];
    if (!invId) return null;
    for (const items of Object.values(inventoryByTag)) {
      const found = items.find(i => i._id === invId);
      if (found) return found;
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-40" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                <i className="fas fa-box-open mr-2 text-purple-600"></i>
                {selectedPkg ? selectedPkg.name : 'Add Service'}
              </h3>
              <div className="flex items-center gap-2">
                {selectedPkg && (
                  <button
                    onClick={() => { setSelectedPkg(null); setSelections({}); }}
                    className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                  >
                    <i className="fas fa-arrow-left mr-1"></i>Back
                  </button>
                )}
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {loading ? (
              <div className="text-center py-8 text-gray-400">
                <i className="fas fa-spinner fa-spin mr-2"></i>Loading packages...
              </div>
            ) : !selectedPkg ? (
              /* Step 1: Package selection */
              packages.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>No service packages configured.</p>
                  <p className="text-xs mt-1">Create packages in the Service Packages admin page.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 p-3 space-y-3">
                  {packages.map(pkg => (
                    <div
                      key={pkg._id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 hover:bg-purple-50/30 cursor-pointer transition-colors"
                      onClick={() => selectPackage(pkg)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-semibold text-gray-900">{pkg.name}</div>
                          {pkg.description && (
                            <div className="text-xs text-gray-500 mt-0.5">{pkg.description}</div>
                          )}
                        </div>
                        <span className="text-lg font-bold text-gray-900 ml-3">
                          {formatCurrency(pkg.price)}
                        </span>
                      </div>

                      {pkg.includedItems.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {pkg.includedItems.map((item, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-200">
                              {item.quantity}x {item.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* Step 2: Pick inventory items for each slot */
              <div className="p-4 space-y-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-purple-900">{selectedPkg.name}</span>
                    <span className="font-bold text-purple-700">{formatCurrency(selectedPkg.price)}</span>
                  </div>
                  {selectedPkg.description && (
                    <p className="text-xs text-purple-600 mt-1">{selectedPkg.description}</p>
                  )}
                </div>

                <p className="text-sm text-gray-600">
                  Select which inventory item to use for each requirement:
                </p>

                {selectedPkg.includedItems.map((included) => {
                  const tagItems = inventoryByTag[included.packageTag] || [];
                  const isTagLoading = loadingTags[included.packageTag];
                  const selected = getSelectedItem(included._id);

                  return (
                    <div key={included._id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900 text-sm">
                          {included.quantity}x {included.label}
                        </div>
                        <span className="text-xs text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">
                          {included.packageTag}
                        </span>
                      </div>

                      {isTagLoading ? (
                        <div className="text-xs text-gray-400 py-2">
                          <i className="fas fa-spinner fa-spin mr-1"></i>Loading options...
                        </div>
                      ) : tagItems.length === 0 ? (
                        <div className="text-xs text-red-500 py-2">
                          <i className="fas fa-exclamation-triangle mr-1"></i>
                          No inventory items with tag "{included.packageTag}"
                        </div>
                      ) : (
                        <select
                          value={selections[included._id] || ''}
                          onChange={(e) => setSelections(prev => ({
                            ...prev,
                            [included._id]: e.target.value
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">-- Select item --</option>
                          {tagItems.map(inv => (
                            <option
                              key={inv._id}
                              value={inv._id}
                            >
                              {inv.name}
                              {inv.partNumber ? ` (${inv.partNumber})` : ''}
                              {` — ${inv.quantityOnHand} ${inv.unit} avail`}
                              {inv.quantityOnHand < included.quantity ? ' (low stock)' : ''}
                            </option>
                          ))}
                        </select>
                      )}

                      {selected && (
                        <div className="mt-1.5 text-xs text-gray-500">
                          {selected.vendor && <span>{selected.vendor} · </span>}
                          Cost: {formatCurrency(selected.cost)}/{selected.unit}
                          {selected.quantityOnHand <= selected.reorderPoint && (
                            <span className="ml-2 text-yellow-600">
                              <i className="fas fa-exclamation-triangle mr-0.5"></i>Low stock
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-200">
            {selectedPkg ? (
              <div className="flex gap-2">
                <button
                  onClick={() => { setSelectedPkg(null); setSelections({}); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading || !allSlotsFilled}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                >
                  {isLoading ? (
                    <><i className="fas fa-spinner fa-spin mr-1"></i>Adding...</>
                  ) : (
                    <><i className="fas fa-check mr-1"></i>Add to Work Order</>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServicePackageModal;
