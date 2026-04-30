import API from './api';

const InventoryService = {
  getAllItems: async (params = {}) => {
    try {
      const response = await API.get('/inventory', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      throw error;
    }
  },

  getItem: async (id) => {
    try {
      const response = await API.get(`/inventory/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching inventory item ${id}:`, error);
      throw error;
    }
  },

  createItem: async (data) => {
    try {
      const response = await API.post('/inventory', data);
      return response.data;
    } catch (error) {
      console.error('Error creating inventory item:', error);
      throw error;
    }
  },

  updateItem: async (id, data) => {
    try {
      const response = await API.patch(`/inventory/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating inventory item ${id}:`, error);
      throw error;
    }
  },

  deleteItem: async (id) => {
    try {
      const response = await API.delete(`/inventory/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting inventory item ${id}:`, error);
      throw error;
    }
  },

  adjustQuantity: async (id, adjustment, reason) => {
    try {
      const response = await API.patch(`/inventory/${id}/adjust`, { adjustment, reason });
      return response.data;
    } catch (error) {
      console.error(`Error adjusting inventory item ${id}:`, error);
      throw error;
    }
  },

  getShoppingList: async () => {
    try {
      const response = await API.get('/inventory/shopping-list');
      return response.data;
    } catch (error) {
      console.error('Error fetching shopping list:', error);
      throw error;
    }
  },

  extractReceipt: async (formData) => {
    try {
      const response = await API.post('/inventory/extract-receipt', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000
      });
      return response.data;
    } catch (error) {
      console.error('Error extracting inventory receipt:', error);
      throw error;
    }
  },

  confirmReceipt: async (data) => {
    try {
      const response = await API.post('/inventory/confirm-receipt', data, { timeout: 30000 });
      return response.data;
    } catch (error) {
      console.error('Error confirming inventory receipt:', error);
      throw error;
    }
  }
};

export default InventoryService;
