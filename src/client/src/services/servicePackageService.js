import API from './api';

const ServicePackageService = {
  getAllPackages: async (params = {}) => {
    try {
      const response = await API.get('/service-packages', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching service packages:', error);
      throw error;
    }
  },

  getPackage: async (id) => {
    try {
      const response = await API.get(`/service-packages/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching service package:', error);
      throw error;
    }
  },

  createPackage: async (data) => {
    try {
      const response = await API.post('/service-packages', data);
      return response.data;
    } catch (error) {
      console.error('Error creating service package:', error);
      throw error;
    }
  },

  updatePackage: async (id, data) => {
    try {
      const response = await API.patch(`/service-packages/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating service package:', error);
      throw error;
    }
  },

  deletePackage: async (id) => {
    try {
      const response = await API.delete(`/service-packages/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting service package:', error);
      throw error;
    }
  }
};

export default ServicePackageService;
