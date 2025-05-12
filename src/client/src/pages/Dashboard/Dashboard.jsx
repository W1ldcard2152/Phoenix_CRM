// src/client/src/pages/Dashboard/Dashboard.jsx

import React, { useState, useEffect } from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import AppointmentCalendar from '../../components/dashboard/AppointmentCalendar';
import WorkflowSummary from '../../components/dashboard/WorkflowSummary';
import WorkOrderService from '../../services/workOrderService';
import AppointmentService from '../../services/appointmentService';

const Dashboard = () => {
  const [activeWorkOrders, setActiveWorkOrders] = useState([]);
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
          'In Progress', 
          'Inspected - Need Parts Ordered',
          'Parts Ordered',
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
        setLoading(false);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-600">Welcome to the Auto Repair Shop CRM</p>
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
      
      {/* Quick Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card title="Quick Stats">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <p>Loading stats...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-blue-800 font-medium">Active Work Orders</h3>
                <p className="text-3xl font-bold">{activeWorkOrders.length}</p>
              </div>
            </div>
          )}
        </Card>
      </div>
      
      {/* Calendar Section */}
      <div className="mb-6">
        <AppointmentCalendar />
      </div>
    </div>
  );
};

export default Dashboard;