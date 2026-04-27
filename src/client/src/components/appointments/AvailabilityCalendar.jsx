import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment-timezone';
import AppointmentService from '../../services/appointmentService';
import ScheduleBlockService from '../../services/scheduleBlockService';
import technicianService from '../../services/technicianService';
import { TIMEZONE } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { applyScheduleBlockVisibility } from '../../utils/permissions';
import { getAppointmentColorClasses } from '../../utils/appointmentColors';

const SHOP_OPEN = 8; // 8 AM
const SHOP_CLOSE = 18; // 6 PM
const HOUR_HEIGHT = 20; // pixels per hour (compact)
const ROW_HEIGHT = (SHOP_CLOSE - SHOP_OPEN) * HOUR_HEIGHT;

/**
 * Compact appointment block with hover popover — styled to match dashboard calendar
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
      const margin = 8;
      const popoverWidth = 224; // w-56

      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - popoverWidth - margin));

      if (spaceBelow < 200 && spaceAbove > spaceBelow) {
        setPopoverCoords({ top: rect.top - margin, left, position: 'top' });
      } else {
        setPopoverCoords({ top: rect.bottom + margin, left, position: 'bottom' });
      }
    }
    setShowPopover(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowPopover(false);
    }, 150);
  };

  const isScheduleBlock = appt.isScheduleBlock;
  const vehicleInfo = appt.vehicle
    ? `${appt.vehicle.year || ''} ${appt.vehicle.make || ''} ${appt.vehicle.model || ''}`.trim()
    : 'No vehicle';

  // Use status-based colors matching the dashboard calendar
  let colorClasses;
  if (isScheduleBlock) {
    if (appt._isRedacted) {
      colorClasses = { bg: 'bg-gray-200', border: 'border-gray-400', text: 'text-gray-600', hover: 'hover:bg-gray-300' };
    } else {
      colorClasses = { bg: 'bg-indigo-200', border: 'border-indigo-400', text: 'text-indigo-900', hover: 'hover:bg-indigo-300' };
    }
  } else {
    const workOrderStatus = typeof appt.workOrder === 'object' ? appt.workOrder?.status : null;
    const statusToUse = workOrderStatus || appt.status;
    colorClasses = getAppointmentColorClasses(statusToUse);
  }

  return (
    <>
      <div
        ref={blockRef}
        className={`absolute left-0.5 right-0.5 ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text} ${colorClasses.hover} border-l-[3px] border-y border-r rounded-sm px-0.5 overflow-hidden cursor-default transition-colors`}
        style={{ top, height: Math.max(height, 10) }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {height > 14 && (
          <div className="truncate text-xs leading-tight font-medium">
            {isScheduleBlock ? appt.title : `${start.format('h:mm')}-${end.format('h:mm')}`}
          </div>
        )}
      </div>

      {/* Popover */}
      {showPopover && ReactDOM.createPortal(
        <div
          className="fixed w-56 bg-white border-2 border-gray-400 rounded-lg shadow-2xl p-3 text-xs"
          style={{
            top: popoverCoords.top,
            left: popoverCoords.left,
            transform: popoverCoords.position === 'top' ? 'translateY(-100%)' : 'none',
            zIndex: 999999
          }}
          onMouseEnter={() => {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
          }}
          onMouseLeave={() => setShowPopover(false)}
        >
          {isScheduleBlock && appt._isRedacted ? (
            <>
              <div className="mb-2">
                <div className="text-xs font-bold text-gray-500 uppercase">Unavailable</div>
                <div className="text-gray-700">This technician is unavailable</div>
              </div>
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase">Time</div>
                <div className="text-gray-900">
                  {start.format('h:mm A')} - {end.format('h:mm A')}
                </div>
              </div>
            </>
          ) : isScheduleBlock ? (
            <>
              <div className="mb-2">
                <div className="text-xs font-bold text-gray-500 uppercase">Task</div>
                <div className="font-semibold text-gray-900">{appt.title}</div>
              </div>
              <div className="mb-2">
                <div className="text-xs font-bold text-gray-500 uppercase">Category</div>
                <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded ${colorClasses.bg} ${colorClasses.text} border ${colorClasses.border} capitalize`}>
                  {appt.category}
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase">Time</div>
                <div className="text-gray-900">
                  {start.format('h:mm A')} - {end.format('h:mm A')}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-2">
                <div className="text-xs font-bold text-gray-500 uppercase">Customer</div>
                <div className="font-semibold text-gray-900">
                  {appt.customer?.name || 'Unknown'}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-xs font-bold text-gray-500 uppercase">Vehicle</div>
                <div className="text-gray-900">{vehicleInfo}</div>
              </div>
              <div className="mb-2">
                <div className="text-xs font-bold text-gray-500 uppercase">Service</div>
                <div className="text-gray-900">{appt.serviceType || 'Not specified'}</div>
              </div>
              <div className="mb-2">
                <div className="text-xs font-bold text-gray-500 uppercase">Status</div>
                <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded ${colorClasses.bg} ${colorClasses.text} border ${colorClasses.border}`}>
                  {typeof appt.workOrder === 'object' ? appt.workOrder?.status || appt.status : appt.status}
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase">Time</div>
                <div className="text-gray-900">
                  {start.format('h:mm A')} - {end.format('h:mm A')}
                </div>
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

/**
 * Compact availability calendar for appointment scheduling
 * Shows separate calendar row for each technician with toggleable visibility
 * Uses Mon-Fri by default, auto-expands to 7 days if weekend events exist
 */
const AvailabilityCalendar = ({ initialDate = null }) => {
  const [appointments, setAppointments] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [visibleTechnicians, setVisibleTechnicians] = useState({});
  const [currentDate, setCurrentDate] = useState(initialDate ? moment(initialDate) : moment());
  const [viewType, setViewType] = useState('weekly');
  const [showWeekends, setShowWeekends] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Fetch technicians
  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        const response = await technicianService.getAllTechnicians(true);
        const techs = response.data?.data?.technicians || [];
        setTechnicians(techs);
        const visible = {};
        techs.forEach(t => { visible[t._id] = false; });
        setVisibleTechnicians(visible);
      } catch (err) {
        console.error('Error fetching technicians:', err);
      }
    };
    fetchTechnicians();
  }, []);

  // Fetch appointments — mirrors SwimmingLaneCalendar logic
  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setLoading(true);
        let startDate, endDate;

        if (viewType === 'daily') {
          startDate = currentDate.clone().subtract(1, 'day').format('YYYY-MM-DD');
          endDate = currentDate.clone().format('YYYY-MM-DD');
        } else {
          // Fetch full Sun-Sat week so we can detect weekend events
          startDate = currentDate.clone().startOf('week').format('YYYY-MM-DD');
          endDate = currentDate.clone().endOf('week').format('YYYY-MM-DD');
        }

        const [appointmentResponse, blockResponse] = await Promise.all([
          AppointmentService.getAppointmentsByDateRange(startDate, endDate),
          ScheduleBlockService.getExpanded(startDate, endDate).catch(err => {
            console.error('Error fetching schedule blocks:', err);
            return { data: { scheduleBlocks: [] } };
          })
        ]);
        const fetchedAppointments = appointmentResponse?.data?.appointments || [];
        const expandedBlocks = blockResponse?.data?.scheduleBlocks || [];

        const visibleBlocks = expandedBlocks.map(block =>
          applyScheduleBlockVisibility(block, user)
        );

        const allEvents = [...fetchedAppointments, ...visibleBlocks];
        setAppointments(allEvents);

        // Auto-expand to 7 days if weekend events exist
        if (viewType === 'weekly') {
          const hasWeekendEvents = allEvents.some(event => {
            const day = moment.utc(event.startTime).tz(TIMEZONE).day();
            return day === 0 || day === 6;
          });
          setShowWeekends(hasWeekendEvents);
        }
      } catch (err) {
        console.error('Error fetching appointments:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAppointments();
  }, [currentDate, viewType]);

  const toggleTechnician = (techId) => {
    setVisibleTechnicians(prev => ({
      ...prev,
      [techId]: !prev[techId]
    }));
  };

  // Get days to display — Mon-Fri or Sun-Sat, matching dashboard WeeklyView
  const days = useMemo(() => {
    if (viewType === 'daily') {
      return [currentDate.clone()];
    }
    const startDay = showWeekends ? 0 : 1; // 0 = Sunday, 1 = Monday
    const endDay = showWeekends ? 6 : 5;   // 6 = Saturday, 5 = Friday
    const result = [];
    for (let i = startDay; i <= endDay; i++) {
      result.push(currentDate.clone().day(i));
    }
    return result;
  }, [currentDate, viewType, showWeekends]);

  const getAppointmentsForTechAndDay = (techId, day) => {
    return appointments.filter(appt => {
      const apptTechId = appt.technician?._id || appt.technician;
      const apptDate = moment.utc(appt.startTime).tz(TIMEZONE);
      return apptTechId === techId && apptDate.isSame(day, 'day');
    });
  };

  const goToPrevious = () => {
    setCurrentDate(prev => prev.clone().subtract(1, viewType === 'daily' ? 'day' : 'week'));
  };

  const goToNext = () => {
    setCurrentDate(prev => prev.clone().add(1, viewType === 'daily' ? 'day' : 'week'));
  };

  const goToToday = () => {
    setCurrentDate(moment());
  };

  const visibleCount = Object.values(visibleTechnicians).filter(Boolean).length;
  const getTechName = (tech) => tech.name || `${tech.firstName} ${tech.lastName}`;

  const getPeriodDisplay = () => {
    if (viewType === 'daily') {
      return currentDate.format('ddd, MMM D');
    }
    const weekStart = currentDate.clone().day(showWeekends ? 0 : 1);
    const weekEnd = currentDate.clone().day(showWeekends ? 6 : 5);
    return `${weekStart.format('MMM D')} - ${weekEnd.format('MMM D, YYYY')}`;
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white text-xs shadow-sm">
      {/* Header — matching dashboard style */}
      <div className="flex items-center justify-between p-2.5 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-0.5">
          <button
            onClick={() => setViewType('daily')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              viewType === 'daily' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setViewType('weekly')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              viewType === 'weekly' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            Week
          </button>
        </div>

        <span className="font-semibold text-gray-800 text-sm">
          {getPeriodDisplay()}
        </span>

        <div className="flex items-center gap-1">
          <button onClick={goToPrevious} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs font-medium transition-colors">
            ←
          </button>
          <button onClick={goToToday} className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors">
            Today
          </button>
          <button onClick={goToNext} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs font-medium transition-colors">
            →
          </button>
        </div>
      </div>

      {/* Technician Rows */}
      {loading ? (
        <div className="p-4 text-center text-gray-500">
          <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-blue-600 mb-1"></div>
          <div>Loading...</div>
        </div>
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
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-gray-50 transition-colors ${
                    isVisible ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`transform transition-transform text-xs ${isVisible ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <span className={`font-medium ${isVisible ? 'text-blue-700' : 'text-gray-700'}`}>
                      {getTechName(tech)}
                    </span>
                  </div>
                  <span className="text-gray-400 text-xs">
                    {techAppointments.length} event{techAppointments.length !== 1 ? 's' : ''}
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
                        const isWeekend = day.day() === 0 || day.day() === 6;

                        return (
                          <div
                            key={dayIndex}
                            className={`flex-1 border-r border-gray-200 last:border-r-0 ${
                              isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-50' : ''
                            }`}
                          >
                            {/* Day Header */}
                            <div className={`h-5 border-b border-gray-200 text-center text-xs font-medium ${
                              isToday ? 'text-blue-700 bg-blue-100' : 'text-gray-600'
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
                                const apptStart = moment.utc(appt.startTime).tz(TIMEZONE);
                                const apptEnd = moment.utc(appt.endTime).tz(TIMEZONE);
                                const startHour = apptStart.hour() + apptStart.minute() / 60;
                                const endHour = apptEnd.hour() + apptEnd.minute() / 60;
                                const blockTop = Math.max(0, (startHour - SHOP_OPEN)) * HOUR_HEIGHT;
                                const blockHeight = Math.min(
                                  (endHour - Math.max(startHour, SHOP_OPEN)) * HOUR_HEIGHT,
                                  ROW_HEIGHT - blockTop
                                );

                                if (blockHeight <= 0) return null;

                                return (
                                  <AppointmentBlock
                                    key={appt._id || apptIndex}
                                    appt={appt}
                                    top={blockTop}
                                    height={blockHeight}
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
        <div className="p-2.5 text-center text-gray-400 text-xs">
          Click a technician name above to view their schedule
        </div>
      )}
    </div>
  );
};

export default AvailabilityCalendar;
