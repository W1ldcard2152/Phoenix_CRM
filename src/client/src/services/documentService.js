import WorkOrderService from './workOrderService';
import QuoteService from './quoteService';

const DocumentService = {
  // Fetch any document (quote or work order) by ID
  getDocument: async (id) => WorkOrderService.getWorkOrder(id),

  // Create - delegates based on mode
  createDocument: async (data, isQuote) => {
    return isQuote
      ? QuoteService.createQuote(data)
      : WorkOrderService.createWorkOrder(data);
  },

  // Update - always uses workOrder endpoint (quotes ARE work orders)
  updateDocument: async (id, data) => WorkOrderService.updateWorkOrder(id, data),

  // Delete
  deleteDocument: async (id) => WorkOrderService.deleteWorkOrder(id),

  // Status update (WO only)
  updateStatus: async (id, status, extraData) => WorkOrderService.updateStatus(id, status, extraData),

  // Quote-specific operations
  convertToWorkOrder: async (id, data) => QuoteService.convertToWorkOrder(id, data),
  archiveQuote: async (id) => QuoteService.archiveQuote(id),
  unarchiveQuote: async (id) => QuoteService.unarchiveQuote(id),
  generateFromWorkOrder: async (woId, data) => QuoteService.generateFromWorkOrder(woId, data),

  // Parts/Labor
  addPart: async (id, partData) => WorkOrderService.addPart(id, partData),
  addLabor: async (id, laborData) => WorkOrderService.addLabor(id, laborData),

  // WO-specific operations
  splitWorkOrder: async (id, data) => WorkOrderService.splitWorkOrder(id, data),
  generateInvoice: async (id) => WorkOrderService.generateInvoice(id),
};

export default DocumentService;
