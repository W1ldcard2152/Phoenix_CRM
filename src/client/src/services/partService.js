import api from './api';

const partService = {
  // Get all parts with optional filters and pagination
  getAllParts: (params = {}) => {
    return api.get('/parts', { params });
  },

  // Get single part by ID
  getPart: (id) => {
    return api.get(`/parts/${id}`);
  },

  // Create new part
  createPart: (partData) => {
    return api.post('/parts', partData);
  },

  // Update existing part
  updatePart: (id, partData) => {
    return api.put(`/parts/${id}`, partData);
  },

  // Delete part (soft delete)
  deletePart: (id) => {
    return api.delete(`/parts/${id}`);
  },

  // Search parts by query
  searchParts: (query, limit = 20) => {
    return api.get('/parts/search', { 
      params: { q: query, limit } 
    });
  },

  // Get all categories
  getCategories: () => {
    return api.get('/parts/categories');
  },

  // Get all vendors
  getVendors: () => {
    return api.get('/parts/vendors');
  },

  // Get all brands
  getBrands: () => {
    return api.get('/parts/brands');
  },

  // Get parts with specific filters for work order integration
  getPartsForWorkOrder: (searchQuery = '', category = '', limit = 50) => {
    const params = {
      isActive: 'true',
      limit,
      sortBy: 'name',
      sortOrder: 'asc'
    };
    
    if (searchQuery) {
      params.search = searchQuery;
    }
    
    if (category) {
      params.category = category;
    }
    
    return api.get('/parts', { params });
  },

  // Get recent parts (last 30 days)
  getRecentParts: (limit = 20) => {
    return api.get('/parts', {
      params: {
        isActive: 'true',
        limit,
        sortBy: 'lastUpdated',
        sortOrder: 'desc'
      }
    });
  },

  // Get parts by category
  getPartsByCategory: (category, limit = 50) => {
    return api.get('/parts', {
      params: {
        category,
        isActive: 'true',
        limit,
        sortBy: 'name',
        sortOrder: 'asc'
      }
    });
  },

  // Get parts by vendor
  getPartsByVendor: (vendor, limit = 50) => {
    return api.get('/parts', {
      params: {
        vendor,
        isActive: 'true',
        limit,
        sortBy: 'name',
        sortOrder: 'asc'
      }
    });
  },

  // Get parts by brand
  getPartsByBrand: (brand, limit = 50) => {
    return api.get('/parts', {
      params: {
        brand,
        isActive: 'true',
        limit,
        sortBy: 'name',
        sortOrder: 'asc'
      }
    });
  },

  // Bulk operations
  bulkUpdateParts: (partIds, updateData) => {
    return api.patch('/parts/bulk', {
      partIds,
      updateData
    });
  },

  // Get parts statistics
  getPartsStats: () => {
    return api.get('/parts/stats');
  },

  // Get low stock parts (for inventory management)
  getLowStockParts: () => {
    return api.get('/parts', {
      params: {
        isActive: 'true',
        lowStock: 'true',
        sortBy: 'name',
        sortOrder: 'asc'
      }
    });
  },

  // Format part for display
  formatPartForDisplay: (part) => {
    return {
      ...part,
      displayName: `${part.name} (${part.partNumber})`,
      formattedPrice: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(part.price),
      formattedCost: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(part.cost),
      profitMargin: part.cost > 0 ? 
        ((part.price - part.cost) / part.cost * 100).toFixed(2) + '%' : 
        'N/A',
      markup: (part.price - part.cost).toFixed(2)
    };
  },

  // Validate part data
  validatePartData: (partData) => {
    const errors = [];

    if (!partData.name || partData.name.trim() === '') {
      errors.push('Part name is required');
    }

    if (!partData.partNumber || partData.partNumber.trim() === '') {
      errors.push('Part number is required');
    }

    if (!partData.price || partData.price < 0) {
      errors.push('Valid price is required');
    }

    if (!partData.cost || partData.cost < 0) {
      errors.push('Valid cost is required');
    }

    if (!partData.vendor || partData.vendor.trim() === '') {
      errors.push('Vendor is required');
    }

    if (!partData.category) {
      errors.push('Category is required');
    }

    if (!partData.brand || partData.brand.trim() === '') {
      errors.push('Brand is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

export default partService;