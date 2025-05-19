import API from './api';

const InvoiceService = {
  // Get all invoices
  getAllInvoices: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      
      // Add filters to params if provided
      if (filters.customer) params.append('customer', filters.customer);
      if (filters.vehicle) params.append('vehicle', filters.vehicle);
      if (filters.workOrder) params.append('workOrder', filters.workOrder);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.status) params.append('status', filters.status);
      
      const response = await API.get(`/invoices?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching invoices:', error);
      throw error;
    }
  },

  // Get a single invoice
  getInvoice: async (id) => {
    try {
      const response = await API.get(`/invoices/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching invoice with ID ${id}:`, error);
      throw error;
    }
  },

  // Create a new invoice
  createInvoice: async (invoiceData) => {
    try {
      const response = await API.post('/invoices', invoiceData);
      return response.data;
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  },

  // Update an invoice
  updateInvoice: async (id, invoiceData) => {
    try {
      const response = await API.patch(`/invoices/${id}`, invoiceData);
      return response.data;
    } catch (error) {
      console.error(`Error updating invoice with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete an invoice
  deleteInvoice: async (id) => {
    try {
      const response = await API.delete(`/invoices/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting invoice with ID ${id}:`, error);
      throw error;
    }
  },

  // Get invoice count (for generating invoice numbers)
  getInvoicesCount: async () => {
    try {
      const response = await API.get('/invoices/count');
      return response.data.count;
    } catch (error) {
      console.error('Error getting invoice count:', error);
      // Return a random number for local development if the endpoint is not available
      return Math.floor(Math.random() * 10000);
    }
  },

  // Generate PDF from invoice
  generatePDF: async (id) => {
    try {
      const response = await API.get(`/invoices/${id}/pdf`, {
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      console.error(`Error generating PDF for invoice with ID ${id}:`, error);
      throw error;
    }
  },

  // Mark invoice as paid
  markAsPaid: async (id, paymentData = {}) => {
    try {
      const response = await API.patch(`/invoices/${id}/pay`, paymentData);
      return response.data;
    } catch (error) {
      console.error(`Error marking invoice ${id} as paid:`, error);
      throw error;
    }
  },

  // Update invoice status
  updateInvoiceStatus: async (id, statusData) => {
    try {
      const response = await API.patch(`/invoices/${id}/status`, statusData);
      return response.data;
    } catch (error) {
      console.error(`Error updating status for invoice ${id}:`, error);
      throw error;
    }
  },

  // Send invoice via email
  sendViaEmail: async (id, emailData) => {
    try {
      const response = await API.post(`/invoices/${id}/send`, emailData);
      return response.data;
    } catch (error) {
      console.error(`Error sending invoice ${id} via email:`, error);
      throw error;
    }
  }
};

export default InvoiceService;
