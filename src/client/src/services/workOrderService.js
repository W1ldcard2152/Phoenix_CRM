// src/client/src/services/workOrderService.js
import API from './api';

const WorkOrderService = {
  // Get all work orders
  getAllWorkOrders: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      
      // Add filters to params if provided
      if (filters.status) params.append('status', filters.status);
      if (filters.customer) params.append('customer', filters.customer);
      if (filters.vehicle) params.append('vehicle', filters.vehicle);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      
      const response = await API.get(`/workorders?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching work orders:', error);
      throw error;
    }
  },

  // Get a work order by ID
  getWorkOrder: async (id) => {
    try {
      const response = await API.get(`/workorders/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching work order with ID ${id}:`, error);
      throw error;
    }
  },

  // Create a new work order
  createWorkOrder: async (workOrderData) => {
    try {
      const response = await API.post('/workorders', workOrderData);
      return response.data;
    } catch (error) {
      console.error('Error creating work order:', error);
      throw error;
    }
  },

  // Update a work order
  updateWorkOrder: async (id, workOrderData) => {
    try {
      const response = await API.patch(`/workorders/${id}`, workOrderData);
      return response.data;
    } catch (error) {
      console.error(`Error updating work order with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete a work order
  deleteWorkOrder: async (id) => {
    try {
      const response = await API.delete(`/workorders/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting work order with ID ${id}:`, error);
      throw error;
    }
  },

  // Update work order status
  updateStatus: async (id, status) => {
    try {
      const response = await API.patch(`/workorders/${id}/status`, { status });
      return response.data;
    } catch (error) {
      console.error(`Error updating status for work order with ID ${id}:`, error);
      throw error;
    }
  },

  // Add part to work order
  addPart: async (id, partData) => {
    try {
      const response = await API.post(`/workorders/${id}/parts`, partData);
      return response.data;
    } catch (error) {
      console.error(`Error adding part to work order with ID ${id}:`, error);
      throw error;
    }
  },

  // Add labor to work order
  addLabor: async (id, laborData) => {
    try {
      const response = await API.post(`/workorders/${id}/labor`, laborData);
      return response.data;
    } catch (error) {
      console.error(`Error adding labor to work order with ID ${id}:`, error);
      throw error;
    }
  },

  // Generate invoice
  generateInvoice: async (id) => {
    try {
      const response = await API.get(`/workorders/${id}/invoice`);
      return response.data;
    } catch (error) {
      console.error(`Error generating invoice for work order with ID ${id}:`, error);
      throw error;
    }
  },

  // Get work orders by status
  getWorkOrdersByStatus: async (status) => {
    try {
      const response = await API.get(`/workorders/status/${encodeURIComponent(status)}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching work orders with status ${status}:`, error);
      throw error;
    }
  },

  // Search work orders
  searchWorkOrders: async (query) => {
    try {
      const response = await API.get(`/workorders/search?query=${query}`);
      return response.data;
    } catch (error) {
      console.error(`Error searching work orders with query "${query}":`, error);
      throw error;
    }
  },

  // Get work orders awaiting scheduling (Parts Received status with no future appointments)
  getWorkOrdersAwaitingScheduling: async () => {
    try {
      const response = await API.get('/workorders/awaiting-scheduling');
      return response.data;
    } catch (error) {
      console.error('Error fetching work orders awaiting scheduling:', error);
      throw error;
    }
  },

  // Get all work orders that need scheduling (for appointments page)
  getWorkOrdersNeedingScheduling: async () => {
    try {
      const response = await API.get('/workorders/needing-scheduling');
      return response.data;
    } catch (error) {
      console.error('Error fetching work orders needing scheduling:', error);
      throw error;
    }
  },

  // Split a work order
  splitWorkOrder: async (id, splitData) => {
    try {
      const response = await API.post(`/workorders/${id}/split`, splitData);
      return response.data;
    } catch (error) {
      console.error(`Error splitting work order ${id}:`, error);
      throw error;
    }
  }
};

export default WorkOrderService;