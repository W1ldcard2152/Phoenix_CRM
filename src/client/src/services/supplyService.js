import API from './api';

/**
 * Shop supplies API client.
 *
 * Separate from inventoryService — /api/inventory and the old Shop Inventory
 * page stay live and untouched during the transition.
 */
const SupplyService = {
  // ── Supplies ──
  getAll: async (params = {}) => {
    try {
      const response = await API.get('/supplies', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching supplies:', error);
      throw error;
    }
  },

  getOne: async (id) => {
    try {
      const response = await API.get(`/supplies/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching supply ${id}:`, error);
      throw error;
    }
  },

  create: async (data) => {
    try {
      const response = await API.post('/supplies', data);
      return response.data;
    } catch (error) {
      console.error('Error creating supply:', error);
      throw error;
    }
  },

  update: async (id, data) => {
    try {
      const response = await API.patch(`/supplies/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating supply ${id}:`, error);
      throw error;
    }
  },

  remove: async (id) => {
    try {
      const response = await API.delete(`/supplies/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting supply ${id}:`, error);
      throw error;
    }
  },

  adjustQuantity: async (id, { quantity, type, unit, note }) => {
    try {
      const response = await API.patch(`/supplies/${id}/adjust`, { quantity, type, unit, note });
      return response.data;
    } catch (error) {
      console.error(`Error adjusting supply ${id}:`, error);
      throw error;
    }
  },

  /**
   * Attach a photo. Accepts a File from an <input type="file"> or a Blob from a
   * clipboard paste — a pasted blob has no name, so one is supplied.
   */
  uploadPhoto: async (id, fileOrBlob) => {
    try {
      const form = new FormData();
      const name = fileOrBlob.name || `pasted-${Date.now()}.png`;
      form.append('photo', fileOrBlob, name);
      const response = await API.post(`/supplies/${id}/photo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
      });
      return response.data;
    } catch (error) {
      console.error(`Error uploading photo for supply ${id}:`, error);
      throw error;
    }
  },

  deletePhoto: async (id) => {
    try {
      const response = await API.delete(`/supplies/${id}/photo`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting photo for supply ${id}:`, error);
      throw error;
    }
  },

  /**
   * Same-origin src for an item photo. Keyed on photoUpdatedAt so replacing a
   * photo busts the browser cache; returns null when there is no photo.
   */
  photoUrl: (supply) => (supply?.photoKey
    ? `/api/supplies/${supply._id}/photo?v=${new Date(supply.photoUpdatedAt || 0).getTime()}`
    : null),

  bulkUpdate: async (ids, set) => {
    try {
      const response = await API.patch('/supplies/bulk', { ids, set });
      return response.data;
    } catch (error) {
      console.error('Error bulk-updating supplies:', error);
      throw error;
    }
  },

  getShoppingList: async () => {
    try {
      const response = await API.get('/supplies/shopping-list');
      return response.data;
    } catch (error) {
      console.error('Error fetching supplies shopping list:', error);
      throw error;
    }
  },

  // ── Tags ──
  getTags: async () => {
    try {
      const response = await API.get('/supplies/tags');
      return response.data;
    } catch (error) {
      console.error('Error fetching supply tags:', error);
      throw error;
    }
  },

  createTag: async (data) => {
    try {
      const response = await API.post('/supplies/tags', data);
      return response.data;
    } catch (error) {
      console.error('Error creating supply tag:', error);
      throw error;
    }
  },

  updateTag: async (id, data) => {
    try {
      const response = await API.patch(`/supplies/tags/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating supply tag ${id}:`, error);
      throw error;
    }
  },

  deleteTag: async (id) => {
    try {
      const response = await API.delete(`/supplies/tags/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting supply tag ${id}:`, error);
      throw error;
    }
  },

  getFields: async () => {
    try {
      const response = await API.get('/supplies/fields');
      return response.data;
    } catch (error) {
      console.error('Error fetching supply fields:', error);
      throw error;
    }
  },

  // ── Vocabulary ──
  getVocab: async () => {
    try {
      const response = await API.get('/supplies/vocab');
      return response.data;
    } catch (error) {
      console.error('Error fetching supply vocabulary:', error);
      throw error;
    }
  },

  createVocab: async (fieldKey, value, label) => {
    try {
      const response = await API.post('/supplies/vocab', { fieldKey, value, label });
      return response.data;
    } catch (error) {
      console.error('Error creating vocabulary entry:', error);
      throw error;
    }
  },

  updateVocab: async (id, data) => {
    try {
      const response = await API.patch(`/supplies/vocab/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating vocabulary entry ${id}:`, error);
      throw error;
    }
  },

  deleteVocab: async (id) => {
    try {
      const response = await API.delete(`/supplies/vocab/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting vocabulary entry ${id}:`, error);
      throw error;
    }
  }
};

export default SupplyService;
