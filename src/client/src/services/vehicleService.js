import API from './api';

const VehicleService = {
  // Get all vehicles
  getAllVehicles: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      
      // Add filters to params if provided
      if (filters.customer) params.append('customer', filters.customer);
      if (filters.make) params.append('make', filters.make);
      if (filters.model) params.append('model', filters.model);
      
      const response = await API.get(`/vehicles?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      throw error;
    }
  },

  // Get a vehicle by ID
  getVehicle: async (id) => {
    try {
      const response = await API.get(`/vehicles/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching vehicle with ID ${id}:`, error);
      throw error;
    }
  },

  // Create a new vehicle
  createVehicle: async (vehicleData) => {
    try {
      const response = await API.post('/vehicles', vehicleData);
      return response.data;
    } catch (error) {
      console.error('Error creating vehicle:', error);
      throw error;
    }
  },

  // Update a vehicle
  updateVehicle: async (id, vehicleData) => {
    try {
      const response = await API.patch(`/vehicles/${id}`, vehicleData);
      return response.data;
    } catch (error) {
      console.error(`Error updating vehicle with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete a vehicle
  deleteVehicle: async (id) => {
    try {
      const response = await API.delete(`/vehicles/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting vehicle with ID ${id}:`, error);
      throw error;
    }
  },

  // Search vehicles
  searchVehicles: async (query) => {
    try {
      const response = await API.get(`/vehicles/search?query=${query}`);
      return response.data;
    } catch (error) {
      console.error(`Error searching vehicles with query "${query}":`, error);
      throw error;
    }
  },

  // Get vehicle service history
  getVehicleServiceHistory: async (id) => {
    try {
      const response = await API.get(`/vehicles/${id}/service-history`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching service history for vehicle with ID ${id}:`, error);
      throw error;
    }
  }
};

export default VehicleService;