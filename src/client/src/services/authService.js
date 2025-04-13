import API from './api';

const AuthService = {
  // Login
  login: async (email, password) => {
    try {
      const response = await API.post('/users/login', { email, password });
      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  // Register
  register: async (userData) => {
    try {
      const response = await API.post('/users/signup', userData);
      return response.data;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  },

  // Logout
  logout: async () => {
    try {
      const response = await API.get('/users/logout');
      return response.data;
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  },

  // Get current user
  getCurrentUser: async () => {
    try {
      const response = await API.get('/users/me');
      return response.data;
    } catch (error) {
      console.error('Error fetching current user:', error);
      throw error;
    }
  },

  // Update current user info
  updateUserInfo: async (userData) => {
    try {
      const response = await API.patch('/users/updateMe', userData);
      return response.data;
    } catch (error) {
      console.error('Error updating user info:', error);
      throw error;
    }
  },

  // Update password
  updatePassword: async (passwordData) => {
    try {
      const response = await API.patch('/users/updateMyPassword', passwordData);
      return response.data;
    } catch (error) {
      console.error('Error updating password:', error);
      throw error;
    }
  },

  // Forgot password
  forgotPassword: async (email) => {
    try {
      const response = await API.post('/users/forgotPassword', { email });
      return response.data;
    } catch (error) {
      console.error('Forgot password error:', error);
      throw error;
    }
  },

  // Reset password
  resetPassword: async (token, passwordData) => {
    try {
      const response = await API.patch(`/users/resetPassword/${token}`, passwordData);
      return response.data;
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  }
};

export default AuthService;