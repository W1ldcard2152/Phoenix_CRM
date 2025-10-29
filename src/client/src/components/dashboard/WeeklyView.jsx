import React from 'react';
import moment from 'moment-timezone';
import AppointmentCard from './AppointmentCard';

/**
 * WeeklyView component - Swimming lane calendar showing one week
 * Time axis on left, days as columns, appointments positioned by time
 *
 * Props:
 * - week: Moment object for the week to display
 * - appointments: All appointments for this week
 * - showWeekends: Boolean to show/hide weekend columns
 */
const WeeklyView = ({ week, appointments, showWeekends }) => {
  const SHOP_OPEN_HOUR = 8;
  const SHOP_CLOSE_HOUR = 18;
  const PIXELS_PER_HOUR = 60; // Height in pixels for each hour
  const PIXELS_PER_MINUTE = PIXELS_PER_HOUR / 60;

  /**
   * Get array of days to display
   */
  const getDays = () => {
    const days = [];
    const startDay = showWeekends ? 0 : 1; // 0 = Sunday, 1 = Monday
    const endDay = showWeekends ? 6 : 5;   // 6 = Saturday, 5 = Friday

    for (let i = startDay; i <= endDay; i++) {
      days.push(week.clone().day(i));
    }
    return days;
  };

  /**
   * Calculate minutes from shop open (8am) for a given time
   */
  const getMinutesFromShopOpen = (dateTime) => {
    const time = moment.utc(dateTime).tz('America/New_York');
    const hour = time.hour();
    const minute = time.minute();
    return (hour - SHOP_OPEN_HOUR) * 60 + minute;
  };

  /**
   * Get duration in minutes
   */
  const getDurationMinutes = (startTime, endTime) => {
    const start = moment.utc(startTime).tz('America/New_York');
    const end = moment.utc(endTime).tz('America/New_York');
    return end.diff(start, 'minutes');
  };

  /**
   * Process appointments for a specific day and technician
   * Handles multi-day appointments by clipping to shop hours
   */
  const getAppointmentsForDayAndTech = (day, technicianId) => {
    const dayStart = day.clone().startOf('day');
    const dayEnd = day.clone().endOf('day');
    const dayFormatted = day.format('YYYY-MM-DD');

    return appointments
      .map(appointment => {
        const apptStart = moment.utc(appointment.startTime).tz('America/New_York');
        const apptEnd = moment.utc(appointment.endTime).tz('America/New_York');
        const apptStartDay = apptStart.format('YYYY-MM-DD');
        const apptEndDay = apptEnd.format('YYYY-MM-DD');

        const matchesTech = appointment.technician && appointment.technician._id === technicianId;

        // Check if appointment is on this day
        if (matchesTech && apptStart.isBefore(dayEnd) && apptEnd.isAfter(dayStart)) {
          // Determine if this is a multi-day appointment
          const isMultiDay = apptStartDay !== apptEndDay;

          let blockStart, blockEnd;

          if (isMultiDay) {
            // For multi-day appointments, clip to shop hours for this specific day
            const isStartDay = dayFormatted === apptStartDay;
            const isEndDay = dayFormatted === apptEndDay;

            if (isStartDay) {
              // First day: show from start time to 6pm
              blockStart = apptStart;
              blockEnd = day.clone().hour(SHOP_CLOSE_HOUR).minute(0);
            } else if (isEndDay) {
              // Last day: show from 8am to end time
              blockStart = day.clone().hour(SHOP_OPEN_HOUR).minute(0);
              blockEnd = apptEnd;
            } else {
              // Middle day (or weekend day that's being shown): show full day (8am to 6pm)
              // This handles cases where appointment spans multiple days with weekends in between
              blockStart = day.clone().hour(SHOP_OPEN_HOUR).minute(0);
              blockEnd = day.clone().hour(SHOP_CLOSE_HOUR).minute(0);
            }
          } else {
            // Single-day appointment
            blockStart = apptStart;
            blockEnd = apptEnd;
          }

          // Calculate positioning
          const startMinutes = getMinutesFromShopOpen(blockStart);
          const durationMinutes = getDurationMinutes(blockStart, blockEnd);

          // Only render if within shop hours and has positive duration
          const totalShopMinutes = (SHOP_CLOSE_HOUR - SHOP_OPEN_HOUR) * 60;
          if (startMinutes >= 0 && startMinutes < totalShopMinutes && durationMinutes > 0) {
            return {
              ...appointment,
              blockStart,
              blockEnd,
              startMinutes,
              durationMinutes
            };
          }
        }

        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.startMinutes - b.startMinutes);
  };

  /**
   * Group appointments by technician
   */
  const getTechnicianSchedules = () => {
    const techMap = new Map();

    appointments.forEach(appointment => {
      if (appointment.technician && appointment.technician._id) {
        const techId = appointment.technician._id;

        if (!techMap.has(techId)) {
          techMap.set(techId, {
            technician: appointment.technician,
            appointments: []
          });
        }

        techMap.get(techId).appointments.push(appointment);
      }
    });

    // Convert to array and sort by name
    const schedules = Array.from(techMap.values());
    schedules.sort((a, b) => {
      const nameA = a.technician.name || '';
      const nameB = b.technician.name || '';
      return nameA.localeCompare(nameB);
    });

    return schedules;
  };

  /**
   * Generate time slots for the vertical axis
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
   * Detect overlapping appointments and assign horizontal lanes
   */
  const layoutAppointments = (appointments) => {
    const sorted = [...appointments].sort((a, b) => a.startMinutes - b.startMinutes);
    const positioned = [];
    const lanes = []; // Track end times of appointments in each lane

    sorted.forEach(appointment => {
      const endMinutes = appointment.startMinutes + appointment.durationMinutes;

      // Find the first lane where this appointment fits
      let laneIndex = 0;
      while (laneIndex < lanes.length && lanes[laneIndex] > appointment.startMinutes) {
        laneIndex++;
      }

      // Assign to this lane
      if (laneIndex === lanes.length) {
        lanes.push(endMinutes);
      } else {
        lanes[laneIndex] = endMinutes;
      }

      positioned.push({
        ...appointment,
        laneIndex,
        totalLanes: lanes.length
      });
    });

    // Update totalLanes for all appointments
    const maxLanes = lanes.length;
    positioned.forEach(appt => {
      appt.totalLanes = maxLanes;
    });

    return positioned;
  };

  const days = getDays();
  const technicianSchedules = getTechnicianSchedules();
  const today = moment().format('YYYY-MM-DD');
  const timeSlots = getTimeSlots();
  const totalHeight = (SHOP_CLOSE_HOUR - SHOP_OPEN_HOUR) * PIXELS_PER_HOUR;

  return (
    <div className="overflow-x-auto border border-gray-300 rounded-lg">
      <div className="min-w-max flex">
        {/* Left Side - Technician and Time */}
        <div className="flex-shrink-0">
          {/* Column headers - same height as day headers */}
          <div className="flex h-16 border-b-2 border-gray-300">
            <div className="w-32 border-r border-gray-300 bg-gray-50 px-3 py-2 flex items-center">
              <div className="text-sm font-bold text-gray-700">Technician</div>
            </div>
            <div className="w-20 border-r-2 border-gray-300 bg-gray-50 px-2 py-2 flex items-center">
              <div className="text-xs font-bold text-gray-700">Time</div>
            </div>
          </div>

          {/* Technician rows */}
          {technicianSchedules.map(({ technician }, techIndex) => (
            <div key={technician._id} className="flex border-b border-gray-200">
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
                {timeSlots.map((slot, idx) => {
                  const topPos = ((slot.hour - SHOP_OPEN_HOUR) * 60 + slot.minute) * PIXELS_PER_MINUTE;

                  // Position labels differently based on which hour
                  let labelTop;
                  if (slot.isHourMark) {
                    if (slot.hour === SHOP_OPEN_HOUR) {
                      // 8:00 AM - 2px padding from top border
                      labelTop = topPos + 2;
                    } else if (slot.hour === SHOP_CLOSE_HOUR) {
                      // 6:00 PM - position well above bottom to avoid next tech row
                      labelTop = topPos - 23;
                    } else {
                      // 9:00 AM - 5:00 PM - center on gridline (half text height)
                      labelTop = topPos - 6;
                    }
                  }

                  return (
                    <React.Fragment key={`${slot.hour}-${slot.minute}`}>
                      {/* Time label */}
                      {slot.isHourMark && (
                        <div
                          className="absolute left-0 pr-1"
                          style={{
                            top: `${labelTop}px`,
                            lineHeight: '1'
                          }}
                        >
                          <span className="text-xs font-medium text-gray-700 pl-1">
                            {slot.label}
                          </span>
                        </div>
                      )}
                      {/* Grid line - only in right quarter */}
                      <div
                        className={`absolute border-t ${slot.isHourMark ? 'border-gray-400' : 'border-gray-200'}`}
                        style={{
                          top: `${topPos}px`,
                          left: '75%',
                          right: 0
                        }}
                      />
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Day Columns */}
        <div className="flex-1">
          {/* Day Headers */}
          <div className="flex border-b-2 border-gray-300 bg-gray-50 h-16">
            {days.map(day => {
              const isToday = day.format('YYYY-MM-DD') === today;
              return (
                <div
                  key={day.format('YYYY-MM-DD')}
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
                </div>
              );
            })}
          </div>

          {/* Technician Rows */}
          {technicianSchedules.map(({ technician }) => (
            <div key={technician._id} className="flex border-b border-gray-200">
              {/* Day Cells */}
              {days.map(day => {
                const dayAppointments = getAppointmentsForDayAndTech(day, technician._id);
                const positionedAppointments = layoutAppointments(dayAppointments);
                const isToday = day.format('YYYY-MM-DD') === today;

                return (
                  <div
                    key={day.format('YYYY-MM-DD')}
                    className={`flex-1 min-w-[200px] border-r border-gray-200 relative ${
                      isToday ? 'bg-blue-50' : 'bg-white'
                    }`}
                    style={{ height: `${totalHeight}px` }}
                  >
                    {/* Hour grid lines */}
                    {timeSlots.map((slot, idx) => (
                      <div
                        key={`${slot.hour}-${slot.minute}`}
                        className={`absolute left-0 right-0 border-t ${slot.isHourMark ? 'border-gray-300' : 'border-gray-100'}`}
                        style={{
                          top: `${((slot.hour - SHOP_OPEN_HOUR) * 60 + slot.minute) * PIXELS_PER_MINUTE}px`
                        }}
                      />
                    ))}

                    {/* Appointments */}
                    {positionedAppointments.map((appointment, idx) => {
                      const topPosition = appointment.startMinutes * PIXELS_PER_MINUTE;
                      const height = appointment.durationMinutes * PIXELS_PER_MINUTE;
                      const laneWidth = 100 / appointment.totalLanes;
                      const leftPosition = appointment.laneIndex * laneWidth;

                      return (
                        <AppointmentCard
                          key={`${appointment._id}-${idx}`}
                          appointment={appointment}
                          viewType="weekly"
                          style={{
                            position: 'absolute',
                            top: `${topPosition}px`,
                            left: `${leftPosition}%`,
                            width: `${laneWidth}%`,
                            height: `${Math.max(height, 30)}px`,
                            paddingLeft: '2px',
                            paddingRight: '2px',
                            zIndex: 10
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeeklyView;
