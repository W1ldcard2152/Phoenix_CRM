import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import WorkOrderService from '../../services/workOrderService';
import { formatDate, formatTime } from '../../utils/formatters';
import usePersistedState from '../../hooks/usePersistedState';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

const getStatusColor = (status) => {
  switch (status) {
    case 'Appointment Scheduled':
      return 'bg-green-100 text-green-800';
    case 'Appointment Complete':
      return 'bg-blue-100 text-blue-800';
    case 'Inspection In Progress':
      return 'bg-yellow-100 text-yellow-800';
    case 'Inspection/Diag Complete':
      return 'bg-blue-100 text-blue-800';
    case 'Repair In Progress':
      return 'bg-orange-100 text-orange-800';
    case 'Repair Complete - Awaiting Payment':
      return 'bg-blue-200 text-blue-900';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getStatusShortName = (status) => {
  switch (status) {
    case 'Appointment Scheduled': return 'Scheduled';
    case 'Appointment Complete': return 'Appt Done';
    case 'Inspection In Progress': return 'Inspecting';
    case 'Inspection/Diag Complete': return 'Diag Done';
    case 'Repair In Progress': return 'Repairing';
    case 'Repair Complete - Awaiting Payment': return 'Complete';
    default: return status;
  }
};

const getServiceDisplayText = (workOrder) => {
  if (workOrder.services && workOrder.services.length > 0) {
    const extra = workOrder.services.length > 1 ? ` (+${workOrder.services.length - 1})` : '';
    return workOrder.services[0].description + extra;
  }
  return workOrder.serviceRequested || 'No service specified';
};

const statusCategories = [
  { key: 'All', label: 'All' },
  { key: 'Inspection', label: 'Inspect', statuses: ['Appointment Scheduled', 'Appointment Complete', 'Inspection In Progress', 'Inspection/Diag Complete'] },
  { key: 'Repair', label: 'Repair', statuses: ['Repair In Progress', 'Repair Complete - Awaiting Payment'] }
];

const TechnicianDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [workQueueFilter, setWorkQueueFilter] = usePersistedState('tech-dash:filter', 'All');

  const techFirstName = user?.technician?.name?.split(' ')[0]
    || user?.name?.split(' ')[0]
    || 'Tech';

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const response = await WorkOrderService.getTechnicianDashboard();
        setDashboardData(response);
      } catch (err) {
        console.error('Error fetching technician dashboard:', err);
        setError('Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const { workOrders = [], todaysSchedule = [], stats = {}, activeJob = null } = dashboardData?.data || {};

  const activeWorkOrder = activeJob ? workOrders.find(wo => wo._id === activeJob) : null;

  const filteredWorkOrders = useMemo(() => {
    const statusOrder = {
      'Repair In Progress': 1,
      'Inspection In Progress': 2,
      'Appointment Complete': 3,
      'Appointment Scheduled': 4,
      'Inspection/Diag Complete': 5,
      'Repair Complete - Awaiting Payment': 6
    };

    let filtered = workOrders.filter(wo => wo._id !== activeJob);
    if (workQueueFilter !== 'All') {
      const category = statusCategories.find(c => c.key === workQueueFilter);
      if (category) {
        filtered = filtered.filter(wo => category.statuses.includes(wo.status));
      }
    }
    filtered.sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));
    return filtered;
  }, [workOrders, workQueueFilter, activeJob]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-6">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              Good {getGreeting()}, {techFirstName}
            </h1>
            <p className="text-sm text-gray-500">
              {formatDate(new Date(), 'dddd, MMMM D')}
            </p>
          </div>
          <button
            onClick={() => navigate('/technician-portal')}
            className="text-sm text-primary-600 font-medium px-3 py-2 rounded-lg active:bg-primary-50"
          >
            All Jobs
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Active Job Card */}
        {activeWorkOrder && (
          <div
            className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-4 text-white shadow-lg cursor-pointer active:opacity-90 transition-opacity"
            onClick={() => navigate(`/technician-portal/checklist/${activeWorkOrder._id}`)}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              <span className="text-sm font-medium opacity-90">
                {getStatusShortName(activeWorkOrder.status)} &mdash; Active
              </span>
              {(activeWorkOrder.priority === 'High' || activeWorkOrder.priority === 'Urgent') && (
                <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  {activeWorkOrder.priority}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold">
              {activeWorkOrder.vehicle
                ? `${activeWorkOrder.vehicle.year} ${activeWorkOrder.vehicle.make} ${activeWorkOrder.vehicle.model}`
                : 'No Vehicle'}
            </h2>
            <p className="text-sm opacity-90 mb-3">
              {activeWorkOrder.customer?.name} &mdash; {getServiceDisplayText(activeWorkOrder)}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/technician-portal/checklist/${activeWorkOrder._id}`);
              }}
              className="w-full py-3 bg-white text-orange-600 rounded-lg font-semibold active:bg-orange-50 transition-colors"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Continue Work
              </span>
            </button>
          </div>
        )}

        {/* Today's Schedule */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Today's Schedule
              <span className="text-sm font-normal text-gray-400">
                ({todaysSchedule.length})
              </span>
            </h2>
          </div>

          {todaysSchedule.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400">
              <svg className="mx-auto h-10 w-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">No appointments scheduled for today</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todaysSchedule.map((item) => (
                <div
                  key={item.appointmentId}
                  className="px-4 py-3 flex items-center gap-3 active:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/technician-portal/checklist/${item.workOrderId}`)}
                >
                  {/* Time column */}
                  <div className="text-right min-w-[56px]">
                    <div className="text-sm font-semibold text-gray-800">
                      {formatTime(item.startTime)}
                    </div>
                    {item.endTime && (
                      <div className="text-xs text-gray-400">
                        {formatTime(item.endTime)}
                      </div>
                    )}
                  </div>
                  {/* Vertical line indicator */}
                  <div className={`w-1 self-stretch rounded-full min-h-[40px] ${
                    item.workOrderStatus.includes('In Progress')
                      ? 'bg-orange-400'
                      : item.workOrderStatus.includes('Complete')
                        ? 'bg-blue-400'
                        : 'bg-primary-400'
                  }`} />
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {item.vehicle
                        ? `${item.vehicle.year} ${item.vehicle.make} ${item.vehicle.model}`
                        : 'No Vehicle'}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {item.customer?.name}{item.serviceType ? ` \u2014 ${item.serviceType}` : ''}
                    </div>
                  </div>
                  {/* Priority + Chevron */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(item.priority === 'High' || item.priority === 'Urgent') && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white rounded-lg p-2 text-center shadow-sm">
            <div className="text-xl font-bold text-primary-600">{stats.total || 0}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div className="bg-white rounded-lg p-2 text-center shadow-sm">
            <div className="text-xl font-bold text-blue-600">{stats.todayCount || 0}</div>
            <div className="text-xs text-gray-500">Today</div>
          </div>
          <div className="bg-white rounded-lg p-2 text-center shadow-sm">
            <div className="text-xl font-bold text-yellow-600">{stats.inspecting || 0}</div>
            <div className="text-xs text-gray-500">Inspect</div>
          </div>
          <div className="bg-white rounded-lg p-2 text-center shadow-sm">
            <div className="text-xl font-bold text-orange-600">{stats.repairing || 0}</div>
            <div className="text-xs text-gray-500">Repair</div>
          </div>
        </div>

        {/* Work Queue */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">Work Queue</h2>
            <div className="flex gap-1">
              {statusCategories.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setWorkQueueFilter(cat.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    workQueueFilter === cat.key
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-600 shadow-sm active:bg-gray-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {filteredWorkOrders.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
              <svg className="mx-auto h-10 w-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">No work orders in queue</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredWorkOrders.map(wo => (
                <div
                  key={wo._id}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden active:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/technician-portal/checklist/${wo._id}`)}
                >
                  <div className="px-4 py-3 flex items-center gap-3">
                    {/* Status badge */}
                    <div className="flex-shrink-0">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(wo.status)}`}>
                        {getStatusShortName(wo.status)}
                      </span>
                    </div>
                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {wo.vehicle
                          ? `${wo.vehicle.year} ${wo.vehicle.make} ${wo.vehicle.model}`
                          : 'No Vehicle'}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {getServiceDisplayText(wo)}
                      </div>
                    </div>
                    {/* Priority + Chevron */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(wo.priority === 'High' || wo.priority === 'Urgent') && (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                      <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TechnicianDashboard;
