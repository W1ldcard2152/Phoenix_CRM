import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import SelectInput from '../../components/common/SelectInput';
import ResponsiveTable, { MobileCard, MobileSection, MobileContainer } from '../../components/common/ResponsiveTable';
import WorkOrderService from '../../services/workOrderService';
import MediaService from '../../services/mediaService';

const WorkOrderList = () => {
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showInvoicedTable, setShowInvoicedTable] = useState(false); // Added for collapsible invoiced table
  const [showOnHoldCancelledTable, setShowOnHoldCancelledTable] = useState(false); // Added for collapsible on hold & cancelled table
  const [statusUpdating, setStatusUpdating] = useState(null); // Track which work order status is being updated
  const [attachmentCounts, setAttachmentCounts] = useState({}); // Track attachment counts for each work order
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Get filter parameters from URL
  const customerParam = searchParams.get('customer');
  const vehicleParam = searchParams.get('vehicle');
  const needsSchedulingParam = searchParams.get('needsScheduling') === 'true';

  useEffect(() => {
    const fetchWorkOrders = async () => {
      try {
        setLoading(true);
        
        // Build filter object based on URL parameters
        const filters = {};
        if (customerParam) filters.customer = customerParam;
        if (vehicleParam) filters.vehicle = vehicleParam;
        if (statusFilter) filters.status = statusFilter;
        
        const response = await WorkOrderService.getAllWorkOrders(filters);
        const sortedWorkOrders = response.data.workOrders.sort((a, b) => {
          // First sort by status priority
          const statusPriorityA = getStatusPriority(a.status);
          const statusPriorityB = getStatusPriority(b.status);
          
          if (statusPriorityA !== statusPriorityB) {
            return statusPriorityA - statusPriorityB;
          }
          
          // If status priority is the same, sort by date (newest first)
          return new Date(b.date) - new Date(a.date);
        });
        setWorkOrders(sortedWorkOrders);
        
        // Fetch attachment counts for each work order
        await fetchAttachmentCounts(sortedWorkOrders);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching work orders:', err);
        setError('Failed to load work orders. Please try again later.');
        setLoading(false);
      }
    };

    fetchWorkOrders();
  }, [customerParam, vehicleParam, statusFilter]);

  // Real-time search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      // If search is empty, fetch all work orders with current filters
      const fetchAllWorkOrders = async () => {
        try {
          setIsSearching(true);
          const filters = {};
          if (customerParam) filters.customer = customerParam;
          if (vehicleParam) filters.vehicle = vehicleParam;
          if (statusFilter) filters.status = statusFilter;
          
          const response = await WorkOrderService.getAllWorkOrders(filters);
          const sortedWorkOrders = response.data.workOrders.sort((a, b) => {
            const statusPriorityA = getStatusPriority(a.status);
            const statusPriorityB = getStatusPriority(b.status);
            
            if (statusPriorityA !== statusPriorityB) {
              return statusPriorityA - statusPriorityB;
            }
            
            return new Date(b.date) - new Date(a.date);
          });
          setWorkOrders(sortedWorkOrders);
          await fetchAttachmentCounts(sortedWorkOrders);
          setIsSearching(false);
        } catch (err) {
          console.error('Error fetching work orders:', err);
          setError('Failed to load work orders. Please try again later.');
          setIsSearching(false);
        }
      };
      
      const timeoutId = setTimeout(() => {
        fetchAllWorkOrders();
      }, 300);
      
      return () => clearTimeout(timeoutId);
    } else {
      // Debounced search
      const timeoutId = setTimeout(() => {
        performSearch(searchQuery);
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, customerParam, vehicleParam, statusFilter]);

  const fetchAttachmentCounts = async (workOrdersList) => {
    try {
      const counts = {};
      
      // Fetch attachment counts for each work order
      await Promise.all(
        workOrdersList.map(async (workOrder) => {
          try {
            const response = await MediaService.getAllMedia({ workOrder: workOrder._id });
            counts[workOrder._id] = response?.data?.media?.length || 0;
          } catch (err) {
            console.error(`Error fetching attachments for work order ${workOrder._id}:`, err);
            counts[workOrder._id] = 0;
          }
        })
      );
      
      setAttachmentCounts(counts);
    } catch (err) {
      console.error('Error fetching attachment counts:', err);
    }
  };

  const performSearch = async (query) => {
    try {
      setIsSearching(true);
      const response = await WorkOrderService.searchWorkOrders(query);
      const sortedWorkOrders = response.data.workOrders.sort((a, b) => {
        const statusPriorityA = getStatusPriority(a.status);
        const statusPriorityB = getStatusPriority(b.status);
        
        if (statusPriorityA !== statusPriorityB) {
          return statusPriorityA - statusPriorityB;
        }
        
        return new Date(b.date) - new Date(a.date);
      });
      setWorkOrders(sortedWorkOrders);
      await fetchAttachmentCounts(sortedWorkOrders);
      setIsSearching(false);
    } catch (err) {
      console.error('Error searching work orders:', err);
      setError('Failed to search work orders. Please try again later.');
      setIsSearching(false);
    }
  };

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
  };

  // Handle inline status update for individual work orders
  const handleWorkOrderStatusUpdate = async (workOrderId, newStatus) => {
    try {
      setStatusUpdating(workOrderId);
      
      // Update the work order status via API
      await WorkOrderService.updateWorkOrder(workOrderId, { status: newStatus });
      
      // Update the local state
      setWorkOrders(prevWorkOrders => {
        const updatedWorkOrders = prevWorkOrders.map(wo => 
          wo._id === workOrderId ? { ...wo, status: newStatus } : wo
        );
        
        // Re-sort the work orders after status change
        return updatedWorkOrders.sort((a, b) => {
          const statusPriorityA = getStatusPriority(a.status);
          const statusPriorityB = getStatusPriority(b.status);
          
          if (statusPriorityA !== statusPriorityB) {
            return statusPriorityA - statusPriorityB;
          }
          
          return new Date(b.date) - new Date(a.date);
        });
      });
      
    } catch (err) {
      console.error('Error updating work order status:', err);
      setError('Failed to update work order status. Please try again.');
    } finally {
      setStatusUpdating(null);
    }
  };

  // Status options for filter dropdown
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'Created', label: 'Created' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Inspection In Progress', label: 'Inspection In Progress' },
    { value: 'Inspected/Parts Ordered', label: 'Inspected/Parts Ordered' },
    { value: 'Parts Received', label: 'Parts Received' },
    { value: 'Repair In Progress', label: 'Repair In Progress' },
    { value: 'Completed - Awaiting Payment', label: 'Completed - Awaiting Payment' },
    { value: 'Invoiced', label: 'Invoiced' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  // Status options for inline status change (without "All Statuses")
  const workOrderStatusOptions = [
    { value: 'Created', label: 'Created' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Inspection In Progress', label: 'Inspection In Progress' },
    { value: 'Inspected/Parts Ordered', label: 'Inspected/Parts Ordered' },
    { value: 'Parts Received', label: 'Parts Received' },
    { value: 'Repair In Progress', label: 'Repair In Progress' },
    { value: 'Completed - Awaiting Payment', label: 'Completed - Awaiting Payment' },
    { value: 'Invoiced', label: 'Invoiced' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  // Status priority for sorting (lower number = higher priority)
  const getStatusPriority = (status) => {
    const priorities = {
      'Created': 1,
      'Scheduled': 2,
      'Inspection In Progress': 3,
      'Inspected/Parts Ordered': 4,
      'Parts Received': 5,
      'Repair In Progress': 6,
      'Completed - Awaiting Payment': 7,
      'Invoiced': 8,
      'On Hold': 9,
      'Cancelled': 10
    };
    return priorities[status] || 99;
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  // Helper function to get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Created':
        return 'bg-gray-100 text-gray-800';
      case 'Scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'In Progress':
        return 'bg-indigo-100 text-indigo-800';
      case 'Inspected - Need Parts Ordered':
        return 'bg-yellow-100 text-yellow-800';
      case 'Parts Ordered':
        return 'bg-orange-100 text-orange-800'; // Using orange for parts ordered
      case 'Parts Received':
        return 'bg-lime-100 text-lime-800'; // Using lime for parts received
      case 'Repair In Progress':
        return 'bg-purple-100 text-purple-800';
      case 'Completed - Need Payment':
        return 'bg-teal-100 text-teal-800'; // Using teal for need payment
      case 'Completed - Paid':
        return 'bg-green-100 text-green-800';
      case 'On Hold':
        return 'bg-pink-100 text-pink-800';
      case 'Cancelled':
        return 'bg-red-100 text-red-800';
      case 'Invoiced': // Added status for Invoiced
        return 'bg-slate-100 text-slate-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper function to display service description, handling both the new
  // services array and the legacy serviceRequested field
  const getServiceDisplay = (workOrder) => {
    if (workOrder.services && workOrder.services.length > 0) {
      return (
        <div>
          {/* Show first service and indicate if there are more */}
          <span>{workOrder.services[0].description}</span>
          {workOrder.services.length > 1 && (
            <span className="text-xs ml-1 text-primary-600">
              (+{workOrder.services.length - 1} more)
            </span>
          )}
        </div>
      );
    } else {
      // Handle legacy format and potentially newline separated services
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
      
      // Simple single service
      return workOrder.serviceRequested || 'No service specified';
    }
  };

  // Filter work orders into active, invoiced, and on hold/cancelled
  const activeWorkOrders = workOrders.filter(wo => wo.status !== 'Invoiced' && wo.status !== 'On Hold' && wo.status !== 'Cancelled');
  const invoicedWorkOrders = workOrders.filter(wo => wo.status === 'Invoiced');
  const onHoldCancelledWorkOrders = workOrders.filter(wo => wo.status === 'On Hold' || wo.status === 'Cancelled');

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Work Orders</h1>
        <Button to="/work-orders/new" variant="primary">
          Create Work Order
        </Button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <Card>
        <div className="mb-4 space-y-4 md:space-y-0 md:grid md:grid-cols-3 md:gap-4">
          <div className="md:col-span-2 relative">
            <Input
              placeholder="Search by service type, notes, or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10"
            />
            {isSearching && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <i className="fas fa-spinner fa-spin text-gray-400"></i>
              </div>
            )}
          </div>
          <div>
            <SelectInput
              name="statusFilter"
              options={statusOptions}
              value={statusFilter}
              onChange={handleStatusChange}
              className="w-full"
            />
          </div>
        </div>

        {(() => {
          if (loading) {
            return (
              <div className="flex justify-center items-center h-48">
                <p>Loading work orders...</p>
              </div>
            );
          }
          
          if (workOrders.length === 0) {
            return (
              <div className="text-center py-6 text-gray-500">
                <p>No work orders found.</p>
              </div>
            );
          }
          
          if (activeWorkOrders.length === 0 && (statusFilter || searchQuery)) {
            return (
              <div className="text-center py-6 text-gray-500">
                <p>No active work orders match your criteria.</p>
              </div>
            );
          }
          
          if (activeWorkOrders.length === 0 && invoicedWorkOrders.length > 0) {
            return (
              <div className="text-center py-6 text-gray-500">
                <p>No active work orders. All current work orders are invoiced.</p>
              </div>
            );
          }
          
          // Render main table when we have active work orders
          return (
          <>
            {/* Desktop Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer & Vehicle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activeWorkOrders.map((workOrder) => (
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
                      <div className="text-xs text-gray-500">
                        {workOrder.status.includes('Completed') 
                          ? 'Final'
                          : 'Estimate'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
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
                        {needsSchedulingParam && (
                          <Button
                            onClick={() => navigate(`/appointments/new?workOrder=${workOrder._id}&vehicle=${workOrder.vehicle?._id}`)}
                            variant="primary"
                            size="sm"
                          >
                            Schedule
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <MobileContainer>
              {activeWorkOrders.map((workOrder) => (
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
                      <div className="text-xs text-gray-500">
                        Estimate
                      </div>
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
                      {needsSchedulingParam && (
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
                    </div>
                  </div>
                </MobileCard>
              ))}
            </MobileContainer>
          </>
          );
        })()}
      </Card>

      {/* Collapsible Table for Invoiced Work Orders */}
      {invoicedWorkOrders.length > 0 || showInvoicedTable ? ( // Render this section if there are invoiced orders or if it's manually toggled open (even if empty after a filter)
        <Card className="mt-6">
          <div 
            className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50"
            onClick={() => setShowInvoicedTable(!showInvoicedTable)}
          >
            <h2 className="text-xl font-semibold text-gray-700">
              Invoiced Work Orders ({invoicedWorkOrders.length})
            </h2>
            <span className="text-sm font-medium text-primary-600">
              {showInvoicedTable ? 'Collapse' : 'Expand'}
              {showInvoicedTable ? 
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline ml-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg> :
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline ml-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              }
            </span>
          </div>
          {showInvoicedTable && (
            loading ? (
              <div className="flex justify-center items-center h-48 p-4">
                <p>Loading...</p> {/* Should ideally not show if main table is already loaded */}
              </div>
            ) : invoicedWorkOrders.length === 0 ? (
              <div className="text-center py-6 text-gray-500 p-4">
                <p>No invoiced work orders found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto p-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer & Vehicle</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoicedWorkOrders.map((workOrder) => (
                      <tr key={workOrder._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(workOrder.date).toLocaleDateString()}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{workOrder.customer?.name || 'Unknown Customer'}</div>
                          <div className="text-sm text-gray-500">{workOrder.vehicle?.year} {workOrder.vehicle?.make} {workOrder.vehicle?.model}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <div className="text-sm text-gray-900 truncate max-w-xs">{getServiceDisplay(workOrder)}</div>
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
                          <div className="text-xs text-gray-500">
                            Estimate
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <Button to={`/work-orders/${workOrder._id}`} variant="outline" size="sm">View</Button>
                            <Button to={`/work-orders/${workOrder._id}/edit`} variant="outline" size="sm">Edit</Button>
                            {/* Schedule button likely not needed for Invoiced WOs, but keeping for "same style" consistency for now */}
                            {needsSchedulingParam && ( 
                              <Button
                                onClick={() => navigate(`/appointments/new?workOrder=${workOrder._id}&vehicle=${workOrder.vehicle?._id}`)}
                                variant="primary"
                                size="sm"
                              >
                                Schedule
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </Card>
      ) : null}

      {/* Collapsible Table for On Hold & Cancelled Work Orders */}
      {onHoldCancelledWorkOrders.length > 0 || showOnHoldCancelledTable ? (
        <Card className="mt-6">
          <div 
            className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50"
            onClick={() => setShowOnHoldCancelledTable(!showOnHoldCancelledTable)}
          >
            <h2 className="text-xl font-semibold text-gray-700">
              On Hold & Cancelled Work Orders ({onHoldCancelledWorkOrders.length})
            </h2>
            <span className="text-sm font-medium text-primary-600">
              {showOnHoldCancelledTable ? 'Collapse' : 'Expand'}
              {showOnHoldCancelledTable ? 
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline ml-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg> :
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline ml-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              }
            </span>
          </div>
          {showOnHoldCancelledTable && (
            loading ? (
              <div className="flex justify-center items-center h-48 p-4">
                <p>Loading...</p>
              </div>
            ) : onHoldCancelledWorkOrders.length === 0 ? (
              <div className="text-center py-6 text-gray-500 p-4">
                <p>No on hold or cancelled work orders found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto p-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer & Vehicle</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {onHoldCancelledWorkOrders.map((workOrder) => (
                      <tr key={workOrder._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(workOrder.date).toLocaleDateString()}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{workOrder.customer?.name || 'Unknown Customer'}</div>
                          <div className="text-sm text-gray-500">{workOrder.vehicle?.year} {workOrder.vehicle?.make} {workOrder.vehicle?.model}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <div className="text-sm text-gray-900 truncate max-w-xs">{getServiceDisplay(workOrder)}</div>
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
                          <div className="text-xs text-gray-500">
                            Estimate
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <Button to={`/work-orders/${workOrder._id}`} variant="outline" size="sm">View</Button>
                            <Button to={`/work-orders/${workOrder._id}/edit`} variant="outline" size="sm">Edit</Button>
                            {needsSchedulingParam && ( 
                              <Button
                                onClick={() => navigate(`/appointments/new?workOrder=${workOrder._id}&vehicle=${workOrder.vehicle?._id}`)}
                                variant="primary"
                                size="sm"
                              >
                                Schedule
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </Card>
      ) : null}
    </div>
  );
};

export default WorkOrderList;
