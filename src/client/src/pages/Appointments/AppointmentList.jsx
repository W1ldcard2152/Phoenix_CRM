// src/client/src/pages/Appointments/AppointmentList.jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import SelectInput from '../../components/common/SelectInput';
import AppointmentService from '../../services/appointmentService';
import WorkOrderService from '../../services/workOrderService';
import ScheduleBlockService from '../../services/scheduleBlockService';
import technicianService from '../../services/technicianService';
import { formatDateTimeToET, getTodayForInput, formatDateForInput, TIMEZONE } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { applyScheduleBlockVisibility, isAdminOrManagement } from '../../utils/permissions';
import usePersistedState from '../../hooks/usePersistedState';

const AppointmentList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [pendingWorkOrders, setPendingWorkOrders] = useState([]);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [showAllTasks, setShowAllTasks] = usePersistedState('appt-list:showAllTasks', false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: getTodayForInput(),
    endDate: formatDateForInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  });
  const [statusFilter, setStatusFilter] = usePersistedState('appt-list:statusFilter', '');
  const [technicianFilter, setTechnicianFilter] = usePersistedState('appt-list:technicianFilter', '');
  const [technicianFilterOptions, setTechnicianFilterOptions] = useState([{ value: '', label: 'Loading Technicians...' }]);
  const [searchParams] = useSearchParams();
  const [appointmentActionModal, setAppointmentActionModal] = useState(false);
  
  // Get filter parameters from URL
  const customerParam = searchParams.get('customer');
  const vehicleParam = searchParams.get('vehicle');

  useEffect(() => {
    const fetchTechOptions = async () => {
      try {
        const response = await technicianService.getAllTechnicians(true); // Fetch active
        const fetchedTechnicians = response.data.data.technicians || [];
        const options = [
          { value: '', label: 'All Technicians' },
          ...fetchedTechnicians.map(tech => ({ value: tech._id, label: tech.name }))
        ];
        setTechnicianFilterOptions(options);
      } catch (err) {
        console.error('Error fetching technicians for filter:', err);
        setTechnicianFilterOptions([{ value: '', label: 'Error loading techs' }]);
      }
    };
    fetchTechOptions();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Build filter object based on URL parameters
        const filters = {};
        if (customerParam) filters.customer = customerParam;
        if (vehicleParam) filters.vehicle = vehicleParam;
        if (statusFilter) filters.status = statusFilter;
        if (technicianFilter) filters.technician = technicianFilter;
        if (dateRange.startDate) filters.startDate = dateRange.startDate;
        if (dateRange.endDate) filters.endDate = dateRange.endDate;
        
        // Fetch appointments
        const appointmentsResponse = await AppointmentService.getAllAppointments(filters);
        setAppointments(appointmentsResponse.data.appointments);
        
        // Fetch work orders that need scheduling (includes all statuses that need scheduling)
        const needingSchedulingResponse = await WorkOrderService.getWorkOrdersNeedingScheduling();
        setPendingWorkOrders(needingSchedulingResponse.data.workOrders);

        // Fetch upcoming tasks (next 7 days)
        const today = moment.tz(TIMEZONE).format('YYYY-MM-DD');
        const weekFromNow = moment.tz(TIMEZONE).add(7, 'days').format('YYYY-MM-DD');
        try {
          const blockResponse = await ScheduleBlockService.getExpanded(today, weekFromNow);
          const expandedBlocks = blockResponse?.data?.scheduleBlocks || [];
          const visibleBlocks = expandedBlocks.map(block =>
            applyScheduleBlockVisibility(block, user)
          );
          setUpcomingTasks(visibleBlocks);
        } catch (err) {
          console.error('Error fetching upcoming tasks:', err);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching appointments:', err);
        setError('Failed to load appointments. Please try again later.');
        setLoading(false);
      }
    };

    fetchData();
  }, [customerParam, vehicleParam, statusFilter, technicianFilter, dateRange]);

  const handleDateRangeChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === 'status') {
      setStatusFilter(value);
    } else if (name === 'technician') {
      setTechnicianFilter(value);
    }
  };

  const handleCreateAppointmentClick = () => {
    setAppointmentActionModal(true);
  };

  const handleScheduleWorkOrder = (workOrderId) => {
    navigate(`/appointments/new?workOrder=${workOrderId}`);
  };

  // Format date and time for display (now uses formatDateTimeToET)
  // The second parameter to formatDateTimeToET is optional and defaults to 'MMM D, YYYY, h:mm A'
  // If a different format is needed here, it can be specified.
  // For example, to get 'MM/DD/YYYY h:mm A': formatDateTimeToET(dateTimeString, 'MM/DD/YYYY h:mm A')

  // Status options for filter dropdown
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Confirmed', label: 'Confirmed' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Inspection/Diag Scheduled', label: 'Inspection/Diag Scheduled' },
    { value: 'Inspection In Progress', label: 'Inspection In Progress' },
    { value: 'Inspection/Diag Complete', label: 'Inspection/Diag Complete' },
    { value: 'Repair Scheduled', label: 'Repair Scheduled' },
    { value: 'Repair In Progress', label: 'Repair In Progress' },
    { value: 'Repair Complete - Awaiting Payment', label: 'Repair Complete - Awaiting Payment' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Cancelled', label: 'Cancelled' },
    { value: 'No-Show', label: 'No-Show' }
  ];

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Calendar & Tasks</h1>
        <div className="flex gap-3">
          <Button onClick={handleCreateAppointmentClick} variant="primary">
            Schedule Work Order
          </Button>
          <Button onClick={() => navigate('/schedule-blocks/new')} variant="secondary">
            Schedule Task
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {/* Work Orders Awaiting Scheduling Section */}
      {pendingWorkOrders.length > 0 && (
        <Card title="Work Orders Awaiting Scheduling" className="mb-6">
          {pendingWorkOrders.some(wo => wo.status === 'Parts Received') && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 text-sm">
                📞 <strong>Parts Received!</strong> {pendingWorkOrders.filter(wo => wo.status === 'Parts Received').length} work order(s) have parts ready and customers need to be called to schedule completion.
              </p>
            </div>
          )}
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
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingWorkOrders.slice(0, 5).map((workOrder) => (
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
                      <span 
                        className={`inline-block px-2 py-1 text-xs rounded-full ${
                          workOrder.status === 'Parts Received'
                            ? 'bg-green-100 text-green-800' 
                            : workOrder.status === 'Inspected/Parts Ordered'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {workOrder.status}
                        {workOrder.status === 'Parts Received' && ' 📞'}
                      </span>
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
            {pendingWorkOrders.length > 5 && (
              <div className="py-3 text-center">
                <Button
                  to="/work-orders?needsScheduling=true"
                  variant="link"
                >
                  View {pendingWorkOrders.length - 5} more work orders
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Upcoming Tasks Section */}
      {upcomingTasks.length > 0 && (
        <Card title="Upcoming Tasks" className="mb-6"
          headerActions={
            <Button to="/schedule-blocks" variant="outline" size="sm">
              Manage All Tasks
            </Button>
          }
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Technician</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                  {isAdminOrManagement(user) && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  )}
                  {isAdminOrManagement(user) && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(showAllTasks ? upcomingTasks : upcomingTasks.slice(0, 5)).map((task) => (
                  <tr key={task._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`font-medium ${task._isRedacted ? 'text-gray-500 italic' : 'text-gray-900'}`}>
                        {task.title}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {task.technician?.name || 'Unassigned'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatDateTimeToET(task.startTime, 'MMM D, YYYY')}</div>
                      <div className="text-xs text-gray-500">
                        {formatDateTimeToET(task.startTime, 'h:mm A')} - {formatDateTimeToET(task.endTime, 'h:mm A')}
                      </div>
                    </td>
                    {isAdminOrManagement(user) && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        {task.category && (
                          <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-800 capitalize">
                            {task.category}
                          </span>
                        )}
                      </td>
                    )}
                    {isAdminOrManagement(user) && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Button to={`/schedule-blocks/${task.scheduleBlockId}/edit`} variant="outline" size="sm">
                          Edit
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {upcomingTasks.length > 5 && (
              <div className="py-3 text-center">
                <button
                  onClick={() => setShowAllTasks(!showAllTasks)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  {showAllTasks ? 'Show less' : `View all ${upcomingTasks.length} upcoming tasks`}
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Appointment Filters */}
      <Card>
        <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <Input
              type="date"
              name="startDate"
              value={dateRange.startDate}
              onChange={handleDateRangeChange}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <Input
              type="date"
              name="endDate"
              value={dateRange.endDate}
              onChange={handleDateRangeChange}
            />
          </div>
          <div>
            <SelectInput
              label="Status"
              name="status"
              options={statusOptions}
              value={statusFilter}
              onChange={handleFilterChange}
            />
          </div>
          <div>
            <SelectInput
              label="Technician"
              name="technician"
              options={technicianFilterOptions}
              value={technicianFilter}
              onChange={handleFilterChange}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-48">
            <p>Loading appointments...</p>
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <p>No appointments found for the selected criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer & Vehicle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Technician
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Work Order
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {appointments.map((appointment) => (
                  <tr key={appointment._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDateTimeToET(appointment.startTime)}
                      </div>
                      <div className="text-xs text-gray-500">
                        to {formatDateTimeToET(appointment.endTime, 'h:mm A')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">
                        {appointment.customer?.name || 'Unknown Customer'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {appointment.vehicle?.year} {appointment.vehicle?.make} {appointment.vehicle?.model}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 truncate max-w-xs">
                        {appointment.serviceType}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {appointment.technician?.name || 'Not Assigned'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span 
                        className={`inline-block px-2 py-1 text-xs rounded-full ${
                          appointment.status === 'Confirmed' 
                            ? 'bg-green-100 text-green-800' 
                            : appointment.status === 'Cancelled'
                              ? 'bg-red-100 text-red-800'
                              : appointment.status === 'Completed'
                                ? 'bg-blue-100 text-blue-800'
                                : appointment.status === 'No-Show'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {appointment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
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
                          onClick={() => navigate(`/work-orders/new?appointment=${appointment._id}`)}
                          variant="outline"
                          size="sm"
                        >
                          Create WO
                        </Button>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <Button
                          to={`/appointments/${appointment._id}`}
                          variant="outline"
                          size="sm"
                        >
                          View
                        </Button>
                        <Button
                          to={`/appointments/${appointment._id}/edit`}
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

      {/* Appointment Action Modal */}
      {appointmentActionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Schedule Work Order</h3>
            <p className="text-gray-700 mb-6">
              How would you like to schedule this work order?
            </p>
            <div className="space-y-4">
              <Button
                onClick={() => {
                  setAppointmentActionModal(false);
                  navigate('/work-orders/new?createAppointment=true');
                }}
                variant="primary"
                className="w-full"
              >
                Create Work Order & Schedule Appointment
              </Button>
              {pendingWorkOrders.length > 0 && (
                <Button
                  onClick={() => {
                    setAppointmentActionModal(false);
                    navigate('/work-orders?needsScheduling=true');
                  }}
                  variant="secondary"
                  className="w-full"
                >
                  Schedule Existing Work Order
                </Button>
              )}
              <Button
                onClick={() => {
                  setAppointmentActionModal(false);
                  navigate('/appointments/new');
                }}
                variant="outline"
                className="w-full"
              >
                Create Standalone Appointment
              </Button>
              <Button
                onClick={() => setAppointmentActionModal(false)}
                variant="light"
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentList;
