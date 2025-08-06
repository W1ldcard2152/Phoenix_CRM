import React, { useState, useEffect } from 'react';
import Button from '../common/Button';
import Input from '../common/Input';
import SelectInput from '../common/SelectInput';
import partService from '../../services/partService';

const PartsSelector = ({ onPartSelect, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [parts, setParts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCategories();
    fetchParts();
  }, []);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      fetchParts();
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery, categoryFilter]);

  const fetchCategories = async () => {
    try {
      const response = await partService.getCategories();
      setCategories(response.data.data.categories);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchParts = async () => {
    try {
      setLoading(true);
      const params = {
        isActive: 'true',
        limit: 50,
        sortBy: 'name',
        sortOrder: 'asc'
      };

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      if (categoryFilter) {
        params.category = categoryFilter;
      }

      const response = await partService.getAllParts(params);
      setParts(response.data.data.parts);
      setError(null);
    } catch (err) {
      console.error('Error fetching parts:', err);
      setError('Failed to load parts');
    } finally {
      setLoading(false);
    }
  };

  const handlePartSelect = (part) => {
    onPartSelect({
      name: part.name,
      partNumber: part.partNumber,
      price: part.price,
      vendor: part.vendor,
      quantity: 1,
      ordered: false,
      received: false,
      purchaseOrderNumber: ''
    });
    onClose();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
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
      'Other': 'bg-neutral-100 text-neutral-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...categories.map(cat => ({ value: cat, label: cat }))
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Select Part</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search and Filter */}
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search parts by name, part number, brand, or vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-48">
              <SelectInput
                name="category"
                options={categoryOptions}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                <p className="text-gray-600">Loading parts...</p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-600">{error}</p>
              <Button
                onClick={fetchParts}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                Try Again
              </Button>
            </div>
          ) : parts.length === 0 ? (
            <div className="text-center py-8">
              <div className="mb-4">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.47-.881-6.08-2.33" />
                </svg>
              </div>
              <p className="text-gray-600">No parts found</p>
              <p className="text-sm text-gray-500 mt-1">
                Try adjusting your search terms or category filter
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {parts.map((part) => (
                <div
                  key={part._id}
                  onClick={() => handlePartSelect(part)}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:shadow-md cursor-pointer transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium text-gray-900 group-hover:text-primary-700 truncate">
                          {part.name}
                        </h4>
                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${getCategoryColor(part.category)}`}>
                          {part.category}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Part #:</span>
                          <div>{part.partNumber}</div>
                        </div>
                        <div>
                          <span className="font-medium">Brand:</span>
                          <div>{part.brand}</div>
                        </div>
                        <div>
                          <span className="font-medium">Vendor:</span>
                          <div>{part.vendor}</div>
                        </div>
                        <div>
                          <span className="font-medium">Price:</span>
                          <div className="font-medium text-green-600">
                            {formatCurrency(part.price)}
                          </div>
                        </div>
                      </div>

                      {part.warranty && (
                        <div className="mt-2 text-xs text-blue-600">
                          Warranty: {part.warranty}
                        </div>
                      )}

                      {part.notes && (
                        <div className="mt-2 text-xs text-gray-500 truncate">
                          {part.notes}
                        </div>
                      )}

                      {part.url && (
                        <div className="mt-2 text-xs">
                          <a
                            href={part.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                            onClick={(e) => e.stopPropagation()} // Prevent triggering part selection
                          >
                            🔗 View Product Page
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {parts.length} parts found
            </p>
            <div className="flex space-x-3">
              <Button
                onClick={onClose}
                variant="light"
              >
                Cancel
              </Button>
              <Button
                onClick={() => window.open('/parts/new', '_blank')}
                variant="outline"
              >
                Add New Part
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartsSelector;