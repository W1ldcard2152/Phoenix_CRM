import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import WorkOrderService from '../../services/workOrderService';
import { useAuth } from '../../contexts/AuthContext';

const TechnicianPortal = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('date'); // 'date', 'priority', 'status', 'vehicle'
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc', 'desc'
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Statuses relevant to technician work
  const technicianStatuses = [
    'Appointment Scheduled',
    'Appointment Complete',
    'Inspection In Progress',
    'Inspection/Diag Complete',
    'Repair In Progress',
    'Repair Complete - Awaiting Payment'
  ];

  // Status filter categories for technician portal
  const statusCategories = [
    { key: 'All', label: 'All', statuses: technicianStatuses },
    { key: 'Inspection', label: 'Inspect', statuses: ['Appointment Scheduled', 'Appointment Complete', 'Inspection In Progress', 'Inspection/Diag Complete'] },
    { key: 'Repair', label: 'Repair', statuses: ['Repair In Progress', 'Repair Complete - Awaiting Payment'] }
  ];

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  const fetchWorkOrders = async () => {
    try {
      setLoading(true);
      // Use the new optimized endpoint that filters server-side
      const response = await WorkOrderService.getTechnicianWorkOrders();
      setWorkOrders(response.data.workOrders || []);
    } catch (err) {
      console.error('Error fetching work orders:', err);
      setError('Failed to load work orders');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Appointment Scheduled':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Appointment Complete':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Inspection In Progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Inspection/Diag Complete':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Repair In Progress':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Repair Complete - Awaiting Payment':
        return 'bg-blue-200 text-blue-900 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusShortName = (status) => {
    switch (status) {
      case 'Appointment Scheduled':
        return 'Scheduled';
      case 'Appointment Complete':
        return 'Appt Done';
      case 'Inspection In Progress':
        return 'Inspecting';
      case 'Inspection/Diag Complete':
        return 'Diag Done';
      case 'Repair In Progress':
        return 'Repairing';
      case 'Repair Complete - Awaiting Payment':
        return 'Complete';
      default:
        return status;
    }
  };

  const getPriorityIndicator = (priority) => {
    switch (priority) {
      case 'High':
      case 'Urgent':
        return (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </span>
        );
      default:
        return null;
    }
  };

  const handleStartWork = (workOrderId) => {
    navigate(`/technician-portal/checklist/${workOrderId}`);
  };

  // Sort options for the dropdown
  const sortOptions = [
    { key: 'date', label: 'Date' },
    { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' },
    { key: 'vehicle', label: 'Vehicle' }
  ];

  // Priority order for sorting
  const getPriorityOrder = (priority) => {
    switch (priority) {
      case 'Urgent': return 1;
      case 'High': return 2;
      case 'Normal': return 3;
      case 'Low': return 4;
      default: return 5;
    }
  };

  // Status order for sorting
  const getStatusOrder = (status) => {
    switch (status) {
      case 'Repair In Progress': return 1;
      case 'Inspection In Progress': return 2;
      case 'Appointment Complete': return 3;
      case 'Appointment Scheduled': return 4;
      case 'Inspection/Diag Complete': return 5;
      case 'Repair Complete - Awaiting Payment': return 6;
      default: return 7;
    }
  };

  // Get filtered and sorted work orders
  const getFilteredWorkOrders = () => {
    let filtered = workOrders;

    // Apply status filter
    if (statusFilter !== 'All') {
      const selectedCategory = statusCategories.find(cat => cat.key === statusFilter);
      if (selectedCategory) {
        filtered = filtered.filter(wo => selectedCategory.statuses.includes(wo.status));
      }
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(wo =>
        (wo.customer?.name || '').toLowerCase().includes(query) ||
        (wo.vehicle?.make || '').toLowerCase().includes(query) ||
        (wo.vehicle?.model || '').toLowerCase().includes(query) ||
        (wo.services?.[0]?.description || wo.serviceRequested || '').toLowerCase().includes(query) ||
        wo._id.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'date':
          comparison = new Date(b.date) - new Date(a.date);
          break;
        case 'priority':
          comparison = getPriorityOrder(a.priority) - getPriorityOrder(b.priority);
          break;
        case 'status':
          comparison = getStatusOrder(a.status) - getStatusOrder(b.status);
          break;
        case 'vehicle':
          const vehicleA = a.vehicle ? `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}` : '';
          const vehicleB = b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : '';
          comparison = vehicleA.localeCompare(vehicleB);
          break;
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? -comparison : comparison;
    });

    return filtered;
  };

  // Toggle sort direction or change sort field
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
    setShowSortMenu(false);
  };

  // Helper to get service display - simplified for mobile
  const getServiceDisplayText = (workOrder) => {
    if (workOrder.services && workOrder.services.length > 0) {
      const extra = workOrder.services.length > 1 ? ` (+${workOrder.services.length - 1})` : '';
      return workOrder.services[0].description + extra;
    }
    return workOrder.serviceRequested || 'No service specified';
  };

  const filteredWorkOrders = useMemo(() => {
    return getFilteredWorkOrders();
  }, [workOrders, statusFilter, searchQuery, sortBy, sortDirection]);

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts = {};
    statusCategories.forEach(category => {
      if (category.key === 'All') {
        counts[category.key] = workOrders.length;
      } else {
        counts[category.key] = workOrders.filter(wo =>
          category.statuses.includes(wo.status)
        ).length;
      }
    });
    return counts;
  }, [workOrders]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading work orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile-optimized Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex justify-between items-center mb-3">
            <h1 className="text-xl font-bold text-gray-800">
              Technician Portal
            </h1>
            <div className="text-sm text-gray-500">
              {user?.name?.split(' ')[0] || 'Tech'}
            </div>
          </div>

          {/* Quick Stats - Compact for mobile */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-primary-50 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold text-primary-600">{workOrders.length}</div>
              <div className="text-xs text-gray-600">Total</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold text-yellow-600">{statusCounts['Inspection'] || 0}</div>
              <div className="text-xs text-gray-600">Inspect</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold text-orange-600">{statusCounts['Repair'] || 0}</div>
              <div className="text-xs text-gray-600">Repair</div>
            </div>
          </div>

          {/* Filter Tabs - Touch-friendly */}
          <div className="flex gap-1 mb-3">
            {statusCategories.map((category) => (
              <button
                key={category.key}
                onClick={() => setStatusFilter(category.key)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === category.key
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {category.label} ({statusCounts[category.key] || 0})
              </button>
            ))}
          </div>

          {/* Search - Touch optimized */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Work Order Cards - Mobile Optimized */}
      <div className="p-4 space-y-3 lg:hidden">
        {/* Sort/Filter Header */}
        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 shadow-sm">
          <div className="text-sm text-gray-600">
            {filteredWorkOrders.length} {filteredWorkOrders.length === 1 ? 'job' : 'jobs'}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg active:bg-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <span>{sortOptions.find(o => o.key === sortBy)?.label}</span>
              <svg className={`w-4 h-4 transition-transform ${showSortMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Sort Dropdown Menu */}
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 z-20 overflow-hidden">
                  {sortOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => handleSort(option.key)}
                      className={`w-full px-4 py-3 text-left text-sm flex items-center justify-between ${
                        sortBy === option.key
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-700 active:bg-gray-50'
                      }`}
                    >
                      <span>{option.label}</span>
                      {sortBy === option.key && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {filteredWorkOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm">
            <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 text-lg">No work orders found</p>
            <p className="text-gray-400 text-sm mt-1">Check back later for new assignments</p>
          </div>
        ) : (
          filteredWorkOrders.map((workOrder) => (
            <div
              key={workOrder._id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden active:bg-gray-50 transition-colors"
              onClick={() => handleStartWork(workOrder._id)}
            >
              {/* Card Header with Status Badge */}
              <div className={`px-4 py-2 border-l-4 ${getStatusColor(workOrder.status).replace('bg-', 'border-').split(' ')[0]}`}>
                <div className="flex items-center justify-between">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(workOrder.status)}`}>
                    {getStatusShortName(workOrder.status)}
                  </span>
                  <div className="flex items-center gap-2">
                    {getPriorityIndicator(workOrder.priority)}
                    <span className="text-xs text-gray-500">
                      {new Date(workOrder.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="px-4 py-3">
                {/* Vehicle Info - Prominent */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 truncate">
                      {workOrder.vehicle
                        ? `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`
                        : 'No Vehicle'}
                    </h3>
                    <p className="text-sm text-gray-500 truncate">
                      {workOrder.customer?.name || 'Unknown Customer'}
                    </p>
                  </div>
                </div>

                {/* Service Description */}
                <div className="bg-gray-50 rounded-lg px-3 py-2 mb-3">
                  <p className="text-sm text-gray-700 line-clamp-2">
                    {getServiceDisplayText(workOrder)}
                  </p>
                </div>

                {/* Action Button - Large Touch Target */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartWork(workOrder._id);
                  }}
                  className={`w-full py-3 rounded-lg font-semibold text-white text-center transition-all active:scale-98 ${
                    workOrder.status.includes('In Progress')
                      ? 'bg-orange-500 active:bg-orange-600'
                      : 'bg-primary-600 active:bg-primary-700'
                  }`}
                >
                  {workOrder.status.includes('In Progress') ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Continue Work
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Start Work
                    </span>
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table - Hidden on mobile, shown on larger screens */}
      <div className="hidden lg:block container mx-auto px-4 py-6">
        <Card>
          <div className="mb-4 space-y-4">
            {/* Status Filter Buttons */}
            <div className="flex flex-wrap gap-2">
              {statusCategories.map((category) => (
                <button
                  key={category.key}
                  onClick={() => setStatusFilter(category.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === category.key
                      ? 'bg-primary-100 text-primary-800 border-2 border-primary-200'
                      : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                  }`}
                >
                  {category.label} ({statusCounts[category.key] || 0})
                </button>
              ))}
            </div>

            {/* Search Input */}
            <Input
              placeholder="Search by customer, vehicle, service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>

          {filteredWorkOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No work orders found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer & Vehicle</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredWorkOrders.map((workOrder) => (
                    <tr key={workOrder._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{new Date(workOrder.date).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">#{workOrder._id.slice(-6)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{workOrder.customer?.name || 'Unknown Customer'}</div>
                        <div className="text-sm text-gray-500">
                          {workOrder.vehicle ? `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}` : 'No Vehicle'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 truncate max-w-xs">{getServiceDisplayText(workOrder)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getPriorityIndicator(workOrder.priority)}
                          <span className="text-sm text-gray-600">{workOrder.priority}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getStatusColor(workOrder.status)}`}>
                          {workOrder.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Button onClick={() => handleStartWork(workOrder._id)} variant="primary" size="sm">
                          {workOrder.status.includes('In Progress') ? 'Continue' : 'Start'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default TechnicianPortal;
