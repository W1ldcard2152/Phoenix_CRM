// src/client/src/components/Dashboard/AppointmentCalendar.jsx - Fixed dependency issue
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import Card from '../common/Card';
import Button from '../common/Button';
import AppointmentService from '../../services/appointmentService';
import { formatDateTimeToET } from '../../utils/formatters';

const AppointmentCalendar = () => {
  const [appointments, setAppointments] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(moment());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showWeekends, setShowWeekends] = useState(false);
  const navigate = useNavigate();

  // Make sure currentWeek is included in the dependency array
  useEffect(() => {
    fetchWeekAppointments();
  }, [currentWeek, fetchWeekAppointments]); // currentWeek is now properly included as a dependency

  const fetchWeekAppointments = async () => {
    try {
      setLoading(true);
      const startDate = currentWeek.clone().startOf('week').format('YYYY-MM-DD');
      const endDate = currentWeek.clone().endOf('week').format('YYYY-MM-DD');
      
      const response = await AppointmentService.getAppointmentsByDateRange(startDate, endDate);
      const weekAppointments = response.data.appointments || [];
      setAppointments(weekAppointments);
      
      // Check if there are any weekend appointments
      const hasWeekendAppointments = weekAppointments.some(appointment => {
        const day = moment(appointment.startTime).day();
        return day === 0 || day === 6; // Sunday = 0, Saturday = 6
      });
      
      setShowWeekends(hasWeekendAppointments);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError('Failed to load appointments');
      setLoading(false);
    }
  };

  const navigateToPreviousWeek = () => {
    setCurrentWeek(currentWeek.clone().subtract(1, 'week'));
  };

  const navigateToNextWeek = () => {
    setCurrentWeek(currentWeek.clone().add(1, 'week'));
  };

  const navigateToCurrentWeek = () => {
    setCurrentWeek(moment());
  };

  const handleAppointmentClick = (appointmentId) => {
    navigate(`/appointments/${appointmentId}`);
  };

  // Generate array of days for the calendar
  const getDays = () => {
    const days = [];
    const startDay = showWeekends ? 0 : 1; // 0 = Sunday, 1 = Monday
    const endDay = showWeekends ? 6 : 5;   // 6 = Saturday, 5 = Friday
    
    for (let i = startDay; i <= endDay; i++) {
      days.push(currentWeek.clone().day(i));
    }
    return days;
  };

  // Filter appointments for a specific day
  const getAppointmentsForDay = (day) => {
    return appointments
      .filter(appointment => {
        // Convert appointment.startTime (UTC) to ET for date comparison
        const appointmentDateET = moment.utc(appointment.startTime).tz('America/New_York').format('YYYY-MM-DD');
        // Filter out appointments linked to "Invoiced" work orders
        return appointmentDateET === day.format('YYYY-MM-DD') && appointment.workOrder?.status !== 'Invoiced';
      })
      .sort((a, b) => moment.utc(a.startTime).valueOf() - moment.utc(b.startTime).valueOf());
  };

  // Format time for display (now uses formatDateTimeToET)
  const formatTime = (dateTimeString) => {
    return formatDateTimeToET(dateTimeString, 'h:mm A');
  };

  // Get a consistent display class for the technician name
  const getTechnicianDisplayClass = () => {
    return 'bg-indigo-100 text-indigo-800'; // Consistent style for technician
  };

  if (loading && appointments.length === 0) {
    return (
      <Card title="Calendar">
        <div className="flex justify-center items-center h-64">
          <p>Loading calendar...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Calendar">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      </Card>
    );
  }

  const days = getDays();

  return (
    <Card 
      title={`Appointments: ${currentWeek.format('MMMM D')} - ${currentWeek.clone().endOf(showWeekends ? 'week' : 'week').subtract(showWeekends ? 0 : 2, 'days').format('MMMM D, YYYY')}`}
      headerActions={
        <div className="flex space-x-2">
          <Button onClick={navigateToPreviousWeek} variant="outline" size="sm">
            <i className="fas fa-chevron-left mr-1"></i> Prev
          </Button>
          <Button onClick={navigateToCurrentWeek} variant="outline" size="sm">
            Today
          </Button>
          <Button onClick={navigateToNextWeek} variant="outline" size="sm">
            Next <i className="fas fa-chevron-right ml-1"></i>
          </Button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <div className="grid grid-cols-5 gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(160px, 1fr))` }}>
          {/* Calendar Headers */}
          {days.map((day, idx) => (
            <div key={idx} className="bg-gray-100 p-2 text-center">
              <p className="font-bold">{day.format('ddd')}</p>
              <p className={`text-sm ${day.format('YYYY-MM-DD') === moment().format('YYYY-MM-DD') ? 'font-bold text-primary-600' : ''}`}>
                {day.format('MMM D')}
              </p>
            </div>
          ))}

          {/* Calendar Body */}
          {days.map((day, idx) => {
            const dayAppointments = getAppointmentsForDay(day);
            const isToday = day.format('YYYY-MM-DD') === moment().format('YYYY-MM-DD');
            
            return (
              <div 
                key={`body-${idx}`} 
                className={`min-h-[20rem] border ${isToday ? 'border-primary-500 bg-primary-50' : 'border-gray-200'} p-1`}
              >
                {dayAppointments.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    No appointments
                  </div>
                ) : (
                  <div className="space-y-1">
                    {dayAppointments.map(appointment => (
                      <div 
                        key={appointment._id}
                        onClick={() => handleAppointmentClick(appointment._id)}
                        className="bg-white p-2 rounded border border-gray-200 shadow-sm hover:bg-gray-50 cursor-pointer transition"
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-sm">
                            {formatTime(appointment.startTime)}
                          </span>
                          <span 
                            className={`text-xs px-1.5 py-0.5 rounded-full ${getTechnicianDisplayClass()}`}
                          >
                            {appointment.technician && appointment.technician.name ? appointment.technician.name : 'Unassigned'}
                          </span>
                        </div>
                        
                        <p className="text-sm font-medium mt-1 truncate">
                          {appointment.vehicle?.year} {appointment.vehicle?.make} {appointment.vehicle?.model}
                        </p>
                        
                        <p className="text-xs text-gray-600 truncate">
                          {appointment.serviceType}
                        </p>
                        
                        {/* Technician is now shown where status was */}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

export default AppointmentCalendar;
