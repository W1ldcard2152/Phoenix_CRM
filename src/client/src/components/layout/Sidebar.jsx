// src/client/src/components/layout/Sidebar.jsx - Updated with Invoice link and Mobile Responsive

import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar = () => {
  const { isAuthenticated, user } = useAuth(); // Assuming user object is available in AuthContext
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
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

  // Close the user/settings popover when the route changes
  useEffect(() => {
    setUserMenuOpen(false);
  }, [location.pathname]);

  // Close the user/settings popover on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

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
    { name: 'Follow-Ups', path: '/follow-ups', icon: 'fas fa-thumbtack', roles: ['admin', 'management', 'service-writer'] },
    { name: 'Technician Portal', path: '/technician-portal', icon: 'fas fa-wrench', roles: ['admin', 'management', 'service-writer', 'technician'] },
    { name: 'Calendar & Tasks', path: '/appointments', icon: 'fas fa-calendar-alt', roles: ['admin', 'management', 'service-writer'] },
    { name: 'Shop Inventory', path: '/inventory', icon: 'fas fa-boxes-stacked', roles: null },
    { name: 'Service Packages', path: '/service-packages', icon: 'fas fa-box-open', roles: ['admin', 'management'] },
    { name: 'Invoices', path: '/invoices', icon: 'fas fa-file-invoice-dollar', roles: ['admin', 'management', 'service-writer'] },
  ];

  const allSecondaryItems = [
    { name: 'Technicians', path: '/technicians', icon: 'fas fa-hard-hat', roles: ['admin', 'management', 'service-writer'] },
    { name: 'Administration', path: '/admin', icon: 'fas fa-shield-alt', roles: ['admin'] },
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
            <div
              className="fixed top-0 left-0 h-full w-80 max-w-[85vw] text-white shadow-xl transform transition-transform duration-300 ease-in-out"
              style={{ backgroundColor: '#4c2622' }}
            >
              {/* Brand header — logo blends into the solid brand color */}
              <div className="relative border-b border-primary-700/60">
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="absolute top-2 right-2 p-2 rounded text-white/70 hover:bg-primary-700 focus:outline-none"
                >
                  <i className="fas fa-times text-lg"></i>
                </button>
                <div className="flex justify-center pt-6 pb-4 px-4">
                  <Link to="/" onClick={() => setMobileMenuOpen(false)} title="Dashboard">
                    <img src="/cvLogo.png" alt="CV Repair — by Certaverus Systems" className="w-40 max-w-full" />
                  </Link>
                </div>
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
                <nav className="flex-grow min-h-0 overflow-y-auto sidebar-scroll">
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
                </nav>

                {/* User Section */}
                <div className="p-6 border-t border-primary-700 mt-auto relative" ref={userMenuRef}>
                  {/* Settings popover */}
                  {userMenuOpen && (
                    <div
                      className="absolute bottom-full left-6 right-6 mb-2 rounded-lg shadow-xl overflow-hidden border border-primary-600"
                      style={{ backgroundColor: '#5a302b' }}
                    >
                      <ul>
                        {secondaryNavigationItems.map((item) => (
                          <li key={item.name}>
                            <Link
                              to={item.path}
                              onClick={() => { setUserMenuOpen(false); setMobileMenuOpen(false); }}
                              className={`flex items-center py-3 px-5 ${
                                location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
                                  ? 'bg-primary-700 text-white'
                                  : 'hover:bg-primary-700'
                              } transition-colors duration-150`}
                            >
                              <i className={`${item.icon} mr-3 w-5 text-center`}></i>
                              <span className="font-medium">{item.name}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-center p-2 rounded">
                    {user?.avatar ? (
                      <img src={user.avatar} alt="" className="h-10 w-10 mr-3 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex items-center justify-center h-10 w-10 mr-3 bg-accent-500 rounded-full text-white font-semibold">
                        {userInitial}
                      </div>
                    )}
                    <span className="font-medium truncate flex-grow">{userName}</span>
                    {secondaryNavigationItems.length > 0 && (
                      <button
                        onClick={() => setUserMenuOpen((prev) => !prev)}
                        className={`ml-2 p-2 rounded text-white/70 hover:bg-primary-700 hover:text-white focus:outline-none transition-colors duration-150 ${userMenuOpen ? 'bg-primary-700 text-white' : ''}`}
                        title="Settings & more"
                        aria-label="Settings & more"
                      >
                        <i className="fas fa-cog text-lg"></i>
                      </button>
                    )}
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
      } text-white transition-all duration-300 ease-in-out h-screen sticky top-0 z-30 flex flex-col relative hidden md:flex`}
      style={{ backgroundColor: '#4c2622' }}
    >
      {/* Brand header — the logo's background matches the solid sidebar color,
          so the dog + name + tagline appear to float on the brand color */}
      <div className="relative z-10 border-b border-primary-700/60">
        <button
          onClick={toggleSidebar}
          className="absolute top-2 right-2 z-20 p-1 rounded text-white/70 hover:bg-primary-700 focus:outline-none"
        >
          <i className={`fas ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'} text-xs`}></i>
        </button>
        {collapsed ? (
          <div className="flex justify-center py-4">
            <Link to="/" title="Dashboard">
              <img src="/cvDog.png" alt="CV Repair" className="w-9" />
            </Link>
          </div>
        ) : (
          <div className="flex justify-center pt-6 pb-4 px-3">
            <Link to="/" title="Dashboard">
              <img src="/cvLogo.png" alt="CV Repair — by Certaverus Systems" className="w-40 max-w-full" />
            </Link>
          </div>
        )}
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
      <nav className="mt-0 flex-grow min-h-0 overflow-y-auto relative z-10 sidebar-scroll">
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

      {/* Desktop User Section */}
      <div className="p-3 border-t border-primary-700 mt-auto relative z-20" ref={userMenuRef}>
        {/* Settings popover — holds Technicians / Administration / Settings */}
        {userMenuOpen && (
          <div
            className={`absolute bottom-full mb-2 rounded-lg shadow-xl overflow-hidden border border-primary-600 min-w-[12rem] ${
              collapsed ? 'left-2' : 'left-3 right-3'
            }`}
            style={{ backgroundColor: '#5a302b' }}
          >
            <ul>
              {secondaryNavigationItems.map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.path}
                    onClick={() => setUserMenuOpen(false)}
                    className={`flex items-center py-2.5 px-4 text-sm ${
                      location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
                        ? 'bg-primary-700 text-white'
                        : 'hover:bg-primary-700'
                    } transition-colors duration-150`}
                  >
                    <i className={`${item.icon} mr-3 w-5 text-center`}></i>
                    <span className="font-medium">{item.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={`flex items-center ${collapsed ? 'justify-center' : ''} p-1 rounded`}>
          {user?.avatar ? (
            <img src={user.avatar} alt="" className={`h-8 w-8 ${collapsed ? '' : 'mr-2'} rounded-full`} referrerPolicy="no-referrer" />
          ) : (
            <div className={`flex items-center justify-center h-8 w-8 ${collapsed ? '' : 'mr-2'} bg-accent-500 rounded-full text-white font-semibold text-sm`}>
              {userInitial}
            </div>
          )}
          {!collapsed && <span className="text-sm font-medium truncate flex-grow">{userName}</span>}
          {secondaryNavigationItems.length > 0 && (
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className={`${collapsed ? 'ml-0' : 'ml-2'} p-1.5 rounded text-white/70 hover:bg-primary-700 hover:text-white focus:outline-none transition-colors duration-150 ${userMenuOpen ? 'bg-primary-700 text-white' : ''}`}
              title="Settings & more"
              aria-label="Settings & more"
            >
              <i className="fas fa-cog"></i>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
