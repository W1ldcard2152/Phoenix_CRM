import React, { useState } from 'react';
import SettingsService from '../../services/settingsService';
import UrlExtractButton from '../common/UrlExtractButton';

/**
 * Shared inventory item form used by both InventoryList and InventoryPickerModal.
 *
 * Props:
 *  - formData / onChange(updatedFormData) — controlled form state
 *  - isEditing — hides Starting Quantity field when true
 *  - categories / onCategoriesChange — inventory categories list + setter
 *  - packageTags — package tags list
 *  - isAdmin — show category management controls
 */
const InventoryItemForm = ({ formData, onChange, isEditing = false, categories = [], onCategoriesChange, packageTags = [], isAdmin = false }) => {
  const [showCategoryMgmt, setShowCategoryMgmt] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const updateField = (field, value) => {
    onChange({ ...formData, [field]: value });
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      const res = await SettingsService.addInventoryCategory(newCategory.trim());
      onCategoriesChange?.(res.data.settings.inventoryCategories);
      setNewCategory('');
    } catch (err) {
      console.error('Error adding category:', err);
    }
  };

  const handleRemoveCategory = async (cat) => {
    try {
      const res = await SettingsService.removeInventoryCategory(cat);
      onCategoriesChange?.(res.data.settings.inventoryCategories);
    } catch (err) {
      console.error('Error removing category:', err);
    }
  };

  const inputClass = "w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

  return (
    <div className="space-y-4">
      {/* Name + Brand/Model */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="e.g., Nitrile Gloves (Large)"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Brand / Model</label>
          <input
            type="text"
            value={formData.partNumber}
            onChange={(e) => updateField('partNumber', e.target.value)}
            placeholder="e.g., Bosch EK110"
            className={inputClass}
          />
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
        <select
          value={formData.category}
          onChange={(e) => updateField('category', e.target.value)}
          className={inputClass}
        >
          <option value="">-- Select --</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

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
            onChange={(e) => updateField('packageTag', e.target.value)}
            className={inputClass}
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
          onChange={(e) => updateField('vendor', e.target.value)}
          placeholder="e.g., Walmart, Amazon"
          className={inputClass}
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
            onChange={(e) => updateField('cost', parseFloat(e.target.value) || 0)}
            className={inputClass}
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
            onChange={(e) => updateField('price', parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Warranty */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Warranty</label>
        <input
          type="text"
          value={formData.warranty}
          onChange={(e) => updateField('warranty', e.target.value)}
          placeholder="e.g., 1 year"
          className={inputClass}
        />
      </div>

      {/* Unit + Reorder Point row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Usage Unit</label>
          <input
            type="text"
            value={formData.unit}
            onChange={(e) => updateField('unit', e.target.value)}
            placeholder="quart, each, oz..."
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reorder At</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={formData.reorderPoint}
            onChange={(e) => updateField('reorderPoint', parseInt(e.target.value) || 0)}
            className={inputClass}
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
            onChange={(e) => updateField('unitsPerPurchase', Math.max(1, parseInt(e.target.value) || 1))}
            className={inputClass}
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
            onChange={(e) => updateField('purchaseUnit', e.target.value)}
            placeholder={formData.unitsPerPurchase > 1 ? 'jug, case, box...' : ''}
            disabled={formData.unitsPerPurchase <= 1}
            className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-400`}
          />
        </div>
      </div>

      {/* Initial QOH - only on create */}
      {!isEditing && (
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
            onChange={(e) => updateField('quantityOnHand', parseInt(e.target.value) || 0)}
            className={inputClass}
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
            onChange={(e) => updateField('url', e.target.value)}
            placeholder="https://..."
            className={`flex-1 ${inputClass}`}
          />
          <UrlExtractButton
            url={formData.url}
            onExtracted={(data) => onChange({
              ...formData,
              name: formData.name || data.name || '',
              price: formData.price || (data.price != null ? data.price : 0),
              cost: formData.cost || (data.cost != null ? data.cost : data.price != null ? data.price : 0),
              vendor: formData.vendor || data.vendor || '',
              partNumber: formData.partNumber || [data.brand, data.partNumber].filter(Boolean).join(' ') || '',
              warranty: formData.warranty || data.warranty || ''
            })}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Any notes about this item..."
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>
    </div>
  );
};

export default InventoryItemForm;
