import api from './api';

const customerInteractionService = {
  // Get all interactions for a work order
  getWorkOrderInteractions: async (workOrderId) => {
    try {
      const response = await api.get(`/interactions/work-order/${workOrderId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching work order interactions:', error);
      throw error;
    }
  },

  // Get interaction statistics for a work order
  getInteractionStats: async (workOrderId) => {
    try {
      const response = await api.get(`/interactions/work-order/${workOrderId}/stats`);
      return response.data;
    } catch (error) {
      console.error('Error fetching interaction stats:', error);
      throw error;
    }
  },

  // Get batch interaction statistics for multiple work orders (batch endpoint)
  getBatchInteractionStats: async (workOrderIds) => {
    try {
      const response = await api.post('/interactions/batch-stats', { workOrderIds });
      return response.data;
    } catch (error) {
      console.error('Error fetching batch interaction stats:', error);
      throw error;
    }
  },

  // Get all interactions for a customer
  getCustomerInteractions: async (customerId) => {
    try {
      const response = await api.get(`/interactions/customer/${customerId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer interactions:', error);
      throw error;
    }
  },

  // Get pending follow-ups
  getPendingFollowUps: async () => {
    try {
      const response = await api.get('/interactions/follow-ups/pending');
      return response.data;
    } catch (error) {
      console.error('Error fetching pending follow-ups:', error);
      throw error;
    }
  },

  // Create a new interaction
  createInteraction: async (interactionData) => {
    try {
      const response = await api.post('/interactions', interactionData);
      return response.data;
    } catch (error) {
      console.error('Error creating interaction:', error);
      throw error;
    }
  },

  // Update an interaction
  updateInteraction: async (id, interactionData) => {
    try {
      const response = await api.put(`/interactions/${id}`, interactionData);
      return response.data;
    } catch (error) {
      console.error('Error updating interaction:', error);
      throw error;
    }
  },

  // Complete a follow-up
  completeFollowUp: async (id) => {
    try {
      const response = await api.put(`/interactions/${id}/complete-follow-up`);
      return response.data;
    } catch (error) {
      console.error('Error completing follow-up:', error);
      throw error;
    }
  },

  // Delete an interaction
  deleteInteraction: async (id) => {
    try {
      const response = await api.delete(`/interactions/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting interaction:', error);
      throw error;
    }
  },

  // Helper function to format interaction for display
  formatInteraction: (interaction) => {
    const date = new Date(interaction.createdAt);
    const time = date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const dateStr = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
    
    return {
      ...interaction,
      displayTime: time,
      displayDate: dateStr,
      displayDateTime: `${dateStr} at ${time}`
    };
  },

  // Get icon for contact type
  getContactTypeIcon: (contactType) => {
    const icons = {
      'Phone Call': '📞',
      'Text Message': '💬',
      'Email': '📧',
      'In Person': '👤',
      'Voicemail': '📱',
      'Other': '📝'
    };
    return icons[contactType] || '📝';
  },

  // Get color class for interaction outcome
  getOutcomeClass: (outcome) => {
    const positiveOutcomes = ['Spoke with Customer', 'Email Sent', 'Text Sent', 'Approved', 'Payment Received'];
    const negativeOutcomes = ['Declined', 'No Answer'];
    const pendingOutcomes = ['Left Voicemail', 'Callback Requested', 'Awaiting Response'];
    
    if (positiveOutcomes.includes(outcome)) return 'success';
    if (negativeOutcomes.includes(outcome)) return 'danger';
    if (pendingOutcomes.includes(outcome)) return 'warning';
    return 'secondary';
  }
};

export default customerInteractionService;