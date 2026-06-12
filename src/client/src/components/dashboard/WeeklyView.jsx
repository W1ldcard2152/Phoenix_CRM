import React, { useRef, useState, useEffect } from 'react';
import moment from 'moment-timezone';
import AppointmentCard from './AppointmentCard';
import { TIMEZONE } from '../../utils/formatters';
import {
  resolveDayHours,
  splitIntoBlocks,
  businessMinutesBetween,
  addBusinessMinutes,
  subtractBusinessMinutes,
  mapGridMinutesToOpenTime
} from '../../utils/businessTime';

/**
 * WeeklyView - Swimming lane calendar showing one week.
 * Time axis on left, days as columns, appointments positioned by time.
 *
 * Appointments render as business-time blocks: split per day and around
 * lunch via splitIntoBlocks. Dragging any block flows the whole
 * appointment through shop-open time (overflow past close wraps to the
 * next open day) with a live ghost preview. Schedule blocks keep the
 * legacy same-day delta drag.
 *
 * Props:
 * - week: Moment object for the week to display
 * - appointments: All appointments for this week
 * - showWeekends: Boolean to show/hide weekend columns
 * - onAppointmentReschedule: legacy delta path (schedule blocks) — (id, deltaMinutes, dayDelta)
 * - onAppointmentMove: flow path (appointments) — (id, startISO, endISO)
 * - shopHoursMap: { [dayOfWeek]: { open, close, closed, ... } } from Settings.
 *   If null, defaults to 8am–6pm every day.
 */
const WeeklyView = ({ week, appointments, showWeekends, onAppointmentReschedule, onAppointmentMove, shopHoursMap }) => {
  const PIXELS_PER_HOUR = 60;
  const PIXELS_PER_MINUTE = PIXELS_PER_HOUR / 60;

  const dayColumnRef = useRef(null);
  const [dayColumnWidth, setDayColumnWidth] = useState(200);
  // Live drag preview while an appointment block is dragged: { id, techId, blocks }
  const [dragPreview, setDragPreview] = useState(null);
  // Current time, refreshed every minute for the now-indicator
  const [now, setNow] = useState(() => moment.tz(TIMEZONE));

  useEffect(() => {
    const timer = setInterval(() => setNow(moment.tz(TIMEZONE)), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const measure = () => {
      if (dayColumnRef.current) {
        setDayColumnWidth(dayColumnRef.current.getBoundingClientRect().width);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [showWeekends]);

  // --- Shop hours helpers ---

  /**
   * Returns { open, close } in integer hours for a given day moment,
   * or null if the shop is closed on that day.
   */
  const getHoursForDay = (dayMoment) => {
    const h = resolveDayHours(dayMoment, shopHoursMap);
    if (!h) return null;
    return {
      open:  Math.floor(h.openMin / 60),
      close: Math.ceil(h.closeMin / 60)
    };
  };

  // --- Days ---

  const getDays = () => {
    const days = [];
    const startDay = showWeekends ? 0 : 1;
    const endDay   = showWeekends ? 6 : 5;
    for (let i = startDay; i <= endDay; i++) {
      days.push(week.clone().day(i));
    }
    return days;
  };

  const days = getDays();

  // --- Viewport bounds (min open / max close across all non-closed visible days) ---

  const activeDayHours = days.map(d => getHoursForDay(d)).filter(Boolean);
  const SHOP_OPEN_HOUR  = activeDayHours.length > 0 ? Math.min(...activeDayHours.map(d => d.open))  : 8;
  const SHOP_CLOSE_HOUR = activeDayHours.length > 0 ? Math.max(...activeDayHours.map(d => d.close)) : 18;
  const totalHeight = (SHOP_CLOSE_HOUR - SHOP_OPEN_HOUR) * PIXELS_PER_HOUR;

  // --- Time helpers (depend on viewport bounds) ---

  const getMinutesFromShopOpen = (dateTime) => {
    const time = moment.utc(dateTime).tz(TIMEZONE);
    return (time.hour() - SHOP_OPEN_HOUR) * 60 + time.minute();
  };

  const getDurationMinutes = (startTime, endTime) => {
    const start = moment.utc(startTime).tz(TIMEZONE);
    const end   = moment.utc(endTime).tz(TIMEZONE);
    return end.diff(start, 'minutes');
  };

  /**
   * Process appointments for a specific day and technician.
   * Appointments are split into business-time blocks (per day, around
   * lunch); schedule blocks render as-is on their own day.
   */
  const getAppointmentsForDayAndTech = (day, technicianId) => {
    const dayStart     = day.clone().startOf('day');
    const dayEnd       = day.clone().endOf('day');
    const dayFormatted = day.format('YYYY-MM-DD');
    const totalShopMinutes = (SHOP_CLOSE_HOUR - SHOP_OPEN_HOUR) * 60;
    const entries = [];

    appointments.forEach(appointment => {
      const matchesTech = appointment.technician && appointment.technician._id === technicianId;
      if (!matchesTech) return;

      const apptStart = moment.utc(appointment.startTime).tz(TIMEZONE);
      const apptEnd   = moment.utc(appointment.endTime).tz(TIMEZONE);
      if (!apptStart.isBefore(dayEnd) || !apptEnd.isAfter(dayStart)) return;

      if (appointment.isScheduleBlock) {
        // Schedule blocks are same-day events; no business-time flow
        if (apptStart.format('YYYY-MM-DD') !== dayFormatted) return;
        const startMinutes    = getMinutesFromShopOpen(apptStart);
        const durationMinutes = getDurationMinutes(apptStart, apptEnd);
        if (startMinutes >= 0 && startMinutes < totalShopMinutes && durationMinutes > 0) {
          entries.push({ ...appointment, _block: null, startMinutes, durationMinutes });
        }
        return;
      }

      splitIntoBlocks(apptStart, apptEnd, shopHoursMap, apptStart.format('YYYY-MM-DD'))
        .filter(block => block.dayKey === dayFormatted)
        .forEach(block => {
          const startMinutes    = getMinutesFromShopOpen(block.start);
          const durationMinutes = block.end.diff(block.start, 'minutes');
          if (startMinutes >= 0 && startMinutes < totalShopMinutes && durationMinutes > 0) {
            entries.push({ ...appointment, _block: block, startMinutes, durationMinutes });
          }
        });
    });

    return entries.sort((a, b) => a.startMinutes - b.startMinutes);
  };

  // --- Business-time flow drag (appointments only) ---

  /**
   * Compute the appointment's proposed new range from drag deltas on one
   * of its blocks. deltaMinutes is the grid offset (snapped, may overshoot
   * past open/close); secondarySnaps is whole-day column moves.
   */
  const computeFlowTimes = (entry, { deltaMinutes, secondarySnaps }) => {
    const apptStart      = moment.utc(entry.startTime).tz(TIMEZONE);
    const apptEnd        = moment.utc(entry.endTime).tz(TIMEZONE);
    const originalAnchor = apptStart.format('YYYY-MM-DD');
    const grabbedStart   = entry._block ? entry._block.start : apptStart;

    // Where the grabbed block was dropped, as wall-clock minutes on the target day
    const targetDay    = grabbedStart.clone().add(secondarySnaps, 'days');
    const targetAnchor = targetDay.format('YYYY-MM-DD');
    const wallMinutes  = SHOP_OPEN_HOUR * 60 + entry.startMinutes + deltaMinutes;
    const newBlockStart = mapGridMinutesToOpenTime(targetDay, wallMinutes, shopHoursMap, targetAnchor);

    // Grabbing a continuation block moves the whole chain: shift back by the
    // business-time offset between the appointment start and the grabbed block
    const offset   = businessMinutesBetween(apptStart, grabbedStart, shopHoursMap, originalAnchor);
    const newStart = offset > 0
      ? subtractBusinessMinutes(newBlockStart, offset, shopHoursMap, targetAnchor)
      : newBlockStart;

    const finalAnchor = newStart.format('YYYY-MM-DD');
    const duration    = Math.max(businessMinutesBetween(apptStart, apptEnd, shopHoursMap, originalAnchor), 15);
    const newEnd      = addBusinessMinutes(newStart, duration, shopHoursMap, finalAnchor);

    return { newStart, newEnd, finalAnchor };
  };

  const handleFlowDragMove = (entry, deltas) => {
    const { newStart, newEnd, finalAnchor } = computeFlowTimes(entry, deltas);
    setDragPreview({
      id: entry._id,
      techId: entry.technician?._id,
      blocks: splitIntoBlocks(newStart, newEnd, shopHoursMap, finalAnchor)
    });
  };

  const handleFlowDragEnd = (entry, deltas) => {
    setDragPreview(null);
    if (deltas.deltaMinutes === 0 && deltas.secondarySnaps === 0) return;
    if (!onAppointmentMove) return;
    const { newStart, newEnd } = computeFlowTimes(entry, deltas);
    onAppointmentMove(entry._id, newStart.toISOString(), newEnd.toISOString());
  };

  /**
   * Group appointments by technician for the visible week.
   */
  const getTechnicianSchedules = () => {
    const weekStart = week.clone().startOf('week');
    const weekEnd   = week.clone().endOf('week');
    const techMap   = new Map();

    appointments.forEach(appointment => {
      if (appointment.technician && appointment.technician._id) {
        const apptStart = moment.utc(appointment.startTime).tz(TIMEZONE);
        const apptEnd   = moment.utc(appointment.endTime).tz(TIMEZONE);

        if (apptStart.isBefore(weekEnd) && apptEnd.isAfter(weekStart)) {
          const techId = appointment.technician._id;
          if (!techMap.has(techId)) {
            techMap.set(techId, { technician: appointment.technician, appointments: [] });
          }
          techMap.get(techId).appointments.push(appointment);
        }
      }
    });

    return Array.from(techMap.values()).sort((a, b) =>
      (a.technician.name || '').localeCompare(b.technician.name || '')
    );
  };

  /**
   * Generate time slots for the vertical axis.
   */
  const getTimeSlots = () => {
    const slots = [];
    for (let hour = SHOP_OPEN_HOUR; hour <= SHOP_CLOSE_HOUR; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        if (hour === SHOP_CLOSE_HOUR && minute > 0) break;

        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const period = hour >= 12 ? 'PM' : 'AM';

        slots.push({
          hour,
          minute,
          isHourMark: minute === 0,
          label: minute === 0 ? `${displayHour}:00 ${period}` : ''
        });
      }
    }
    return slots;
  };

  /**
   * Detect overlapping appointments and assign horizontal lanes.
   */
  const layoutAppointments = (appointments) => {
    const sorted     = [...appointments].sort((a, b) => a.startMinutes - b.startMinutes);
    const positioned = [];
    const lanes      = [];

    sorted.forEach(appointment => {
      const endMinutes = appointment.startMinutes + appointment.durationMinutes;

      let laneIndex = 0;
      while (laneIndex < lanes.length && lanes[laneIndex] > appointment.startMinutes) {
        laneIndex++;
      }
      if (laneIndex === lanes.length) {
        lanes.push(endMinutes);
      } else {
        lanes[laneIndex] = endMinutes;
      }

      positioned.push({ ...appointment, laneIndex, totalLanes: lanes.length });
    });

    const maxLanes = lanes.length;
    positioned.forEach(appt => { appt.totalLanes = maxLanes; });

    return positioned;
  };

  const technicianSchedules = getTechnicianSchedules();
  const today     = now.format('YYYY-MM-DD');
  const timeSlots = getTimeSlots();
  const totalShopMinutes = (SHOP_CLOSE_HOUR - SHOP_OPEN_HOUR) * 60;
  // Now-indicator geometry (only rendered in today's column when within the viewport)
  const nowMinutes = (now.hour() - SHOP_OPEN_HOUR) * 60 + now.minute();
  const showNowLine = nowMinutes >= 0 && nowMinutes <= totalShopMinutes;
  const nowHourTop = (now.hour() - SHOP_OPEN_HOUR) * 60 * PIXELS_PER_MINUTE;

  return (
    <div className="overflow-x-auto border border-gray-300 rounded-lg">
      <div className="min-w-max flex">
        {/* Left Side - Technician and Time */}
        <div className="flex-shrink-0">
          {/* Column headers */}
          <div className="flex h-16 border-b-2 border-gray-300">
            <div className="w-32 border-r border-gray-300 bg-gray-50 px-3 py-2 flex items-center">
              <div className="text-sm font-bold text-gray-700">Technician</div>
            </div>
            <div className="w-20 border-r-2 border-gray-300 bg-gray-50 px-2 py-2 flex items-center">
              <div className="text-xs font-bold text-gray-700">Time</div>
            </div>
          </div>

          {/* Technician rows */}
          {technicianSchedules.map(({ technician }, techIdx) => (
            <React.Fragment key={technician._id}>
            <div className="flex border-b border-gray-200">
              {/* Technician name */}
              <div className="w-32 border-r border-gray-300 bg-gray-50 px-3 py-2 flex items-start" style={{ height: `${totalHeight}px` }}>
                <div>
                  <div className="text-sm font-semibold text-gray-800">
                    {technician.name || 'Unassigned'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {appointments.filter(a => a.technician?._id === technician._id).length} orders
                  </div>
                </div>
              </div>

              {/* Time labels */}
              <div className="w-20 border-r-2 border-gray-300 bg-gray-50 relative" style={{ height: `${totalHeight}px` }}>
                {timeSlots.map((slot) => {
                  const topPos = ((slot.hour - SHOP_OPEN_HOUR) * 60 + slot.minute) * PIXELS_PER_MINUTE;

                  let labelTop;
                  if (slot.isHourMark) {
                    if (slot.hour === SHOP_OPEN_HOUR) {
                      labelTop = topPos + 2;
                    } else if (slot.hour === SHOP_CLOSE_HOUR) {
                      labelTop = topPos - 23;
                    } else {
                      labelTop = topPos - 6;
                    }
                  }

                  return (
                    <React.Fragment key={`${slot.hour}-${slot.minute}`}>
                      {slot.isHourMark && (
                        <div
                          className="absolute left-0 pr-1"
                          style={{ top: `${labelTop}px`, lineHeight: '1' }}
                        >
                          <span className="text-xs font-medium text-gray-700 pl-1">
                            {slot.label}
                          </span>
                        </div>
                      )}
                      <div
                        className={`absolute border-t ${slot.isHourMark ? 'border-gray-400' : 'border-gray-200'}`}
                        style={{ top: `${topPos}px`, left: '75%', right: 0 }}
                      />
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            {/* Spacer between technicians (must mirror the day-column side) */}
            {techIdx < technicianSchedules.length - 1 && (
              <div className="h-2 bg-gray-200 border-b border-gray-300" />
            )}
            </React.Fragment>
          ))}
        </div>

        {/* Day Columns */}
        <div className="flex-1">
          {/* Day Headers */}
          <div className="flex border-b-2 border-gray-300 bg-gray-50 h-16">
            {days.map((day, dayIdx) => {
              const isToday  = day.format('YYYY-MM-DD') === today;
              const dayHrs   = getHoursForDay(day);
              return (
                <div
                  key={day.format('YYYY-MM-DD')}
                  ref={dayIdx === 0 ? dayColumnRef : undefined}
                  className={`flex-1 min-w-[200px] border-r border-gray-300 px-3 py-2 text-center ${
                    isToday ? 'bg-blue-100' : ''
                  }`}
                >
                  <div className="text-xs font-medium text-gray-600 uppercase">
                    {day.format('ddd')}
                  </div>
                  <div className={`text-lg font-semibold ${isToday ? 'text-blue-700' : 'text-gray-800'}`}>
                    {day.format('MMM D')}
                  </div>
                  {dayHrs === null && (
                    <div className="text-xs text-gray-400">Closed</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Technician Rows */}
          {technicianSchedules.map(({ technician }, techIdx) => (
            <React.Fragment key={technician._id}>
            <div className="flex border-b border-gray-200">
              {days.map(day => {
                const dayAppointments      = getAppointmentsForDayAndTech(day, technician._id);
                const positionedAppointments = layoutAppointments(dayAppointments);
                const dayFormatted         = day.format('YYYY-MM-DD');
                const isToday              = dayFormatted === today;
                const isClosed             = getHoursForDay(day) === null;
                const dayHours             = resolveDayHours(day, shopHoursMap);
                const ghostBlocks          = dragPreview && dragPreview.techId === technician._id
                  ? dragPreview.blocks.filter(b => b.dayKey === dayFormatted)
                  : [];

                return (
                  <div
                    key={dayFormatted}
                    className={`flex-1 min-w-[200px] border-r border-gray-200 relative ${
                      isClosed ? 'bg-gray-100' : isToday ? 'bg-blue-50' : 'bg-white'
                    }`}
                    style={{ height: `${totalHeight}px` }}
                  >
                    {/* Closed overlay */}
                    {isClosed && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-xs text-gray-400 font-medium">Closed</span>
                      </div>
                    )}

                    {/* Hour grid lines */}
                    {timeSlots.map((slot) => (
                      <div
                        key={`${slot.hour}-${slot.minute}`}
                        className={`absolute left-0 right-0 border-t ${slot.isHourMark ? 'border-gray-300' : 'border-gray-100'}`}
                        style={{ top: `${((slot.hour - SHOP_OPEN_HOUR) * 60 + slot.minute) * PIXELS_PER_MINUTE}px` }}
                      />
                    ))}

                    {/* Current-hour highlight + now line (today only) */}
                    {isToday && !isClosed && showNowLine && (
                      <>
                        {now.hour() < SHOP_CLOSE_HOUR && (
                          <div
                            className="absolute left-0 right-0 bg-yellow-200 bg-opacity-40 pointer-events-none"
                            style={{
                              top:    `${Math.max(nowHourTop, 0)}px`,
                              height: `${60 * PIXELS_PER_MINUTE}px`,
                              zIndex: 4
                            }}
                          />
                        )}
                        <div
                          className="absolute left-0 right-0 pointer-events-none"
                          style={{ top: `${nowMinutes * PIXELS_PER_MINUTE - 1}px`, zIndex: 30 }}
                        >
                          <div className="border-t-2 border-red-500" />
                          <div className="absolute w-2 h-2 rounded-full bg-red-500" style={{ left: '-1px', top: '-4px' }} />
                        </div>
                      </>
                    )}

                    {/* Lunch band */}
                    {dayHours && dayHours.lunchStartMin !== null && (
                      <div
                        className="absolute left-0 right-0 bg-gray-200 bg-opacity-60 border-y border-gray-300 pointer-events-none flex items-center justify-center"
                        style={{
                          top:    `${(dayHours.lunchStartMin - SHOP_OPEN_HOUR * 60) * PIXELS_PER_MINUTE}px`,
                          height: `${(dayHours.lunchEndMin - dayHours.lunchStartMin) * PIXELS_PER_MINUTE}px`,
                          zIndex: 5
                        }}
                      >
                        {(dayHours.lunchEndMin - dayHours.lunchStartMin) * PIXELS_PER_MINUTE >= 16 && (
                          <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Lunch</span>
                        )}
                      </div>
                    )}

                    {/* Appointments */}
                    {positionedAppointments.map((appointment, idx) => {
                      const topPosition  = appointment.startMinutes * PIXELS_PER_MINUTE;
                      const height       = appointment.durationMinutes * PIXELS_PER_MINUTE;
                      const laneWidth    = 100 / appointment.totalLanes;
                      const leftPosition = appointment.laneIndex * laneWidth;
                      const isFlowAppt   = !appointment.isScheduleBlock;
                      const isDragSource = dragPreview && dragPreview.id === appointment._id;

                      return (
                        <AppointmentCard
                          key={`${appointment._id}-${idx}`}
                          appointment={appointment}
                          block={appointment._block}
                          shopHoursMap={shopHoursMap}
                          viewType="weekly"
                          style={{
                            position: 'absolute',
                            top:    `${topPosition}px`,
                            left:   `${leftPosition}%`,
                            width:  `${laneWidth}%`,
                            height: `${Math.max(height, 30)}px`,
                            paddingLeft: '2px',
                            paddingRight: '2px',
                            zIndex: 10,
                            ...(isDragSource ? { opacity: 0.4 } : {})
                          }}
                          dragConfig={{
                            axis: 'y',
                            pixelsPerMinute: PIXELS_PER_MINUTE,
                            snapMinutes: 15,
                            maxMinutes: totalShopMinutes,
                            durationMinutes: appointment.durationMinutes,
                            originalPositionPx: topPosition,
                            secondarySnapPx: appointment.blockType === 'recurring' ? 0 : dayColumnWidth,
                            overshootMinutes: isFlowAppt ? totalShopMinutes : 0
                          }}
                          onReschedule={isFlowAppt ? null : onAppointmentReschedule}
                          onDragMove={isFlowAppt ? (deltas) => handleFlowDragMove(appointment, deltas) : null}
                          onDragEnd={isFlowAppt ? (deltas) => handleFlowDragEnd(appointment, deltas) : null}
                        />
                      );
                    })}

                    {/* Drag preview ghosts */}
                    {ghostBlocks.map((block, i) => {
                      const ghostTop    = getMinutesFromShopOpen(block.start) * PIXELS_PER_MINUTE;
                      const ghostHeight = block.end.diff(block.start, 'minutes') * PIXELS_PER_MINUTE;
                      return (
                        <div
                          key={`ghost-${i}`}
                          className="absolute left-0 right-0 border-2 border-dashed border-blue-500 bg-blue-100 bg-opacity-70 rounded pointer-events-none px-1.5 py-0.5 overflow-hidden"
                          style={{ top: `${ghostTop}px`, height: `${Math.max(ghostHeight, 14)}px`, zIndex: 9000 }}
                        >
                          <span className="text-[10px] font-semibold text-blue-700 whitespace-nowrap">
                            {block.isFirst ? '' : '↪ '}{block.start.format('h:mm A')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {/* Spacer between technicians (must mirror the name/time side) */}
            {techIdx < technicianSchedules.length - 1 && (
              <div className="h-2 bg-gray-200 border-b border-gray-300" />
            )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeeklyView;
