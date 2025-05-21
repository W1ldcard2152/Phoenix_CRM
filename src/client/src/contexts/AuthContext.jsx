import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set token in axios defaults
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, [token, fetchCurrentUser]);

  // Fetch current user data
  const fetchCurrentUser = async () => {
    try {
      const res = await axios.get('/api/users/me');
      setCurrentUser(res.data.data.user);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching user:', err);
      logout();
      setLoading(false);
    }
  };

  // Login function
  const login = async (email, password) => {
    try {
      const res = await axios.post('/api/users/login', { email, password });
      const { token, data } = res.data;
      
      // Save token to local storage
      localStorage.setItem('token', token);
      setToken(token);
      setCurrentUser(data.user);
      
      return data.user;
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  // Register function
  const register = async (userData) => {
    try {
      const res = await axios.post('/api/users/signup', userData);
      const { token, data } = res.data;
      
      // Save token to local storage
      localStorage.setItem('token', token);
      setToken(token);
      setCurrentUser(data.user);
      
      return data.user;
    } catch (err) {
      console.error('Registration error:', err);
      throw err;
    }
  };

  const value = {
    currentUser,
    loading,
    login,
    logout,
    register,
    isAuthenticated: !!token
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
