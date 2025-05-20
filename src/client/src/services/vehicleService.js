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
      // Process mileage history to ensure dates are valid
      if (vehicleData.mileageHistory && vehicleData.mileageHistory.length > 0) {
        vehicleData.mileageHistory = vehicleData.mileageHistory.map(record => ({
          ...record,
          date: record.date || new Date().toISOString().split('T')[0],
          mileage: parseInt(record.mileage) || 0
        }));
      }
      
      const response = await API.post('/vehicles', vehicleData);
      return response.data;
    } catch (error) {
      console.error('Error creating vehicle:', error);
      console.log('Full error object:', error); // Added console.log
      throw error;
    }
  },

  // Update a vehicle
  updateVehicle: async (id, vehicleData) => {
    try {
      // Process mileage history to ensure dates are valid
      if (vehicleData.mileageHistory && vehicleData.mileageHistory.length > 0) {
        vehicleData.mileageHistory = vehicleData.mileageHistory.map(record => ({
          ...record,
          date: record.date || new Date().toISOString().split('T')[0],
          mileage: parseInt(record.mileage) || 0
        }));
        
        // Sort mileage history by date (newest first) to ensure currentMileage is updated correctly
        vehicleData.mileageHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Update current mileage if the most recent record has a higher mileage
        if (vehicleData.mileageHistory.length > 0 && 
            vehicleData.mileageHistory[0].mileage > (vehicleData.currentMileage || 0)) {
          vehicleData.currentMileage = vehicleData.mileageHistory[0].mileage;
        }
      }
      
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
  },
  
  // Add mileage record
  addMileageRecord: async (id, mileageData) => {
    try {
      // Format the data
      const formattedData = {
        date: mileageData.date || new Date().toISOString().split('T')[0],
        mileage: parseInt(mileageData.mileage) || 0,
        notes: mileageData.notes || ''
      };
      
      // Get current vehicle data
      const vehicleResponse = await API.get(`/vehicles/${id}`);
      const vehicleData = vehicleResponse.data.vehicle;
      
      // Update mileage history
      const updatedVehicle = {
        ...vehicleData,
        mileageHistory: [
          ...(vehicleData.mileageHistory || []),
          formattedData
        ],
        // Update current mileage if new record is higher
        currentMileage: Math.max(vehicleData.currentMileage || 0, formattedData.mileage)
      };
      
      // Update vehicle
      const response = await API.patch(`/vehicles/${id}`, updatedVehicle);
      return response.data;
    } catch (error) {
      console.error(`Error adding mileage record for vehicle with ID ${id}:`, error);
      throw error;
    }
  },
  
  // Get mileage at a specific date (estimated if exact date not available)
  getMileageAtDate: async (id, date) => {
    try {
      const vehicleResponse = await API.get(`/vehicles/${id}`);
      const vehicle = vehicleResponse.data.vehicle;
      
      if (!vehicle.mileageHistory || vehicle.mileageHistory.length === 0) {
        return vehicle.currentMileage || 0;
      }
      
      const targetDate = new Date(date);
      const sortedHistory = [...vehicle.mileageHistory].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
      );
      
      // Exact match
      const exactMatch = sortedHistory.find(record => 
        new Date(record.date).toDateString() === targetDate.toDateString()
      );
      
      if (exactMatch) {
        return exactMatch.mileage;
      }
      
      // Find closest records before and after
      const before = [...sortedHistory].reverse().find(record => 
        new Date(record.date) <= targetDate
      );
      
      const after = sortedHistory.find(record => 
        new Date(record.date) >= targetDate
      );
      
      // No records before, use first record or 0
      if (!before) {
        return after ? after.mileage : 0;
      }
      
      // No records after, use last record
      if (!after) {
        return before.mileage;
      }
      
      // Interpolate between the two closest records
      const beforeDate = new Date(before.date);
      const afterDate = new Date(after.date);
      const totalDays = (afterDate - beforeDate) / (1000 * 60 * 60 * 24);
      const daysBetween = (targetDate - beforeDate) / (1000 * 60 * 60 * 24);
      const ratio = daysBetween / totalDays;
      
      // Linear interpolation
      const estimatedMileage = before.mileage + (after.mileage - before.mileage) * ratio;
      
      return Math.round(estimatedMileage);
    } catch (error) {
      console.error(`Error estimating mileage for vehicle with ID ${id} at date ${date}:`, error);
      throw error;
    }
  }
};

export default VehicleService;
