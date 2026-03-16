import React, { useState, useEffect, useMemo, useCallback } from 'react';
import InventoryService from '../../services/inventoryService';
import SettingsService from '../../services/settingsService';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate, formatTime, formatCurrency } from '../../utils/formatters';
import usePersistedState from '../../hooks/usePersistedState';
import UrlExtractButton from '../../components/common/UrlExtractButton';

const getStockStatus = (item) => {
  if (item.quantityOnHand === 0) return 'out';
  if (item.quantityOnHand <= item.reorderPoint) return 'low';
  return 'good';
};

const stockColors = {
  good: { border: 'border-green-400', bg: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-100 text-green-800' },
  low: { border: 'border-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-800' },
  out: { border: 'border-red-400', bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100 text-red-800' }
};

const ADJUST_REASONS = ['Restocked', 'Used', 'Damaged', 'Counted/Corrected', 'Ordered'];

const InventoryList = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = usePersistedState('inventory:categoryFilter', 'All');
  const [searchQuery, setSearchQuery] = useState('');
  const [shoppingListCount, setShoppingListCount] = useState(0);

  // Modal states
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [shoppingListItems, setShoppingListItems] = useState([]);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState(null);
  const [adjustDirection, setAdjustDirection] = useState(1);

  // Item form state
  const [formData, setFormData] = useState({
    name: '', partNumber: '', category: '', quantityOnHand: 0, unit: 'each',
    unitsPerPurchase: 1, purchaseUnit: '', packageTag: '',
    reorderPoint: 1, price: 0, cost: 0, vendor: '', warranty: '',
    url: '', notes: ''
  });
  const [packageTags, setPackageTags] = useState([]);
  const [formSaving, setFormSaving] = useState(false);

  // Adjust modal state
  const [adjustAmount, setAdjustAmount] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [usePurchaseUnits, setUsePurchaseUnits] = useState(false);

  // Shopping list order amounts
  const [orderAmounts, setOrderAmounts] = useState({});

  // Category management
  const [newCategory, setNewCategory] = useState('');
  const [showCategoryMgmt, setShowCategoryMgmt] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'management';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [itemsRes, settingsRes] = await Promise.all([
        InventoryService.getAllItems(),
        SettingsService.getSettings()
      ]);
      setItems(itemsRes.data.items || []);
      setCategories(settingsRes.data.settings.inventoryCategories || []);
      setPackageTags(settingsRes.data.settings.packageTags || []);

      // Calculate shopping list count
      const allItems = itemsRes.data.items || [];
      const lowCount = allItems.filter(i => i.quantityOnHand <= i.reorderPoint).length;
      setShoppingListCount(lowCount);
    } catch (err) {
      console.error('Error fetching inventory data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredItems = useMemo(() => {
    let filtered = items;
    if (categoryFilter !== 'All') {
      filtered = filtered.filter(i => i.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q) ||
        (i.notes || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [items, categoryFilter, searchQuery]);

  const stats = useMemo(() => ({
    total: items.length,
    low: items.filter(i => i.quantityOnHand <= i.reorderPoint && i.quantityOnHand > 0).length,
    out: items.filter(i => i.quantityOnHand === 0).length
  }), [items]);

  // Item form handlers
  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({ name: '', partNumber: '', category: '', quantityOnHand: 0, unit: 'each',
      unitsPerPurchase: 1, purchaseUnit: '', packageTag: '',
      reorderPoint: 1, price: 0, cost: 0, vendor: '', warranty: '', url: '', notes: '' });
    setShowItemModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      partNumber: item.partNumber || item.brand || '',
      category: item.category || '',
      quantityOnHand: item.quantityOnHand,
      unit: item.unit || 'each',
      unitsPerPurchase: item.unitsPerPurchase || 1,
      purchaseUnit: item.purchaseUnit || '',
      packageTag: item.packageTag || '',
      reorderPoint: item.reorderPoint,
      price: item.price || 0,
      cost: item.cost || 0,
      vendor: item.vendor || '',
      warranty: item.warranty || '',
      url: item.url || '',
      notes: item.notes || ''
    });
    setShowItemModal(true);
  };

  const handleSaveItem = async () => {
    if (!formData.name.trim()) return;
    setFormSaving(true);
    try {
      if (editingItem) {
        const { quantityOnHand, ...updateData } = formData;
        await InventoryService.updateItem(editingItem._id, updateData);
      } else {
        const createData = { ...formData };
        // Convert starting quantity from purchase units to usage units
        if (createData.unitsPerPurchase > 1 && createData.quantityOnHand > 0) {
          createData.quantityOnHand = createData.quantityOnHand * createData.unitsPerPurchase;
        }
        await InventoryService.createItem(createData);
      }
      setShowItemModal(false);
      fetchData();
    } catch (err) {
      console.error('Error saving item:', err);
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Deactivate "${item.name}"?`)) return;
    try {
      await InventoryService.deleteItem(item._id);
      fetchData();
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  };

  // Adjust handlers
  const openAdjustModal = (item, direction) => {
    setAdjustingItem(item);
    setAdjustDirection(direction);
    setAdjustAmount(1);
    setAdjustReason(direction > 0 ? 'Restocked' : 'Used');
    setUsePurchaseUnits(direction > 0 && (item.unitsPerPurchase || 1) > 1);
    setShowAdjustModal(true);
  };

  const getActualAdjustment = () => {
    if (!adjustingItem) return adjustAmount;
    if (usePurchaseUnits && adjustDirection > 0) {
      return adjustAmount * (adjustingItem.unitsPerPurchase || 1);
    }
    return adjustAmount;
  };

  const handleAdjust = async () => {
    if (!adjustingItem || adjustAmount <= 0) return;
    const actualAdj = getActualAdjustment();
    const reason = usePurchaseUnits && adjustDirection > 0
      ? `${adjustReason} (${adjustAmount} ${adjustingItem.purchaseUnit || 'unit'}${adjustAmount !== 1 ? 's' : ''})`
      : adjustReason;
    try {
      await InventoryService.adjustQuantity(
        adjustingItem._id,
        adjustDirection * actualAdj,
        reason
      );
      setShowAdjustModal(false);
      fetchData();
    } catch (err) {
      console.error('Error adjusting quantity:', err);
    }
  };

  // Shopping list handlers
  const openShoppingList = async () => {
    try {
      const res = await InventoryService.getShoppingList();
      const listItems = res.data.items || [];
      setShoppingListItems(listItems);
      const defaults = {};
      listItems.forEach(i => {
        defaults[i._id] = Math.max(1, i.reorderPoint - i.quantityOnHand + 1);
      });
      setOrderAmounts(defaults);
      setShowShoppingList(true);
    } catch (err) {
      console.error('Error fetching shopping list:', err);
    }
  };

  const handleMarkOrdered = async (item) => {
    const qty = orderAmounts[item._id] || 1;
    try {
      await InventoryService.adjustQuantity(item._id, qty, 'Ordered');
      // Refresh shopping list
      const res = await InventoryService.getShoppingList();
      setShoppingListItems(res.data.items || []);
      fetchData();
    } catch (err) {
      console.error('Error marking as ordered:', err);
    }
  };

  const copyShoppingList = () => {
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const lines = [`Shopping List (${date})`, ''];
    shoppingListItems.forEach(item => {
      const need = Math.max(1, item.reorderPoint - item.quantityOnHand + 1);
      let line = `- ${item.name}`;
      if (item.partNumber || item.brand) line += ` (${item.partNumber || item.brand})`;
      line += ` (QOH: ${item.quantityOnHand}, Need: ${need})`;
      if (item.vendor) line += ` - ${item.vendor}`;
      if (item.url) line += ` ${item.url}`;
      lines.push(line);
    });
    navigator.clipboard.writeText(lines.join('\n'));
  };

  // Category management
  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      const res = await SettingsService.addInventoryCategory(newCategory.trim());
      setCategories(res.data.settings.inventoryCategories);
      setNewCategory('');
    } catch (err) {
      console.error('Error adding category:', err);
    }
  };

  const handleRemoveCategory = async (cat) => {
    try {
      const res = await SettingsService.removeInventoryCategory(cat);
      setCategories(res.data.settings.inventoryCategories);
    } catch (err) {
      console.error('Error removing category:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sticky Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          {/* Title row */}
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-800">Shop Inventory</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={openShoppingList}
                className="relative p-2 rounded-lg bg-primary-50 text-primary-600 active:bg-primary-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
                {shoppingListCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                    {shoppingListCount}
                  </span>
                )}
              </button>
              <button
                onClick={openCreateModal}
                className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium active:bg-primary-700"
              >
                + Add Item
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-primary-50 rounded-lg p-2 text-center">
              <div className="text-xl font-bold text-primary-600">{stats.total}</div>
              <div className="text-xs text-gray-600">Total</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-2 text-center">
              <div className="text-xl font-bold text-yellow-600">{stats.low}</div>
              <div className="text-xs text-gray-600">Low Stock</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2 text-center">
              <div className="text-xl font-bold text-red-600">{stats.out}</div>
              <div className="text-xs text-gray-600">Out</div>
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex gap-1 mb-3 overflow-x-auto hide-scrollbar pb-1">
            <button
              onClick={() => setCategoryFilter('All')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                categoryFilter === 'All'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  categoryFilter === cat
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Item Cards - Mobile */}
      <div className="p-4 space-y-2 lg:hidden">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
            <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm">No items found</p>
            <button onClick={openCreateModal} className="mt-3 text-primary-600 text-sm font-medium">
              Add your first item
            </button>
          </div>
        ) : (
          filteredItems.map(item => {
            const status = getStockStatus(item);
            const colors = stockColors[status];
            return (
              <div
                key={item._id}
                className={`bg-white rounded-xl shadow-sm border-l-4 ${colors.border} overflow-hidden`}
              >
                <div className="px-4 py-3">
                  {/* Top row: category + status */}
                  <div className="flex items-center justify-between mb-1">
                    {item.category && (
                      <span className="text-xs font-medium text-gray-500">{item.category}</span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                      {status === 'out' ? 'Out of Stock' : status === 'low' ? 'Low Stock' : 'In Stock'}
                    </span>
                  </div>

                  {/* Item name + QOH */}
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-semibold text-gray-900 truncate flex-1 mr-2">{item.name}</h3>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-lg font-bold ${colors.text}`}>{item.quantityOnHand}</span>
                      <span className="text-xs text-gray-500 ml-1">{item.unit}</span>
                    </div>
                  </div>

                  {/* Part details row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mb-1">
                    {(item.partNumber || item.brand) && <span>{item.partNumber || item.brand}</span>}
                    {item.vendor && <span>{item.vendor}</span>}
                    {item.price > 0 && <span className="text-green-600 font-medium">{formatCurrency(item.price)}</span>}
                  </div>

                  <div className="text-xs text-gray-400 mb-3">
                    Reorder at: {item.reorderPoint}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-primary-500 inline-flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Buy
                      </a>
                    )}
                  </div>

                  {/* Action row */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openAdjustModal(item, -1)}
                      className="w-11 h-11 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-xl font-bold active:bg-red-100 transition-colors"
                    >
                      &minus;
                    </button>
                    <div className="flex-1 text-center">
                      <span className={`text-2xl font-bold ${colors.text}`}>{item.quantityOnHand}</span>
                    </div>
                    <button
                      onClick={() => openAdjustModal(item, 1)}
                      className="w-11 h-11 rounded-lg bg-green-50 text-green-600 flex items-center justify-center text-xl font-bold active:bg-green-100 transition-colors"
                    >
                      +
                    </button>
                    <button
                      onClick={() => openEditModal(item)}
                      className="w-11 h-11 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center active:bg-gray-200 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block p-4">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p>No items found</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">QOH</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Reorder</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Adjust</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredItems.map(item => {
                  const status = getStockStatus(item);
                  const colors = stockColors[status];
                  return (
                    <tr key={item._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {(item.partNumber || item.brand) && <span>{item.partNumber || item.brand}</span>}
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">
                              Link
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{item.category || '-'}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{item.vendor || '-'}</td>
                      <td className="px-4 py-4 text-right text-sm text-gray-900">
                        {item.price > 0 ? formatCurrency(item.price) : '-'}
                        {item.cost > 0 && item.price > 0 && (
                          <div className="text-xs text-gray-400">{formatCurrency(item.cost)} cost</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex px-2 py-1 text-sm font-bold rounded-full ${colors.badge}`}>
                          {item.quantityOnHand}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center text-sm text-gray-500">{item.unit}</td>
                      <td className="px-4 py-4 text-center text-sm text-gray-500">{item.reorderPoint}</td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openAdjustModal(item, -1)}
                            className="w-8 h-8 rounded bg-red-50 text-red-600 flex items-center justify-center font-bold hover:bg-red-100"
                          >
                            &minus;
                          </button>
                          <button
                            onClick={() => openAdjustModal(item, 1)}
                            className="w-8 h-8 rounded bg-green-50 text-green-600 flex items-center justify-center font-bold hover:bg-green-100"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEditModal(item)} className="text-gray-500 hover:text-primary-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDeleteItem(item)} className="text-gray-400 hover:text-red-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ========== ITEM FORM MODAL ========== */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowItemModal(false)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingItem ? 'Edit Item' : 'Add Item'}
              </h2>
              <button onClick={() => setShowItemModal(false)} className="text-gray-400 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Name + Brand/Model */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Nitrile Gloves (Large)"
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand / Model</label>
                  <input
                    type="text"
                    value={formData.partNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, partNumber: e.target.value }))}
                    placeholder="e.g., Bosch EK110"
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">-- Select --</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                {/* Category management for admin/management */}
                {isAdmin && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setShowCategoryMgmt(!showCategoryMgmt)}
                      className="text-xs text-primary-600 font-medium"
                    >
                      {showCategoryMgmt ? 'Hide' : 'Manage'} categories
                    </button>
                    {showCategoryMgmt && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            placeholder="New category"
                            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                          />
                          <button
                            onClick={handleAddCategory}
                            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded font-medium"
                          >
                            Add
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {categories.map(cat => (
                            <span key={cat} className="inline-flex items-center gap-1 px-2 py-1 bg-white border rounded text-xs">
                              {cat}
                              <button onClick={() => handleRemoveCategory(cat)} className="text-red-400 hover:text-red-600">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Package Tag */}
              {packageTags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Package Tag</label>
                  <select
                    value={formData.packageTag}
                    onChange={(e) => setFormData(prev => ({ ...prev, packageTag: e.target.value }))}
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">-- None --</option>
                    {packageTags.map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Tag this item for use in service packages</p>
                </div>
              )}

              {/* Vendor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <input
                  type="text"
                  value={formData.vendor}
                  onChange={(e) => setFormData(prev => ({ ...prev, vendor: e.target.value }))}
                  placeholder="e.g., Walmart, Amazon"
                  className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Cost + Price row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) => setFormData(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retail Price</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Warranty */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warranty</label>
                <input
                  type="text"
                  value={formData.warranty}
                  onChange={(e) => setFormData(prev => ({ ...prev, warranty: e.target.value }))}
                  placeholder="e.g., 1 year"
                  className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Unit + Reorder Point row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Usage Unit</label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                    placeholder="quart, each, oz..."
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reorder At</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={formData.reorderPoint}
                    onChange={(e) => setFormData(prev => ({ ...prev, reorderPoint: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Bulk purchase unit conversion */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Units per Purchase
                    <span className="text-xs text-gray-400 ml-1">(e.g., 5 for a 5qt jug)</span>
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={formData.unitsPerPurchase}
                    onChange={(e) => setFormData(prev => ({ ...prev, unitsPerPurchase: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Purchase Unit
                    <span className="text-xs text-gray-400 ml-1">(e.g., jug, case)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.purchaseUnit}
                    onChange={(e) => setFormData(prev => ({ ...prev, purchaseUnit: e.target.value }))}
                    placeholder={formData.unitsPerPurchase > 1 ? 'jug, case, box...' : ''}
                    disabled={formData.unitsPerPurchase <= 1}
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              {/* Initial QOH - only on create */}
              {!editingItem && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Starting Quantity
                    {formData.unitsPerPurchase > 1 && formData.purchaseUnit && (
                      <span className="text-xs text-gray-400 ml-1">({formData.purchaseUnit}s)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={formData.quantityOnHand}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantityOnHand: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {formData.unitsPerPurchase > 1 && formData.quantityOnHand > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      {formData.quantityOnHand} {formData.purchaseUnit || 'unit'}{formData.quantityOnHand !== 1 ? 's' : ''} = {formData.quantityOnHand * formData.unitsPerPurchase} {formData.unit}
                    </p>
                  )}
                </div>
              )}

              {/* Purchase URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase URL</label>
                <div className="flex items-start">
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://..."
                    className="flex-1 px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <UrlExtractButton
                    url={formData.url}
                    onExtracted={(data) => setFormData(prev => ({
                      ...prev,
                      name: prev.name || data.name || '',
                      partNumber: prev.partNumber || data.partNumber || '',
                      price: prev.price || (data.price != null ? data.price : 0),
                      cost: prev.cost || (data.cost != null ? data.cost : data.price != null ? data.price : 0),
                      vendor: prev.vendor || data.vendor || '',
                      partNumber: prev.partNumber || [data.brand, data.partNumber].filter(Boolean).join(' ') || '',
                      warranty: prev.warranty || data.warranty || ''
                    }))}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any notes about this item..."
                  rows={2}
                  className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>
            </div>

            {/* Save/Cancel buttons */}
            <div className="sticky bottom-0 bg-white px-4 py-3 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => setShowItemModal(false)}
                className="flex-1 py-3 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 active:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveItem}
                disabled={formSaving || !formData.name.trim()}
                className="flex-1 py-3 rounded-lg text-sm font-semibold text-white bg-primary-600 active:bg-primary-700 disabled:opacity-50"
              >
                {formSaving ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== ADJUST QUANTITY MODAL ========== */}
      {showAdjustModal && adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowAdjustModal(false)} />
          <div className="relative bg-white w-full sm:max-w-sm sm:rounded-xl rounded-t-xl">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">
                {adjustDirection > 0 ? 'Add Stock' : 'Remove Stock'}
              </h2>
              <p className="text-sm text-gray-500">{adjustingItem.name}</p>
              <p className="text-xs text-gray-400">Current: {adjustingItem.quantityOnHand} {adjustingItem.unit}</p>
            </div>

            <div className="p-4 space-y-4">
              {/* Purchase unit toggle (only when restocking items with unitsPerPurchase > 1) */}
              {adjustDirection > 0 && (adjustingItem.unitsPerPurchase || 1) > 1 && (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <span className="text-sm text-blue-800">
                    Enter in {adjustingItem.purchaseUnit || 'purchase unit'}s
                  </span>
                  <button
                    onClick={() => setUsePurchaseUnits(!usePurchaseUnits)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      usePurchaseUnits ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      usePurchaseUnits ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {usePurchaseUnits && adjustDirection > 0
                    ? `Amount (${adjustingItem.purchaseUnit || 'purchase unit'}s)`
                    : `Amount (${adjustingItem.unit})`
                  }
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg text-lg text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
                {usePurchaseUnits && adjustDirection > 0 && (
                  <p className="text-xs text-blue-600 text-center mt-1">
                    {adjustAmount} {adjustingItem.purchaseUnit || 'unit'}{adjustAmount !== 1 ? 's' : ''} = {getActualAdjustment()} {adjustingItem.unit}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {ADJUST_REASONS.map(reason => (
                    <button
                      key={reason}
                      onClick={() => setAdjustReason(reason)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                        adjustReason === reason
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-700 border-gray-300 active:bg-gray-100'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-center text-sm text-gray-500">
                {adjustingItem.quantityOnHand} {adjustDirection > 0 ? '+' : '-'} {getActualAdjustment()} = {' '}
                <span className="font-bold text-gray-800">
                  {Math.max(0, adjustingItem.quantityOnHand + (adjustDirection * getActualAdjustment()))}
                </span>{' '}
                {adjustingItem.unit}
              </div>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => setShowAdjustModal(false)}
                className="flex-1 py-3 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 active:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjust}
                className={`flex-1 py-3 rounded-lg text-sm font-semibold text-white active:opacity-90 ${
                  adjustDirection > 0 ? 'bg-green-600' : 'bg-red-600'
                }`}
              >
                {adjustDirection > 0 ? 'Add' : 'Remove'} {getActualAdjustment()} {adjustingItem.unit}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== SHOPPING LIST MODAL ========== */}
      {showShoppingList && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowShoppingList(false)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Shopping List</h2>
                <p className="text-xs text-gray-500">{shoppingListItems.length} items need restocking</p>
              </div>
              <div className="flex items-center gap-2">
                {shoppingListItems.length > 0 && (
                  <button
                    onClick={copyShoppingList}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg active:bg-gray-200"
                  >
                    Copy List
                  </button>
                )}
                <button onClick={() => setShowShoppingList(false)} className="text-gray-400 p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {shoppingListItems.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <svg className="mx-auto h-10 w-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm">Everything is stocked up!</p>
                </div>
              ) : (
                shoppingListItems.map(item => (
                  <div key={item._id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900">{item.name}</h3>
                        <div className="text-xs text-gray-500">
                          {item.category && <span>{item.category} &middot; </span>}
                          {item.vendor && <span>{item.vendor} &middot; </span>}
                          QOH: <span className="font-medium text-red-600">{item.quantityOnHand}</span> &middot; Reorder at: {item.reorderPoint}
                          {item.price > 0 && <span> &middot; {formatCurrency(item.price)}/{item.unit || 'ea'}</span>}
                        </div>
                      </div>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 ml-2 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg active:bg-primary-100 flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Buy
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">Order:</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={orderAmounts[item._id] || 1}
                        onChange={(e) => setOrderAmounts(prev => ({
                          ...prev,
                          [item._id]: parseInt(e.target.value) || 1
                        }))}
                        className="w-16 px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <button
                        onClick={() => handleMarkOrdered(item)}
                        className="flex-1 py-2 text-xs font-semibold text-white bg-green-600 rounded-lg active:bg-green-700"
                      >
                        Mark Ordered (+{orderAmounts[item._id] || 1})
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryList;
