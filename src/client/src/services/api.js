import axios from 'axios';

// Configure axios with default settings
// withCredentials: true ensures HTTP-only cookies are sent with requests
const API = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true // Send cookies with every request
});

// Add a response interceptor for global error handling
API.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle session expiration, but not for password update attempts or login
    const isPasswordUpdate = error.config?.url?.includes('/updateMyPassword');
    const isLogin = error.config?.url?.includes('/login');
    const isMe = error.config?.url?.includes('/me');

    if (error.response && error.response.status === 401 && !isPasswordUpdate && !isLogin && !isMe) {
      // Redirect to login on auth failure
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default API;
