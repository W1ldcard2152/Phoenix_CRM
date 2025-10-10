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
  const [serviceWritersCorner, setServiceWritersCorner] = useState({
    diagComplete: { workOrders: [], count: 0 },
    partsReceived: { workOrders: [], count: 0 },
    awaitingPayment: { workOrders: [], count: 0 }
  });
  const [expandedSections, setExpandedSections] = useState({
    diagComplete: false,
    partsReceived: false,
    awaitingPayment: false
  });
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

        // Fetch Service Writer's Corner data
        const serviceWritersCornerResponse = await WorkOrderService.getServiceWritersCorner();
        setServiceWritersCorner(serviceWritersCornerResponse.data);

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
    console.log('handleScheduleWorkOrder called with:', workOrderId);
    navigate(`/appointments/new?workOrder=${workOrderId}`);
  };

  const handleViewWorkOrder = (workOrderId) => {
    console.log('handleViewWorkOrder called with:', workOrderId);
    navigate(`/work-orders/${workOrderId}`);
  };

  const handleViewAppointment = (appointmentId) => {
    console.log('handleViewAppointment called with:', appointmentId);
    navigate(`/appointments/${appointmentId}`);
  };

  const totalActionItems =
    serviceWritersCorner.diagComplete.count +
    serviceWritersCorner.partsReceived.count +
    serviceWritersCorner.awaitingPayment.count;

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
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

      {/* Service Writer's Corner Section */}
      {totalActionItems > 0 && (
        <Card
          title={`Service Writer's Corner (${totalActionItems} ${totalActionItems === 1 ? 'item' : 'items'})`}
          className="mb-6"
        >
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 text-sm">
              📋 <strong>Action Required:</strong> These work orders need your attention to move forward in the workflow.
            </p>
          </div>

          {/* Inspection/Diag Complete Section */}
          {serviceWritersCorner.diagComplete.count > 0 && (
            <div className="mb-6">
              <button
                onClick={() => toggleSection('diagComplete')}
                className="w-full text-left text-lg font-semibold text-gray-800 mb-3 flex items-center justify-between hover:bg-gray-50 p-2 rounded transition-colors"
              >
                <div className="flex items-center">
                  <span className="inline-block w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                  Inspection/Diag Complete ({serviceWritersCorner.diagComplete.count})
                </div>
                <svg
                  className={`w-5 h-5 transition-transform ${expandedSections.diagComplete ? 'transform rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expandedSections.diagComplete && (
                <>
                  <div className="mb-3 p-2 bg-orange-50 border-l-4 border-orange-400 rounded">
                    <p className="text-orange-800 text-sm">
                      Parts need to be ordered and/or customer needs to be called.
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
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {serviceWritersCorner.diagComplete.workOrders.slice(0, 5).map((workOrder) => (
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
                        <td className="px-6 py-4 whitespace-nowrap w-48">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('View WO clicked:', workOrder._id);
                                handleViewWorkOrder(workOrder._id);
                              }}
                              className="px-3 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center justify-center"
                            >
                              View WO
                            </button>
                            {workOrder.hasAppointment ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('View Appt clicked:', workOrder.appointmentId);
                                  handleViewAppointment(workOrder.appointmentId);
                                }}
                                className="px-3 py-2 text-sm bg-secondary-500 text-white rounded-md hover:bg-secondary-600 focus:outline-none focus:ring-2 focus:ring-secondary-400 flex items-center justify-center"
                              >
                                View Appt
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('Schedule clicked:', workOrder._id);
                                  handleScheduleWorkOrder(workOrder._id);
                                }}
                                className="px-3 py-2 text-sm bg-secondary-500 text-white rounded-md hover:bg-secondary-600 focus:outline-none focus:ring-2 focus:ring-secondary-400 flex items-center justify-center"
                              >
                                Schedule
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {serviceWritersCorner.diagComplete.count > 5 && (
                  <div className="py-3 text-center">
                    <Button
                      onClick={() => navigate('/workorders')}
                      variant="link"
                    >
                      View {serviceWritersCorner.diagComplete.count - 5} more
                    </Button>
                  </div>
                )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Parts Received Section */}
          {serviceWritersCorner.partsReceived.count > 0 && (
            <div className="mb-6">
              <button
                onClick={() => toggleSection('partsReceived')}
                className="w-full text-left text-lg font-semibold text-gray-800 mb-3 flex items-center justify-between hover:bg-gray-50 p-2 rounded transition-colors"
              >
                <div className="flex items-center">
                  <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                  Parts Received ({serviceWritersCorner.partsReceived.count})
                </div>
                <svg
                  className={`w-5 h-5 transition-transform ${expandedSections.partsReceived ? 'transform rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expandedSections.partsReceived && (
                <>
                  <div className="mb-3 p-2 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                    <p className="text-yellow-800 text-sm">
                      Customer needs to be called to schedule appointment for repair.
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
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {serviceWritersCorner.partsReceived.workOrders.slice(0, 5).map((workOrder) => (
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
                        <td className="px-6 py-4 whitespace-nowrap w-48">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('View WO clicked:', workOrder._id);
                                handleViewWorkOrder(workOrder._id);
                              }}
                              className="px-3 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center justify-center"
                            >
                              View WO
                            </button>
                            {workOrder.hasAppointment ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('View Appt clicked:', workOrder.appointmentId);
                                  handleViewAppointment(workOrder.appointmentId);
                                }}
                                className="px-3 py-2 text-sm bg-secondary-500 text-white rounded-md hover:bg-secondary-600 focus:outline-none focus:ring-2 focus:ring-secondary-400 flex items-center justify-center"
                              >
                                View Appt
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('Schedule clicked:', workOrder._id);
                                  handleScheduleWorkOrder(workOrder._id);
                                }}
                                className="px-3 py-2 text-sm bg-secondary-500 text-white rounded-md hover:bg-secondary-600 focus:outline-none focus:ring-2 focus:ring-secondary-400 flex items-center justify-center"
                              >
                                Schedule
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {serviceWritersCorner.partsReceived.count > 5 && (
                  <div className="py-3 text-center">
                    <Button
                      onClick={() => navigate('/appointments')}
                      variant="link"
                    >
                      View {serviceWritersCorner.partsReceived.count - 5} more
                    </Button>
                  </div>
                )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Repair Complete - Awaiting Payment Section */}
          {serviceWritersCorner.awaitingPayment.count > 0 && (
            <div className="mb-6">
              <button
                onClick={() => toggleSection('awaitingPayment')}
                className="w-full text-left text-lg font-semibold text-gray-800 mb-3 flex items-center justify-between hover:bg-gray-50 p-2 rounded transition-colors"
              >
                <div className="flex items-center">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Repair Complete - Awaiting Payment ({serviceWritersCorner.awaitingPayment.count})
                </div>
                <svg
                  className={`w-5 h-5 transition-transform ${expandedSections.awaitingPayment ? 'transform rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expandedSections.awaitingPayment && (
                <>
                  <div className="mb-3 p-2 bg-green-50 border-l-4 border-green-400 rounded">
                    <p className="text-green-800 text-sm">
                      Customer needs to be contacted to arrange payment and pickup.
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
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {serviceWritersCorner.awaitingPayment.workOrders.slice(0, 5).map((workOrder) => (
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
                        <td className="px-6 py-4 whitespace-nowrap w-48">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('View WO clicked:', workOrder._id);
                                handleViewWorkOrder(workOrder._id);
                              }}
                              className="px-3 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center justify-center"
                            >
                              View WO
                            </button>
                            {workOrder.hasAppointment ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('View Appt clicked:', workOrder.appointmentId);
                                  handleViewAppointment(workOrder.appointmentId);
                                }}
                                className="px-3 py-2 text-sm bg-secondary-500 text-white rounded-md hover:bg-secondary-600 focus:outline-none focus:ring-2 focus:ring-secondary-400 flex items-center justify-center"
                              >
                                View Appt
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('Schedule clicked:', workOrder._id);
                                  handleScheduleWorkOrder(workOrder._id);
                                }}
                                className="px-3 py-2 text-sm bg-secondary-500 text-white rounded-md hover:bg-secondary-600 focus:outline-none focus:ring-2 focus:ring-secondary-400 flex items-center justify-center"
                              >
                                Schedule
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {serviceWritersCorner.awaitingPayment.count > 5 && (
                  <div className="py-3 text-center">
                    <Button
                      onClick={() => navigate('/workorders')}
                      variant="link"
                    >
                      View {serviceWritersCorner.awaitingPayment.count - 5} more
                    </Button>
                  </div>
                )}
                  </div>
                </>
              )}
            </div>
          )}
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
