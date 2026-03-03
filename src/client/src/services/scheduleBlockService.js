import API from './api';

const ScheduleBlockService = {
  // Get all schedule blocks
  getAll: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.technician) params.append('technician', filters.technician);
      if (filters.active !== undefined) params.append('active', filters.active);
      const response = await API.get(`/schedule-blocks?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching schedule blocks:', error);
      throw error;
    }
  },

  // Get a single schedule block
  getById: async (id) => {
    try {
      const response = await API.get(`/schedule-blocks/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching schedule block ${id}:`, error);
      throw error;
    }
  },

  // Create a schedule block
  create: async (data) => {
    try {
      const response = await API.post('/schedule-blocks', data);
      return response.data;
    } catch (error) {
      console.error('Error creating schedule block:', error);
      throw error;
    }
  },

  // Update a schedule block
  update: async (id, data) => {
    try {
      const response = await API.patch(`/schedule-blocks/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating schedule block ${id}:`, error);
      throw error;
    }
  },

  // Delete a schedule block
  remove: async (id) => {
    try {
      const response = await API.delete(`/schedule-blocks/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting schedule block ${id}:`, error);
      throw error;
    }
  },

  // Get expanded blocks for a date range (concrete calendar instances)
  getExpanded: async (startDate, endDate) => {
    try {
      const response = await API.get(`/schedule-blocks/expanded/${startDate}/${endDate}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching expanded blocks for ${startDate} to ${endDate}:`, error);
      throw error;
    }
  },

  // Add an exception to a schedule block
  addException: async (id, exceptionData) => {
    try {
      const response = await API.post(`/schedule-blocks/${id}/exceptions`, exceptionData);
      return response.data;
    } catch (error) {
      console.error(`Error adding exception to schedule block ${id}:`, error);
      throw error;
    }
  },

  // Remove an exception from a schedule block
  removeException: async (id, exceptionId) => {
    try {
      const response = await API.delete(`/schedule-blocks/${id}/exceptions/${exceptionId}`);
      return response.data;
    } catch (error) {
      console.error(`Error removing exception from schedule block ${id}:`, error);
      throw error;
    }
  }
};

export default ScheduleBlockService;
