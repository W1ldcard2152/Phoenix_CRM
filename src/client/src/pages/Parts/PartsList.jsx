import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import SelectInput from '../../components/common/SelectInput';
import partService from '../../services/partService';
import { useAuth } from '../../contexts/AuthContext';
import { permissions } from '../../utils/permissions';
import usePersistedState from '../../hooks/usePersistedState';
import UrlExtractButton from '../../components/common/UrlExtractButton';

const PartsList = () => {
  const { currentUser } = useAuth();
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = usePersistedState('parts:categoryFilter', '');
  const [vendorFilter, setVendorFilter] = usePersistedState('parts:vendorFilter', '');
  const [brandFilter, setBrandFilter] = usePersistedState('parts:brandFilter', '');
  const [statusFilter, setStatusFilter] = usePersistedState('parts:statusFilter', 'active');
  const [isSearching, setIsSearching] = useState(false);

  // Filter options
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [brands, setBrands] = useState([]);

  const [searchParams] = useSearchParams();
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalParts: 0
  });

  // Modal state
  const [showPartModal, setShowPartModal] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const defaultFormData = {
    name: '', partNumber: '', category: '', brand: '', vendor: '',
    cost: '', price: '', warranty: '', url: '', notes: '', quantityOnHand: 0
  };
  const [formData, setFormData] = useState({ ...defaultFormData });

  const categoryOptions = [
    { value: '', label: 'Select Category' },
    { value: 'Engine', label: 'Engine' },
    { value: 'Transmission', label: 'Transmission' },
    { value: 'Brakes', label: 'Brakes' },
    { value: 'Suspension', label: 'Suspension' },
    { value: 'Electrical', label: 'Electrical' },
    { value: 'Exhaust', label: 'Exhaust' },
    { value: 'Cooling', label: 'Cooling' },
    { value: 'Fuel System', label: 'Fuel System' },
    { value: 'Air & Filters', label: 'Air & Filters' },
    { value: 'Fluids & Chemicals', label: 'Fluids & Chemicals' },
    { value: 'Belts & Hoses', label: 'Belts & Hoses' },
    { value: 'Ignition', label: 'Ignition' },
    { value: 'Body Parts', label: 'Body Parts' },
    { value: 'Interior', label: 'Interior' },
    { value: 'Tires & Wheels', label: 'Tires & Wheels' },
    { value: 'Tools & Equipment', label: 'Tools & Equipment' },
    { value: 'Other', label: 'Other' }
  ];

  // Get filter parameters from URL
  const categoryParam = searchParams.get('category');

  useEffect(() => {
    fetchFilterOptions();
    if (categoryParam) {
      setCategoryFilter(categoryParam);
    }
  }, [categoryParam]);

  useEffect(() => {
    fetchParts();
  }, [categoryFilter, vendorFilter, brandFilter, statusFilter]);

  const fetchFilterOptions = async () => {
    try {
      const [categoriesRes, vendorsRes, brandsRes] = await Promise.all([
        partService.getCategories(),
        partService.getVendors(),
        partService.getBrands()
      ]);

      setCategories(categoriesRes.data.data.categories);
      setVendors(vendorsRes.data.data.vendors);
      setBrands(brandsRes.data.data.brands);
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  };

  const fetchParts = async (page = 1) => {
    try {
      setLoading(page === 1);

      const params = {
        page,
        limit: 25,
        sortBy: 'name',
        sortOrder: 'asc'
      };

      if (categoryFilter) params.category = categoryFilter;
      if (vendorFilter) params.vendor = vendorFilter;
      if (brandFilter) params.brand = brandFilter;
      if (statusFilter !== 'all') params.isActive = statusFilter === 'active';
      if (searchQuery) params.search = searchQuery;

      const response = await partService.getAllParts(params);
      setParts(response.data.data.parts);
      setPagination(response.data.data.pagination);

      setLoading(false);
    } catch (err) {
      console.error('Error fetching parts:', err);
      setError('Failed to load parts. Please try again later.');
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    await fetchParts(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('');
    setVendorFilter('');
    setBrandFilter('');
    setStatusFilter('active');
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const getStatusBadge = (isActive) => {
    return isActive ? (
      <span className="inline-block px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
        Active
      </span>
    ) : (
      <span className="inline-block px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
        Inactive
      </span>
    );
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Engine': 'bg-red-100 text-red-800',
      'Transmission': 'bg-purple-100 text-purple-800',
      'Brakes': 'bg-orange-100 text-orange-800',
      'Suspension': 'bg-blue-100 text-blue-800',
      'Electrical': 'bg-yellow-100 text-yellow-800',
      'Exhaust': 'bg-gray-100 text-gray-800',
      'Cooling': 'bg-cyan-100 text-cyan-800',
      'Fuel System': 'bg-green-100 text-green-800',
      'Air & Filters': 'bg-indigo-100 text-indigo-800',
      'Fluids & Chemicals': 'bg-pink-100 text-pink-800',
      'Belts & Hoses': 'bg-teal-100 text-teal-800',
      'Ignition': 'bg-amber-100 text-amber-800',
      'Body Parts': 'bg-lime-100 text-lime-800',
      'Interior': 'bg-emerald-100 text-emerald-800',
      'Tires & Wheels': 'bg-slate-100 text-slate-800',
      'Tools & Equipment': 'bg-violet-100 text-violet-800',
      'Other': 'bg-neutral-100 text-neutral-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  // Filter options for dropdowns
  const filterCategoryOptions = [
    { value: '', label: 'All Categories' },
    ...categories.map(cat => ({ value: cat, label: cat }))
  ];

  const vendorOptions = [
    { value: '', label: 'All Vendors' },
    ...vendors.map(vendor => ({ value: vendor, label: vendor }))
  ];

  const brandOptions = [
    { value: '', label: 'All Brands' },
    ...brands.map(brand => ({ value: brand, label: brand }))
  ];

  const statusOptions = [
    { value: 'active', label: 'Active Only' },
    { value: 'inactive', label: 'Inactive Only' },
    { value: 'all', label: 'All Parts' }
  ];

  // Modal handlers
  const openCreateModal = () => {
    setEditingPart(null);
    setFormData({ ...defaultFormData });
    setFormError(null);
    setShowPartModal(true);
  };

  const openEditModal = async (part) => {
    setEditingPart(part);
    setFormData({
      name: part.name || '',
      partNumber: part.partNumber || '',
      category: part.category || '',
      brand: part.brand || '',
      vendor: part.vendor || '',
      cost: part.cost?.toString() || '',
      price: part.price?.toString() || '',
      warranty: part.warranty || '',
      url: part.url || '',
      notes: part.notes || '',
      quantityOnHand: part.quantityOnHand || 0
    });
    setFormError(null);
    setShowPartModal(true);
  };

  const handleSavePart = async () => {
    if (!formData.name.trim()) { setFormError('Part name is required'); return; }
    if (!formData.partNumber.trim()) { setFormError('Part number is required'); return; }
    if (!formData.category) { setFormError('Category is required'); return; }
    if (!formData.vendor.trim()) { setFormError('Vendor is required'); return; }
    if (!formData.brand.trim()) { setFormError('Brand is required'); return; }

    setFormSaving(true);
    setFormError(null);
    try {
      const partData = {
        ...formData,
        price: parseFloat(formData.price) || 0,
        cost: parseFloat(formData.cost) || 0
      };

      if (editingPart) {
        await partService.updatePart(editingPart._id, partData);
      } else {
        await partService.createPart(partData);
      }

      setShowPartModal(false);
      fetchParts(pagination.currentPage);
      fetchFilterOptions();
    } catch (err) {
      console.error('Error saving part:', err);
      setFormError(err.response?.data?.message || 'Failed to save part.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleActive = async (part) => {
    try {
      await partService.updatePart(part._id, { isActive: !part.isActive });
      fetchParts(pagination.currentPage);
    } catch (err) {
      console.error('Error toggling part status:', err);
    }
  };

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Parts Catalog</h1>
        {permissions.parts.canCreate(currentUser) && (
          <Button onClick={openCreateModal} variant="primary">
            Add to Catalog
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <Card>
        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name, part number, brand, or vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
              />
            </div>
            <Button
              onClick={handleSearch}
              variant="secondary"
              disabled={isSearching}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SelectInput
              name="category"
              options={filterCategoryOptions}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            />
            <SelectInput
              name="vendor"
              options={vendorOptions}
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
            />
            <SelectInput
              name="brand"
              options={brandOptions}
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
            />
            <SelectInput
              name="status"
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </div>

          <div className="flex justify-between items-center">
            <Button
              onClick={handleClearFilters}
              variant="outline"
              size="sm"
            >
              Clear Filters
            </Button>
            <p className="text-sm text-gray-600">
              {pagination.totalParts} total parts
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-48">
            <p>Loading parts...</p>
          </div>
        ) : parts.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <p>No parts found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Part Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category & Brand
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vendor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pricing
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {parts.map((part) => (
                  <tr key={part._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 truncate max-w-xs">
                        {part.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        #{part.partNumber}
                      </div>
                      {part.warranty && (
                        <div className="text-xs text-blue-600">
                          Warranty: {part.warranty}
                        </div>
                      )}
                      {part.url && (
                        <div className="text-xs mt-1">
                          <a
                            href={part.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            View Product
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-block px-2 py-1 text-xs rounded-full ${getCategoryColor(part.category)}`}>
                        {part.category}
                      </span>
                      <div className="text-sm text-gray-900 mt-1">
                        {part.brand}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {part.vendor}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div>Sell: {formatCurrency(part.price)}</div>
                        <div>Cost: {formatCurrency(part.cost)}</div>
                        <div className="text-xs text-green-600">
                          +{formatCurrency(part.price - part.cost)}
                          {part.cost > 0 && ` (${(((part.price - part.cost) / part.cost) * 100).toFixed(1)}%)`}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(part.isActive)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {permissions.parts.canEdit(currentUser) && (
                          <Button
                            onClick={() => openEditModal(part)}
                            variant="outline"
                            size="sm"
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <div className="flex space-x-2">
              <Button
                onClick={() => fetchParts(pagination.currentPage - 1)}
                disabled={!pagination.hasPrevPage}
                variant="outline"
                size="sm"
              >
                Previous
              </Button>
              <span className="px-3 py-1 text-sm text-gray-600">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              <Button
                onClick={() => fetchParts(pagination.currentPage + 1)}
                disabled={!pagination.hasNextPage}
                variant="outline"
                size="sm"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ========== ADD/EDIT PART MODAL ========== */}
      {showPartModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowPartModal(false)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-xl sm:mx-4 rounded-t-2xl max-h-[90vh] flex flex-col shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingPart ? 'Edit Catalog Part' : 'Add to Parts Catalog'}
              </h2>
              <button onClick={() => setShowPartModal(false)} className="text-gray-400 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {formError}
                </div>
              )}

              {/* Name + Part Number */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Oil Filter"
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Part # *</label>
                  <input
                    type="text"
                    value={formData.partNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, partNumber: e.target.value }))}
                    placeholder="OF-12345"
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {categoryOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Vendor + Brand row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
                  <input
                    type="text"
                    value={formData.vendor}
                    onChange={(e) => setFormData(prev => ({ ...prev, vendor: e.target.value }))}
                    placeholder="e.g., AutoZone"
                    list="part-vendors-list"
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <datalist id="part-vendors-list">
                    {vendors.map(v => <option key={v} value={v} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand *</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value }))}
                    placeholder="e.g., Bosch"
                    list="part-brands-list"
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <datalist id="part-brands-list">
                    {brands.map(b => <option key={b} value={b} />)}
                  </datalist>
                </div>
              </div>

              {/* Cost + Price row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) => setFormData(prev => ({ ...prev, cost: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retail Price *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Profit preview */}
              {formData.cost && formData.price && parseFloat(formData.cost) > 0 && parseFloat(formData.price) > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                  Markup: {formatCurrency(parseFloat(formData.price) - parseFloat(formData.cost))}
                  {' '}({(((parseFloat(formData.price) - parseFloat(formData.cost)) / parseFloat(formData.cost)) * 100).toFixed(1)}%)
                </div>
              )}

              {/* Warranty */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warranty</label>
                <input
                  type="text"
                  value={formData.warranty}
                  onChange={(e) => setFormData(prev => ({ ...prev, warranty: e.target.value }))}
                  placeholder="e.g., 1 year / 12,000 miles"
                  className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Product URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product URL</label>
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
                      price: prev.price || (data.price != null ? data.price.toString() : ''),
                      cost: prev.cost || (data.cost != null ? data.cost.toString() : data.price != null ? data.price.toString() : ''),
                      vendor: prev.vendor || data.vendor || '',
                      brand: prev.brand || data.brand || '',
                      warranty: prev.warranty || data.warranty || ''
                    }))}
                  />
                </div>
              </div>

              {/* Quantity on Hand */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity on Hand</label>
                <input
                  type="number"
                  min="0"
                  value={formData.quantityOnHand}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantityOnHand: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  rows={2}
                  className="w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>
            </div>

            {/* Save/Cancel buttons */}
            <div className="sticky bottom-0 bg-white px-4 py-3 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => setShowPartModal(false)}
                className="flex-1 py-3 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 active:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePart}
                disabled={formSaving || !formData.name.trim()}
                className="flex-1 py-3 rounded-lg text-sm font-semibold text-white bg-primary-600 active:bg-primary-700 disabled:opacity-50"
              >
                {formSaving ? 'Saving...' : editingPart ? 'Save Changes' : 'Add Part'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartsList;
