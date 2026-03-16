import API from './api';

const aiService = {
  extractFromUrl: async (url) => {
    try {
      const response = await API.post('/ai/extract-url', { url }, { timeout: 30000 });
      return response.data;
    } catch (error) {
      console.error('Error extracting from URL:', error);
      throw error;
    }
  }
};

export default aiService;
