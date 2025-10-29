import React from 'react';
import moment from 'moment-timezone';
import AppointmentBlock from './AppointmentBlock';
import { SHOP_OPEN_HOUR, SHOP_CLOSE_HOUR, PIXELS_PER_HOUR } from './TimeAxis';

/**
 * TechnicianRow component - Displays one technician's schedule across all days
 *
 * Props:
 * - technician: Technician object with firstName, lastName
 * - days: Array of moment objects representing the days to display
 * - appointments: All appointments for this technician in the current week
 */
const TechnicianRow = ({ technician, days, appointments }) => {
  // Total height for the row (8am to 6pm = 10 hours)
  const totalHours = SHOP_CLOSE_HOUR - SHOP_OPEN_HOUR;
  const rowHeight = totalHours * PIXELS_PER_HOUR;

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
   * Get duration in minutes between start and end time
   */
  const getDurationMinutes = (startTime, endTime) => {
    const start = moment.utc(startTime).tz('America/New_York');
    const end = moment.utc(endTime).tz('America/New_York');
    return end.diff(start, 'minutes');
  };

  /**
   * Process appointments for a specific day
   * Handles multi-day appointments by splitting them appropriately
   */
  const getAppointmentsForDay = (day) => {
    const dayStart = day.clone().startOf('day');
    const dayEnd = day.clone().endOf('day');
    const dayFormatted = day.format('YYYY-MM-DD');

    return appointments
      .map(appointment => {
        const apptStart = moment.utc(appointment.startTime).tz('America/New_York');
        const apptEnd = moment.utc(appointment.endTime).tz('America/New_York');
        const apptStartDay = apptStart.format('YYYY-MM-DD');
        const apptEndDay = apptEnd.format('YYYY-MM-DD');

        // Check if appointment is on this day
        if (apptStart.isBefore(dayEnd) && apptEnd.isAfter(dayStart)) {
          // Determine if this is a multi-day appointment
          const isMultiDay = apptStartDay !== apptEndDay;

          let blockStart, blockEnd, isPartial;

          if (isMultiDay) {
            // For multi-day appointments, show partial blocks
            if (dayFormatted === apptStartDay) {
              // First day: show from start time to 6pm
              blockStart = apptStart;
              blockEnd = day.clone().hour(SHOP_CLOSE_HOUR).minute(0);
              isPartial = 'start';
            } else if (dayFormatted === apptEndDay) {
              // Last day: show from 8am to end time
              blockStart = day.clone().hour(SHOP_OPEN_HOUR).minute(0);
              blockEnd = apptEnd;
              isPartial = 'end';
            } else {
              // Middle day: show full day (8am to 6pm)
              blockStart = day.clone().hour(SHOP_OPEN_HOUR).minute(0);
              blockEnd = day.clone().hour(SHOP_CLOSE_HOUR).minute(0);
              isPartial = 'middle';
            }
          } else {
            // Single-day appointment
            blockStart = apptStart;
            blockEnd = apptEnd;
            isPartial = false;
          }

          // Calculate positioning
          const startMinutes = getMinutesFromShopOpen(blockStart);
          const durationMinutes = getDurationMinutes(blockStart, blockEnd);

          // Only render if within shop hours
          if (startMinutes >= 0 && startMinutes < totalHours * 60) {
            return {
              ...appointment,
              blockStart,
              blockEnd,
              startMinutes,
              durationMinutes,
              isPartial
            };
          }
        }

        return null;
      })
      .filter(Boolean);
  };

  return (
    <div className="flex border-b border-gray-300">
      {/* Technician Name Header */}
      <div className="flex-shrink-0 w-40 border-r border-gray-300 bg-gray-50 px-3 py-2 flex items-center">
        <div className="text-sm font-semibold text-gray-800">
          {technician.lastName}, {technician.firstName}
        </div>
      </div>

      {/* Day Columns */}
      <div className="flex flex-1">
        {days.map((day, dayIndex) => {
          const dayAppointments = getAppointmentsForDay(day);
          const isToday = day.format('YYYY-MM-DD') === moment().format('YYYY-MM-DD');

          return (
            <div
              key={day.format('YYYY-MM-DD')}
              className={`flex-1 border-r border-gray-200 relative ${
                isToday ? 'bg-blue-50' : 'bg-white'
              }`}
              style={{ height: `${rowHeight}px` }}
            >
              {/* Appointment Blocks */}
              {dayAppointments.map((appointment, idx) => (
                <AppointmentBlock
                  key={`${appointment._id}-${dayIndex}-${idx}`}
                  appointment={appointment}
                  startMinutes={appointment.startMinutes}
                  durationMinutes={appointment.durationMinutes}
                  isPartial={appointment.isPartial}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TechnicianRow;
