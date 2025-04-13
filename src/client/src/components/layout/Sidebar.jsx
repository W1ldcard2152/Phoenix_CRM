import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar = () => {
  const { isAuthenticated } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  // If not authenticated, don't show sidebar
  if (!isAuthenticated) {
    return null;
  }

  const navigationItems = [
    { name: 'Dashboard', path: '/', icon: 'fas fa-tachometer-alt' },
    { name: 'Customers', path: '/customers', icon: 'fas fa-users' },
    { name: 'Vehicles', path: '/vehicles', icon: 'fas fa-car' },
    { name: 'Work Orders', path: '/work-orders', icon: 'fas fa-clipboard-list' },
    { name: 'Appointments', path: '/appointments', icon: 'fas fa-calendar-alt' },
  ];

  return (
    <div
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } bg-primary-800 text-white transition-all duration-300 ease-in-out min-h-screen`}
    >
      <div className="flex items-center justify-between p-4 border-b border-primary-700">
        {!collapsed && (
          <h2 className="text-xl font-bold">
            Auto CRM
          </h2>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-primary-700 focus:outline-none"
        >
          <i className={`fas ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
        </button>
      </div>

      <nav className="mt-6">
        <ul>
          {navigationItems.map((item) => (
            <li key={item.name} className="mb-2">
              <Link
                to={item.path}
                className={`flex items-center p-4 ${
                  collapsed ? 'justify-center' : 'justify-start'
                } ${
                  location.pathname === item.path
                    ? 'bg-primary-700 border-l-4 border-white'
                    : 'hover:bg-primary-700'
                }`}
              >
                <i className={`${item.icon} ${collapsed ? 'text-xl' : 'mr-3'}`}></i>
                {!collapsed && <span>{item.name}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;