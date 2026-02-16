import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import FeedbackButton from '../common/FeedbackButton';
import GlobalSearch from '../common/GlobalSearch';

const Navbar = ({ onMobileMenuToggle }) => {
  const { currentUser, logout, isAuthenticated } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    logout();
  };

  const handleMobileMenuToggle = () => {
    // Find and trigger the sidebar's mobile menu toggle
    const event = new CustomEvent('toggleMobileMenu');
    window.dispatchEvent(event);
  };

  return (
    <header className="bg-white shadow-md sticky top-0 z-40">
      <div className="px-2 sm:px-4 lg:px-8">
        <div className="flex justify-between items-center h-16 sm:h-20 lg:h-24 gap-2 sm:gap-4">
          {/* Left side - Mobile menu + Logo */}
          <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
            {/* Mobile hamburger menu - only show on mobile */}
            {isMobile && isAuthenticated && (
              <button
                onClick={handleMobileMenuToggle}
                className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                aria-label="Open mobile menu"
              >
                <i className="fas fa-bars text-lg"></i>
              </button>
            )}

            {/* Logo */}
            <div className="flex-shrink-0">
              <Link to="/" className="text-xl font-bold text-primary-600">
                <img
                  src="/phxBanner.svg"
                  alt="Phoenix Automotive Group Banner"
                  className="h-8 sm:h-12 lg:h-14"
                />
              </Link>
            </div>
          </div>

          {/* Center - Global Search (visible when authenticated) */}
          {isAuthenticated && (
            <div className="flex-1 max-w-xl hidden md:block">
              <GlobalSearch />
            </div>
          )}

          {/* Right side - User controls */}
          <div className="flex items-center flex-shrink-0">
            {isAuthenticated ? (
              <div className="flex items-center space-x-2 sm:space-x-4">
                {/* User avatar + welcome message */}
                <div className="hidden sm:flex items-center space-x-2">
                  {currentUser?.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt=""
                      className="h-8 w-8 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-primary-500 text-white flex items-center justify-center text-sm font-medium">
                      {currentUser?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                  )}
                  <span className="text-xs sm:text-sm text-gray-700 truncate max-w-32 sm:max-w-none">
                    {currentUser?.name || 'User'}
                  </span>
                </div>

                {/* Feedback button - hidden on mobile */}
                <div className="hidden sm:block">
                  <FeedbackButton />
                </div>

                {/* Logout button */}
                <button
                  className="bg-primary-600 text-white rounded-md py-1.5 px-2 sm:py-2 sm:px-4 hover:bg-primary-700 transition text-xs sm:text-sm font-medium"
                  onClick={handleLogout}
                >
                  <span className="hidden sm:inline">Logout</span>
                  <i className="fas fa-sign-out-alt sm:hidden"></i>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Link
                  to="/login"
                  className="text-gray-700 hover:text-primary-600 transition text-xs sm:text-sm font-medium"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-primary-600 text-white rounded-md py-1.5 px-2 sm:py-2 sm:px-4 hover:bg-primary-700 transition text-xs sm:text-sm font-medium"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
