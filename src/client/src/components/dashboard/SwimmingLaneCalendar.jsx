import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';
import AppointmentService from '../../services/appointmentService';
import ScheduleBlockService from '../../services/scheduleBlockService';
import DailyView from './DailyView';
import WeeklyView from './WeeklyView';
import Card from '../common/Card';
import { TIMEZONE } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { applyScheduleBlockVisibility, isAdminOrManagement } from '../../utils/permissions';

/**
 * SwimmingLaneCalendar component - Main calendar with daily/weekly toggle
 * Swimming lane style calendar for shop scheduling
 *
 * @param {boolean} embedded - If true, renders without Card wrapper for embedding in other components
 * @param {boolean} compact - If true, hides the legend for a more compact view
 * @param {string} initialDate - Optional initial date to display (YYYY-MM-DD format)
 */
const SwimmingLaneCalendar = ({ embedded = false, compact = false, initialDate = null }) => {
  const [appointments, setAppointments] = useState([]);
  const [currentDate, setCurrentDate] = useState(initialDate ? moment(initialDate) : moment());
  const [viewType, setViewType] = useState('weekly'); // 'daily' or 'weekly'
  const [showWeekends, setShowWeekends] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // Fetch appointments based on current view
  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setLoading(true);
        setError(null);

        let startDate, endDate;

        if (viewType === 'daily') {
          // Fetch appointments for the current day
          // Look back 7 days to catch multi-day appointments that started earlier
          startDate = currentDate.clone().subtract(7, 'days').format('YYYY-MM-DD');
          endDate = currentDate.clone().endOf('day').format('YYYY-MM-DD');
        } else {
          // Fetch appointments for the current week
          // Look back 7 days to catch multi-day appointments that started in the previous week
          startDate = currentDate.clone().startOf('week').subtract(7, 'days').format('YYYY-MM-DD');
          endDate = currentDate.clone().endOf('week').format('YYYY-MM-DD');
        }

        // Fetch appointments and schedule blocks in parallel
        const [appointmentResponse, blockResponse] = await Promise.all([
          AppointmentService.getAppointmentsByDateRange(startDate, endDate),
          ScheduleBlockService.getExpanded(startDate, endDate).catch(err => {
            console.error('Error fetching schedule blocks:', err);
            return { data: { scheduleBlocks: [] } };
          })
        ]);

        if (appointmentResponse && appointmentResponse.data) {
          const fetchedAppointments = appointmentResponse.data.appointments || [];
          const expandedBlocks = blockResponse?.data?.scheduleBlocks || [];

          // Apply role-based visibility to schedule blocks
          const visibleBlocks = expandedBlocks.map(block =>
            applyScheduleBlockVisibility(block, user)
          );

          // Merge appointments and schedule blocks into one array
          const allEvents = [...fetchedAppointments, ...visibleBlocks];

          setAppointments(allEvents);

          // Check if we need to show weekends (weekly view only)
          if (viewType === 'weekly') {
            const hasWeekendAppointments = allEvents.some(event => {
              const day = moment.utc(event.startTime).tz(TIMEZONE).day();
              return day === 0 || day === 6;
            });
            setShowWeekends(hasWeekendAppointments);
          }
        }
      } catch (err) {
        console.error('Error fetching appointments:', err);
        setError('Failed to load appointments. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchAppointments();
  }, [currentDate, viewType]);

  /**
   * Handle appointment time reschedule from drag-and-drop.
   * Optimistically updates local state, then persists to backend.
   * Rolls back on API failure.
   */
  const handleAppointmentReschedule = async (eventId, deltaMinutes, dayDelta = 0) => {
    const event = appointments.find(a => a._id === eventId);
    if (!event) return;

    // Calculate new times (day shift + time shift)
    const newStart = moment.utc(event.startTime).add(dayDelta, 'days').add(deltaMinutes, 'minutes');
    const newEnd = moment.utc(event.endTime).add(dayDelta, 'days').add(deltaMinutes, 'minutes');

    // Optimistic update
    const previousAppointments = [...appointments];
    setAppointments(prev => prev.map(a =>
      a._id === eventId
        ? { ...a, startTime: newStart.toISOString(), endTime: newEnd.toISOString() }
        : a
    ));

    try {
      if (event.isScheduleBlock) {
        // Schedule block: update via schedule block API
        const newStartET = newStart.tz(TIMEZONE);
        const newEndET = newEnd.tz(TIMEZONE);
        const newTimeStart = newStartET.format('HH:mm');
        const newTimeEnd = newEndET.format('HH:mm');

        if (event.blockType === 'recurring') {
          // Recurring: add a modify exception for this specific date
          const originalDate = moment.utc(event.startTime).tz(TIMEZONE).format('YYYY-MM-DD');
          await ScheduleBlockService.addException(event.scheduleBlockId, {
            date: originalDate,
            action: 'modify',
            startTime: newTimeStart,
            endTime: newTimeEnd
          });
        } else {
          // One-time: update the block directly
          const updateData = {
            oneTimeStartTime: newTimeStart,
            oneTimeEndTime: newTimeEnd
          };
          if (dayDelta !== 0) {
            updateData.oneTimeDate = newStartET.format('YYYY-MM-DD');
          }
          await ScheduleBlockService.update(event.scheduleBlockId, updateData);
        }
      } else {
        // Regular appointment
        const newStartLocal = newStart.tz(TIMEZONE).format('YYYY-MM-DDTHH:mm:ss');
        const newEndLocal = newEnd.tz(TIMEZONE).format('YYYY-MM-DDTHH:mm:ss');
        await AppointmentService.updateAppointment(eventId, {
          startTime: newStartLocal,
          endTime: newEndLocal
        });
      }

      // If dragged to a weekend while in 5-day mode, expand to 7-day
      if (!showWeekends && viewType === 'weekly') {
        const newDay = newStart.tz(TIMEZONE).day();
        if (newDay === 0 || newDay === 6) {
          setShowWeekends(true);
        }
      }
    } catch (err) {
      console.error('Failed to reschedule:', err);
      setAppointments(previousAppointments);
      setError('Failed to reschedule. Changes have been reverted.');
      setTimeout(() => setError(null), 5000);
    }
  };

  /**
   * Navigate to previous period (day or week)
   */
  const goToPrevious = () => {
    if (viewType === 'daily') {
      setCurrentDate(currentDate.clone().subtract(1, 'day'));
    } else {
      setCurrentDate(currentDate.clone().subtract(1, 'week'));
    }
  };

  /**
   * Navigate to next period (day or week)
   */
  const goToNext = () => {
    if (viewType === 'daily') {
      setCurrentDate(currentDate.clone().add(1, 'day'));
    } else {
      setCurrentDate(currentDate.clone().add(1, 'week'));
    }
  };

  /**
   * Navigate to today
   */
  const goToToday = () => {
    setCurrentDate(moment());
  };

  /**
   * Toggle between daily and weekly view
   */
  const switchView = (newView) => {
    setViewType(newView);
  };

  /**
   * Get display text for current period
   */
  const getPeriodDisplay = () => {
    if (viewType === 'daily') {
      return currentDate.format('dddd, MMMM D, YYYY');
    } else {
      const weekStart = currentDate.clone().startOf('week');
      const weekEnd = currentDate.clone().endOf('week');
      return `${weekStart.format('MMM D')} - ${weekEnd.format('MMM D, YYYY')}`;
    }
  };

  const calendarContent = (
    <>
      {/* Header with controls */}
      <div className={`flex flex-wrap items-center justify-between gap-4 ${embedded ? 'mb-4' : ''}`}>
        {/* View Toggle - Segmented Control */}
        <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-0.5">
          <button
            onClick={() => switchView('daily')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewType === 'daily'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => switchView('weekly')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewType === 'weekly'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            Weekly
          </button>
        </div>

        {/* Period Display */}
        <h2 className="text-lg font-semibold text-gray-800">
          {getPeriodDisplay()}
        </h2>

        {/* Navigation Controls */}
        <div className="flex gap-2">
          <button
            onClick={goToPrevious}
            className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition-colors"
            title={viewType === 'daily' ? 'Previous Day' : 'Previous Week'}
          >
            ← Prev
          </button>
          <button
            onClick={goToToday}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
          >
            Today
          </button>
          <button
            onClick={goToNext}
            className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition-colors"
            title={viewType === 'daily' ? 'Next Day' : 'Next Week'}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading schedule...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800 mb-4">
          {error}
        </div>
      )}

      {/* Calendar Views */}
      {!loading && !error && (
        <>
          {viewType === 'daily' ? (
            <DailyView date={currentDate} appointments={appointments} onAppointmentReschedule={handleAppointmentReschedule} />
          ) : (
            <WeeklyView week={currentDate} appointments={appointments} showWeekends={showWeekends} onAppointmentReschedule={handleAppointmentReschedule} />
          )}
        </>
      )}

      {/* Color Legend - hide in compact mode */}
      {!compact && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="text-xs font-semibold text-gray-700 mb-2">Status Legend:</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
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
            {isAdminOrManagement(user) ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-indigo-200 border border-indigo-400 rounded"></div>
                <span>Task</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-300 border border-gray-400 rounded"></div>
                <span>Unavailable</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  // If embedded, return content without Card wrapper
  if (embedded) {
    return <div className="bg-white border border-gray-200 rounded-lg p-4">{calendarContent}</div>;
  }

  // Default: wrap in Card
  return (
    <Card title="Shop Schedule">
      {calendarContent}
    </Card>
  );
};

export default SwimmingLaneCalendar;
