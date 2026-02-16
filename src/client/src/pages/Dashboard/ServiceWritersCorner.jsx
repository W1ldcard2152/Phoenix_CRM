import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { MobileCard, MobileSection, MobileContainer } from '../../components/common/ResponsiveTable';
import WorkOrderService from '../../services/workOrderService';
import MediaService from '../../services/mediaService';
import customerInteractionService from '../../services/customerInteractionService';

const ServiceWritersCorner = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [statusUpdating, setStatusUpdating] = useState(null);
  const [attachmentCounts, setAttachmentCounts] = useState({});
  const [interactionStats, setInteractionStats] = useState({});

  // Multi-tier sorting state
  const [sortConfig, setSortConfig] = useState([{ column: 'status', direction: 'asc' }]);

  // Status filter categories for SWC
  const statusCategories = [
    { key: 'All', label: 'All', statuses: [] },
    { key: 'Appointment Complete', label: 'Appointment Complete', statuses: ['Appointment Complete'] },
    { key: 'Inspection/Diag Complete', label: 'Inspection/Diag Complete', statuses: ['Inspection/Diag Complete'] },
    { key: 'Parts Received', label: 'Parts Received', statuses: ['Parts Received'] },
    { key: 'Awaiting Payment', label: 'Awaiting Payment', statuses: ['Repair Complete - Awaiting Payment'] }
  ];

  // All status options for inline status change dropdown
  const workOrderStatusOptions = [
    { value: 'Work Order Created', label: 'Work Order Created' },
    { value: 'Appointment Scheduled', label: 'Appointment Scheduled' },
    { value: 'Appointment Complete', label: 'Appointment Complete' },
    { value: 'Inspection In Progress', label: 'Inspection In Progress' },
    { value: 'Inspection/Diag Complete', label: 'Inspection/Diag Complete' },
    { value: 'Parts Ordered', label: 'Parts Ordered' },
    { value: 'Parts Received', label: 'Parts Received' },
    { value: 'Repair In Progress', label: 'Repair In Progress' },
    { value: 'Repair Complete - Awaiting Payment', label: 'Repair Complete - Awaiting Payment' },
    { value: 'Repair Complete - Invoiced', label: 'Repair Complete - Invoiced' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  // Status priority for sorting
  const getStatusPriority = (status) => {
    const priorities = {
      'Appointment Complete': 1,
      'Inspection/Diag Complete': 2,
      'Parts Received': 3,
      'Repair Complete - Awaiting Payment': 4
    };
    return priorities[status] || 99;
  };

  // Status color classes
  const getStatusColor = (status) => {
    switch (status) {
      case 'Work Order Created':
        return 'bg-green-100 text-green-800';
      case 'Appointment Scheduled':
        return 'bg-green-100 text-green-800';
      case 'Parts Ordered':
        return 'bg-green-100 text-green-800';
      case 'Repair Complete - Invoiced':
        return 'bg-green-300 text-green-950';
      case 'Appointment Complete':
        return 'bg-blue-100 text-blue-800';
      case 'Inspection/Diag Complete':
        return 'bg-blue-100 text-blue-800';
      case 'Parts Received':
        return 'bg-blue-200 text-blue-900';
      case 'Repair Complete - Awaiting Payment':
        return 'bg-blue-300 text-blue-950';
      case 'Inspection In Progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'Repair In Progress':
        return 'bg-orange-200 text-orange-900';
      case 'On Hold':
        return 'bg-gray-200 text-gray-700';
      case 'Cancelled':
        return 'bg-gray-400 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const getServiceDisplay = (workOrder) => {
    if (workOrder.services && workOrder.services.length > 0) {
      return (
        <div>
          <span>{workOrder.services[0].description}</span>
          {workOrder.services.length > 1 && (
            <span className="text-xs ml-1 text-primary-600">
              (+{workOrder.services.length - 1} more)
            </span>
          )}
        </div>
      );
    } else {
      if (workOrder.serviceRequested && workOrder.serviceRequested.includes('\n')) {
        const services = workOrder.serviceRequested.split('\n').filter(s => s.trim());
        return (
          <div>
            <span>{services[0]}</span>
            {services.length > 1 && (
              <span className="text-xs ml-1 text-primary-600">
                (+{services.length - 1} more)
              </span>
            )}
          </div>
        );
      }
      return workOrder.serviceRequested || 'No service specified';
    }
  };

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await WorkOrderService.getServiceWritersCorner();
        const wos = response.data.workOrders || [];
        setWorkOrders(wos);

        // Fetch attachment counts and interaction stats in parallel
        if (wos.length > 0) {
          const workOrderIds = wos.map(wo => wo._id);
          const [attachmentResponse, interactionResponse] = await Promise.all([
            MediaService.getBatchAttachmentCounts(workOrderIds).catch(() => ({ data: { counts: {} } })),
            customerInteractionService.getBatchInteractionStats(workOrderIds).catch(() => ({ data: { stats: {} } }))
          ]);
          setAttachmentCounts(attachmentResponse.data.counts || {});
          setInteractionStats(interactionResponse.data.stats || {});
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching Service Writer\'s Corner data:', err);
        setError('Failed to load action items. Please try again later.');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Sorting handlers
  const handleSort = (columnName) => {
    setSortConfig(prevConfig => {
      const existingIndex = prevConfig.findIndex(config => config.column === columnName);

      if (existingIndex !== -1) {
        const existingConfig = prevConfig[existingIndex];
        if (existingConfig.direction === 'asc') {
          const newConfig = [...prevConfig];
          newConfig[existingIndex] = { column: columnName, direction: 'desc' };
          return newConfig;
        } else {
          return prevConfig.filter((_, index) => index !== existingIndex);
        }
      } else {
        if (prevConfig.length >= 3) {
          return [...prevConfig.slice(0, 2), { column: columnName, direction: 'asc' }];
        }
        return [...prevConfig, { column: columnName, direction: 'asc' }];
      }
    });
  };

  const renderSortIndicator = (columnName) => {
    const sortIndex = sortConfig.findIndex(config => config.column === columnName);
    if (sortIndex === -1) return null;

    const config = sortConfig[sortIndex];
    const priority = sortIndex + 1;
    const arrow = config.direction === 'asc' ? '▲' : '▼';

    return (
      <span className="ml-2 inline-flex items-center">
        <span className="text-primary-600 font-bold">{arrow}</span>
        {priority > 1 && (
          <span className="text-xs ml-1 text-primary-600 font-semibold">{priority}</span>
        )}
      </span>
    );
  };

  const applySorting = (data) => {
    if (sortConfig.length === 0) return data;

    return [...data].sort((a, b) => {
      for (const config of sortConfig) {
        let aValue, bValue;

        switch (config.column) {
          case 'date':
            aValue = new Date(a.date).getTime();
            bValue = new Date(b.date).getTime();
            break;
          case 'customer':
            aValue = (a.customer?.name || '').toLowerCase();
            bValue = (b.customer?.name || '').toLowerCase();
            break;
          case 'service':
            if (a.services && a.services.length > 0) {
              aValue = a.services[0].description.toLowerCase();
            } else if (a.serviceRequested) {
              aValue = a.serviceRequested.split('\n')[0].toLowerCase();
            } else {
              aValue = '';
            }
            if (b.services && b.services.length > 0) {
              bValue = b.services[0].description.toLowerCase();
            } else if (b.serviceRequested) {
              bValue = b.serviceRequested.split('\n')[0].toLowerCase();
            } else {
              bValue = '';
            }
            break;
          case 'status':
            aValue = getStatusPriority(a.status);
            bValue = getStatusPriority(b.status);
            break;
          case 'amount':
            aValue = a.totalEstimate || 0;
            bValue = b.totalEstimate || 0;
            break;
          default:
            aValue = '';
            bValue = '';
        }

        let comparison = 0;
        if (aValue < bValue) comparison = -1;
        else if (aValue > bValue) comparison = 1;

        if (comparison !== 0) {
          return config.direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  };

  // Inline status update
  const handleWorkOrderStatusUpdate = async (workOrderId, newStatus, retryCount = 0) => {
    try {
      setStatusUpdating(workOrderId);
      await WorkOrderService.updateWorkOrder(workOrderId, { status: newStatus });

      // Update local state — if the new status is no longer a SWC status, remove it from the list
      const swcStatuses = ['Appointment Complete', 'Inspection/Diag Complete', 'Parts Received', 'Repair Complete - Awaiting Payment'];
      if (swcStatuses.includes(newStatus)) {
        setWorkOrders(prev => prev.map(wo =>
          wo._id === workOrderId ? { ...wo, status: newStatus } : wo
        ));
      } else {
        setWorkOrders(prev => prev.filter(wo => wo._id !== workOrderId));
      }
    } catch (err) {
      console.error('Error updating work order status:', err);
      if (err.status === 429 && retryCount < 2) {
        setTimeout(() => {
          handleWorkOrderStatusUpdate(workOrderId, newStatus, retryCount + 1);
        }, (retryCount + 1) * 1000);
        return;
      }
      setError('Failed to update work order status. Please try again.');
    } finally {
      if (retryCount === 0) {
        setStatusUpdating(null);
      }
    }
  };

  // Interaction badges
  const renderInteractionBadges = (workOrderId) => {
    const stats = interactionStats[workOrderId];
    if (!stats) return null;

    const badges = [];

    if (stats.totalInteractions > 0) {
      const lastContactDate = new Date(stats.lastContact);
      const hoursAgo = Math.floor((new Date() - lastContactDate) / (1000 * 60 * 60));

      let timeText = '';
      let colorClass = '';

      if (hoursAgo < 24) {
        timeText = hoursAgo < 1 ? 'Just now' : `${hoursAgo}h ago`;
        colorClass = 'bg-green-100 text-green-800';
      } else {
        const daysAgo = Math.floor(hoursAgo / 24);
        timeText = `${daysAgo}d ago`;
        colorClass = daysAgo > 7 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800';
      }

      badges.push(
        <span key="last-contact" className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
          {timeText}
        </span>
      );
    }

    if (stats.pendingFollowUps > 0) {
      badges.push(
        <span key="follow-ups" className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          {stats.pendingFollowUps} follow-up{stats.pendingFollowUps > 1 ? 's' : ''}
        </span>
      );
    }

    if (stats.overdueFollowUps > 0) {
      badges.push(
        <span key="overdue" className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          {stats.overdueFollowUps} overdue
        </span>
      );
    }

    return badges.length > 0 ? (
      <div className="flex flex-wrap gap-1 mt-1">
        {badges}
      </div>
    ) : null;
  };

  // Filter and sort
  const getFilteredWorkOrders = () => {
    if (statusFilter === 'All') return workOrders;
    const selectedCategory = statusCategories.find(cat => cat.key === statusFilter);
    if (!selectedCategory) return workOrders;
    return workOrders.filter(wo => selectedCategory.statuses.includes(wo.status));
  };

  const filteredWorkOrders = useMemo(() => {
    return applySorting(getFilteredWorkOrders());
  }, [workOrders, statusFilter, sortConfig]);

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
      <Card title="Service Writer's Corner">
        <div className="flex justify-center items-center h-48">
          <p>Loading action items...</p>
        </div>
      </Card>
    );
  }

  if (workOrders.length === 0) {
    return (
      <Card title="Service Writer's Corner">
        <div className="text-center py-6 text-gray-500">
          <p>No action items right now. All caught up!</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title={`Service Writer's Corner (${workOrders.length} ${workOrders.length === 1 ? 'item' : 'items'})`}>
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-blue-800 text-sm">
          <strong>Action Required:</strong> These work orders need your attention to move forward in the workflow.
        </p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Status Filter Buttons */}
      <div className="mb-4">
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
      </div>

      {filteredWorkOrders.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <p>No work orders match this filter.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('date')}
                  >
                    <div className="flex items-center">
                      Date
                      {renderSortIndicator('date')}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('customer')}
                  >
                    <div className="flex items-center">
                      Customer & Vehicle
                      {renderSortIndicator('customer')}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('service')}
                  >
                    <div className="flex items-center">
                      Service
                      {renderSortIndicator('service')}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center">
                      Status
                      {renderSortIndicator('status')}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('amount')}
                  >
                    <div className="flex items-center">
                      Amount
                      {renderSortIndicator('amount')}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredWorkOrders.map((workOrder) => (
                  <tr key={workOrder._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(workOrder.date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">
                        {workOrder.customer?.name || 'Unknown Customer'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {workOrder.vehicle?.year} {workOrder.vehicle?.make} {workOrder.vehicle?.model}
                      </div>
                      {renderInteractionBadges(workOrder._id)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <div className="text-sm text-gray-900 truncate max-w-xs">
                          {getServiceDisplay(workOrder)}
                        </div>
                        {attachmentCounts[workOrder._id] > 0 && (
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            <span>{attachmentCounts[workOrder._id]}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="relative">
                        <select
                          value={workOrder.status}
                          onChange={(e) => handleWorkOrderStatusUpdate(workOrder._id, e.target.value)}
                          disabled={statusUpdating === workOrder._id}
                          className={`
                            text-xs rounded-full px-2 py-1 border-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 appearance-none pr-6
                            ${getStatusColor(workOrder.status)}
                            ${statusUpdating === workOrder._id ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}
                          `}
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                            backgroundPosition: 'right 4px center',
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: '12px'
                          }}
                        >
                          {workOrderStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {statusUpdating === workOrder._id && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatCurrency(workOrder.totalEstimate)}
                      </div>
                      <div className="text-xs text-gray-500">Estimate</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Button
                          to={`/work-orders/${workOrder._id}`}
                          variant="outline"
                          size="sm"
                        >
                          View
                        </Button>
                        <Button
                          to={`/work-orders/${workOrder._id}/edit`}
                          variant="outline"
                          size="sm"
                        >
                          Edit
                        </Button>
                        <div className="w-40">
                          {(workOrder.status === 'Appointment Complete' || workOrder.status === 'Parts Received') ? (
                            <Button
                              onClick={() => navigate(`/appointments/new?workOrder=${workOrder._id}&vehicle=${workOrder.vehicle?._id}`)}
                              variant="primary"
                              size="sm"
                              className="w-full"
                            >
                              Schedule
                            </Button>
                          ) : workOrder.status === 'Inspection/Diag Complete' ? (
                            <Button
                              onClick={() => navigate(`/work-orders/${workOrder._id}#parts`)}
                              variant="primary"
                              size="sm"
                              className="w-full"
                            >
                              Order Parts
                            </Button>
                          ) : workOrder.status === 'Repair Complete - Awaiting Payment' ? (
                            <Button
                              onClick={() => navigate(`/invoices/new/${workOrder._id}`)}
                              variant="primary"
                              size="sm"
                              className="w-full"
                            >
                              Create Invoice
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <MobileContainer>
            {filteredWorkOrders.map((workOrder) => (
              <MobileCard key={workOrder._id} onClick={() => navigate(`/work-orders/${workOrder._id}`)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <MobileSection label="Customer">
                      <div className="font-medium">{workOrder.customer?.name || 'Unknown Customer'}</div>
                      {(workOrder.vehicle?.year || workOrder.vehicle?.make || workOrder.vehicle?.model) ? (
                        <div className="text-xs text-gray-500 mt-1">
                          {workOrder.vehicle?.year} {workOrder.vehicle?.make} {workOrder.vehicle?.model}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 mt-1">No Vehicle Assigned</div>
                      )}
                    </MobileSection>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-xs text-gray-500 mb-1">
                      {new Date(workOrder.date).toLocaleDateString()}
                    </div>
                    <div className="relative">
                      <select
                        value={workOrder.status}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleWorkOrderStatusUpdate(workOrder._id, e.target.value);
                        }}
                        disabled={statusUpdating === workOrder._id}
                        onClick={(e) => e.stopPropagation()}
                        className={`
                          text-xs rounded-full px-2 py-1 border-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 appearance-none pr-6
                          ${getStatusColor(workOrder.status)}
                          ${statusUpdating === workOrder._id ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}
                        `}
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: 'right 4px center',
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: '12px'
                        }}
                      >
                        {workOrderStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {statusUpdating === workOrder._id && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <MobileSection label="Service">
                  <div className="flex items-center space-x-2">
                    <div className="text-sm">{getServiceDisplay(workOrder)}</div>
                    {attachmentCounts[workOrder._id] > 0 && (
                      <div className="flex items-center space-x-1 text-xs text-gray-500">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span>{attachmentCounts[workOrder._id]}</span>
                      </div>
                    )}
                  </div>
                </MobileSection>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(workOrder.totalEstimate)}
                    </div>
                    <div className="text-xs text-gray-500">Estimate</div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      to={`/work-orders/${workOrder._id}/edit`}
                      variant="outline"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Edit
                    </Button>
                    {(workOrder.status === 'Appointment Complete' || workOrder.status === 'Parts Received') && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/appointments/new?workOrder=${workOrder._id}&vehicle=${workOrder.vehicle?._id}`);
                        }}
                        variant="primary"
                        size="sm"
                      >
                        Schedule
                      </Button>
                    )}
                    {workOrder.status === 'Inspection/Diag Complete' && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/work-orders/${workOrder._id}#parts`);
                        }}
                        variant="primary"
                        size="sm"
                      >
                        Order Parts
                      </Button>
                    )}
                    {workOrder.status === 'Repair Complete - Awaiting Payment' && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/invoices/new/${workOrder._id}`);
                        }}
                        variant="primary"
                        size="sm"
                      >
                        Invoice
                      </Button>
                    )}
                  </div>
                </div>
              </MobileCard>
            ))}
          </MobileContainer>
        </>
      )}
    </Card>
  );
};

export default ServiceWritersCorner;
