import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import moment from 'moment-timezone';
import { getAppointmentColorClasses } from '../../utils/appointmentColors';
import { formatDateTimeToET } from '../../utils/formatters';

/**
 * AppointmentCard component - Smart card for swimming lane calendar
 * Shows only complete lines that fit, truncates intelligently
 *
 * Props:
 * - appointment: The appointment object
 * - style: Positioning styles (passed from parent)
 * - viewType: 'daily' or 'weekly' (affects layout)
 */
const AppointmentCard = ({ appointment, style = {}, viewType = 'daily' }) => {
  const [showPopover, setShowPopover] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState('bottom');
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0 });
  const cardRef = useRef(null);
  const popoverRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const isOverPopoverRef = useRef(false);

  // Get color classes based on work order status if available, otherwise appointment status
  // This ensures all appointments for the same work order show the same color
  // Handle both populated workOrder (object) and unpopulated (string ID)
  const workOrderStatus = typeof appointment.workOrder === 'object' ? appointment.workOrder?.status : null;
  const statusToUse = workOrderStatus || appointment.status;
  const colorClasses = getAppointmentColorClasses(statusToUse);

  // Show popover immediately
  const handleCardEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setShowPopover(true);
  };

  // Delay hiding to allow moving to popover
  const handleCardLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      if (!isOverPopoverRef.current) {
        setShowPopover(false);
      }
    }, 100);
  };

  // Keep popover open when hovering it
  const handlePopoverEnter = () => {
    isOverPopoverRef.current = true;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  // Hide when leaving popover
  const handlePopoverLeave = () => {
    isOverPopoverRef.current = false;
    setShowPopover(false);
  };

  // Format time for display
  const formatTime = (dateTime) => {
    return moment.utc(dateTime).tz('America/New_York').format('h:mm A');
  };

  // Calculate duration in minutes, excluding closed hours (6pm-8am) for multi-day appointments
  const getDurationMinutes = () => {
    const startET = moment.utc(appointment.startTime).tz('America/New_York');
    const endET = moment.utc(appointment.endTime).tz('America/New_York');

    // Business hours: 8 AM to 6 PM (18:00)
    const BUSINESS_START_HOUR = 8;
    const BUSINESS_END_HOUR = 18;

    // If appointment is within the same day, calculate normally
    if (startET.isSame(endET, 'day')) {
      return endET.diff(startET, 'minutes');
    }

    // Multi-day appointment: exclude closed hours (6pm-8am)
    let totalMinutes = 0;

    // Iterate through each day
    let currentDay = startET.clone().startOf('day');
    const lastDay = endET.clone().startOf('day');

    while (currentDay.isSameOrBefore(lastDay, 'day')) {
      // Determine the start time for this day
      let dayStart;
      if (currentDay.isSame(startET, 'day')) {
        // First day: use actual start time
        dayStart = startET.clone();
      } else {
        // Subsequent days: start at business hours
        dayStart = currentDay.clone().hour(BUSINESS_START_HOUR).minute(0).second(0);
      }

      // Determine the end time for this day
      let dayEnd;
      if (currentDay.isSame(endET, 'day')) {
        // Last day: use actual end time
        dayEnd = endET.clone();
      } else {
        // Not last day: end at close of business
        dayEnd = currentDay.clone().hour(BUSINESS_END_HOUR).minute(0).second(0);
      }

      // Calculate business hours for this day
      const businessStart = currentDay.clone().hour(BUSINESS_START_HOUR).minute(0).second(0);
      const businessEnd = currentDay.clone().hour(BUSINESS_END_HOUR).minute(0).second(0);

      // Clamp the day's start and end to business hours
      const effectiveStart = moment.max(dayStart, businessStart);
      const effectiveEnd = moment.min(dayEnd, businessEnd);

      // Add minutes if there's any overlap with business hours
      if (effectiveStart.isBefore(effectiveEnd)) {
        totalMinutes += effectiveEnd.diff(effectiveStart, 'minutes');
      }

      // Move to next day
      currentDay.add(1, 'day');
    }

    return totalMinutes;
  };

  // Calculate duration formatted
  const getDuration = () => {
    const durationMinutes = getDurationMinutes();

    if (durationMinutes < 60) {
      return `${durationMinutes}m`;
    } else {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  };

  // Format vehicle info with appointment type
  const vehicleInfo = appointment.vehicle
    ? `${appointment.vehicle.year || ''} ${appointment.vehicle.make || ''} ${appointment.vehicle.model || ''}`.trim()
    : 'No vehicle';

  // Add service type in parentheses if available
  // Ensure serviceType is a string to avoid rendering issues
  const serviceType = appointment.serviceType ? String(appointment.serviceType) : '';
  const displayTitle = serviceType
    ? `${vehicleInfo} (${serviceType})`
    : vehicleInfo;

  // Check if popover should open upward or downward based on screen position
  // Also calculate absolute viewport coordinates for fixed positioning
  useEffect(() => {
    if (showPopover && cardRef.current) {
      const cardRect = cardRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const cardMiddle = cardRect.top + (cardRect.height / 2);

      // Open upward if in bottom half of screen, downward if in top half
      if (cardMiddle > viewportHeight / 2) {
        setPopoverPosition('top');
        // Position popover above the card
        setPopoverCoords({
          top: cardRect.top - 8, // 8px margin
          left: cardRect.left
        });
      } else {
        setPopoverPosition('bottom');
        // Position popover below the card
        setPopoverCoords({
          top: cardRect.bottom + 8, // 8px margin
          left: cardRect.left
        });
      }
    }
  }, [showPopover, appointment._id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [appointment._id]);

  return (
    <div
      ref={cardRef}
      className="relative cursor-pointer"
      style={{...style, zIndex: showPopover ? 100000 : style.zIndex || 10}}
      onMouseEnter={handleCardEnter}
      onMouseLeave={handleCardLeave}
    >
      {/* Appointment Card */}
      <div
        className={`h-full rounded border-l-4 ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text} ${colorClasses.hover} px-2 py-1.5 transition-colors shadow-sm overflow-hidden`}
      >
        {/* Vehicle Info with Service Type - Always show first, bold */}
        {viewType === 'daily' ? (
          <div className="text-xs font-bold leading-tight mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis" title={displayTitle}>
            {displayTitle}
          </div>
        ) : (
          <div className="text-xs font-bold leading-tight mb-0.5 truncate" title={displayTitle}>
            {displayTitle}
          </div>
        )}

        {/* Time and Duration - Hide for 30min appointments */}
        {getDurationMinutes() > 30 && (
          <div className="text-xs leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {formatTime(appointment.startTime)} ({getDuration()})
          </div>
        )}

        {/* Service Type - Show if space allows (weekly view only, for larger appointments) */}
        {viewType === 'weekly' && getDurationMinutes() > 60 && (
          <div className="text-xs leading-tight truncate mt-0.5" title={appointment.serviceType}>
            {appointment.serviceType}
          </div>
        )}
      </div>

      {/* Popover on Hover - Rendered as Portal to escape container clipping */}
      {showPopover && ReactDOM.createPortal(
        <div
          ref={popoverRef}
          className="fixed w-80 bg-white border-2 border-gray-400 rounded-lg shadow-2xl p-4"
          style={{
            top: popoverPosition === 'top'
              ? `${popoverCoords.top}px`
              : `${popoverCoords.top}px`,
            left: `${popoverCoords.left}px`,
            transform: popoverPosition === 'top' ? 'translateY(-100%)' : 'none',
            zIndex: 2147483647,
            pointerEvents: 'auto'
          }}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handlePopoverLeave}
          onWheel={(e) => {
            // Pass scroll events through to the page
            const scrollableParent = document.scrollingElement || document.documentElement;
            scrollableParent.scrollTop += e.deltaY;
            e.preventDefault();
          }}
        >
          {/* Customer Info */}
          <div className="mb-3">
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Customer</div>
            <div className="text-base font-semibold text-gray-900">
              {appointment.customer?.firstName} {appointment.customer?.lastName}
            </div>
            {appointment.customer?.phone && (
              <div className="text-sm text-gray-600">{appointment.customer.phone}</div>
            )}
          </div>

          {/* Vehicle Info */}
          <div className="mb-3">
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Vehicle</div>
            <div className="text-base text-gray-900">{vehicleInfo}</div>
            {appointment.vehicle?.vin && (
              <div className="text-xs text-gray-500">VIN: {appointment.vehicle.vin}</div>
            )}
          </div>

          {/* Service Info */}
          <div className="mb-3">
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Service</div>
            <div className="text-base text-gray-900">{serviceType || 'Not specified'}</div>
          </div>

          {/* Time Info */}
          <div className="mb-3">
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Time</div>
            <div className="text-base text-gray-900">
              {formatDateTimeToET(appointment.startTime, 'MMM D, YYYY')}
            </div>
            <div className="text-sm text-gray-700">
              {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
            </div>
          </div>

          {/* Technician Info */}
          <div className="mb-3">
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Technician</div>
            <div className="text-base text-gray-900">
              {appointment.technician?.name || 'Unassigned'}
            </div>
          </div>

          {/* Status */}
          <div className="mb-3">
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Status</div>
            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${colorClasses.bg} ${colorClasses.text} border ${colorClasses.border}`}>
              {statusToUse}
            </span>
          </div>

          {/* Notes */}
          {appointment.notes && (
            <div className="mb-3">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Notes</div>
              <div className="text-sm text-gray-700">{appointment.notes}</div>
            </div>
          )}

          {/* Action Links */}
          <div className="flex gap-2 pt-3 mt-3 border-t border-gray-200">
            <Link
              to={`/appointments/${appointment._id}`}
              className="flex-1 text-center bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              View Appointment
            </Link>
            {appointment.workOrder && (
              <Link
                to={`/work-orders/${typeof appointment.workOrder === 'string' ? appointment.workOrder : (appointment.workOrder._id || appointment.workOrder)}`}
                className="flex-1 text-center bg-green-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-green-700 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                View Work Order
              </Link>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AppointmentCard;
