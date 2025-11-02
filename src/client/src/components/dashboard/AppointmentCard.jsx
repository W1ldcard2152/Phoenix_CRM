import React, { useState, useRef, useEffect } from 'react';
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

  // Calculate duration in minutes
  const getDurationMinutes = () => {
    const start = moment.utc(appointment.startTime).tz('America/New_York');
    const end = moment.utc(appointment.endTime).tz('America/New_York');
    return end.diff(start, 'minutes');
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

  // Check if popover would go off-screen and adjust position
  useEffect(() => {
    if (showPopover) {
      if (cardRef.current && popoverRef.current) {
        const cardRect = cardRef.current.getBoundingClientRect();
        const popoverRect = popoverRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Check vertical position
        if (cardRect.bottom + popoverRect.height > viewportHeight) {
          setPopoverPosition('top');
        } else {
          setPopoverPosition('bottom');
        }
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

      {/* Popover on Hover */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute w-80 bg-white border-2 border-gray-400 rounded-lg shadow-2xl p-4"
          style={{
            left: '0',
            top: '100%',
            marginTop: '8px',
            zIndex: 99999
          }}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handlePopoverLeave}
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
          <div className="flex gap-2 pt-3 border-t border-gray-200">
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
        </div>
      )}
    </div>
  );
};

export default AppointmentCard;
