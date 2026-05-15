import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import moment from 'moment-timezone';
import { getAppointmentColorClasses } from '../../utils/appointmentColors';
import { formatDateTimeToET, TIMEZONE } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { applyScheduleBlockVisibility } from '../../utils/permissions';
import useDragToReschedule from '../../hooks/useDragToReschedule';

/**
 * AppointmentCard component - Smart card for swimming lane calendar
 * Shows only complete lines that fit, truncates intelligently
 * Supports drag-to-reschedule when dragConfig and onReschedule are provided
 *
 * Props:
 * - appointment: The appointment object
 * - style: Positioning styles (passed from parent)
 * - viewType: 'daily' or 'weekly' (affects layout)
 * - dragConfig: { axis, pixelsPerMinute, snapMinutes, maxMinutes, durationMinutes, originalPositionPx }
 * - onReschedule: (appointmentId, deltaMinutes) => void
 */
const AppointmentCard = ({ appointment, style = {}, viewType = 'daily', dragConfig = null, onReschedule = null }) => {
  const [showPopover, setShowPopover] = useState(false);
  const [showApptActions, setShowApptActions] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0 });
  const cardRef = useRef(null);
  const popoverRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const isOverPopoverRef = useRef(false);
  const { user } = useAuth();
  const location = useLocation();
  const fromQuery = location.pathname !== '/appointments' ? `from=${encodeURIComponent(location.pathname)}` : '';

  // Apply role-based visibility for schedule blocks
  const displayAppointment = appointment.isScheduleBlock
    ? applyScheduleBlockVisibility(appointment, user)
    : appointment;

  // Get color classes based on work order status if available, otherwise appointment status
  // This ensures all appointments for the same work order show the same color
  // Handle both populated workOrder (object) and unpopulated (string ID)
  const workOrderStatus = typeof appointment.workOrder === 'object' ? appointment.workOrder?.status : null;
  const statusToUse = workOrderStatus || displayAppointment.status;
  const colorClasses = getAppointmentColorClasses(statusToUse);

  // Show popover immediately (suppressed during drag)
  const handleCardEnter = () => {
    if (isDragging) return;
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
    return moment.utc(dateTime).tz(TIMEZONE).format('h:mm A');
  };

  // Calculate duration in minutes, excluding closed hours (6pm-8am) for multi-day appointments
  const getDurationMinutes = () => {
    const startET = moment.utc(appointment.startTime).tz(TIMEZONE);
    const endET = moment.utc(appointment.endTime).tz(TIMEZONE);

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

  // Determine if this is a schedule block (recurring task) vs an appointment
  const isScheduleBlock = appointment.isScheduleBlock;

  // Drag-to-reschedule logic — all appointments and non-redacted schedule blocks are draggable
  const canDrag = !!dragConfig
    && !!onReschedule
    && !(isScheduleBlock && displayAppointment._isRedacted);

  const { primaryOffset, secondaryOffset, isDragging, handleMouseDown } = useDragToReschedule({
    enabled: canDrag,
    primaryAxis: dragConfig?.axis || 'x',
    pixelsPerMinute: dragConfig?.pixelsPerMinute || 2,
    snapMinutes: dragConfig?.snapMinutes || 15,
    maxMinutes: dragConfig?.maxMinutes || 600,
    durationMinutes: dragConfig?.durationMinutes || 60,
    originalPositionPx: dragConfig?.originalPositionPx || 0,
    secondarySnapPx: dragConfig?.secondarySnapPx || 0,
    onDragEnd: ({ deltaMinutes, secondarySnaps }) => {
      if ((deltaMinutes !== 0 || secondarySnaps !== 0) && onReschedule) {
        onReschedule(appointment._id, deltaMinutes, secondarySnaps || 0);
      }
    }
  });

  // Apply drag offsets to positioning
  const dragStyle = { ...style };
  if (isDragging) {
    if (viewType === 'daily') {
      if (primaryOffset !== 0) {
        const currentLeft = parseFloat(style.left) || 0;
        dragStyle.left = `${currentLeft + primaryOffset}px`;
      }
    } else {
      // Weekly: primary = vertical (time), secondary = horizontal (days)
      if (primaryOffset !== 0) {
        const currentTop = parseFloat(style.top) || 0;
        dragStyle.top = `${currentTop + primaryOffset}px`;
      }
      if (secondaryOffset !== 0) {
        dragStyle.transform = `translateX(${secondaryOffset}px)`;
      }
    }
    dragStyle.zIndex = 10000;
    dragStyle.opacity = 0.85;
  }

  // Format vehicle info with appointment type
  const vehicleInfo = appointment.vehicle
    ? `${appointment.vehicle.year || ''} ${appointment.vehicle.make || ''} ${appointment.vehicle.model || ''}`.trim()
    : 'No vehicle';

  // Build display title: "ServiceType: Details" if details exist, else "Vehicle (ServiceType)"
  const serviceType = appointment.serviceType ? String(appointment.serviceType) : '';
  const details = appointment.details ? String(appointment.details) : '';
  const displayTitle = isScheduleBlock
    ? displayAppointment.title
    : details
      ? `${serviceType}: ${details}`
      : serviceType
        ? `${vehicleInfo} (${serviceType})`
        : vehicleInfo;

  // Position popover beside the card so vertical neighbors stay clickable
  // and there's no dead zone between card and popover.
  useEffect(() => {
    if (!showPopover || !cardRef.current) return;

    const positionPopover = () => {
      const cardRect = cardRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const cardCenterX = cardRect.left + (cardRect.width / 2);
      const popoverWidth = 320; // w-80 = 20rem = 320px
      const edgeBuffer = 8; // keep this much room from viewport edges
      // Respect the sticky page header so the popover can't tuck under it.
      const headerEl = document.querySelector('header');
      const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
      const topBound = Math.max(edgeBuffer, headerBottom + edgeBuffer);

      // Prefer the side opposite the card's half of the viewport;
      // flip if the preferred side doesn't have room and the other side does.
      const roomRight = viewportWidth - cardRect.right;
      const roomLeft = cardRect.left;
      const preferRight = cardCenterX < viewportWidth / 2;

      let side;
      if (preferRight) {
        side = roomRight >= popoverWidth || roomRight >= roomLeft ? 'right' : 'left';
      } else {
        side = roomLeft >= popoverWidth || roomLeft >= roomRight ? 'left' : 'right';
      }

      // Flush against the card's edge (no gap), so the cursor can travel
      // straight from card to popover without crossing any neighbor's hit-area.
      let left;
      if (side === 'right') {
        left = cardRect.right;
        if (left + popoverWidth > viewportWidth - edgeBuffer) {
          left = Math.max(edgeBuffer, viewportWidth - popoverWidth - edgeBuffer);
        }
      } else {
        left = cardRect.left - popoverWidth;
        if (left < edgeBuffer) left = edgeBuffer;
      }

      // Vertically align with the card's top edge so the popover never
      // overlaps the card or its vertical neighbors. Clamp to topBound so
      // the popover doesn't slip behind the sticky header.
      const top = Math.max(topBound, cardRect.top);

      setPopoverCoords({ top, left });

      // After a frame, check actual popover height and clamp vertically.
      requestAnimationFrame(() => {
        if (!popoverRef.current) return;
        const popoverRect = popoverRef.current.getBoundingClientRect();

        let adjustedTop = top;
        if (popoverRect.bottom > viewportHeight - edgeBuffer) {
          adjustedTop = Math.max(topBound, viewportHeight - popoverRect.height - edgeBuffer);
        } else if (popoverRect.top < topBound) {
          adjustedTop = topBound;
        }

        if (adjustedTop !== top) {
          setPopoverCoords(prev => ({ ...prev, top: adjustedTop }));
        }
      });
    };

    positionPopover();
  }, [showPopover, appointment._id]);

  // Reset the View/Edit choice each time the popover closes
  useEffect(() => {
    if (!showPopover) setShowApptActions(false);
  }, [showPopover]);

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
      className={`relative ${canDrag ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'}`}
      style={{...dragStyle, zIndex: showPopover ? 100000 : dragStyle.zIndex || 10}}
      onMouseEnter={handleCardEnter}
      onMouseLeave={handleCardLeave}
      onMouseDown={canDrag ? handleMouseDown : undefined}
    >
      {/* Appointment Card */}
      <div
        className={`h-full rounded border-l-4 border-2 ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text} ${colorClasses.hover} px-2 py-1 transition-colors ${isDragging ? 'ring-2 ring-blue-400 shadow-lg' : 'shadow-sm'} overflow-hidden`}
        style={{ marginTop: '2px', marginBottom: '2px' }}
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
            top: `${popoverCoords.top}px`,
            left: `${popoverCoords.left}px`,
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
          {isScheduleBlock && displayAppointment._isRedacted ? (
            <>
              {/* Redacted Schedule Block Popover (Service Writers / Other Technicians) */}
              <div className="mb-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Unavailable</div>
                <div className="text-base text-gray-700">This technician is unavailable during this time</div>
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
            </>
          ) : isScheduleBlock ? (
            <>
              {/* Action Row - top of popover */}
              <div className="flex gap-2 mb-3 pb-3 border-b border-gray-200">
                <Link
                  to={`/schedule-blocks/${appointment.scheduleBlockId}/edit${fromQuery ? `?${fromQuery}` : ''}`}
                  className="flex-1 text-center bg-indigo-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-indigo-700 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Edit Task
                </Link>
              </div>

              {/* Task Title */}
              <div className="mb-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Task</div>
                <div className="text-base font-semibold text-gray-900">{appointment.title}</div>
              </div>

              {/* Notes - shown high so list/process is immediately visible */}
              {displayAppointment.notes && (
                <div className="mb-3">
                  <div className="text-xs font-bold text-gray-500 uppercase mb-1">Notes</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{displayAppointment.notes}</div>
                </div>
              )}

              {/* Category */}
              <div className="mb-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Category</div>
                <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${colorClasses.bg} ${colorClasses.text} border ${colorClasses.border} capitalize`}>
                  {appointment.category}
                </span>
              </div>

              {/* Time Info */}
              <div className="mb-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Time</div>
                <div className="text-sm text-gray-700">
                  {formatDateTimeToET(appointment.startTime, 'MMM D, YYYY')}
                  {' · '}
                  {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
                </div>
              </div>

              {/* Technician Info */}
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Technician</div>
                <div className="text-sm text-gray-900">
                  {appointment.technician?.name || 'Unassigned'}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Appointment Popover */}
              {/* Action Row - top of popover, one line */}
              <div className="flex gap-2 mb-3 pb-3 border-b border-gray-200">
                {showApptActions ? (
                  <>
                    <Link
                      to={`/appointments/${appointment._id}`}
                      className="flex-1 text-center bg-blue-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-blue-700 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View
                    </Link>
                    <Link
                      to={workOrderStatus === 'Appointment Complete'
                        ? `/appointments/${appointment._id}/edit?reschedule=true${fromQuery ? `&${fromQuery}` : ''}`
                        : `/appointments/${appointment._id}/edit${fromQuery ? `?${fromQuery}` : ''}`}
                      className={`flex-1 text-center text-white px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                        workOrderStatus === 'Appointment Complete'
                          ? 'bg-yellow-500 hover:bg-yellow-600'
                          : 'bg-gray-500 hover:bg-gray-600'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {workOrderStatus === 'Appointment Complete' ? 'Reschedule' : 'Edit'}
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowApptActions(false); }}
                      className="px-2 py-1.5 rounded text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                      aria-label="Back"
                    >
                      ←
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowApptActions(true); }}
                      className="flex-1 flex flex-col items-center justify-center bg-blue-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-blue-700 transition-colors leading-tight"
                    >
                      <div>View/Edit</div>
                      <div>Appointment</div>
                    </button>
                    {appointment.workOrder && (
                      <Link
                        to={`/work-orders/${typeof appointment.workOrder === 'string' ? appointment.workOrder : (appointment.workOrder._id || appointment.workOrder)}`}
                        className="flex-1 flex flex-col items-center justify-center text-center bg-green-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-green-700 transition-colors leading-tight"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div>View</div>
                        <div>Work Order</div>
                      </Link>
                    )}
                  </>
                )}
              </div>

              {/* Customer / Vehicle */}
              <div className="mb-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Customer / Vehicle</div>
                <div className="text-base font-semibold text-gray-900">
                  {appointment.customer?.name}
                </div>
                {appointment.customer?.phone && (
                  <div className="text-xs text-gray-600">{appointment.customer.phone}</div>
                )}
                <div className="text-sm text-gray-700 mt-0.5">{vehicleInfo}</div>
                {appointment.vehicle?.vin && (
                  <div className="text-xs text-gray-500">VIN: {appointment.vehicle.vin}</div>
                )}
              </div>

              {/* Service & Time */}
              <div className="mb-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Service & Time</div>
                <div className="text-base text-gray-900">{serviceType || 'Not specified'}</div>
                {details && (
                  <div className="text-sm text-gray-700 mt-0.5">{details}</div>
                )}
                <div className="text-sm text-gray-700 mt-1">
                  {formatDateTimeToET(appointment.startTime, 'MMM D, YYYY')}
                  {' · '}
                  {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
                </div>
              </div>

              {/* Technician */}
              <div className="mb-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Technician</div>
                <div className="text-sm text-gray-900">
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
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase mb-1">Notes</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{appointment.notes}</div>
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default AppointmentCard;
