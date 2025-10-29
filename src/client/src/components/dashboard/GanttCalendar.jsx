import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';
import AppointmentService from '../../services/appointmentService';
import TimeAxis from './TimeAxis';
import TechnicianRow from './TechnicianRow';
import Card from '../common/Card';

/**
 * GanttCalendar component - Gantt-style resource calendar for shop scheduling
 * Shows technicians as rows and days as columns with time-blocked appointments
 */
const GanttCalendar = () => {
  const [appointments, setAppointments] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(moment());
  const [showWeekends, setShowWeekends] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch appointments for the current week
  useEffect(() => {
    const fetchWeekAppointments = async () => {
      try {
        setLoading(true);
        setError(null);

        const startDate = currentWeek.clone().startOf('week').format('YYYY-MM-DD');
        const endDate = currentWeek.clone().endOf('week').format('YYYY-MM-DD');

        const response = await AppointmentService.getAppointmentsByDateRange(startDate, endDate);

        if (response && response.data) {
          // Get appointments array from response
          const weekAppointments = response.data.appointments || [];

          // Filter out appointments for invoiced work orders
          const filteredAppointments = weekAppointments.filter(
            appointment => appointment.workOrderStatus !== 'Invoiced'
          );
          setAppointments(filteredAppointments);

          // Check if we need to show weekends
          const hasWeekendAppointments = filteredAppointments.some(appointment => {
            const day = moment.utc(appointment.startTime).tz('America/New_York').day();
            return day === 0 || day === 6; // Sunday = 0, Saturday = 6
          });
          setShowWeekends(hasWeekendAppointments);
        }
      } catch (err) {
        console.error('Error fetching appointments:', err);
        setError('Failed to load appointments. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchWeekAppointments();
  }, [currentWeek]);

  /**
   * Navigate to previous week
   */
  const goToPreviousWeek = () => {
    setCurrentWeek(currentWeek.clone().subtract(1, 'week'));
  };

  /**
   * Navigate to next week
   */
  const goToNextWeek = () => {
    setCurrentWeek(currentWeek.clone().add(1, 'week'));
  };

  /**
   * Navigate to current week
   */
  const goToToday = () => {
    setCurrentWeek(moment());
  };

  /**
   * Get array of days to display based on showWeekends flag
   */
  const getDays = () => {
    const days = [];
    const startDay = showWeekends ? 0 : 1; // 0 = Sunday, 1 = Monday
    const endDay = showWeekends ? 6 : 5;   // 6 = Saturday, 5 = Friday

    for (let i = startDay; i <= endDay; i++) {
      days.push(currentWeek.clone().day(i));
    }
    return days;
  };

  /**
   * Group appointments by technician and sort technicians alphabetically
   * Only include technicians who have appointments in the current week
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

    // Convert to array and sort by last name
    const schedules = Array.from(techMap.values());
    schedules.sort((a, b) => {
      const lastNameA = a.technician.lastName || '';
      const lastNameB = b.technician.lastName || '';
      return lastNameA.localeCompare(lastNameB);
    });

    return schedules;
  };

  const days = getDays();
  const technicianSchedules = getTechnicianSchedules();
  const weekStart = currentWeek.clone().startOf('week');
  const weekEnd = currentWeek.clone().endOf('week');

  return (
    <Card
      title="Shop Schedule"
      headerContent={
        <div className="flex gap-2">
          <button
            onClick={goToPreviousWeek}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition-colors"
          >
            ← Previous
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
          >
            Today
          </button>
          <button
            onClick={goToNextWeek}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition-colors"
          >
            Next →
          </button>
        </div>
      }
    >
      {/* Week Range Display */}
      <div className="text-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          {weekStart.format('MMM D')} - {weekEnd.format('MMM D, YYYY')}
        </h2>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading schedule...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800">
          {error}
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <div className="flex min-w-max">
            {/* Time Axis */}
            <TimeAxis />

            {/* Technician Name Column Header + Day Columns */}
            <div className="flex-1 flex flex-col">
              {/* Day Headers */}
              <div className="flex border-b border-gray-300">
                {/* Spacer for technician name column */}
                <div className="flex-shrink-0 w-40 border-r border-gray-300 bg-gray-100 px-3 py-2">
                  <div className="text-sm font-bold text-gray-700">Technician</div>
                </div>

                {/* Day Header Cells */}
                <div className="flex flex-1">
                  {days.map(day => {
                    const isToday = day.format('YYYY-MM-DD') === moment().format('YYYY-MM-DD');
                    return (
                      <div
                        key={day.format('YYYY-MM-DD')}
                        className={`flex-1 border-r border-gray-300 px-3 py-2 text-center ${
                          isToday ? 'bg-blue-100' : 'bg-gray-100'
                        }`}
                      >
                        <div className="text-xs font-medium text-gray-600 uppercase">
                          {day.format('ddd')}
                        </div>
                        <div className={`text-lg font-semibold ${isToday ? 'text-blue-700' : 'text-gray-800'}`}>
                          {day.format('D')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Technician Rows */}
              {technicianSchedules.length > 0 ? (
                technicianSchedules.map(({ technician, appointments: techAppointments }) => (
                  <TechnicianRow
                    key={technician._id}
                    technician={technician}
                    days={days}
                    appointments={techAppointments}
                  />
                ))
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No appointments scheduled this week.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Color Legend */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="text-xs font-semibold text-gray-700 mb-2">Status Legend:</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-200 border border-blue-400 rounded"></div>
            <span>Service Writer Action</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-200 border border-yellow-400 rounded"></div>
            <span>Technician Action</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-200 border border-green-400 rounded"></div>
            <span>Waiting/Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-300 border border-gray-400 rounded"></div>
            <span>On Hold/Cancelled</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default GanttCalendar;
