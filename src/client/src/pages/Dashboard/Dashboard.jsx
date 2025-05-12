// src/client/src/pages/Dashboard/Dashboard.jsx - Updated with WorkflowSummary and fixed imports
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import AppointmentCalendar from '../../components/dashboard/AppointmentCalendar';
import WorkflowSummary from '../../components/dashboard/WorkflowSummary';
import WorkOrderService from '../../services/workOrderService';
import AppointmentService from '../../services/appointmentService';

const Dashboard = () => {
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [activeWorkOrders, setActiveWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // Fetch today's appointments
        const appointmentsResponse = await AppointmentService.getTodayAppointments();
        setTodayAppointments(appointmentsResponse.data.appointments);
        
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
      
      {/* Workflow Summary - New Component */}
      <div className="mb-6">
        <WorkflowSummary />
      </div>
      
      <div className="mb-6">
        <AppointmentCalendar />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Quick Stats */}
        <Card title="Quick Stats">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <p>Loading stats...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-primary-50 p-4 rounded-lg">
                <h3 className="text-primary-800 font-medium">Today's Appointments</h3>
                <p className="text-3xl font-bold">{todayAppointments.length}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-blue-800 font-medium">Active Work Orders</h3>
                <p className="text-3xl font-bold">{activeWorkOrders.length}</p>
              </div>
            </div>
          )}
        </Card>
        
        {/* Quick Actions */}
        <Card title="Quick Actions">
          <div className="grid grid-cols-2 gap-4">
            <Button to="/customers/new" variant="primary" className="w-full">
              New Customer
            </Button>
            <Button to="/vehicles/new" variant="secondary" className="w-full">
              New Vehicle
            </Button>
            <Button to="/work-orders/new?createAppointment=true" variant="success" className="w-full">
              Work Order + Appointment
            </Button>
            <Button to="/appointments" variant="info" className="w-full">
              Appointment Schedule
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;