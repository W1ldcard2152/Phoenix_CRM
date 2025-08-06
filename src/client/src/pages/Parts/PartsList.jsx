import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import SelectInput from '../../components/common/SelectInput';
import partService from '../../services/partService';

const PartsList = () => {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
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
  const categoryOptions = [
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

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Parts Inventory</h1>
        <Button to="/parts/new" variant="primary">
          Add New Part
        </Button>
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
              options={categoryOptions}
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
                            🔗 View Product
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
                        <Button
                          to={`/parts/${part._id}`}
                          variant="outline"
                          size="sm"
                        >
                          View
                        </Button>
                        <Button
                          to={`/parts/${part._id}/edit`}
                          variant="outline"
                          size="sm"
                        >
                          Edit
                        </Button>
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
    </div>
  );
};

export default PartsList;