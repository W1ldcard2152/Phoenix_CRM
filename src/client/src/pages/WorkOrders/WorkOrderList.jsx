import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import SelectInput from '../../components/common/SelectInput';
import WorkOrderService from '../../services/workOrderService';

const WorkOrderList = () => {
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchParams] = useSearchParams();
  
  // Get filter parameters from URL
  const customerParam = searchParams.get('customer');
  const vehicleParam = searchParams.get('vehicle');

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
        setWorkOrders(response.data.workOrders);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching work orders:', err);
        setError('Failed to load work orders. Please try again later.');
        setLoading(false);
      }
    };

    fetchWorkOrders();
  }, [customerParam, vehicleParam, statusFilter]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      // If search query is empty, fetch all work orders with current filters
      try {
        setIsSearching(true);
        
        const filters = {};
        if (customerParam) filters.customer = customerParam;
        if (vehicleParam) filters.vehicle = vehicleParam;
        if (statusFilter) filters.status = statusFilter;
        
        const response = await WorkOrderService.getAllWorkOrders(filters);
        setWorkOrders(response.data.workOrders);
        
        setIsSearching(false);
      } catch (err) {
        console.error('Error fetching work orders:', err);
        setError('Failed to load work orders. Please try again later.');
        setIsSearching(false);
      }
      return;
    }

    try {
      setIsSearching(true);
      const response = await WorkOrderService.searchWorkOrders(searchQuery);
      setWorkOrders(response.data.workOrders);
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

  // Status options for filter dropdown
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'Created', label: 'Created' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Inspected - Need Parts Ordered', label: 'Inspected - Need Parts' },
    { value: 'Parts Ordered', label: 'Parts Ordered' },
    { value: 'Parts Received', label: 'Parts Received' },
    { value: 'Repair In Progress', label: 'Repair In Progress' },
    { value: 'Completed - Need Payment', label: 'Completed - Need Payment' },
    { value: 'Completed - Paid', label: 'Completed - Paid' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  // Get status label for display
  const getStatusLabel = (status) => {
    const option = statusOptions.find(option => option.value === status);
    return option ? option.label : status;
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

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
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Input
              placeholder="Search by service type, notes, or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
            />
          </div>
          <div className="flex">
            <SelectInput
              name="statusFilter"
              options={statusOptions}
              value={statusFilter}
              onChange={handleStatusChange}
              className="flex-grow"
            />
            <Button
              onClick={handleSearch}
              variant="secondary"
              className="ml-2"
              disabled={isSearching}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-48">
            <p>Loading work orders...</p>
          </div>
        ) : workOrders.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <p>No work orders found.</p>
          </div>
        ) : (
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
                {workOrders.map((workOrder) => (
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
                      <div className="text-sm text-gray-900 truncate max-w-xs">
                        {workOrder.serviceRequested}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span 
                        className={`inline-block px-2 py-1 text-xs rounded-full ${
                          workOrder.status.includes('Completed') 
                            ? 'bg-green-100 text-green-800' 
                            : workOrder.status === 'Cancelled'
                              ? 'bg-red-100 text-red-800'
                              : workOrder.status.includes('Parts')
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {workOrder.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {workOrder.status.includes('Completed') 
                          ? formatCurrency(workOrder.totalActual)
                          : formatCurrency(workOrder.totalEstimate)}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default WorkOrderList;