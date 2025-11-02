import React from 'react';
import moment from 'moment-timezone';
import HorizontalTimeAxis, { SHOP_OPEN_HOUR, SHOP_CLOSE_HOUR, PIXELS_PER_MINUTE } from './HorizontalTimeAxis';
import AppointmentCard from './AppointmentCard';

/**
 * DailyView component - Swimming lane calendar showing one day
 * Horizontal time axis with technicians as rows
 *
 * Props:
 * - date: Moment object for the day to display
 * - appointments: All appointments for this day
 */
const DailyView = ({ date, appointments }) => {
  const ROW_HEIGHT = 80; // Height of each technician row

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
   * Get appointments for this specific date
   * Includes multi-day appointments that overlap with this day
   * Clips multi-day appointments to shop hours for this specific day
   */
  const getDayAppointments = () => {
    const dayStart = date.clone().startOf('day');
    const dayEnd = date.clone().endOf('day');
    const dayFormatted = date.format('YYYY-MM-DD');

    return appointments
      .filter(appointment => {
        const apptStart = moment.utc(appointment.startTime).tz('America/New_York');
        const apptEnd = moment.utc(appointment.endTime).tz('America/New_York');
        // Check if appointment overlaps with this day
        return apptStart.isBefore(dayEnd) && apptEnd.isAfter(dayStart);
      })
      .map(appointment => {
        const apptStart = moment.utc(appointment.startTime).tz('America/New_York');
        const apptEnd = moment.utc(appointment.endTime).tz('America/New_York');
        const apptStartDay = apptStart.format('YYYY-MM-DD');
        const apptEndDay = apptEnd.format('YYYY-MM-DD');

        // Check if this is a multi-day appointment
        const isMultiDay = apptStartDay !== apptEndDay;

        if (isMultiDay) {
          // Clip to shop hours for this specific day
          const isStartDay = dayFormatted === apptStartDay;
          const isEndDay = dayFormatted === apptEndDay;

          let displayStart, displayEnd;

          if (isStartDay) {
            // First day: show from start time to 6pm
            displayStart = apptStart;
            displayEnd = date.clone().tz('America/New_York').hour(SHOP_CLOSE_HOUR).minute(0);
          } else if (isEndDay) {
            // Last day: show from 8am to end time
            displayStart = date.clone().tz('America/New_York').hour(SHOP_OPEN_HOUR).minute(0);
            displayEnd = apptEnd;
          } else {
            // Middle day: show full shop hours (8am to 6pm)
            displayStart = date.clone().tz('America/New_York').hour(SHOP_OPEN_HOUR).minute(0);
            displayEnd = date.clone().tz('America/New_York').hour(SHOP_CLOSE_HOUR).minute(0);
          }

          return {
            ...appointment,
            startTime: displayStart.toISOString(),
            endTime: displayEnd.toISOString()
          };
        }

        // Single-day appointment - return as-is
        return appointment;
      });
  };

  /**
   * Group appointments by technician
   * Only include technicians with appointments on this specific day
   */
  const getTechnicianSchedules = () => {
    const dayAppointments = getDayAppointments();
    const techMap = new Map();

    // Only build technician list from appointments that are actually on this day
    dayAppointments.forEach(appointment => {
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
   * Detect overlapping appointments and assign row positions
   * Returns appointments with positioning data
   */
  const layoutAppointments = (appointments) => {
    // Sort by start time
    const sorted = [...appointments].sort((a, b) => {
      return moment.utc(a.startTime).diff(moment.utc(b.startTime));
    });

    const positioned = [];
    const lanes = []; // Track end times of appointments in each lane

    sorted.forEach(appointment => {
      const start = moment.utc(appointment.startTime).tz('America/New_York');
      const end = moment.utc(appointment.endTime).tz('America/New_York');

      // Find the first lane where this appointment fits
      let laneIndex = 0;
      while (laneIndex < lanes.length && lanes[laneIndex].isAfter(start)) {
        laneIndex++;
      }

      // Assign to this lane
      if (laneIndex === lanes.length) {
        lanes.push(end);
      } else {
        lanes[laneIndex] = end;
      }

      // Calculate positioning
      const startMinutes = getMinutesFromShopOpen(start);
      const durationMinutes = getDurationMinutes(start, end);
      const leftPosition = startMinutes * PIXELS_PER_MINUTE;
      const width = durationMinutes * PIXELS_PER_MINUTE;

      positioned.push({
        appointment,
        laneIndex,
        leftPosition,
        width
      });
    });

    return positioned;
  };

  const technicianSchedules = getTechnicianSchedules();

  return (
    <div className="overflow-x-auto border border-gray-300 rounded-lg">
      <div className="min-w-max">
        {/* Time Axis */}
        <HorizontalTimeAxis />

        {/* Technician Rows */}
        {technicianSchedules.length > 0 ? (
          technicianSchedules.map(({ technician, appointments: techAppointments }) => {
            const positionedAppointments = layoutAppointments(techAppointments);
            const totalLanes = Math.max(...positionedAppointments.map(a => a.laneIndex + 1), 1);
            const rowHeight = Math.max(ROW_HEIGHT, totalLanes * 60); // Dynamic height based on lanes

            return (
              <div key={technician._id} className="flex border-b border-gray-200">
                {/* Technician Name */}
                <div
                  className="flex-shrink-0 w-40 border-r border-gray-300 bg-gray-50 px-3 py-2 flex items-center"
                  style={{ minHeight: `${rowHeight}px` }}
                >
                  <div className="text-sm font-semibold text-gray-800">
                    {technician.name || 'Unassigned'}
                  </div>
                </div>

                {/* Appointment Lane */}
                <div
                  className="flex-1 relative bg-white"
                  style={{ minHeight: `${rowHeight}px` }}
                >
                  {/* Hour dividers */}
                  {Array.from({ length: SHOP_CLOSE_HOUR - SHOP_OPEN_HOUR + 1 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-r border-gray-200"
                      style={{ left: `${i * 120}px`, width: '120px' }}
                    />
                  ))}

                  {/* Appointments */}
                  {positionedAppointments.map(({ appointment, laneIndex, leftPosition, width }, idx) => (
                    <AppointmentCard
                      key={`${appointment._id}-${idx}`}
                      appointment={appointment}
                      viewType="daily"
                      style={{
                        position: 'absolute',
                        left: `${leftPosition}px`,
                        top: `${laneIndex * 56 + 8}px`,
                        width: `${Math.max(width, 80)}px`, // Minimum width for readability
                        height: '48px',
                        zIndex: 10
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-gray-500">
            No appointments scheduled for this day.
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyView;
