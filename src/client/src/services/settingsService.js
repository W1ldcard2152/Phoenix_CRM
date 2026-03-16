import API from './api';

const SettingsService = {
  getSettings: async () => {
    const response = await API.get('/settings');
    return response.data;
  },

  updateSettings: async (data) => {
    const response = await API.patch('/settings', data);
    return response.data;
  },

  addVendor: async (vendor, hostname) => {
    const response = await API.post('/settings/vendors', { vendor, hostname });
    return response.data;
  },

  removeVendor: async (vendor) => {
    const response = await API.post('/settings/vendors/remove', { vendor });
    return response.data;
  },

  addCategory: async (category) => {
    const response = await API.post('/settings/categories', { category });
    return response.data;
  },

  removeCategory: async (category) => {
    const response = await API.post('/settings/categories/remove', { category });
    return response.data;
  },

  addTaskCategory: async (category) => {
    const response = await API.post('/settings/task-categories', { category });
    return response.data;
  },

  removeTaskCategory: async (category) => {
    const response = await API.post('/settings/task-categories/remove', { category });
    return response.data;
  },

  addInventoryCategory: async (category) => {
    const response = await API.post('/settings/inventory-categories', { category });
    return response.data;
  },

  removeInventoryCategory: async (category) => {
    const response = await API.post('/settings/inventory-categories/remove', { category });
    return response.data;
  },

  addPackageTag: async (tag) => {
    const response = await API.post('/settings/package-tags', { tag });
    return response.data;
  },

  removePackageTag: async (tag) => {
    const response = await API.post('/settings/package-tags/remove', { tag });
    return response.data;
  }
};

export default SettingsService;
