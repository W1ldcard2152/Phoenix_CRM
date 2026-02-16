import API from './api';

const QuoteService = {
  // Get all quotes
  getAllQuotes: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.customer) params.append('customer', filters.customer);
      if (filters.vehicle) params.append('vehicle', filters.vehicle);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.includeArchived) params.append('includeArchived', 'true');

      const response = await API.get(`/workorders/quotes?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching quotes:', error);
      throw error;
    }
  },

  // Get a quote by ID (quotes are stored as work orders)
  getQuote: async (id) => {
    try {
      const response = await API.get(`/workorders/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching quote with ID ${id}:`, error);
      throw error;
    }
  },

  // Create a new quote
  createQuote: async (quoteData) => {
    try {
      const response = await API.post('/workorders/quotes', quoteData);
      return response.data;
    } catch (error) {
      console.error('Error creating quote:', error);
      throw error;
    }
  },

  // Update a quote (uses work order update endpoint)
  updateQuote: async (id, quoteData) => {
    try {
      const response = await API.patch(`/workorders/${id}`, quoteData);
      return response.data;
    } catch (error) {
      console.error(`Error updating quote with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete a quote (uses work order delete endpoint)
  deleteQuote: async (id) => {
    try {
      const response = await API.delete(`/workorders/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting quote with ID ${id}:`, error);
      throw error;
    }
  },

  // Convert a quote to a work order (full or partial)
  convertToWorkOrder: async (id, data = {}) => {
    try {
      const response = await API.post(`/workorders/${id}/convert-to-work-order`, data);
      return response.data;
    } catch (error) {
      console.error(`Error converting quote ${id} to work order:`, error);
      throw error;
    }
  },

  // Generate a quote from an existing work order
  generateFromWorkOrder: async (workOrderId, data = {}) => {
    try {
      const response = await API.post(`/workorders/${workOrderId}/generate-quote`, data);
      return response.data;
    } catch (error) {
      console.error(`Error generating quote from work order ${workOrderId}:`, error);
      throw error;
    }
  },

  // Archive a quote
  archiveQuote: async (id) => {
    try {
      const response = await API.post(`/workorders/${id}/archive-quote`);
      return response.data;
    } catch (error) {
      console.error(`Error archiving quote ${id}:`, error);
      throw error;
    }
  },

  // Unarchive a quote
  unarchiveQuote: async (id) => {
    try {
      const response = await API.post(`/workorders/${id}/unarchive-quote`);
      return response.data;
    } catch (error) {
      console.error(`Error unarchiving quote ${id}:`, error);
      throw error;
    }
  },

  // Add part to quote
  addPart: async (id, partData) => {
    try {
      const response = await API.post(`/workorders/${id}/parts`, partData);
      return response.data;
    } catch (error) {
      console.error(`Error adding part to quote with ID ${id}:`, error);
      throw error;
    }
  },

  // Add labor to quote
  addLabor: async (id, laborData) => {
    try {
      const response = await API.post(`/workorders/${id}/labor`, laborData);
      return response.data;
    } catch (error) {
      console.error(`Error adding labor to quote with ID ${id}:`, error);
      throw error;
    }
  }
};

export default QuoteService;
