const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

class WorkOrderNotesService {
  /**
   * Get all notes for a work order
   * @param {string} workOrderId - The work order ID
   * @param {boolean|null} customerFacing - Filter by customer-facing status (true/false/null for all)
   * @returns {Promise} API response with notes
   */
  async getNotes(workOrderId, customerFacing = null) {
    try {
      let url = `${API_BASE_URL}/workorders/${workOrderId}/notes`;
      
      if (customerFacing !== null) {
        url += `?customerFacing=${customerFacing}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch work order notes');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching work order notes:', error);
      throw error;
    }
  }

  /**
   * Create a new note for a work order
   * @param {string} workOrderId - The work order ID
   * @param {Object} noteData - Note data {content, isCustomerFacing}
   * @returns {Promise} API response with created note
   */
  async createNote(workOrderId, noteData) {
    try {
      const response = await fetch(`${API_BASE_URL}/workorders/${workOrderId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noteData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create work order note');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating work order note:', error);
      throw error;
    }
  }

  /**
   * Update an existing note
   * @param {string} workOrderId - The work order ID
   * @param {string} noteId - The note ID
   * @param {Object} updateData - Updated note data {content, isCustomerFacing}
   * @returns {Promise} API response with updated note
   */
  async updateNote(workOrderId, noteId, updateData) {
    try {
      const response = await fetch(`${API_BASE_URL}/workorders/${workOrderId}/notes/${noteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update work order note');
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating work order note:', error);
      throw error;
    }
  }

  /**
   * Delete a note
   * @param {string} workOrderId - The work order ID
   * @param {string} noteId - The note ID
   * @returns {Promise} API response
   */
  async deleteNote(workOrderId, noteId) {
    try {
      const response = await fetch(`${API_BASE_URL}/workorders/${workOrderId}/notes/${noteId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete work order note');
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting work order note:', error);
      throw error;
    }
  }

  /**
   * Get only customer-facing notes (for invoices)
   * @param {string} workOrderId - The work order ID
   * @returns {Promise} API response with customer-facing notes
   */
  async getCustomerFacingNotes(workOrderId) {
    try {
      const response = await fetch(`${API_BASE_URL}/workorders/${workOrderId}/notes/customer-facing`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch customer-facing notes');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching customer-facing notes:', error);
      throw error;
    }
  }
}

// Export a singleton instance
const workOrderNotesService = new WorkOrderNotesService();
export default workOrderNotesService;