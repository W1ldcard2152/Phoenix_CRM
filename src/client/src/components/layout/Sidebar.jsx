// src/client/src/components/layout/Sidebar.jsx - Updated with Invoice link

import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar = () => {
  const { isAuthenticated, user } = useAuth(); // Assuming user object is available in AuthContext
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  // If not authenticated, don't show sidebar
  if (!isAuthenticated) {
    return null;
  }

  const primaryNavigationItems = [
    { name: 'Dashboard', path: '/', icon: 'fas fa-tachometer-alt' },
    { name: 'Customers', path: '/customers', icon: 'fas fa-users' },
    { name: 'Vehicles', path: '/vehicles', icon: 'fas fa-car' },
    { name: 'Work Orders', path: '/work-orders', icon: 'fas fa-clipboard-list' },
    { name: 'Appointments', path: '/appointments', icon: 'fas fa-calendar-alt' },
    { name: 'Invoices', path: '/invoices/generate', icon: 'fas fa-file-invoice-dollar' },
  ];

  const secondaryNavigationItems = [
    { name: 'Technicians', path: '/technicians', icon: 'fas fa-hard-hat' },
    { name: 'Administration', path: '/admin', icon: 'fas fa-shield-alt' },
    { name: 'Settings', path: '/settings', icon: 'fas fa-sliders-h' },
  ];

  // Get user initial - using a placeholder if user or user.name is not available
  const userInitial = user && user.name ? user.name.charAt(0).toUpperCase() : (user && user.email ? user.email.charAt(0).toUpperCase() : 'U');
  const userName = user && user.name ? user.name : (user && user.email ? user.email : 'User');


  return (
    <div
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } bg-primary-800 text-white transition-all duration-300 ease-in-out min-h-screen flex flex-col`}
    >
      <div className="flex items-center justify-end p-4 border-b border-primary-700 h-[60px]"> {/* Adjusted to justify-end and set a fixed height similar to Navbar for alignment */}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-primary-700 focus:outline-none"
        >
          <i className={`fas ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
        </button>
      </div>

      <nav className="mt-0 flex-grow"> {/* Removed mt-6 to move Dashboard up */}
        {/* Primary Navigation */}
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

      {/* Secondary Navigation - Moved to bottom */}
      <div>
        {!collapsed && <hr className="my-3 mx-4 border-primary-600" />}
        <nav className="pb-2"> {/* Added pb-2 for spacing */}
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

      {/* User Management Section - at the bottom */}
      <div className="p-3 border-t border-primary-700 mt-auto"> {/* mt-auto pushes this section to the bottom */}
        {/* TODO: Implement user dropdown menu functionality */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : ''} cursor-pointer group p-1 rounded hover:bg-primary-700`}>
          <div className={`flex items-center justify-center h-8 w-8 ${collapsed ? '' : 'mr-2'} bg-accent-500 rounded-full text-white font-semibold text-sm group-hover:bg-accent-600 transition-colors duration-150`}>
            {userInitial}
          </div>
          {!collapsed && <span className="text-sm font-medium group-hover:text-accent-300 truncate">{userName}</span>}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
