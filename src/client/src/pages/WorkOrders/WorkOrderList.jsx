import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import { MobileCard, MobileSection, MobileContainer } from '../../components/common/ResponsiveTable';
import WorkOrderService from '../../services/workOrderService';
import MediaService from '../../services/mediaService';
import customerInteractionService from '../../services/customerInteractionService';

const WorkOrderList = () => {
  const [workOrders, setWorkOrders] = useState([]); // Active work orders only
  const [invoicedWorkOrders, setInvoicedWorkOrders] = useState([]); // Separate state for invoiced
  const [onHoldCancelledWorkOrders, setOnHoldCancelledWorkOrders] = useState([]); // Separate state for on hold/cancelled
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isSearching, setIsSearching] = useState(false);
  const [showInvoicedTable, setShowInvoicedTable] = useState(false);
  const [showOnHoldCancelledTable, setShowOnHoldCancelledTable] = useState(false);
  const [invoicedLoading, setInvoicedLoading] = useState(false); // Loading state for invoiced section
  const [onHoldCancelledLoading, setOnHoldCancelledLoading] = useState(false); // Loading state for on hold/cancelled section
  const [statusUpdating, setStatusUpdating] = useState(null);
  const [attachmentCounts, setAttachmentCounts] = useState({});
  const [interactionStats, setInteractionStats] = useState({});
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Multi-tier sorting state - array of sort configs [{column, direction}, ...]
  // Default to sorting by date descending
  const [sortConfig, setSortConfig] = useState([{ column: 'date', direction: 'desc' }]);

  // Get filter parameters from URL
  const customerParam = searchParams.get('customer');
  const vehicleParam = searchParams.get('vehicle');
  const needsSchedulingParam = searchParams.get('needsScheduling') === 'true';

  // Handle column header click for sorting
  const handleSort = (columnName) => {
    setSortConfig(prevConfig => {
      // Find if this column is already in the sort config
      const existingIndex = prevConfig.findIndex(config => config.column === columnName);

      if (existingIndex !== -1) {
        // Column is already being sorted
        const existingConfig = prevConfig[existingIndex];

        if (existingConfig.direction === 'asc') {
          // Toggle to descending
          const newConfig = [...prevConfig];
          newConfig[existingIndex] = { column: columnName, direction: 'desc' };
          return newConfig;
        } else {
          // Remove from sort (was descending, now remove)
          return prevConfig.filter((_, index) => index !== existingIndex);
        }
      } else {
        // Add as new sort column (ascending by default)
        if (prevConfig.length >= 3) {
          // Max 3 levels, remove the last one
          return [...prevConfig.slice(0, 2), { column: columnName, direction: 'asc' }];
        }
        return [...prevConfig, { column: columnName, direction: 'asc' }];
      }
    });
  };

  // Render sort indicator for a column
  const renderSortIndicator = (columnName) => {
    const sortIndex = sortConfig.findIndex(config => config.column === columnName);

    if (sortIndex === -1) {
      // Not sorted
      return null;
    }

    const config = sortConfig[sortIndex];
    const priority = sortIndex + 1;
    const arrow = config.direction === 'asc' ? '▲' : '▼';

    // Use V symbols as requested
    const vSymbol = config.direction === 'asc' ? '∨' : '∧';

    return (
      <span className="ml-2 inline-flex items-center">
        <span className="text-primary-600 font-bold">{arrow}</span>
        {priority > 1 && (
          <span className="text-xs ml-1 text-primary-600 font-semibold">{priority}</span>
        )}
      </span>
    );
  };

  // Multi-tier sorting function
  const applySorting = (data) => {
    if (sortConfig.length === 0) {
      return data;
    }

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
          case 'vehicle':
            aValue = `${a.vehicle?.year || ''} ${a.vehicle?.make || ''} ${a.vehicle?.model || ''}`.toLowerCase();
            bValue = `${b.vehicle?.year || ''} ${b.vehicle?.make || ''} ${b.vehicle?.model || ''}`.toLowerCase();
            break;
          case 'service':
            // Get the first service for comparison
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
        if (aValue < bValue) {
          comparison = -1;
        } else if (aValue > bValue) {
          comparison = 1;
        }

        if (comparison !== 0) {
          return config.direction === 'asc' ? comparison : -comparison;
        }
      }

      return 0;
    });
  };

  useEffect(() => {
    const fetchWorkOrders = async () => {
      try {
        setLoading(true);
        
        // Build filter object based on URL parameters
        const filters = {};
        if (customerParam) filters.customer = customerParam;
        if (vehicleParam) filters.vehicle = vehicleParam;
        // Exclude statuses that have their own sections at the database level
        filters.excludeStatuses = 'Repair Complete - Invoiced,On Hold,Cancelled';
        
        const response = await WorkOrderService.getAllWorkOrders(filters);
        setWorkOrders(response.data.workOrders);

        // Fetch attachment counts for each work order
        await fetchAttachmentCounts(response.data.workOrders);

        // Fetch interaction stats for each work order
        await fetchInteractionStats(response.data.workOrders);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching work orders:', err);
        setError('Failed to load work orders. Please try again later.');
        setLoading(false);
      }
    };

    fetchWorkOrders();
  }, [customerParam, vehicleParam]);

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
          // Exclude statuses that have their own sections at the database level
          filters.excludeStatuses = 'Repair Complete - Invoiced,On Hold,Cancelled';
          
          const response = await WorkOrderService.getAllWorkOrders(filters);
          setWorkOrders(response.data.workOrders);
          await fetchAttachmentCounts(response.data.workOrders);
          await fetchInteractionStats(response.data.workOrders);
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
  }, [searchQuery, customerParam, vehicleParam]);

  // Fetch invoiced work orders when section is toggled
  const fetchInvoicedWorkOrders = async () => {
    try {
      setInvoicedLoading(true);
      const filters = { status: 'Repair Complete - Invoiced' };
      if (customerParam) filters.customer = customerParam;
      if (vehicleParam) filters.vehicle = vehicleParam;
      
      const response = await WorkOrderService.getAllWorkOrders(filters);
      setInvoicedWorkOrders(response.data.workOrders || []);
      
      // Fetch attachment counts for invoiced work orders
      await fetchAttachmentCounts(response.data.workOrders || []);
      setInvoicedLoading(false);
    } catch (err) {
      console.error('Error fetching invoiced work orders:', err);
      setInvoicedLoading(false);
    }
  };

  // Fetch on hold/cancelled work orders when section is toggled
  const fetchOnHoldCancelledWorkOrders = async () => {
    try {
      setOnHoldCancelledLoading(true);
      
      // Need to fetch both statuses - make two separate calls since API doesn't support multiple status filters
      const filters = { customer: customerParam, vehicle: vehicleParam };
      const [onHoldResponse, cancelledResponse] = await Promise.all([
        WorkOrderService.getAllWorkOrders({ ...filters, status: 'On Hold' }),
        WorkOrderService.getAllWorkOrders({ ...filters, status: 'Cancelled' })
      ]);
      
      const combinedOrders = [
        ...(onHoldResponse.data.workOrders || []),
        ...(cancelledResponse.data.workOrders || [])
      ];
      
      setOnHoldCancelledWorkOrders(combinedOrders);
      
      // Fetch attachment counts for on hold/cancelled work orders
      await fetchAttachmentCounts(combinedOrders);
      setOnHoldCancelledLoading(false);
    } catch (err) {
      console.error('Error fetching on hold/cancelled work orders:', err);
      setOnHoldCancelledLoading(false);
    }
  };

  // Toggle invoiced table and fetch data if needed
  const toggleInvoicedTable = async () => {
    const newShowState = !showInvoicedTable;
    setShowInvoicedTable(newShowState);
    
    if (newShowState && invoicedWorkOrders.length === 0) {
      await fetchInvoicedWorkOrders();
    }
  };

  // Toggle on hold/cancelled table and fetch data if needed  
  const toggleOnHoldCancelledTable = async () => {
    const newShowState = !showOnHoldCancelledTable;
    setShowOnHoldCancelledTable(newShowState);
    
    if (newShowState && onHoldCancelledWorkOrders.length === 0) {
      await fetchOnHoldCancelledWorkOrders();
    }
  };

  const fetchAttachmentCounts = async (workOrdersList) => {
    try {
      const counts = {};
      
      // Process work orders in batches to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < workOrdersList.length; i += batchSize) {
        const batch = workOrdersList.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (workOrder) => {
            try {
              const response = await MediaService.getAllMedia({ workOrder: workOrder._id });
              counts[workOrder._id] = response?.data?.media?.length || 0;
            } catch (err) {
              console.error(`Error fetching attachments for work order ${workOrder._id}:`, err);
              counts[workOrder._id] = 0;
            }
          })
        );
        
        // Add delay between batches to prevent rate limiting
        if (i + batchSize < workOrdersList.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      setAttachmentCounts(counts);
    } catch (err) {
      console.error('Error fetching attachment counts:', err);
    }
  };

  const fetchInteractionStats = async (workOrdersList) => {
    try {
      const stats = {};
      
      // Process work orders in batches to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < workOrdersList.length; i += batchSize) {
        const batch = workOrdersList.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (workOrder) => {
            try {
              const response = await customerInteractionService.getInteractionStats(workOrder._id);
              stats[workOrder._id] = response;
            } catch (err) {
              console.error(`Error fetching interaction stats for work order ${workOrder._id}:`, err);
              stats[workOrder._id] = null;
            }
          })
        );
        
        // Add delay between batches to prevent rate limiting
        if (i + batchSize < workOrdersList.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      setInteractionStats(stats);
    } catch (err) {
      console.error('Error fetching interaction stats:', err);
    }
  };

  // Helper function to render interaction badges
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
          📞 {timeText}
        </span>
      );
    }
    
    if (stats.pendingFollowUps > 0) {
      badges.push(
        <span key="follow-ups" className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          ⏰ {stats.pendingFollowUps} follow-up{stats.pendingFollowUps > 1 ? 's' : ''}
        </span>
      );
    }
    
    if (stats.overdueFollowUps > 0) {
      badges.push(
        <span key="overdue" className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          🚨 {stats.overdueFollowUps} overdue
        </span>
      );
    }
    
    return badges.length > 0 ? (
      <div className="flex flex-wrap gap-1 mt-1">
        {badges}
      </div>
    ) : null;
  };

  const performSearch = useCallback(async (query) => {
    try {
      setIsSearching(true);
      const response = await WorkOrderService.searchWorkOrders(query);
      setWorkOrders(response.data.workOrders);
      await fetchAttachmentCounts(response.data.workOrders);
      await fetchInteractionStats(response.data.workOrders);
      setIsSearching(false);
    } catch (err) {
      console.error('Error searching work orders:', err);
      setError('Failed to search work orders. Please try again later.');
      setIsSearching(false);
    }
  }, []);


  // Handle inline status update for individual work orders
  const handleWorkOrderStatusUpdate = async (workOrderId, newStatus, retryCount = 0) => {
    try {
      setStatusUpdating(workOrderId);
      
      // Update the work order status via API
      await WorkOrderService.updateWorkOrder(workOrderId, { status: newStatus });
      
      // Update the local state
      setWorkOrders(prevWorkOrders =>
        prevWorkOrders.map(wo =>
          wo._id === workOrderId ? { ...wo, status: newStatus } : wo
        )
      );
      
    } catch (err) {
      console.error('Error updating work order status:', err);
      
      // Retry on rate limit (429) error, up to 2 retries
      if (err.status === 429 && retryCount < 2) {
        console.log(`Rate limited, retrying in ${(retryCount + 1) * 1000}ms...`);
        setTimeout(() => {
          handleWorkOrderStatusUpdate(workOrderId, newStatus, retryCount + 1);
        }, (retryCount + 1) * 1000);
        return;
      }
      
      setError('Failed to update work order status. Please try again.');
    } finally {
      if (retryCount === 0) { // Only clear on the initial attempt, not retries
        setStatusUpdating(null);
      }
    }
  };


  // Status options for inline status change (without "All Statuses")
  const workOrderStatusOptions = [
    { value: 'Work Order Created', label: 'Work Order Created' },
    { value: 'Appointment Scheduled', label: 'Appointment Scheduled' },
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

  // Status priority for sorting (lower number = higher priority)
  const getStatusPriority = (status) => {
    const priorities = {
      'Work Order Created': 1,
      'Appointment Scheduled': 2,
      'Inspection In Progress': 3,
      'Inspection/Diag Complete': 4,
      'Parts Ordered': 5,
      'Parts Received': 6,
      'Repair In Progress': 7,
      'Repair Complete - Awaiting Payment': 8,
      'Repair Complete - Invoiced': 9,
      'On Hold': 10,
      'Cancelled': 11
    };
    return priorities[status] || 99;
  };

  // Status filter categories - aligned with color coding
  const statusCategories = [
    { key: 'All', label: 'All', statuses: [] },
    { key: 'Created', label: 'Created', statuses: ['Work Order Created'] },
    { key: 'Service Writer Action', label: 'Service Writer Action', statuses: ['Inspection/Diag Complete', 'Parts Received', 'Repair Complete - Awaiting Payment'] },
    { key: 'Technician Action', label: 'Technician Action', statuses: ['Inspection In Progress', 'Repair In Progress'] },
    { key: 'Waiting/Scheduled', label: 'Waiting/Scheduled', statuses: ['Work Order Created', 'Appointment Scheduled', 'Parts Ordered'] }
  ];

  // Filter work orders based on selected category, excluding statuses that have their own sections
  const getFilteredWorkOrders = () => {
    // Always exclude these statuses from the main view since they have separate sections
    const excludedStatuses = ['Repair Complete - Invoiced', 'On Hold', 'Cancelled'];
    
    if (statusFilter === 'All') {
      return workOrders.filter(wo => !excludedStatuses.includes(wo.status));
    }
    
    const selectedCategory = statusCategories.find(cat => cat.key === statusFilter);
    if (!selectedCategory) {
      return workOrders.filter(wo => !excludedStatuses.includes(wo.status));
    }
    
    return workOrders.filter(wo => 
      selectedCategory.statuses.includes(wo.status) && 
      !excludedStatuses.includes(wo.status)
    );
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  // Helper function to get status color (matches dashboard calendar color scheme)
  const getStatusColor = (status) => {
    switch (status) {
      // GREEN SCALE - Waiting/Automated
      case 'Work Order Created':
        return 'bg-green-100 text-green-800';
      case 'Appointment Scheduled':
        return 'bg-green-100 text-green-800';
      case 'Parts Ordered':
        return 'bg-green-100 text-green-800';
      case 'Repair Complete - Invoiced':
        return 'bg-green-300 text-green-950';

      // BLUE SCALE - Service Writer Action Needed
      case 'Inspection/Diag Complete':
        return 'bg-blue-100 text-blue-800';
      case 'Parts Received':
        return 'bg-blue-200 text-blue-900';
      case 'Repair Complete - Awaiting Payment':
        return 'bg-blue-300 text-blue-950';

      // YELLOW/ORANGE SCALE - Technician Action Needed
      case 'Inspection In Progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'Repair In Progress':
        return 'bg-orange-200 text-orange-900';

      // GREY SCALE - Customer/Stopped
      case 'On Hold':
        return 'bg-gray-200 text-gray-700';
      case 'Cancelled':
        return 'bg-gray-400 text-gray-800';

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

  // Get filtered work orders based on current filter and apply sorting
  const filteredWorkOrders = useMemo(() => {
    const filtered = getFilteredWorkOrders();
    return applySorting(filtered);
  }, [workOrders, statusFilter, sortConfig]);

  // Apply sorting to invoiced work orders
  const sortedInvoicedWorkOrders = useMemo(() => {
    return applySorting(invoicedWorkOrders);
  }, [invoicedWorkOrders, sortConfig]);

  // Apply sorting to on hold/cancelled work orders
  const sortedOnHoldCancelledWorkOrders = useMemo(() => {
    return applySorting(onHoldCancelledWorkOrders);
  }, [onHoldCancelledWorkOrders, sortConfig]);

  // Calculate status counts (memoized so they update when workOrders changes)
  const statusCounts = useMemo(() => {
    // Exclude statuses that have their own separate sections
    const excludedStatuses = ['Repair Complete - Invoiced', 'On Hold', 'Cancelled'];
    const mainViewWorkOrders = workOrders.filter(wo => !excludedStatuses.includes(wo.status));
    
    const counts = {};
    statusCategories.forEach(category => {
      if (category.key === 'All') {
        counts[category.key] = mainViewWorkOrders.length;
      } else {
        counts[category.key] = mainViewWorkOrders.filter(wo => 
          category.statuses.includes(wo.status)
        ).length;
      }
    });
    return counts;
  }, [workOrders]);
  
  // invoicedWorkOrders and onHoldCancelledWorkOrders are now separate state variables
  // that are fetched on-demand when their sections are toggled

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
          <div className="relative">
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
          
          if (filteredWorkOrders.length === 0 && (statusFilter !== 'All' || searchQuery)) {
            return (
              <div className="text-center py-6 text-gray-500">
                <p>No work orders match your criteria.</p>
              </div>
            );
          }
          
          if (filteredWorkOrders.length === 0 && statusFilter === 'All') {
            return (
              <div className="text-center py-6 text-gray-500">
                <p>No work orders found.</p>
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
                      <div className="text-xs text-gray-500">
                        {workOrder.status.includes('Completed') 
                          ? 'Final'
                          : 'Estimate'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {/* Always visible buttons */}
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
                        
                        {/* Status-specific Action Button with fixed width */}
                        <div className="w-40">
                          {(workOrder.status === 'Work Order Created' || workOrder.status === 'Parts Received') ? (
                            <Button
                              onClick={() => navigate(`/appointments/new?workOrder=${workOrder._id}&vehicle=${workOrder.vehicle?._id}`)}
                              variant="primary"
                              size="sm"
                              className="w-full"
                            >
                              Schedule Work Order
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
                          ) : workOrder.status === 'Parts Ordered' ? (
                            <Button
                              onClick={() => navigate(`/appointments/new?workOrder=${workOrder._id}&vehicle=${workOrder.vehicle?._id}`)}
                              variant="primary"
                              size="sm"
                              className="w-full"
                            >
                              Schedule Repair
                            </Button>
                          ) : null}
                        </div>
                        
                        {/* Additional Schedule button if needed */}
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
      <Card className="mt-6">
          <div 
            className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50"
            onClick={toggleInvoicedTable}
          >
            <h2 className="text-xl font-semibold text-gray-700">
              Invoiced Work Orders{showInvoicedTable ? ` (${invoicedWorkOrders.length})` : ''}
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
            invoicedLoading ? (
              <div className="flex justify-center items-center h-48 p-4">
                <div className="flex items-center">
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  <p>Loading invoiced work orders...</p>
                </div>
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
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortedInvoicedWorkOrders.map((workOrder) => (
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
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getStatusColor(workOrder.status)}`}>
                            {workOrder.status}
                          </span>
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

      {/* Collapsible Table for On Hold & Cancelled Work Orders */}
      <Card className="mt-6">
          <div 
            className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50"
            onClick={toggleOnHoldCancelledTable}
          >
            <h2 className="text-xl font-semibold text-gray-700">
              On Hold & Cancelled Work Orders{showOnHoldCancelledTable ? ` (${onHoldCancelledWorkOrders.length})` : ''}
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
            onHoldCancelledLoading ? (
              <div className="flex justify-center items-center h-48 p-4">
                <div className="flex items-center">
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  <p>Loading on hold & cancelled work orders...</p>
                </div>
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
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortedOnHoldCancelledWorkOrders.map((workOrder) => (
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
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getStatusColor(workOrder.status)}`}>
                            {workOrder.status}
                          </span>
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
    </div>
  );
};

export default WorkOrderList;
