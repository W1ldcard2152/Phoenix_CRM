import api from './api';

const followUpService = {
  getDashboardFollowUps: async () => {
    try {
      const response = await api.get('/follow-ups/dashboard');
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard follow-ups:', error);
      throw error;
    }
  },

  getEntityFollowUps: async (entityType, entityId) => {
    try {
      const response = await api.get(`/follow-ups/entity/${entityType}/${entityId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching entity follow-ups:', error);
      throw error;
    }
  },

  getFollowUps: async (params = {}) => {
    try {
      const response = await api.get('/follow-ups', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching follow-ups:', error);
      throw error;
    }
  },

  getFollowUp: async (id) => {
    try {
      const response = await api.get(`/follow-ups/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching follow-up:', error);
      throw error;
    }
  },

  createFollowUp: async (data) => {
    try {
      const response = await api.post('/follow-ups', data);
      return response.data;
    } catch (error) {
      console.error('Error creating follow-up:', error);
      throw error;
    }
  },

  updateFollowUp: async (id, data) => {
    try {
      const response = await api.put(`/follow-ups/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating follow-up:', error);
      throw error;
    }
  },

  closeFollowUp: async (id, resolutionNote) => {
    try {
      const response = await api.put(`/follow-ups/${id}/close`, { resolutionNote });
      return response.data;
    } catch (error) {
      console.error('Error closing follow-up:', error);
      throw error;
    }
  },

  reopenFollowUp: async (id) => {
    try {
      const response = await api.put(`/follow-ups/${id}/reopen`);
      return response.data;
    } catch (error) {
      console.error('Error reopening follow-up:', error);
      throw error;
    }
  },

  addNote: async (id, noteData) => {
    try {
      const response = await api.post(`/follow-ups/${id}/notes`, noteData);
      return response.data;
    } catch (error) {
      console.error('Error adding note:', error);
      throw error;
    }
  },

  updateNote: async (id, noteId, noteData) => {
    try {
      const response = await api.put(`/follow-ups/${id}/notes/${noteId}`, noteData);
      return response.data;
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  },

  deleteNote: async (id, noteId) => {
    try {
      const response = await api.delete(`/follow-ups/${id}/notes/${noteId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting note:', error);
      throw error;
    }
  },

  deleteFollowUp: async (id) => {
    try {
      const response = await api.delete(`/follow-ups/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting follow-up:', error);
      throw error;
    }
  }
};

export default followUpService;
