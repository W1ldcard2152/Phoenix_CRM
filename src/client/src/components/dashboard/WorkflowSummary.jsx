// src/client/src/components/dashboard/WorkflowSummary.jsx - Fixed imports
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../common/Card';
import Button from '../common/Button';
// Import services directly - fix the imports
import AppointmentService from '../../services/appointmentService';
import WorkOrderService from '../../services/workOrderService';
import QuickScheduleModal from '../scheduling/QuickScheduleModal';

/**
 * Component that displays a summary of work orders and appointments
 * to help manage the workflow between the two
 */
const WorkflowSummary = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unscheduledWorkOrders, setUnscheduledWorkOrders] = useState([]);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(null);

  useEffect(() => {
    fetchWorkflowData();
  }, []);

  // Replace the workflowService with direct calls to services
  const fetchWorkflowData = async () => {
    try {
      setLoading(true);
      
      // Get today's appointments
      const todayApptsResponse = await AppointmentService.getTodayAppointments();
      
      // Get active work orders that need scheduling
      // Get active work orders (not completed or cancelled)
      const schedulableStatuses = ['Created', 'Inspected - Need Parts Ordered', 'Parts Ordered', 'Parts Received'];
      
      const workOrdersPromises = schedulableStatuses.map(status => 
        WorkOrderService.getWorkOrdersByStatus(status)
      );
      
      const workOrdersResponses = await Promise.all(workOrdersPromises);
      
      // Combine and flatten work orders from different statuses
      const allWorkOrders = workOrdersResponses.flatMap(
        response => response.data.workOrders || []
      );
      
      // Get all appointments to filter out work orders that already have appointments
      const appointmentsResponse = await AppointmentService.getAllAppointments();
      const appointments = appointmentsResponse.data.appointments || [];
      
      // Create a set of work order IDs that already have appointments
      const scheduledWorkOrderIds = new Set(
        appointments
          .filter(a => a.workOrder)
          .map(a => typeof a.workOrder === 'object' ? a.workOrder._id : a.workOrder)
      );
      
      // Filter out work orders that already have appointments
      const unscheduledWorkOrders = allWorkOrders.filter(
        wo => !scheduledWorkOrderIds.has(wo._id)
      );
      
      // Set the state
      setUnscheduledWorkOrders(unscheduledWorkOrders || []);
      setTodayAppointments(todayApptsResponse.data.appointments || []);
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching workflow data:', err);
      setError('Failed to load workflow data');
      setLoading(false);
    }
  };

  const handleQuickSchedule = (workOrderId) => {
    setSelectedWorkOrderId(workOrderId);
    setScheduleModalOpen(true);
  };

  const handleAppointmentCreated = (result) => {
    // Refresh the data after an appointment is created
    fetchWorkflowData();
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <Card title="Workflow Summary">
        <div className="flex justify-center items-center h-32">
          <p>Loading workflow data...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Workflow Summary">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </Card>
    );
  }

  return (
    <Card 
      title="Workflow Summary" 
      headerActions={
        <Button 
          to="/work-orders/new?createAppointment=true" 
          variant="primary"
          size="sm"
        >
          New Work Order + Appointment
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Unscheduled Work Orders */}
        <div>
          <h3 className="font-medium text-lg mb-3 text-gray-700">Needs Scheduling</h3>
          {unscheduledWorkOrders.length === 0 ? (
            <div className="text-center py-4 bg-gray-50 rounded-md text-gray-500">
              <p>No unscheduled work orders</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {unscheduledWorkOrders.slice(0, 5).map(workOrder => (
                <li key={workOrder._id} className="py-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-800">
                        {workOrder.serviceRequested}
                      </p>
                      <p className="text-sm text-gray-600">
                        {workOrder.customer?.name} • {workOrder.vehicle?.year} {workOrder.vehicle?.make} {workOrder.vehicle?.model}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Created: {new Date(workOrder.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => handleQuickSchedule(workOrder._id)}
                        variant="primary"
                        size="sm"
                      >
                        Schedule
                      </Button>
                      <Button
                        to={`/work-orders/${workOrder._id}`}
                        variant="outline"
                        size="sm"
                      >
                        View
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
              {unscheduledWorkOrders.length > 5 && (
                <li className="py-3 text-center">
                  <Button
                    to="/appointments"
                    variant="link"
                  >
                    View all {unscheduledWorkOrders.length} unscheduled work orders
                  </Button>
                </li>
              )}
            </ul>
          )}
        </div>
        
        {/* Today's Appointments */}
        <div>
          <h3 className="font-medium text-lg mb-3 text-gray-700">Today's Appointments</h3>
          {todayAppointments.length === 0 ? (
            <div className="text-center py-4 bg-gray-50 rounded-md text-gray-500">
              <p>No appointments scheduled for today</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {todayAppointments.slice(0, 5).map(appointment => (
                <li key={appointment._id} className="py-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center">
                        <span className="font-medium text-gray-800 mr-2">
                          {formatTime(appointment.startTime)}
                        </span>
                        <span 
                          className={`text-xs px-2 py-0.5 rounded-full ${
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
                      <p className="text-sm text-gray-600 mt-1">
                        {appointment.customer?.name} • {appointment.vehicle?.year} {appointment.vehicle?.make} {appointment.vehicle?.model}
                      </p>
                      <p className="text-sm text-gray-600">
                        {appointment.serviceType}
                      </p>
                      {appointment.technician && (
                        <p className="text-xs text-gray-500">
                          Tech: {appointment.technician}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        to={`/appointments/${appointment._id}`}
                        variant="outline"
                        size="sm"
                      >
                        View
                      </Button>
                      {appointment.workOrder ? (
                        <Button
                          to={`/work-orders/${typeof appointment.workOrder === 'object' ? appointment.workOrder._id : appointment.workOrder}`}
                          variant="outline"
                          size="sm"
                        >
                          View WO
                        </Button>
                      ) : (
                        <Button
                          to={`/work-orders/new?appointment=${appointment._id}`}
                          variant="primary"
                          size="sm"
                        >
                          Create WO
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
              {todayAppointments.length > 5 && (
                <li className="py-3 text-center">
                  <Button
                    to="/appointments"
                    variant="link"
                  >
                    View all {todayAppointments.length} appointments
                  </Button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
      
      {/* Quick Schedule Modal */}
      <QuickScheduleModal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        workOrderId={selectedWorkOrderId}
        onScheduled={handleAppointmentCreated}
      />
    </Card>
  );
};

export default WorkflowSummary;