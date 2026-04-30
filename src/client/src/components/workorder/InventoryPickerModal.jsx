import React, { useState, useEffect, useCallback } from 'react';
import InventoryService from '../../services/inventoryService';
import SettingsService from '../../services/settingsService';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import InventoryItemForm from '../inventory/InventoryItemForm';

const EMPTY_FORM = {
  name: '', partNumber: '', category: '', quantityOnHand: 0, unit: 'each',
  unitsPerPurchase: 1, purchaseUnit: '', packageTag: '',
  reorderPoint: 1, price: 0, cost: 0, vendor: '', warranty: '', url: '', notes: ''
};

const InventoryPickerModal = ({ isOpen, onClose, onConfirm, isLoading }) => {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const { user } = useAuth();

  // Create new item state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Settings for the form
  const [categories, setCategories] = useState([]);
  const [packageTags, setPackageTags] = useState([]);
  const [markupPercentage, setMarkupPercentage] = useState(30);

  const isAdmin = user?.role === 'admin' || user?.role === 'management';

  const searchItems = useCallback(async (query) => {
    setSearching(true);
    try {
      const res = await InventoryService.getAllItems({ search: query });
      setItems(res.data?.items || []);
    } catch (err) {
      console.error('Error searching inventory:', err);
    } finally {
      setSearching(false);
    }
  }, []);

  // Load all items on open, debounce search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => searchItems(search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [isOpen, search, searchItems]);

  // Fetch settings + reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedItem(null);
      setQuantity(1);
      setShowCreateForm(false);
      setFormData(EMPTY_FORM);
      setFormError('');

      SettingsService.getSettings().then(res => {
        const settings = res.data?.settings || {};
        setCategories(settings.inventoryCategories || []);
        setPackageTags(settings.packageTags || []);
        if (settings.partMarkupPercentage != null) setMarkupPercentage(settings.partMarkupPercentage);
      }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getStockColor = (item) => {
    if (item.quantityOnHand === 0) return 'text-red-600 bg-red-50';
    if (item.quantityOnHand <= item.reorderPoint) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const handleConfirm = () => {
    if (!selectedItem || quantity < 1) return;
    onConfirm({ inventoryItemId: selectedItem._id, quantity });
  };

  const openCreateForm = () => {
    setFormData({ ...EMPTY_FORM, name: search });
    setFormError('');
    setShowCreateForm(true);
  };

  const handleCreateItem = async () => {
    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const createData = { ...formData };
      if (createData.unitsPerPurchase > 1 && createData.quantityOnHand > 0) {
        createData.quantityOnHand = createData.quantityOnHand * createData.unitsPerPurchase;
      }
      const res = await InventoryService.createItem(createData);
      const newItem = res.data?.item || res.data?.data?.item;
      // Refresh the search list and auto-select the new item
      await searchItems(search);
      if (newItem) {
        setSelectedItem(newItem);
        setQuantity(1);
      }
      setShowCreateForm(false);
    } catch (err) {
      console.error('Error creating inventory item:', err);
      setFormError(err.response?.data?.message || 'Failed to create item');
    } finally {
      setFormSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-40" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                <i className="fas fa-boxes-stacked mr-2 text-green-600"></i>
                {showCreateForm ? 'New Inventory Item' : 'Add from Inventory'}
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>

          {showCreateForm ? (
            <>
              {/* Create New Item Form */}
              <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 mb-3"
                >
                  <i className="fas fa-arrow-left mr-1"></i> Back to search
                </button>

                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700 mb-3">
                    {formError}
                  </div>
                )}

                <InventoryItemForm
                  formData={formData}
                  onChange={setFormData}
                  isEditing={false}
                  categories={categories}
                  onCategoriesChange={setCategories}
                  packageTags={packageTags}
                  isAdmin={isAdmin}
                  markupPercentage={markupPercentage}
                />
              </div>

              {/* Create Footer */}
              <div className="px-5 py-3 border-t border-gray-200 flex gap-2">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateItem}
                  disabled={formSaving || !formData.name.trim()}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  {formSaving ? (
                    <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</>
                  ) : (
                    <><i className="fas fa-plus mr-1"></i>Create Item</>
                  )}
                </button>
              </div>
            </>
          ) : !selectedItem ? (
            <>
              {/* Search */}
              <div className="px-5 py-3 border-b border-gray-100">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search inventory..."
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Results */}
              <div className="overflow-y-auto flex-1 min-h-0">
                {searching ? (
                  <div className="text-center py-8 text-gray-400">
                    <i className="fas fa-spinner fa-spin mr-2"></i>Searching...
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div>{search ? 'No items found' : 'No inventory items'}</div>
                    <button
                      onClick={openCreateForm}
                      className="mt-3 inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      <i className="fas fa-plus mr-2"></i>
                      Create New Item{search ? ` "${search}"` : ''}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-gray-100">
                      {items.map(item => (
                        <button
                          key={item._id}
                          onClick={() => { setSelectedItem(item); setQuantity(1); }}
                          disabled={item.quantityOnHand === 0}
                          className={`w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors ${item.quantityOnHand === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 truncate">{item.name}</div>
                              <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                {(item.partNumber || item.brand) && <span>{item.partNumber || item.brand}</span>}
                                {item.vendor && <span>· {item.vendor}</span>}
                                {item.cost > 0 && <span>· {formatCurrency(item.cost)}/{item.unit}</span>}
                              </div>
                            </div>
                            <span className={`ml-3 px-2 py-1 rounded-full text-xs font-bold ${getStockColor(item)}`}>
                              {item.quantityOnHand} {item.unit}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Create new item link at bottom of results */}
                    <div className="px-5 py-3 border-t border-gray-100">
                      <button
                        onClick={openCreateForm}
                        className="w-full text-left text-sm text-green-600 hover:text-green-700 font-medium"
                      >
                        <i className="fas fa-plus mr-1.5"></i>
                        Create new inventory item{search ? ` for "${search}"` : ''}...
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Selected item detail */}
              <div className="px-5 py-4 flex-1">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 mb-3"
                >
                  <i className="fas fa-arrow-left mr-1"></i> Back to search
                </button>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="font-semibold text-gray-900">{selectedItem.name}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {(selectedItem.partNumber || selectedItem.brand) && <span>{selectedItem.partNumber || selectedItem.brand} · </span>}
                    {selectedItem.vendor && <span>{selectedItem.vendor} · </span>}
                    <span className={`font-medium ${getStockColor(selectedItem).split(' ')[0]}`}>
                      {selectedItem.quantityOnHand} {selectedItem.unit} in stock
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity ({selectedItem.unit})
                    </label>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      max={selectedItem.quantityOnHand}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    {quantity > selectedItem.quantityOnHand && (
                      <p className="text-xs text-red-500 mt-1">
                        Only {selectedItem.quantityOnHand} {selectedItem.unit} available
                      </p>
                    )}
                  </div>

                  {selectedItem.cost > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>Cost per {selectedItem.unit}:</span>
                        <span>{formatCurrency(selectedItem.cost)}</span>
                      </div>
                      <div className="flex justify-between text-gray-600 mt-1">
                        <span>Subtotal cost:</span>
                        <span>{formatCurrency(selectedItem.cost * quantity)}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Customer price calculated with markup
                      </div>
                    </div>
                  )}

                  {(selectedItem.quantityOnHand - quantity) <= selectedItem.reorderPoint && quantity <= selectedItem.quantityOnHand && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                      <i className="fas fa-exclamation-triangle mr-1"></i>
                      Low stock warning: {selectedItem.quantityOnHand - quantity} {selectedItem.unit} will remain after this (reorder point: {selectedItem.reorderPoint})
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-200 flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading || quantity < 1 || quantity > selectedItem.quantityOnHand}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading ? (
                    <><i className="fas fa-spinner fa-spin mr-1"></i>Adding...</>
                  ) : (
                    <><i className="fas fa-plus mr-1"></i>Add {quantity} {selectedItem.unit}</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryPickerModal;
