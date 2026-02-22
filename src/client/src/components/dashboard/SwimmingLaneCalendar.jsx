import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';
import AppointmentService from '../../services/appointmentService';
import DailyView from './DailyView';
import WeeklyView from './WeeklyView';
import Card from '../common/Card';

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

        const response = await AppointmentService.getAppointmentsByDateRange(startDate, endDate);

        if (response && response.data) {
          const fetchedAppointments = response.data.appointments || [];

          // Show all appointments regardless of work order status
          setAppointments(fetchedAppointments);

          // Check if we need to show weekends (weekly view only)
          if (viewType === 'weekly') {
            const hasWeekendAppointments = fetchedAppointments.some(appointment => {
              const day = moment.utc(appointment.startTime).tz('America/New_York').day();
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
            <DailyView date={currentDate} appointments={appointments} />
          ) : (
            <WeeklyView week={currentDate} appointments={appointments} showWeekends={showWeekends} />
          )}
        </>
      )}

      {/* Color Legend - hide in compact mode */}
      {!compact && (
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
