import React, { useState, useEffect, useCallback } from 'react';
import ServicePackageService from '../../services/servicePackageService';
import SettingsService from '../../services/settingsService';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';

const ServicePackageList = () => {
  const { currentUser } = useAuth();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPkg, setEditingPkg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [packageTags, setPackageTags] = useState([]);

  // Form state
  const [formData, setFormData] = useState({ name: '', description: '', price: 0 });
  const [includedItems, setIncludedItems] = useState([]);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      const [pkgRes, settingsRes] = await Promise.all([
        ServicePackageService.getAllPackages(),
        SettingsService.getSettings()
      ]);
      setPackages(pkgRes.data?.packages || []);
      setPackageTags(settingsRes.data?.settings?.packageTags || []);
    } catch (err) {
      console.error('Error fetching packages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const openCreateModal = () => {
    setEditingPkg(null);
    setFormData({ name: '', description: '', price: 0 });
    setIncludedItems([]);
    setShowModal(true);
  };

  const openEditModal = (pkg) => {
    setEditingPkg(pkg);
    setFormData({ name: pkg.name, description: pkg.description || '', price: pkg.price });
    setIncludedItems(pkg.includedItems.map(item => ({
      packageTag: item.packageTag,
      label: item.label,
      quantity: item.quantity
    })));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || formData.price < 0) return;
    // Validate all items have a tag selected
    const invalid = includedItems.some(item => !item.packageTag);
    if (invalid) {
      setError('All included items must have a package tag selected');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...formData,
        includedItems: includedItems.map(item => ({
          packageTag: item.packageTag,
          label: item.label || item.packageTag,
          quantity: item.quantity
        }))
      };

      if (editingPkg) {
        await ServicePackageService.updatePackage(editingPkg._id, payload);
      } else {
        await ServicePackageService.createPackage(payload);
      }
      setShowModal(false);
      fetchPackages();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save package');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pkg) => {
    if (!window.confirm(`Delete "${pkg.name}"?`)) return;
    try {
      await ServicePackageService.deletePackage(pkg._id);
      fetchPackages();
    } catch (err) {
      console.error('Error deleting package:', err);
    }
  };

  const addIncludedItem = () => {
    setIncludedItems(prev => [...prev, {
      packageTag: packageTags[0] || '',
      label: packageTags[0] || '',
      quantity: 1
    }]);
  };

  const updateIncludedItem = (index, field, value) => {
    setIncludedItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      // Auto-set label when tag changes (if label matches old tag or is empty)
      if (field === 'packageTag' && (!item.label || item.label === item.packageTag)) {
        updated.label = value;
      }
      return updated;
    }));
  };

  const removeIncludedItem = (index) => {
    setIncludedItems(prev => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Packages</h1>
          <p className="text-sm text-gray-500 mt-1">Predefined service bundles with tag-based inventory requirements</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700"
        >
          <i className="fas fa-plus mr-1"></i> New Package
        </button>
      </div>

      {/* Package list */}
      {packages.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <i className="fas fa-box-open text-4xl mb-3"></i>
          <p className="text-lg">No service packages yet</p>
          <p className="text-sm mt-1">Create a package to bundle services with inventory items</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map(pkg => (
            <div key={pkg._id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
                    <span className="text-lg font-bold text-purple-600">{formatCurrency(pkg.price)}</span>
                  </div>
                  {pkg.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{pkg.description}</p>
                  )}
                  {pkg.includedItems.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {pkg.includedItems.map((item, idx) => (
                        <span key={idx} className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-200">
                          {item.quantity}x {item.label}
                          <span className="ml-1 text-purple-400">({item.packageTag})</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button onClick={() => openEditModal(pkg)} className="p-2 text-gray-400 hover:text-gray-600">
                    <i className="fas fa-pen text-sm"></i>
                  </button>
                  <button onClick={() => handleDelete(pkg)} className="p-2 text-gray-400 hover:text-red-600">
                    <i className="fas fa-trash text-sm"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========== ADD/EDIT MODAL ========== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                {editingPkg ? 'Edit Package' : 'New Service Package'}
              </h3>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Standard Oil Change"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g., Up to 5 quarts of oil with filter"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Price *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Included Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Included Items</label>
                  <button
                    onClick={addIncludedItem}
                    disabled={packageTags.length === 0}
                    className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50"
                  >
                    <i className="fas fa-plus mr-1"></i>Add Requirement
                  </button>
                </div>

                {packageTags.length === 0 && (
                  <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2">
                    <i className="fas fa-exclamation-triangle mr-1"></i>
                    No package tags configured. Add tags in Company Settings first.
                  </p>
                )}

                {/* Included items list */}
                {includedItems.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-lg">
                    No items added yet — add requirements to define what this package includes
                  </p>
                ) : (
                  <div className="space-y-2">
                    {includedItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                        <div className="flex-1 min-w-0">
                          <select
                            value={item.packageTag}
                            onChange={(e) => updateIncludedItem(idx, 'packageTag', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                          >
                            <option value="">-- Select Tag --</option>
                            {packageTags.map(tag => (
                              <option key={tag} value={tag}>{tag}</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-20">
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => updateIncludedItem(idx, 'label', e.target.value)}
                            placeholder="Label"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                            title="Display label (defaults to tag name)"
                          />
                        </div>
                        <div className="w-16">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateIncludedItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>
                        <button
                          onClick={() => removeIncludedItem(idx)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {includedItems.length > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    Each row defines a requirement: tag = what type of item, quantity = how many. When adding this service to a work order, the user picks specific inventory items for each slot.
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
              >
                {saving ? (
                  <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</>
                ) : editingPkg ? 'Update Package' : 'Create Package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicePackageList;
