import API from './api';

const FeedbackService = {
  // Get all feedback entries
  getAllFeedback: async () => {
    try {
      const response = await API.get('/feedback');
      return response.data;
    } catch (error) {
      console.error('Error fetching feedback:', error);
      throw error;
    }
  },

  // Get a feedback entry by ID
  getFeedback: async (id) => {
    try {
      const response = await API.get(`/feedback/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching feedback with ID ${id}:`, error);
      throw error;
    }
  },

  // Create a new feedback entry
  createFeedback: async (feedbackData) => {
    try {
      const response = await API.post('/feedback', feedbackData);
      return response.data;
    } catch (error) {
      console.error('Error creating feedback:', error);
      throw error;
    }
  },

  // Update a feedback entry
  updateFeedback: async (id, feedbackData) => {
    try {
      const response = await API.patch(`/feedback/${id}`, feedbackData);
      return response.data;
    } catch (error) {
      console.error(`Error updating feedback with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete a feedback entry
  deleteFeedback: async (id) => {
    try {
      const response = await API.delete(`/feedback/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting feedback with ID ${id}:`, error);
      throw error;
    }
  },

  // Archive a feedback entry
  archiveFeedback: async (id) => {
    try {
      const response = await API.patch(`/feedback/${id}/archive`);
      return response.data;
    } catch (error) {
      console.error(`Error archiving feedback with ID ${id}:`, error);
      throw error;
    }
  },
};

export default FeedbackService;
