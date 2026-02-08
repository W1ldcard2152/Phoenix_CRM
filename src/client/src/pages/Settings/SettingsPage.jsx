import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AuthService from '../../services/authService';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { currentUser, updateUser, updateToken } = useAuth();

  // User Info State
  const [userInfo, setUserInfo] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || ''
  });
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState({ type: '', text: '' });
  const [isUpdatingInfo, setIsUpdatingInfo] = useState(false);

  // Password State
  const [passwordData, setPasswordData] = useState({
    passwordCurrent: '',
    password: '',
    passwordConfirm: ''
  });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  const handleBack = () => {
    navigate(-1);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  // Handle user info update
  const handleUpdateInfo = async (e) => {
    e.preventDefault();
    setIsUpdatingInfo(true);
    setInfoMessage({ type: '', text: '' });

    try {
      const response = await AuthService.updateUserInfo(userInfo);
      // Update the user in context
      if (response.data?.user) {
        updateUser(response.data.user);
      }
      setInfoMessage({ type: 'success', text: 'Profile updated successfully!' });
      setIsEditingInfo(false);
      setTimeout(() => setInfoMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setInfoMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to update profile'
      });
    } finally {
      setIsUpdatingInfo(false);
    }
  };

  // Handle password update
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setIsUpdatingPassword(true);
    setPasswordMessage({ type: '', text: '' });

    // Validate password match
    if (passwordData.password !== passwordData.passwordConfirm) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' });
      setIsUpdatingPassword(false);
      return;
    }

    // Validate password length
    if (passwordData.password.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      setIsUpdatingPassword(false);
      return;
    }

    try {
      const response = await AuthService.updatePassword(passwordData);

      // Update the token and user in context (password change returns new token)
      if (response.token) {
        updateToken(response.token);
      }
      if (response.data?.user) {
        updateUser(response.data.user);
      }
      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
      setPasswordData({ passwordCurrent: '', password: '', passwordConfirm: '' });
      setShowPasswordSection(false);
      setTimeout(() => setPasswordMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setPasswordMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to update password'
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-800">Settings</h1>
        <div className="flex gap-2">
          <button
            onClick={handleBack}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Back
          </button>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <i className="fas fa-sync-alt mr-2"></i>
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-4xl space-y-6">
        {/* User Profile Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Profile Information</h2>
            {!isEditingInfo && (
              <button
                onClick={() => setIsEditingInfo(true)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                <i className="fas fa-edit mr-1"></i>
                Edit
              </button>
            )}
          </div>

          {infoMessage.text && (
            <div className={`mb-4 p-3 rounded ${
              infoMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {infoMessage.text}
            </div>
          )}

          <form onSubmit={handleUpdateInfo}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={userInfo.name}
                  onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })}
                  disabled={!isEditingInfo}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={userInfo.email}
                  onChange={(e) => setUserInfo({ ...userInfo, email: e.target.value })}
                  disabled={!isEditingInfo}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <input
                  type="text"
                  value={currentUser?.role || ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 capitalize"
                />
              </div>

              {isEditingInfo && (
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingInfo}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400"
                  >
                    {isUpdatingInfo ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingInfo(false);
                      setUserInfo({
                        name: currentUser?.name || '',
                        email: currentUser?.email || ''
                      });
                      setInfoMessage({ type: '', text: '' });
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Password Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Password</h2>
            {!showPasswordSection && (
              <button
                onClick={() => setShowPasswordSection(true)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                <i className="fas fa-key mr-1"></i>
                Change Password
              </button>
            )}
          </div>

          {passwordMessage.text && (
            <div className={`mb-4 p-3 rounded ${
              passwordMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {passwordMessage.text}
            </div>
          )}

          {showPasswordSection ? (
            <form onSubmit={handleUpdatePassword}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.passwordCurrent}
                    onChange={(e) => setPasswordData({ ...passwordData, passwordCurrent: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    minLength={8}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.password}
                    onChange={(e) => setPasswordData({ ...passwordData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    minLength={8}
                  />
                  <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.passwordConfirm}
                    onChange={(e) => setPasswordData({ ...passwordData, passwordConfirm: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    minLength={8}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400"
                  >
                    {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordSection(false);
                      setPasswordData({ passwordCurrent: '', password: '', passwordConfirm: '' });
                      setPasswordMessage({ type: '', text: '' });
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <p className="text-gray-600 text-sm">
              Click "Change Password" to update your password. You'll need to provide your current password for security.
            </p>
          )}
        </div>

        {/* Account Information Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Account Information</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Account Created:</span>
              <span className="font-medium text-gray-800">
                {currentUser?.createdAt ? new Date(currentUser.createdAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Last Updated:</span>
              <span className="font-medium text-gray-800">
                {currentUser?.updatedAt ? new Date(currentUser.updatedAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
