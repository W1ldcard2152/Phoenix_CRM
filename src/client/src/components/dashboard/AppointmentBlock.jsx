import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import moment from 'moment-timezone';
import { getAppointmentColorClasses } from '../../utils/appointmentColors';
import { formatDateTimeToET } from '../../utils/formatters';

/**
 * AppointmentBlock component - Individual appointment block in the Gantt calendar
 *
 * Props:
 * - appointment: The appointment object
 * - startMinutes: Number of minutes from shop open (8am) to start
 * - durationMinutes: Duration of the appointment in minutes
 * - isPartial: Whether this is a partial block (multi-day appointment)
 */
const AppointmentBlock = ({ appointment, startMinutes, durationMinutes, isPartial = false }) => {
  const [showPopover, setShowPopover] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState('bottom');
  const blockRef = useRef(null);
  const popoverRef = useRef(null);

  const PIXELS_PER_MINUTE = 80 / 60; // 80 pixels per hour = 1.333 pixels per minute
  const MIN_DISPLAY_HEIGHT = 40; // 30 minutes worth of pixels (40px)

  // Calculate block positioning and sizing
  const topPosition = startMinutes * PIXELS_PER_MINUTE;
  const calculatedHeight = durationMinutes * PIXELS_PER_MINUTE;
  const displayHeight = Math.max(calculatedHeight, MIN_DISPLAY_HEIGHT);

  // Get color classes based on appointment status
  const colorClasses = getAppointmentColorClasses(appointment.status);

  // Format time for display
  const formatTime = (dateTime) => {
    return moment.utc(dateTime).tz('America/New_York').format('h:mm A');
  };

  // Format vehicle info
  const vehicleInfo = appointment.vehicle
    ? `${appointment.vehicle.year || ''} ${appointment.vehicle.make || ''} ${appointment.vehicle.model || ''}`.trim()
    : 'No vehicle specified';

  // Check if popover would go off-screen and adjust position
  useEffect(() => {
    if (showPopover && blockRef.current && popoverRef.current) {
      const blockRect = blockRef.current.getBoundingClientRect();
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // If popover goes below viewport, show it above the block
      if (blockRect.bottom + popoverRect.height > viewportHeight) {
        setPopoverPosition('top');
      } else {
        setPopoverPosition('bottom');
      }
    }
  }, [showPopover]);

  return (
    <div
      ref={blockRef}
      className="absolute left-0 right-0 px-1 cursor-pointer"
      style={{
        top: `${topPosition}px`,
        height: `${displayHeight}px`,
        zIndex: showPopover ? 50 : 10
      }}
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      {/* Appointment Block */}
      <div
        className={`h-full rounded border-l-4 ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text} ${colorClasses.hover} px-2 py-1 transition-colors overflow-hidden`}
      >
        <div className="text-xs font-bold leading-tight">
          {formatTime(appointment.startTime)}
        </div>
        <div className="text-xs leading-tight truncate" title={vehicleInfo}>
          {vehicleInfo}
        </div>
        <div className="text-xs leading-tight truncate" title={appointment.serviceType}>
          {appointment.serviceType}
        </div>
        {isPartial && (
          <div className="text-xs italic mt-1">
            (Continued)
          </div>
        )}
      </div>

      {/* Popover on Hover */}
      {showPopover && (
        <div
          ref={popoverRef}
          className={`absolute left-0 w-72 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 ${
            popoverPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          style={{ zIndex: 100 }}
        >
          {/* Customer Info */}
          <div className="mb-3">
            <div className="text-sm font-bold text-gray-700 mb-1">Customer</div>
            <div className="text-base font-semibold">
              {appointment.customer?.firstName} {appointment.customer?.lastName}
            </div>
            {appointment.customer?.phone && (
              <div className="text-sm text-gray-600">{appointment.customer.phone}</div>
            )}
          </div>

          {/* Vehicle Info */}
          <div className="mb-3">
            <div className="text-sm font-bold text-gray-700 mb-1">Vehicle</div>
            <div className="text-base">{vehicleInfo}</div>
            {appointment.vehicle?.vin && (
              <div className="text-xs text-gray-500">VIN: {appointment.vehicle.vin}</div>
            )}
          </div>

          {/* Service Info */}
          <div className="mb-3">
            <div className="text-sm font-bold text-gray-700 mb-1">Service</div>
            <div className="text-base">{appointment.serviceType}</div>
          </div>

          {/* Time Info */}
          <div className="mb-3">
            <div className="text-sm font-bold text-gray-700 mb-1">Time</div>
            <div className="text-base">
              {formatDateTimeToET(appointment.startTime, 'MMM D, YYYY')}
            </div>
            <div className="text-sm">
              {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
            </div>
          </div>

          {/* Technician Info */}
          <div className="mb-3">
            <div className="text-sm font-bold text-gray-700 mb-1">Technician</div>
            <div className="text-base">
              {appointment.technician?.firstName} {appointment.technician?.lastName}
            </div>
          </div>

          {/* Status */}
          <div className="mb-3">
            <div className="text-sm font-bold text-gray-700 mb-1">Status</div>
            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${colorClasses.bg} ${colorClasses.text}`}>
              {appointment.status}
            </span>
          </div>

          {/* Notes */}
          {appointment.notes && (
            <div className="mb-3">
              <div className="text-sm font-bold text-gray-700 mb-1">Notes</div>
              <div className="text-sm text-gray-600">{appointment.notes}</div>
            </div>
          )}

          {/* Action Links */}
          <div className="flex gap-2 pt-3 border-t border-gray-200">
            <Link
              to={`/appointments/${appointment._id}`}
              className="flex-1 text-center bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              View Appointment
            </Link>
            {appointment.workOrder && (
              <Link
                to={`/workorders/${appointment.workOrder}`}
                className="flex-1 text-center bg-green-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-green-700 transition-colors"
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

export default AppointmentBlock;
