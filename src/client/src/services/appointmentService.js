import API from './api';

const AppointmentService = {
  // Get all appointments
  getAllAppointments: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      
      // Add filters to params if provided
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.status) params.append('status', filters.status);
      if (filters.technician) params.append('technician', filters.technician);
      
      const response = await API.get(`/appointments?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching appointments:', error);
      throw error;
    }
  },

  // Get a single appointment
  getAppointment: async (id) => {
    try {
      const response = await API.get(`/appointments/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching appointment with ID ${id}:`, error);
      throw error;
    }
  },

  // Create a new appointment
  createAppointment: async (appointmentData) => {
    try {
      const response = await API.post('/appointments', appointmentData);
      return response.data;
    } catch (error) {
      console.error('Error creating appointment:', error);
      throw error;
    }
  },

  // Update an appointment
  updateAppointment: async (id, appointmentData) => {
    try {
      const response = await API.patch(`/appointments/${id}`, appointmentData);
      return response.data;
    } catch (error) {
      console.error(`Error updating appointment with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete an appointment
  deleteAppointment: async (id) => {
    try {
      const response = await API.delete(`/appointments/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting appointment with ID ${id}:`, error);
      throw error;
    }
  },

  // Create work order from appointment
  createWorkOrderFromAppointment: async (id) => {
    try {
      const response = await API.post(`/appointments/${id}/create-work-order`);
      return response.data;
    } catch (error) {
      console.error(`Error creating work order from appointment with ID ${id}:`, error);
      throw error;
    }
  },

  // Send appointment reminder
  sendAppointmentReminder: async (id) => {
    try {
      const response = await API.post(`/appointments/${id}/send-reminder`);
      return response.data;
    } catch (error) {
      console.error(`Error sending reminder for appointment with ID ${id}:`, error);
      throw error;
    }
  },

  // Check for scheduling conflicts
  checkConflicts: async (appointmentData) => {
    try {
      const response = await API.post('/appointments/check-conflicts', appointmentData);
      return response.data;
    } catch (error) {
      console.error('Error checking for appointment conflicts:', error);
      throw error;
    }
  },

  // Get appointments by date range
  getAppointmentsByDateRange: async (startDate, endDate) => {
    try {
      const response = await API.get(`/appointments/date-range/${startDate}/${endDate}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching appointments for date range ${startDate} to ${endDate}:`, error);
      throw error;
    }
  },

  // Get today's appointments
  getTodayAppointments: async () => {
    try {
      const response = await API.get('/appointments/today');
      return response.data;
    } catch (error) {
      console.error('Error fetching today\'s appointments:', error);
      throw error;
    }
  },

  // Get customer appointments
  getCustomerAppointments: async (customerId) => {
    try {
      const response = await API.get(`/appointments/customer/${customerId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching appointments for customer with ID ${customerId}:`, error);
      throw error;
    }
  },

  // Get vehicle appointments
  getVehicleAppointments: async (vehicleId) => {
    try {
      const response = await API.get(`/appointments/vehicle/${vehicleId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching appointments for vehicle with ID ${vehicleId}:`, error);
      throw error;
    }
  }
};

export default AppointmentService;