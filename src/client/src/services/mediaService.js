import API from './api';

const MediaService = {
  // Upload media
  uploadMedia: async (formData) => {
    try {
      const response = await API.post('/media/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error uploading media:', error);
      throw error;
    }
  },

  // Get all media
  getAllMedia: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      
      // Add filters to params if provided
      if (filters.workOrder) params.append('workOrder', filters.workOrder);
      if (filters.vehicle) params.append('vehicle', filters.vehicle);
      if (filters.customer) params.append('customer', filters.customer);
      if (filters.type) params.append('type', filters.type);
      
      const response = await API.get(`/media?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching media:', error);
      throw error;
    }
  },

  // Get a single media item
  getMedia: async (id) => {
    try {
      const response = await API.get(`/media/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching media with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete media
  deleteMedia: async (id) => {
    try {
      const response = await API.delete(`/media/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting media with ID ${id}:`, error);
      throw error;
    }
  },

  // Get signed URL for media
  getSignedUrl: async (id) => {
    try {
      const response = await API.get(`/media/${id}/signed-url`);
      return response.data;
    } catch (error) {
      console.error(`Error getting signed URL for media with ID ${id}:`, error);
      throw error;
    }
  },

  // Share media via email
  shareMediaViaEmail: async (id, email) => {
    try {
      const response = await API.post(`/media/${id}/share`, { email });
      return response.data;
    } catch (error) {
      console.error(`Error sharing media with ID ${id} via email:`, error);
      throw error;
    }
  },

  // Get attachment counts for multiple work orders in a single call (batch endpoint)
  getBatchAttachmentCounts: async (workOrderIds) => {
    try {
      const response = await API.post('/media/batch-counts', { workOrderIds });
      return response.data;
    } catch (error) {
      console.error('Error fetching batch attachment counts:', error);
      throw error;
    }
  }
};

export default MediaService;