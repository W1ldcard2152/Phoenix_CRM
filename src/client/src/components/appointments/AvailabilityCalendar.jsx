import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment-timezone';
import AppointmentService from '../../services/appointmentService';
import technicianService from '../../services/technicianService';

const TIMEZONE = 'America/New_York';
const SHOP_OPEN = 8; // 8 AM
const SHOP_CLOSE = 18; // 6 PM
const HOUR_HEIGHT = 20; // pixels per hour (compact)
const ROW_HEIGHT = (SHOP_CLOSE - SHOP_OPEN) * HOUR_HEIGHT; // Total height per technician row

/**
 * Compact appointment block with hover popover
 */
const AppointmentBlock = ({ appt, top, height }) => {
  const [showPopover, setShowPopover] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0, position: 'bottom' });
  const blockRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  const start = moment.utc(appt.startTime).tz(TIMEZONE);
  const end = moment.utc(appt.endTime).tz(TIMEZONE);

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }

    if (blockRef.current) {
      const rect = blockRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Prefer showing below, but show above if not enough space
      if (spaceBelow < 200 && spaceAbove > spaceBelow) {
        setPopoverCoords({
          top: rect.top - 8,
          left: Math.min(rect.left, window.innerWidth - 260),
          position: 'top'
        });
      } else {
        setPopoverCoords({
          top: rect.bottom + 8,
          left: Math.min(rect.left, window.innerWidth - 260),
          position: 'bottom'
        });
      }
    }
    setShowPopover(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowPopover(false);
    }, 150);
  };

  const vehicleInfo = appt.vehicle
    ? `${appt.vehicle.year || ''} ${appt.vehicle.make || ''} ${appt.vehicle.model || ''}`.trim()
    : 'No vehicle';

  return (
    <>
      <div
        ref={blockRef}
        className="absolute left-0.5 right-0.5 bg-blue-300 border border-blue-500 rounded-sm px-0.5 overflow-hidden text-blue-900 cursor-default hover:bg-blue-400 transition-colors"
        style={{ top, height: Math.max(height, 10) }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {height > 14 && (
          <div className="truncate text-xs leading-tight">
            {start.format('h:mm')}-{end.format('h:mm')}
          </div>
        )}
      </div>

      {/* Popover */}
      {showPopover && ReactDOM.createPortal(
        <div
          className="fixed w-56 bg-white border border-gray-300 rounded-lg shadow-xl p-3 text-xs"
          style={{
            top: popoverCoords.position === 'top' ? popoverCoords.top : popoverCoords.top,
            left: popoverCoords.left,
            transform: popoverCoords.position === 'top' ? 'translateY(-100%)' : 'none',
            zIndex: 999999
          }}
          onMouseEnter={() => {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
          }}
          onMouseLeave={() => setShowPopover(false)}
        >
          {/* Customer */}
          <div className="mb-2">
            <div className="text-gray-500 text-xs uppercase font-medium">Customer</div>
            <div className="font-semibold text-gray-900">
              {appt.customer?.name || `${appt.customer?.firstName || ''} ${appt.customer?.lastName || ''}`.trim() || 'Unknown'}
            </div>
          </div>

          {/* Vehicle */}
          <div className="mb-2">
            <div className="text-gray-500 text-xs uppercase font-medium">Vehicle</div>
            <div className="text-gray-900">{vehicleInfo}</div>
          </div>

          {/* Service */}
          <div className="mb-2">
            <div className="text-gray-500 text-xs uppercase font-medium">Service</div>
            <div className="text-gray-900">{appt.serviceType || 'Not specified'}</div>
          </div>

          {/* Time */}
          <div>
            <div className="text-gray-500 text-xs uppercase font-medium">Time</div>
            <div className="text-gray-900">
              {start.format('h:mm A')} - {end.format('h:mm A')}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

/**
 * Compact availability calendar for appointment scheduling
 * Shows separate calendar row for each technician with toggleable visibility
 */
const AvailabilityCalendar = ({ initialDate = null }) => {
  const [appointments, setAppointments] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [visibleTechnicians, setVisibleTechnicians] = useState({});
  const [currentDate, setCurrentDate] = useState(initialDate ? moment(initialDate) : moment());
  const [viewType, setViewType] = useState('weekly');
  const [loading, setLoading] = useState(true);

  // Fetch technicians
  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        const response = await technicianService.getAllTechnicians(true);
        const techs = response.data?.data?.technicians || [];
        setTechnicians(techs);
        // Default: all technicians collapsed
        const visible = {};
        techs.forEach(t => { visible[t._id] = false; });
        setVisibleTechnicians(visible);
      } catch (err) {
        console.error('Error fetching technicians:', err);
      }
    };
    fetchTechnicians();
  }, []);

  // Fetch appointments
  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setLoading(true);
        let startDate, endDate;

        if (viewType === 'daily') {
          startDate = currentDate.clone().subtract(1, 'day').format('YYYY-MM-DD');
          endDate = currentDate.clone().format('YYYY-MM-DD');
        } else {
          startDate = currentDate.clone().startOf('week').format('YYYY-MM-DD');
          endDate = currentDate.clone().endOf('week').format('YYYY-MM-DD');
        }

        const response = await AppointmentService.getAppointmentsByDateRange(startDate, endDate);
        setAppointments(response?.data?.appointments || []);
      } catch (err) {
        console.error('Error fetching appointments:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAppointments();
  }, [currentDate, viewType]);

  // Toggle technician visibility
  const toggleTechnician = (techId) => {
    setVisibleTechnicians(prev => ({
      ...prev,
      [techId]: !prev[techId]
    }));
  };

  // Get days to display
  const days = useMemo(() => {
    if (viewType === 'daily') {
      return [currentDate.clone()];
    }
    const weekStart = currentDate.clone().startOf('week');
    return Array.from({ length: 5 }, (_, i) => weekStart.clone().add(i, 'days')); // Mon-Fri
  }, [currentDate, viewType]);

  // Get appointments for a specific technician and day
  const getAppointmentsForTechAndDay = (techId, day) => {
    return appointments.filter(appt => {
      const apptTechId = appt.technician?._id || appt.technician;
      const apptDate = moment.utc(appt.startTime).tz(TIMEZONE);
      return apptTechId === techId && apptDate.isSame(day, 'day');
    });
  };

  // Navigation
  const goToPrevious = () => {
    setCurrentDate(prev => prev.clone().subtract(1, viewType === 'daily' ? 'day' : 'week'));
  };

  const goToNext = () => {
    setCurrentDate(prev => prev.clone().add(1, viewType === 'daily' ? 'day' : 'week'));
  };

  const goToToday = () => {
    setCurrentDate(moment());
  };

  // Count visible technicians
  const visibleCount = Object.values(visibleTechnicians).filter(Boolean).length;

  // Get technician display name
  const getTechName = (tech) => tech.name || `${tech.firstName} ${tech.lastName}`;

  return (
    <div className="border border-gray-200 rounded-lg bg-white text-xs">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewType('daily')}
            className={`px-2 py-1 rounded text-xs font-medium ${
              viewType === 'daily' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setViewType('weekly')}
            className={`px-2 py-1 rounded text-xs font-medium ${
              viewType === 'weekly' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Week
          </button>
        </div>

        <span className="font-medium text-gray-700">
          {viewType === 'daily'
            ? currentDate.format('ddd, MMM D')
            : `${currentDate.clone().startOf('week').format('MMM D')} - ${currentDate.clone().endOf('week').format('MMM D')}`
          }
        </span>

        <div className="flex items-center gap-1">
          <button onClick={goToPrevious} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs">
            ←
          </button>
          <button onClick={goToToday} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs">
            Today
          </button>
          <button onClick={goToNext} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs">
            →
          </button>
        </div>
      </div>

      {/* Technician Rows */}
      {loading ? (
        <div className="p-4 text-center text-gray-500">Loading...</div>
      ) : (
        <div>
          {technicians.map(tech => {
            const isVisible = visibleTechnicians[tech._id];
            const techAppointments = appointments.filter(a =>
              (a.technician?._id || a.technician) === tech._id
            );

            return (
              <div key={tech._id} className="border-b border-gray-200 last:border-b-0">
                {/* Technician Toggle Header */}
                <button
                  onClick={() => toggleTechnician(tech._id)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-left hover:bg-gray-50 transition-colors ${
                    isVisible ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`transform transition-transform ${isVisible ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <span className={`font-medium ${isVisible ? 'text-blue-700' : 'text-gray-700'}`}>
                      {getTechName(tech)}
                    </span>
                  </div>
                  <span className="text-gray-400">
                    {techAppointments.length} appt{techAppointments.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {/* Calendar Grid (collapsible) */}
                {isVisible && (
                  <div className="flex border-t border-gray-100">
                    {/* Time Column */}
                    <div className="w-8 flex-shrink-0 border-r border-gray-200 bg-gray-50">
                      {Array.from({ length: SHOP_CLOSE - SHOP_OPEN }, (_, i) => (
                        <div
                          key={i}
                          className="border-b border-gray-100 text-right pr-0.5 text-gray-400"
                          style={{ height: HOUR_HEIGHT, fontSize: '9px' }}
                        >
                          {SHOP_OPEN + i > 12 ? SHOP_OPEN + i - 12 : SHOP_OPEN + i}
                        </div>
                      ))}
                    </div>

                    {/* Day Columns */}
                    <div className="flex-1 flex">
                      {days.map((day, dayIndex) => {
                        const dayAppointments = getAppointmentsForTechAndDay(tech._id, day);
                        const isToday = day.isSame(moment(), 'day');

                        return (
                          <div
                            key={dayIndex}
                            className={`flex-1 border-r border-gray-200 last:border-r-0 ${
                              isToday ? 'bg-blue-50' : ''
                            }`}
                          >
                            {/* Day Header */}
                            <div className={`h-5 border-b border-gray-200 text-center text-xs ${
                              isToday ? 'text-blue-700 font-medium' : 'text-gray-600'
                            }`}>
                              {day.format('ddd D')}
                            </div>

                            {/* Time Slots */}
                            <div className="relative" style={{ height: ROW_HEIGHT }}>
                              {/* Hour lines */}
                              {Array.from({ length: SHOP_CLOSE - SHOP_OPEN }, (_, i) => (
                                <div
                                  key={i}
                                  className="absolute w-full border-b border-gray-100"
                                  style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                                />
                              ))}

                              {/* Appointments */}
                              {dayAppointments.map((appt, apptIndex) => {
                                const start = moment.utc(appt.startTime).tz(TIMEZONE);
                                const end = moment.utc(appt.endTime).tz(TIMEZONE);
                                const startHour = start.hour() + start.minute() / 60;
                                const endHour = end.hour() + end.minute() / 60;
                                const top = Math.max(0, (startHour - SHOP_OPEN)) * HOUR_HEIGHT;
                                const height = Math.min(
                                  (endHour - Math.max(startHour, SHOP_OPEN)) * HOUR_HEIGHT,
                                  ROW_HEIGHT - top
                                );

                                if (height <= 0) return null;

                                return (
                                  <AppointmentBlock
                                    key={appt._id || apptIndex}
                                    appt={appt}
                                    top={top}
                                    height={height}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {visibleCount === 0 && !loading && (
        <div className="p-2 text-center text-gray-400 text-xs">
          Click a technician name above to view their schedule
        </div>
      )}
    </div>
  );
};

export default AvailabilityCalendar;
