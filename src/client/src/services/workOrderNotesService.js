import API from './api';

/**
 * Service for managing work order notes
 */
const workOrderNotesService = {
  /**
   * Get all notes for a work order
   * @param {string} workOrderId - The work order ID
   * @param {boolean|null} customerFacing - Filter by customer-facing status (true/false/null for all)
   * @returns {Promise} API response with notes
   */
  getNotes: async (workOrderId, customerFacing = null) => {
    try {
      let url = `/workorders/${workOrderId}/notes`;

      if (customerFacing !== null) {
        url += `?customerFacing=${customerFacing}`;
      }

      const response = await API.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching work order notes:', error);
      throw error;
    }
  },

  /**
   * Create a new note for a work order
   * @param {string} workOrderId - The work order ID
   * @param {Object} noteData - Note data {content, isCustomerFacing}
   * @returns {Promise} API response with created note
   */
  createNote: async (workOrderId, noteData) => {
    try {
      const response = await API.post(`/workorders/${workOrderId}/notes`, noteData);
      return response.data;
    } catch (error) {
      console.error('Error creating work order note:', error);
      throw error;
    }
  },

  /**
   * Update an existing note
   * @param {string} workOrderId - The work order ID
   * @param {string} noteId - The note ID
   * @param {Object} updateData - Updated note data {content, isCustomerFacing}
   * @returns {Promise} API response with updated note
   */
  updateNote: async (workOrderId, noteId, updateData) => {
    try {
      const response = await API.put(`/workorders/${workOrderId}/notes/${noteId}`, updateData);
      return response.data;
    } catch (error) {
      console.error('Error updating work order note:', error);
      throw error;
    }
  },

  /**
   * Delete a note
   * @param {string} workOrderId - The work order ID
   * @param {string} noteId - The note ID
   * @returns {Promise} API response
   */
  deleteNote: async (workOrderId, noteId) => {
    try {
      const response = await API.delete(`/workorders/${workOrderId}/notes/${noteId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting work order note:', error);
      throw error;
    }
  },

  /**
   * Get only customer-facing notes (for invoices/quotes)
   * @param {string} workOrderId - The work order ID
   * @returns {Promise} API response with customer-facing notes
   */
  getCustomerFacingNotes: async (workOrderId) => {
    try {
      const response = await API.get(`/workorders/${workOrderId}/notes/customer-facing`);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer-facing notes:', error);
      throw error;
    }
  }
};

export default workOrderNotesService;
