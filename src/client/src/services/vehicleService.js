import API from './api';

const VehicleService = {
  // Get all vehicles
  getAllVehicles: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.customer) params.append('customer', filters.customer);
    if (filters.make) params.append('make', filters.make);
    if (filters.model) params.append('model', filters.model);
    const response = await API.get(`/vehicles?${params.toString()}`);
    return response.data;
  },

  // Get a vehicle by ID
  getVehicle: async (id) => {
    const response = await API.get(`/vehicles/${id}`);
    return response.data;
  },

  // Create a new vehicle
  createVehicle: async (vehicleData) => {
    const response = await API.post('/vehicles', vehicleData);
    return response.data;
  },

  // Update a vehicle
  updateVehicle: async (id, vehicleData) => {
    const response = await API.patch(`/vehicles/${id}`, vehicleData);
    return response.data;
  },

  // Delete a vehicle
  deleteVehicle: async (id) => {
    const response = await API.delete(`/vehicles/${id}`);
    return response.data;
  },

  // Search vehicles
  searchVehicles: async (query) => {
    const response = await API.get(`/vehicles/search?query=${encodeURIComponent(query)}`);
    return response.data;
  },

  // Get vehicle service history
  getVehicleServiceHistory: async (id) => {
    const response = await API.get(`/vehicles/${id}/service-history`);
    return response.data;
  },

  // Add a mileage record (uses the dedicated server endpoint, which handles
  // TZ-correct date parsing and currentMileage update via the model's pre-save hook).
  addMileageRecord: async (id, { date, mileage, notes } = {}) => {
    const response = await API.post(`/vehicles/${id}/mileage`, { date, mileage, notes });
    return response.data;
  },

  // Get mileage history
  getMileageHistory: async (id) => {
    const response = await API.get(`/vehicles/${id}/mileage-history`);
    return response.data;
  },

  // Get estimated mileage at a given date (server interpolates between records)
  getMileageAtDate: async (id, date) => {
    const response = await API.get(`/vehicles/${id}/mileage-at-date`, { params: { date } });
    return response.data;
  },

  // Check if VIN exists in database
  checkVinExists: async (vin) => {
    const response = await API.get(`/vehicles/check-vin?vin=${encodeURIComponent(vin)}`);
    return response.data;
  }
};

export default VehicleService;
