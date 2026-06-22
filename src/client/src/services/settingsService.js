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

  addVendor: async (vendor, hostname, usedFor) => {
    const response = await API.post('/settings/vendors', { vendor, hostname, usedFor });
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

  renameInventoryCategory: async (oldName, newName) => {
    const response = await API.post('/settings/inventory-categories/rename', { oldName, newName });
    return response.data;
  },

  addPackageTag: async (tag) => {
    const response = await API.post('/settings/package-tags', { tag });
    return response.data;
  },

  removePackageTag: async (tag) => {
    const response = await API.post('/settings/package-tags/remove', { tag });
    return response.data;
  },

  addLaborType: async (laborType) => {
    const response = await API.post('/settings/labor-types', { laborType });
    return response.data;
  },

  renameLaborType: async (oldName, newName) => {
    const response = await API.post('/settings/labor-types/rename', { oldName, newName });
    return response.data;
  },

  removeLaborType: async (laborType) => {
    const response = await API.post('/settings/labor-types/remove', { laborType });
    return response.data;
  },

  addBrandOverride: async (brand) => {
    const response = await API.post('/settings/brand-overrides', { brand });
    return response.data;
  },

  updateBrandOverride: async (oldBrand, newBrand) => {
    const response = await API.post('/settings/brand-overrides/update', { oldBrand, newBrand });
    return response.data;
  },

  removeBrandOverride: async (brand) => {
    const response = await API.post('/settings/brand-overrides/remove', { brand });
    return response.data;
  },

  applyBrandOverrideToInventory: async (brand) => {
    const response = await API.post('/settings/brand-overrides/apply', { brand });
    return response.data;
  },

  applyAllBrandOverridesToInventory: async () => {
    const response = await API.post('/settings/brand-overrides/apply', { applyAll: true });
    return response.data;
  },

  updateShopHours: async (shopHours) => {
    const response = await API.patch('/settings', { shopHours });
    return response.data;
  },

  updateCompanyProfile: async (profile) => {
    const response = await API.patch('/settings', profile);
    return response.data;
  },

  uploadCompanyLogo: async (file) => {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await API.post('/settings/company-logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
};

export default SettingsService;
