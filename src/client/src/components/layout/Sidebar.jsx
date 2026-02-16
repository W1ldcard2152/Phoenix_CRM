// src/client/src/components/layout/Sidebar.jsx - Updated with Invoice link and Mobile Responsive

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar = () => {
  const { isAuthenticated, user } = useAuth(); // Assuming user object is available in AuthContext
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();

  // Handle window resize to detect mobile/desktop
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768; // md breakpoint
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(false); // Don't use collapsed state on mobile
        setMobileMenuOpen(false); // Close mobile menu on resize
      }
    };

    handleResize(); // Set initial state
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  }, [location.pathname, isMobile]);

  // Listen for mobile menu toggle from Navbar
  useEffect(() => {
    const handleMobileMenuToggle = () => {
      if (isMobile) {
        setMobileMenuOpen(prev => !prev);
      }
    };

    window.addEventListener('toggleMobileMenu', handleMobileMenuToggle);
    return () => window.removeEventListener('toggleMobileMenu', handleMobileMenuToggle);
  }, [isMobile]);

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileMenuOpen(!mobileMenuOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  // If not authenticated, don't show sidebar
  if (!isAuthenticated) {
    return null;
  }

  const userRole = user?.role;

  // Role-based navigation filtering
  // Tiers: admin > management > service-writer > technician
  const allPrimaryItems = [
    { name: 'Dashboard', path: '/', icon: 'fas fa-tachometer-alt', roles: null },
    { name: 'Customers', path: '/customers', icon: 'fas fa-users', roles: ['admin', 'management', 'service-writer'] },
    { name: 'Vehicles', path: '/vehicles', icon: 'fas fa-car', roles: ['admin', 'management', 'service-writer'] },
    { name: 'Work Orders', path: '/work-orders', icon: 'fas fa-clipboard-list', roles: null },
    { name: 'Quotes', path: '/quotes', icon: 'fas fa-file-alt', roles: ['admin', 'management', 'service-writer'] },
    { name: 'Technician Portal', path: '/technician-portal', icon: 'fas fa-wrench', roles: ['admin', 'management', 'service-writer', 'technician'] },
    { name: 'Appointments', path: '/appointments', icon: 'fas fa-calendar-alt', roles: ['admin', 'management', 'service-writer'] },
    { name: 'Parts', path: '/parts', icon: 'fas fa-cogs', roles: ['admin', 'management', 'service-writer'] },
    { name: 'Invoices', path: '/invoices', icon: 'fas fa-file-invoice-dollar', roles: ['admin', 'management', 'service-writer'] },
  ];

  const allSecondaryItems = [
    { name: 'Technicians', path: '/technicians', icon: 'fas fa-hard-hat', roles: ['admin', 'management', 'service-writer'] },
    { name: 'Administration', path: '/admin', icon: 'fas fa-shield-alt', roles: ['admin', 'management'] },
    { name: 'Settings', path: '/settings', icon: 'fas fa-sliders-h', roles: null },
  ];

  const filterByRole = (items) =>
    items.filter(item => !item.roles || !userRole || item.roles.includes(userRole));

  const primaryNavigationItems = filterByRole(allPrimaryItems);
  const secondaryNavigationItems = filterByRole(allSecondaryItems);

  // Get user initial - using a placeholder if user or user.name is not available
  const userInitial = user && user.name ? user.name.charAt(0).toUpperCase() : (user && user.email ? user.email.charAt(0).toUpperCase() : 'U');
  const userName = user && user.name ? user.name : (user && user.email ? user.email : 'User');


  // Mobile: Render as overlay
  if (isMobile) {
    return (
      <>
        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-50"
              onClick={() => setMobileMenuOpen(false)}
            />
            
            {/* Sidebar */}
            <div className="fixed top-0 left-0 h-full w-80 max-w-[85vw] text-white shadow-xl transform transition-transform duration-300 ease-in-out"
              style={{
                backgroundImage: 'linear-gradient(to bottom, rgba(23, 37, 84, 0.95), rgba(17, 24, 39, 0.98)), url(/navbar.jpg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Header with close button */}
              <div className="flex items-center justify-between p-4 border-b border-primary-700">
                <div className="flex items-center">
                  <img src="/phxBanner.svg" alt="Phoenix CRM" className="h-8" />
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded hover:bg-primary-700 focus:outline-none"
                >
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>

              {/* Navigation Content */}
              <div className="flex flex-col h-full pt-4">
                {/* Quick Entry CTA */}
                <div className="px-4 mb-3">
                  <Link
                    to="/intake"
                    className={`flex items-center py-3 px-4 rounded-lg font-semibold transition-colors duration-150 ${
                      location.pathname === '/intake'
                        ? 'bg-primary-500 text-white shadow-md'
                        : 'bg-primary-500/20 text-primary-200 border border-primary-400/30 hover:bg-primary-500/30'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <i className="fas fa-plus-circle mr-3 w-5 text-center text-lg"></i>
                    <span>Quick Entry</span>
                  </Link>
                </div>

                {/* Primary Navigation */}
                <nav className="flex-grow">
                  <ul className="mb-6">
                    {primaryNavigationItems.map((item) => (
                      <li key={item.name} className="mb-1">
                        <Link
                          to={item.path}
                          className={`flex items-center py-4 px-6 ${
                            location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
                              ? 'bg-primary-700 border-l-4 border-accent-500'
                              : 'hover:bg-primary-700 hover:border-l-4 hover:border-accent-500/50'
                          } transition-colors duration-150`}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <i className={`${item.icon} mr-4 w-5 text-center text-lg`}></i>
                          <span className="font-medium">{item.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {/* Secondary Navigation */}
                  <hr className="my-4 mx-6 border-primary-600" />
                  <ul className="mb-4">
                    {secondaryNavigationItems.map((item) => (
                      <li key={item.name} className="mb-1">
                        <Link
                          to={item.path}
                          className={`flex items-center py-4 px-6 ${
                            location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
                              ? 'bg-primary-700 border-l-4 border-accent-500'
                              : 'hover:bg-primary-700 hover:border-l-4 hover:border-accent-500/50'
                          } transition-colors duration-150`}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <i className={`${item.icon} mr-4 w-5 text-center text-lg`}></i>
                          <span className="font-medium">{item.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>

                {/* User Section */}
                <div className="p-6 border-t border-primary-700 mt-auto">
                  <div className="flex items-center cursor-pointer group p-2 rounded hover:bg-primary-700/50">
                    {user?.avatar ? (
                      <img src={user.avatar} alt="" className="h-10 w-10 mr-3 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex items-center justify-center h-10 w-10 mr-3 bg-accent-500 rounded-full text-white font-semibold group-hover:bg-accent-600 transition-colors duration-150">
                        {userInitial}
                      </div>
                    )}
                    <span className="font-medium group-hover:text-accent-300 truncate">{userName}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop: Render as fixed sidebar
  return (
    <div
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } text-white transition-all duration-300 ease-in-out min-h-screen flex flex-col relative hidden md:flex`}
      style={{
        backgroundImage: 'linear-gradient(to bottom, rgba(23, 37, 84, 0.85), rgba(17, 24, 39, 0.95)), url(/navbar.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Desktop toggle button */}
      <div className="relative z-10 flex items-center justify-end p-4 border-b border-primary-700 h-[60px]">
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-primary-700 focus:outline-none"
        >
          <i className={`fas ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
        </button>
      </div>

      {/* Quick Entry CTA - Desktop */}
      <div className={`relative z-10 ${collapsed ? 'px-2' : 'px-3'} pt-3 mb-2`}>
        <Link
          to="/intake"
          className={`flex items-center ${collapsed ? 'justify-center' : ''} py-2.5 px-3 rounded-lg font-semibold transition-colors duration-150 ${
            location.pathname === '/intake'
              ? 'bg-primary-500 text-white shadow-md'
              : 'bg-primary-500/20 text-primary-200 border border-primary-400/30 hover:bg-primary-500/30'
          }`}
          title={collapsed ? 'Quick Entry' : undefined}
        >
          <i className={`fas fa-plus-circle ${collapsed ? 'text-lg' : 'mr-3 w-5 text-center'}`}></i>
          {!collapsed && <span className="text-sm">Quick Entry</span>}
        </Link>
      </div>

      {/* Desktop Navigation */}
      <nav className="mt-0 flex-grow relative z-10">
        <ul className="mb-4">
          {primaryNavigationItems.map((item) => (
            <li key={item.name} className="mb-1">
              <Link
                to={item.path}
                className={`flex items-center py-3 px-4 ${
                  collapsed ? 'justify-center' : 'justify-start'
                } ${
                  location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
                    ? 'bg-primary-700 border-l-4 border-accent-500'
                    : 'hover:bg-primary-700 hover:border-l-4 hover:border-accent-500/50'
                } transition-colors duration-150`}
              >
                <i className={`${item.icon} ${collapsed ? 'text-lg' : 'mr-3 w-5 text-center'}`}></i>
                {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Desktop Secondary Navigation */}
      <div className="relative z-10">
        {!collapsed && <hr className="my-3 mx-4 border-primary-600" />}
        <nav className="pb-2">
          <ul>
            {secondaryNavigationItems.map((item) => (
              <li key={item.name} className="mb-1">
                <Link
                  to={item.path}
                  className={`flex items-center py-3 px-4 ${
                    collapsed ? 'justify-center' : 'justify-start'
                  } ${
                    location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
                      ? 'bg-primary-700 border-l-4 border-accent-500'
                      : 'hover:bg-primary-700 hover:border-l-4 hover:border-accent-500/50'
                  } transition-colors duration-150`}
                >
                  <i className={`${item.icon} ${collapsed ? 'text-lg' : 'mr-3 w-5 text-center'}`}></i>
                  {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Desktop User Section */}
      <div className="p-3 border-t border-primary-700 mt-auto relative z-10">
        <div className={`flex items-center ${collapsed ? 'justify-center' : ''} cursor-pointer group p-1 rounded hover:bg-primary-700/50`}>
          {user?.avatar ? (
            <img src={user.avatar} alt="" className={`h-8 w-8 ${collapsed ? '' : 'mr-2'} rounded-full`} referrerPolicy="no-referrer" />
          ) : (
            <div className={`flex items-center justify-center h-8 w-8 ${collapsed ? '' : 'mr-2'} bg-accent-500 rounded-full text-white font-semibold text-sm group-hover:bg-accent-600 transition-colors duration-150`}>
              {userInitial}
            </div>
          )}
          {!collapsed && <span className="text-sm font-medium group-hover:text-accent-300 truncate">{userName}</span>}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
