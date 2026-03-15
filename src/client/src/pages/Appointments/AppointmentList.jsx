// src/client/src/pages/Appointments/AppointmentList.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import SelectInput from '../../components/common/SelectInput';
import AppointmentService from '../../services/appointmentService';
import WorkOrderService from '../../services/workOrderService';
import ScheduleBlockService from '../../services/scheduleBlockService';
import technicianService from '../../services/technicianService';
import { formatDateTimeToET, getTodayForInput, formatDateForInput } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { applyScheduleBlockVisibility, isAdminOrManagement } from '../../utils/permissions';
import usePersistedState from '../../hooks/usePersistedState';

// Multi-select status chip definitions for the unified table
const STATUS_CHIPS = [
  { key: 'Scheduled', label: 'Scheduled', statuses: ['Scheduled'], colorClass: 'bg-green-100 text-green-800 border-green-300' },
  { key: 'Confirmed', label: 'Confirmed', statuses: ['Confirmed'], colorClass: 'bg-green-200 text-green-900 border-green-400' },
  { key: 'InProgress', label: 'In Progress', statuses: ['In Progress', 'Repair Scheduled', 'Repair In Progress'], colorClass: 'bg-orange-100 text-orange-800 border-orange-300' },
  { key: 'Inspection', label: 'Inspection', statuses: ['Inspection/Diag Scheduled', 'Inspection In Progress', 'Inspection/Diag Complete'], colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { key: 'Complete', label: 'Complete', statuses: ['Repair Complete - Awaiting Payment', 'Completed'], colorClass: 'bg-blue-100 text-blue-800 border-blue-300' },
  { key: 'Cancelled', label: 'Cancelled', statuses: ['Cancelled'], colorClass: 'bg-gray-300 text-gray-700 border-gray-400' },
  { key: 'NoShow', label: 'No-Show', statuses: ['No-Show'], colorClass: 'bg-red-100 text-red-800 border-red-300' },
  { key: 'Task', label: 'Task', statuses: [], colorClass: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
];

// WO scheduling section status tab definitions
const WO_STATUS_CATEGORIES = [
  { key: 'All', label: 'All', statuses: [] },
  { key: 'Created', label: 'Work Order Created', statuses: ['Created'] },
  { key: 'ApptComplete', label: 'Appointment Complete', statuses: ['Appointment Complete'] },
  { key: 'PartsOrdered', label: 'Parts Ordered', statuses: ['Inspected/Parts Ordered'] },
  { key: 'PartsReceived', label: 'Parts Received', statuses: ['Parts Received'] },
];

const getWoStatusColor = (status) => {
  switch (status) {
    case 'Created': return 'bg-green-100 text-green-800';
    case 'Appointment Complete': return 'bg-blue-100 text-blue-800';
    case 'Inspected/Parts Ordered': return 'bg-yellow-100 text-yellow-800';
    case 'Parts Received': return 'bg-green-200 text-green-900';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getAppointmentStatusColor = (status) => {
  switch (status) {
    case 'Scheduled': return 'bg-green-100 text-green-800';
    case 'Confirmed': return 'bg-green-200 text-green-900';
    case 'In Progress':
    case 'Repair Scheduled':
    case 'Repair In Progress': return 'bg-orange-100 text-orange-800';
    case 'Inspection/Diag Scheduled':
    case 'Inspection In Progress': return 'bg-yellow-100 text-yellow-800';
    case 'Inspection/Diag Complete': return 'bg-yellow-200 text-yellow-900';
    case 'Repair Complete - Awaiting Payment': return 'bg-blue-200 text-blue-900';
    case 'Completed': return 'bg-blue-100 text-blue-800';
    case 'Cancelled': return 'bg-gray-400 text-gray-800';
    case 'No-Show': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const AppointmentList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Data state
  const [appointments, setAppointments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pendingWorkOrders, setPendingWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [technicianOptions, setTechnicianOptions] = useState([{ value: '', label: 'Loading...' }]);
  const [appointmentActionModal, setAppointmentActionModal] = useState(false);

  // WO scheduling section tab
  const [woStatusFilter, setWoStatusFilter] = usePersistedState('appt-list:woStatusFilter', 'All');

  // Unified table filters — all persisted
  const defaultStart = getTodayForInput();
  const defaultEnd = formatDateForInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [dateStart, setDateStart] = usePersistedState('appt-list:dateStart', defaultStart);
  const [dateEnd, setDateEnd] = usePersistedState('appt-list:dateEnd', defaultEnd);
  const [techFilter, setTechFilter] = usePersistedState('appt-list:techFilter', '');
  const [selectedChips, setSelectedChips] = usePersistedState('appt-list:statusChips', []);

  const [searchParams] = useSearchParams();
  const customerParam = searchParams.get('customer');
  const vehicleParam = searchParams.get('vehicle');

  // Fetch technician dropdown options
  useEffect(() => {
    const fetchTechOptions = async () => {
      try {
        const response = await technicianService.getAllTechnicians(true);
        const techs = response.data.data.technicians || [];
        setTechnicianOptions([
          { value: '', label: 'All Employees' },
          ...techs.map(t => ({ value: t._id, label: t.name }))
        ]);
      } catch (err) {
        console.error('Error fetching technicians:', err);
        setTechnicianOptions([{ value: '', label: 'Error loading' }]);
      }
    };
    fetchTechOptions();
  }, []);

  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Appointment filters — no status filter (filtered client-side via chips)
        const filters = {};
        if (customerParam) filters.customer = customerParam;
        if (vehicleParam) filters.vehicle = vehicleParam;
        if (techFilter) filters.technician = techFilter;
        if (dateStart) filters.startDate = dateStart;
        if (dateEnd) filters.endDate = dateEnd;

        const [apptRes, woRes, blockRes] = await Promise.all([
          AppointmentService.getAllAppointments(filters),
          WorkOrderService.getWorkOrdersNeedingScheduling(),
          ScheduleBlockService.getExpanded(
            dateStart || defaultStart,
            dateEnd || defaultEnd
          ).catch(err => {
            console.error('Error fetching tasks:', err);
            return { data: { scheduleBlocks: [] } };
          })
        ]);

        setAppointments(apptRes.data.appointments || []);
        setPendingWorkOrders(woRes.data.workOrders || []);

        // Apply role-based visibility and filter out redacted blocks
        const expanded = blockRes?.data?.scheduleBlocks || [];
        const visible = expanded
          .map(block => applyScheduleBlockVisibility(block, user))
          .filter(block => !block._isRedacted);

        // Apply technician filter client-side for tasks
        const filteredTasks = techFilter
          ? visible.filter(t => {
              const techId = t.technician?._id || t.technician;
              return techId === techFilter;
            })
          : visible;

        setTasks(filteredTasks);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again later.');
        setLoading(false);
      }
    };

    fetchData();
  }, [customerParam, vehicleParam, techFilter, dateStart, dateEnd, defaultStart, defaultEnd, user]);

  // --- Derived data ---

  // Unified items: merge appointments + tasks, apply chip filters, sort by time
  const unifiedItems = useMemo(() => {
    const apptItems = appointments.map(a => ({ ...a, _type: 'appointment' }));
    const taskItems = tasks.map(t => ({ ...t, _type: 'task' }));
    let merged = [...apptItems, ...taskItems];

    if (selectedChips.length > 0) {
      const showTasks = selectedChips.includes('Task');
      const activeStatusChips = STATUS_CHIPS.filter(c => c.key !== 'Task' && selectedChips.includes(c.key));
      const allowedStatuses = activeStatusChips.flatMap(c => c.statuses);

      merged = merged.filter(item => {
        if (item._type === 'task') return showTasks;
        // Appointments: if no appointment chips selected but Task is, hide appointments
        if (allowedStatuses.length === 0) return false;
        return allowedStatuses.includes(item.status);
      });
    }

    merged.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    return merged;
  }, [appointments, tasks, selectedChips]);

  // WO scheduling: filtered by status tab
  const filteredPendingWOs = useMemo(() => {
    if (woStatusFilter === 'All') return pendingWorkOrders;
    const category = WO_STATUS_CATEGORIES.find(c => c.key === woStatusFilter);
    if (!category) return pendingWorkOrders;
    return pendingWorkOrders.filter(wo => category.statuses.includes(wo.status));
  }, [pendingWorkOrders, woStatusFilter]);

  // WO status tab counts
  const woStatusCounts = useMemo(() => {
    const counts = {};
    WO_STATUS_CATEGORIES.forEach(cat => {
      counts[cat.key] = cat.key === 'All'
        ? pendingWorkOrders.length
        : pendingWorkOrders.filter(wo => cat.statuses.includes(wo.status)).length;
    });
    return counts;
  }, [pendingWorkOrders]);

  // Chip counts for the unified table
  const chipCounts = useMemo(() => {
    const counts = {};
    STATUS_CHIPS.forEach(chip => {
      if (chip.key === 'Task') {
        counts[chip.key] = tasks.length;
      } else {
        counts[chip.key] = appointments.filter(a => chip.statuses.includes(a.status)).length;
      }
    });
    return counts;
  }, [appointments, tasks]);

  // --- Handlers ---

  const toggleChip = (chipKey) => {
    setSelectedChips(prev => {
      if (prev.includes(chipKey)) return prev.filter(k => k !== chipKey);
      return [...prev, chipKey];
    });
  };

  const clearFilters = () => {
    setDateStart(getTodayForInput());
    setDateEnd(formatDateForInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
    setTechFilter('');
    setSelectedChips([]);
  };

  const hasActiveFilters = techFilter || selectedChips.length > 0 ||
    dateStart !== defaultStart || dateEnd !== defaultEnd;

  const handleScheduleWorkOrder = (workOrderId) => {
    navigate(`/appointments/new?workOrder=${workOrderId}`);
  };

  // --- Render ---

  return (
    <div className="container mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Calendar & Tasks</h1>
        <div className="flex gap-3">
          <Button onClick={() => setAppointmentActionModal(true)} variant="primary">
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

      {/* ============================================ */}
      {/* Section 1: Work Orders Needing Scheduling    */}
      {/* ============================================ */}
      {pendingWorkOrders.length > 0 && (
        <Card title="Work Orders Needing Scheduling" className="mb-6">
          {/* Parts Received Banner */}
          {pendingWorkOrders.some(wo => wo.status === 'Parts Received') && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 text-sm">
                <strong>Parts Received!</strong> {pendingWorkOrders.filter(wo => wo.status === 'Parts Received').length} work order(s) have parts ready — call customers to schedule.
              </p>
            </div>
          )}

          {/* Status Tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {WO_STATUS_CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setWoStatusFilter(cat.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  woStatusFilter === cat.key
                    ? cat.key === 'PartsReceived'
                      ? 'bg-green-200 text-green-900 border-2 border-green-400'
                      : 'bg-primary-100 text-primary-800 border-2 border-primary-200'
                    : cat.key === 'PartsReceived'
                      ? 'bg-green-50 text-green-700 border-2 border-transparent hover:bg-green-100'
                      : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                }`}
              >
                {cat.label} ({woStatusCounts[cat.key] || 0})
              </button>
            ))}
          </div>

          {/* WO Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer & Vehicle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPendingWOs.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                      No work orders in this category.
                    </td>
                  </tr>
                ) : (
                  filteredPendingWOs.map(wo => (
                    <tr key={wo._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{wo.customer?.name || 'Unknown Customer'}</div>
                        <div className="text-sm text-gray-500">
                          {wo.vehicle?.year} {wo.vehicle?.make} {wo.vehicle?.model}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 truncate max-w-xs">{wo.serviceRequested}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${getWoStatusColor(wo.status)}`}>
                          {wo.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex justify-end space-x-2">
                          <Button to={`/work-orders/${wo._id}`} variant="outline" size="sm">
                            View WO
                          </Button>
                          <Button onClick={() => handleScheduleWorkOrder(wo._id)} variant="primary" size="sm">
                            Schedule
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ============================================ */}
      {/* Section 2: Unified Appointments & Tasks      */}
      {/* ============================================ */}
      <Card title="Appointments & Tasks">
        {/* Filters */}
        <div className="mb-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
            </div>
            <div>
              <SelectInput
                label="Employee"
                name="technician"
                options={technicianOptions}
                value={techFilter}
                onChange={e => setTechFilter(e.target.value)}
              />
            </div>
            <div className="flex items-end pb-1">
              {hasActiveFilters && (
                <Button onClick={clearFilters} variant="outline" size="sm">
                  Clear Filters
                </Button>
              )}
            </div>
          </div>

          {/* Multi-select Status Chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedChips([])}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                selectedChips.length === 0
                  ? 'bg-primary-100 text-primary-800 border-primary-200'
                  : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {STATUS_CHIPS.map(chip => (
              <button
                key={chip.key}
                onClick={() => toggleChip(chip.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                  selectedChips.includes(chip.key)
                    ? chip.colorClass
                    : `${chip.colorClass} opacity-50 hover:opacity-80 border-transparent`
                }`}
              >
                {chip.label} ({chipCounts[chip.key] || 0})
              </button>
            ))}
          </div>
        </div>

        {/* Unified Table */}
        {loading ? (
          <div className="flex justify-center items-center h-48">
            <p>Loading...</p>
          </div>
        ) : unifiedItems.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <p>No appointments or tasks found for the selected criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer / Task</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {unifiedItems.map(item => (
                  <tr key={`${item._type}-${item._id}`} className="hover:bg-gray-50">
                    {/* Type Badge */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                        item._type === 'task'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {item._type === 'task' ? 'Task' : 'Appt'}
                      </span>
                    </td>

                    {/* Date & Time */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatDateTimeToET(item.startTime, 'MMM D, YYYY')}</div>
                      <div className="text-xs text-gray-500">
                        {formatDateTimeToET(item.startTime, 'h:mm A')} – {formatDateTimeToET(item.endTime, 'h:mm A')}
                      </div>
                    </td>

                    {/* Customer / Task Name */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      {item._type === 'appointment' ? (
                        <>
                          <div className="font-medium text-gray-900">
                            {item.customer?.name || 'Unknown Customer'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {item.vehicle?.year} {item.vehicle?.make} {item.vehicle?.model}
                          </div>
                        </>
                      ) : (
                        <div className="font-medium text-gray-900">{item.title}</div>
                      )}
                    </td>

                    {/* Details */}
                    <td className="px-4 py-4">
                      {item._type === 'appointment' ? (
                        <div className="text-sm text-gray-900 truncate max-w-xs">{item.serviceType}</div>
                      ) : isAdminOrManagement(user) && item.category ? (
                        <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-800 capitalize">
                          {item.category}
                        </span>
                      ) : (
                        <span className="text-gray-400">&mdash;</span>
                      )}
                    </td>

                    {/* Employee */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.technician?.name || 'Not Assigned'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      {item._type === 'appointment' ? (
                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${getAppointmentStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-800">
                          Task
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {item._type === 'appointment' ? (
                        <div className="flex justify-end space-x-2">
                          {item.workOrder ? (
                            <Button
                              to={`/work-orders/${typeof item.workOrder === 'object' ? item.workOrder._id : item.workOrder}`}
                              variant="outline"
                              size="sm"
                            >
                              WO
                            </Button>
                          ) : (
                            <Button
                              onClick={() => navigate(`/work-orders/new?appointment=${item._id}`)}
                              variant="outline"
                              size="sm"
                            >
                              +WO
                            </Button>
                          )}
                          <Button to={`/appointments/${item._id}`} variant="outline" size="sm">
                            View
                          </Button>
                          <Button to={`/appointments/${item._id}/edit`} variant="outline" size="sm">
                            Edit
                          </Button>
                        </div>
                      ) : (
                        isAdminOrManagement(user) ? (
                          <Button to={`/schedule-blocks/${item.scheduleBlockId}/edit`} variant="outline" size="sm">
                            Edit
                          </Button>
                        ) : null
                      )}
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
