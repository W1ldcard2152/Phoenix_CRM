import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
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
            <Button to="/work-orders/new" variant="success" className="w-full">
              New Work Order
            </Button>
            <Button to="/appointments/new" variant="info" className="w-full">
              New Appointment
            </Button>
          </div>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Today's Appointments */}
        <Card 
          title="Today's Appointments" 
          headerActions={
            <Button to="/appointments" variant="link" size="sm">
              View All
            </Button>
          }
        >
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <p>Loading appointments...</p>
            </div>
          ) : todayAppointments.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p>No appointments scheduled for today.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {todayAppointments.map((appointment) => (
                <div key={appointment._id} className="py-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        {appointment.customer?.name || 'Unknown Customer'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {appointment.vehicle?.year} {appointment.vehicle?.make} {appointment.vehicle?.model}
                      </p>
                      <p className="text-sm text-gray-600">
                        {appointment.serviceType}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {new Date(appointment.startTime).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                      <span 
                        className={`inline-block px-2 py-1 text-xs rounded-full ${
                          appointment.status === 'Confirmed' 
                            ? 'bg-green-100 text-green-800' 
                            : appointment.status === 'Cancelled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {appointment.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end space-x-2">
                    <Button 
                      to={`/appointments/${appointment._id}`} 
                      variant="outline" 
                      size="sm"
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        
        {/* Active Work Orders */}
        <Card 
          title="Active Work Orders" 
          headerActions={
            <Button to="/work-orders" variant="link" size="sm">
              View All
            </Button>
          }
        >
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <p>Loading work orders...</p>
            </div>
          ) : activeWorkOrders.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p>No active work orders.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {activeWorkOrders.slice(0, 5).map((workOrder) => (
                <div key={workOrder._id} className="py-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        {workOrder.customer?.name || 'Unknown Customer'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {workOrder.vehicle?.year} {workOrder.vehicle?.make} {workOrder.vehicle?.model}
                      </p>
                      <p className="text-sm text-gray-600 truncate max-w-xs">
                        {workOrder.serviceRequested}
                      </p>
                    </div>
                    <div>
                      <span 
                        className={`inline-block px-2 py-1 text-xs rounded-full ${
                          workOrder.status.includes('Parts') 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : workOrder.status.includes('In Progress')
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {workOrder.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end space-x-2">
                    <Button 
                      to={`/work-orders/${workOrder._id}`} 
                      variant="outline" 
                      size="sm"
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
              {activeWorkOrders.length > 5 && (
                <div className="pt-3 text-center">
                  <Link to="/work-orders" className="text-primary-600 hover:text-primary-800">
                    View {activeWorkOrders.length - 5} more work orders
                  </Link>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;