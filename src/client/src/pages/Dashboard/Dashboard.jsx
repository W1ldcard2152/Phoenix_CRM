// src/client/src/pages/Dashboard/Dashboard.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import AppointmentCalendar from '../../components/dashboard/AppointmentCalendar';
import WorkflowSummary from '../../components/dashboard/WorkflowSummary';
import GlobalSearch from '../../components/common/GlobalSearch';
import WorkOrderService from '../../services/workOrderService';

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeWorkOrders, setActiveWorkOrders] = useState([]);
  const [workOrdersAwaitingScheduling, setWorkOrdersAwaitingScheduling] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // Fetch active work orders (not completed or cancelled)
        const activeStatuses = [
          'Created', 
          'Scheduled', 
          'Inspection In Progress', 
          'Inspected/Parts Ordered',
          'Parts Received',
          'Repair In Progress'
        ];
        
        const workOrdersPromises = activeStatuses.map(status => 
          WorkOrderService.getWorkOrdersByStatus(status)
        );
        
        const workOrdersResponses = await Promise.all(workOrdersPromises);
        
        // Combine and flatten work orders from different statuses
        const allActiveWorkOrders = workOrdersResponses.flatMap(
          response => response.data.workOrders
        );
        
        setActiveWorkOrders(allActiveWorkOrders);
        
        // Fetch work orders awaiting scheduling
        const awaitingSchedulingResponse = await WorkOrderService.getWorkOrdersAwaitingScheduling();
        setWorkOrdersAwaitingScheduling(awaitingSchedulingResponse.data.workOrders);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);

  const handleScheduleWorkOrder = (workOrderId) => {
    navigate(`/appointments/new?workOrder=${workOrderId}`);
  };

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
            <p className="text-gray-600">Welcome to the Auto Repair Shop CRM</p>
          </div>
          <div className="w-full sm:w-80">
            <GlobalSearch />
          </div>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {/* Workflow Summary with Today's Appointments */}
      <div className="mb-6">
        <WorkflowSummary />
      </div>
      
      {/* Work Orders Awaiting Scheduling Section */}
      {workOrdersAwaitingScheduling.length > 0 && (
        <Card title="Work Orders Awaiting Scheduling" className="mb-6">
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 text-sm">
              📞 <strong>Parts Received!</strong> These work orders have their parts and need to be scheduled for completion.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer & Vehicle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {workOrdersAwaitingScheduling.slice(0, 5).map((workOrder) => (
                  <tr key={workOrder._id} className="hover:bg-gray-50">
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
                      <div className="text-sm text-gray-900">
                        {workOrder.customer?.phone || 'No phone'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Button
                        onClick={() => handleScheduleWorkOrder(workOrder._id)}
                        variant="primary"
                        size="sm"
                      >
                        Schedule
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {workOrdersAwaitingScheduling.length > 5 && (
              <div className="py-3 text-center">
                <Button
                  onClick={() => navigate('/appointments')}
                  variant="link"
                >
                  View {workOrdersAwaitingScheduling.length - 5} more work orders
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
      
      {/* Calendar Section */}
      <div className="mb-6">
        <AppointmentCalendar />
      </div>
    </div>
  );
};

export default Dashboard;
