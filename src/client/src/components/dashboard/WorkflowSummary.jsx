import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppointmentService from '../../services/appointmentService';
import QuoteService from '../../services/quoteService';
import WorkOrderService from '../../services/workOrderService';

const WorkflowSummary = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [openQuotes, setOpenQuotes] = useState([]);
  const [waitingOnParts, setWaitingOnParts] = useState([]);
  const [awaitingPickup, setAwaitingPickup] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [appointmentsRes, quotesRes, partsRes, pickupRes] = await Promise.all([
          AppointmentService.getTodayAppointments().catch(() => ({ data: { appointments: [] } })),
          QuoteService.getAllQuotes().catch(() => ({ data: { quotes: [] } })),
          WorkOrderService.getActiveWorkOrdersByStatuses(['Parts Ordered']).catch(() => ({ data: { workOrders: [] } })),
          WorkOrderService.getActiveWorkOrdersByStatuses(['Repair Complete - Awaiting Payment']).catch(() => ({ data: { workOrders: [] } }))
        ]);

        setTodayAppointments(appointmentsRes.data.appointments || []);
        setOpenQuotes(quotesRes.data.quotes || []);
        setWaitingOnParts(partsRes.data.workOrders || []);
        setAwaitingPickup(pickupRes.data.workOrders || []);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching workflow data:', err);
        setError('Failed to load workflow data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Helpers
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const getDaysAgo = (dateString) => {
    if (!dateString) return 0;
    return Math.floor((new Date() - new Date(dateString)) / (1000 * 60 * 60 * 24));
  };

  // Quote age badges (from QuoteList pattern)
  const getQuoteAgeBadge = (date) => {
    const days = getDaysAgo(date);
    if (days <= 7) {
      const label = days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
      return { label, className: 'bg-green-100 text-green-800' };
    }
    if (days <= 14) return { label: 'Follow up', className: 'bg-blue-100 text-blue-800' };
    if (days <= 30) return { label: 'Follow up', className: 'bg-yellow-100 text-yellow-800' };
    if (days <= 60) return { label: 'Needs attention', className: 'bg-orange-100 text-orange-800' };
    return { label: 'Archive?', className: 'bg-red-100 text-red-800' };
  };

  // Parts age badges (user spec: ≤3d green, 4-7d yellow, 8+ red)
  const getPartsAgeBadge = (wo) => {
    const dateToUse = wo.statusChangedAt || wo.updatedAt;
    const days = getDaysAgo(dateToUse);
    const label = days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
    if (days <= 3) return { label, className: 'bg-green-100 text-green-800' };
    if (days <= 7) return { label, className: 'bg-yellow-100 text-yellow-800' };
    return { label, className: 'bg-red-100 text-red-800' };
  };

  // Column config
  const columns = [
    {
      key: 'schedule',
      title: "Today's Schedule",
      icon: 'fas fa-calendar-day',
      color: 'blue',
      count: todayAppointments.length,
      viewAllLink: '/appointments',
      viewAllLabel: 'View all appointments',
      emptyMessage: 'No appointments today',
      items: todayAppointments.slice(0, 5),
      renderItem: (appt) => (
        <li
          key={appt._id}
          className="py-2 px-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
          onClick={() => navigate(`/appointments/${appt._id}`)}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">{formatTime(appt.startTime)}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
              {appt.technician?.name || 'Unassigned'}
            </span>
          </div>
          <div className="text-sm text-gray-700 mt-0.5 truncate">{appt.customer?.name || 'Unknown'}</div>
          <div className="text-xs text-gray-500 truncate">
            {appt.vehicle?.year} {appt.vehicle?.make} {appt.vehicle?.model}
          </div>
        </li>
      )
    },
    {
      key: 'quotes',
      title: 'Open Quotes',
      icon: 'fas fa-file-alt',
      color: 'purple',
      count: openQuotes.length,
      viewAllLink: '/quotes',
      viewAllLabel: 'View all quotes',
      emptyMessage: 'No open quotes',
      items: openQuotes.slice(0, 5),
      renderItem: (quote) => {
        const ageBadge = getQuoteAgeBadge(quote.date);
        return (
          <li
            key={quote._id}
            className="py-2 px-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={() => navigate(`/quotes/${quote._id}`)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-800 truncate">{quote.customer?.name || 'Unknown'}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${ageBadge.className}`}>{ageBadge.label}</span>
            </div>
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {quote.vehicle?.year} {quote.vehicle?.make} {quote.vehicle?.model}
            </div>
            <div className="text-xs text-gray-600 mt-0.5">{formatCurrency(quote.totalEstimate)}</div>
          </li>
        );
      }
    },
    {
      key: 'parts',
      title: 'Waiting on Parts',
      icon: 'fas fa-box',
      color: 'amber',
      count: waitingOnParts.length,
      viewAllLink: '/work-orders',
      viewAllLabel: 'View work orders',
      emptyMessage: 'No parts on order',
      items: waitingOnParts.slice(0, 5),
      renderItem: (wo) => {
        const ageBadge = getPartsAgeBadge(wo);
        return (
          <li
            key={wo._id}
            className="py-2 px-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={() => navigate(`/work-orders/${wo._id}`)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-800 truncate">{wo.customer?.name || 'Unknown'}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${ageBadge.className}`}>{ageBadge.label}</span>
            </div>
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {wo.vehicle?.year} {wo.vehicle?.make} {wo.vehicle?.model}
            </div>
          </li>
        );
      }
    },
    {
      key: 'pickup',
      title: 'Awaiting Pickup',
      icon: 'fas fa-car',
      color: 'green',
      count: awaitingPickup.length,
      viewAllLink: '/work-orders',
      viewAllLabel: 'View work orders',
      emptyMessage: 'No vehicles awaiting pickup',
      items: awaitingPickup.slice(0, 5),
      renderItem: (wo) => (
        <li
          key={wo._id}
          className="py-2 px-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
          onClick={() => navigate(`/work-orders/${wo._id}`)}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800 truncate">{wo.customer?.name || 'Unknown'}</span>
            <span className="text-xs text-gray-600">{formatCurrency(wo.totalEstimate)}</span>
          </div>
          <div className="text-xs text-gray-500 truncate mt-0.5">
            {wo.vehicle?.year} {wo.vehicle?.make} {wo.vehicle?.model}
          </div>
          {wo.customer?.phone && (
            <div className="text-xs text-blue-600 mt-0.5">{wo.customer.phone}</div>
          )}
        </li>
      )
    }
  ];

  const colorMap = {
    blue: { bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    purple: { bg: 'bg-purple-500', light: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    amber: { bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    green: { bg: 'bg-green-500', light: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' }
  };

  if (loading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Shop Overview</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-lg shadow-md p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-3"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header with Quick Entry */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Shop Overview</h2>
        <Link
          to="/intake"
          className="inline-flex items-center px-5 py-2.5 rounded-lg font-semibold text-white text-sm shadow-lg hover:shadow-xl transition-all duration-200"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}
        >
          <i className="fas fa-plus-circle mr-2"></i>
          Quick Entry
        </Link>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* 4-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((col) => {
          const colors = colorMap[col.color];
          return (
            <div key={col.key} className={`bg-white rounded-lg shadow-md border ${colors.border} overflow-hidden flex flex-col`}>
              {/* Column Header */}
              <div className={`px-4 py-3 ${colors.light} border-b ${colors.border}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <i className={`${col.icon} ${colors.text} text-sm`}></i>
                    <h3 className={`text-sm font-semibold ${colors.text}`}>{col.title}</h3>
                  </div>
                  <span className={`${colors.bg} text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center`}>
                    {col.count}
                  </span>
                </div>
              </div>

              {/* Column Body */}
              <div className="flex-1 p-2">
                {col.items.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    {col.emptyMessage}
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {col.items.map(col.renderItem)}
                  </ul>
                )}
              </div>

              {/* Column Footer */}
              {col.count > 0 && (
                <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                  <Link
                    to={col.viewAllLink}
                    className={`text-xs font-medium ${colors.text} hover:underline`}
                  >
                    {col.viewAllLabel} ({col.count}) &rarr;
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkflowSummary;
