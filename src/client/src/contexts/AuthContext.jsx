import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Logout function - calls server to clear HTTP-only cookie
  const logout = async () => {
    try {
      await axios.get('/api/users/logout', { withCredentials: true });
    } catch (err) {
      console.error('Logout error:', err);
    }
    setCurrentUser(null);
  };

  useEffect(() => {
    // Fetch current user data - cookie is sent automatically with credentials
    const fetchCurrentUser = async () => {
      try {
        const res = await axios.get('/api/users/me', { withCredentials: true });
        setCurrentUser(res.data.data.user);
        setLoading(false);
      } catch (err) {
        // User is not authenticated - this is expected if not logged in
        if (err.response?.status !== 401) {
          console.error('Error fetching user:', err);
        }
        setCurrentUser(null);
        setLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  // Login function - server sets HTTP-only cookie automatically
  const login = async (email, password) => {
    try {
      const res = await axios.post(
        '/api/users/login',
        { email, password },
        { withCredentials: true }
      );
      const { data } = res.data;
      setCurrentUser(data.user);
      return data.user;
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    }
  };

  // Register function - server sets HTTP-only cookie automatically
  const register = async (userData) => {
    try {
      const res = await axios.post(
        '/api/users/signup',
        userData,
        { withCredentials: true }
      );
      const { data } = res.data;
      setCurrentUser(data.user);
      return data.user;
    } catch (err) {
      console.error('Registration error:', err);
      throw err;
    }
  };

  // Update user data (for profile updates)
  const updateUser = (userData) => {
    setCurrentUser(userData);
  };

  // Refresh user data from server (for password changes, etc.)
  const refreshUser = async () => {
    try {
      const res = await axios.get('/api/users/me', { withCredentials: true });
      setCurrentUser(res.data.data.user);
    } catch (err) {
      console.error('Error refreshing user:', err);
    }
  };

  const value = {
    currentUser,
    user: currentUser, // Alias for components that use 'user'
    loading,
    login,
    logout,
    register,
    updateUser,
    refreshUser,
    isAuthenticated: !!currentUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
