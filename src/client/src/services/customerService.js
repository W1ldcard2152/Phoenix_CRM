import API from './api';

const CustomerService = {
  // Get all customers
  getAllCustomers: async () => {
    try {
      const response = await API.get('/customers');
      return response.data;
    } catch (error) {
      console.error('Error fetching customers:', error);
      throw error;
    }
  },

  // Get a customer by ID
  getCustomer: async (id) => {
    try {
      const response = await API.get(`/customers/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching customer with ID ${id}:`, error);
      throw error;
    }
  },

  // Create a new customer
  createCustomer: async (customerData) => {
    try {
      const response = await API.post('/customers', customerData);
      return response.data;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  },

  // Update a customer
  updateCustomer: async (id, customerData) => {
    try {
      const response = await API.patch(`/customers/${id}`, customerData);
      return response.data;
    } catch (error) {
      console.error(`Error updating customer with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete a customer
  deleteCustomer: async (id) => {
    try {
      const response = await API.delete(`/customers/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting customer with ID ${id}:`, error);
      throw error;
    }
  },

  // Search customers
  searchCustomers: async (query) => {
    try {
      const response = await API.get(`/customers/search?query=${query}`);
      return response.data;
    } catch (error) {
      console.error(`Error searching customers with query "${query}":`, error);
      throw error;
    }
  },

  // Get customer vehicles
  getCustomerVehicles: async (id) => {
    try {
      const response = await API.get(`/customers/${id}/vehicles`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching vehicles for customer with ID ${id}:`, error);
      throw error;
    }
  },

  // Check if customer exists by phone
  checkExistingCustomerByPhone: async (phone) => {
    try {
      const response = await API.get(`/customers/check-phone?phone=${encodeURIComponent(phone)}`);
      return response.data;
    } catch (error) {
      console.error(`Error checking customer by phone ${phone}:`, error);
      throw error;
    }
  }
};

export default CustomerService;
