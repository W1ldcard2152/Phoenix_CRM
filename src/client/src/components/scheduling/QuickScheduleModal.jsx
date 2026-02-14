// src/client/src/components/scheduling/QuickScheduleModal.jsx - Fixed import issues
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../common/Button';
import Input from '../common/Input';
import SelectInput from '../common/SelectInput';
import AppointmentService from '../../services/appointmentService';
import WorkOrderService from '../../services/workOrderService';
import technicianService from '../../services/technicianService'; // Import technician service
import { formatDateForInput, getTodayForInput } from '../../utils/formatters';

/**
 * Quick Schedule Modal Component
 * A reusable component that provides a quick way to schedule work orders
 * Can be used from various parts of the application
 */
const QuickScheduleModal = ({ 
  isOpen, 
  onClose, 
  workOrderId = null, 
  initialDate = null,
  onScheduled = () => {}
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [workOrder, setWorkOrder] = useState(null);
  const [technicianOptionsList, setTechnicianOptionsList] = useState([{ value: '', label: 'Loading Technicians...' }]);
  const [scheduleData, setScheduleData] = useState({
    date: initialDate ? formatDateForInput(initialDate) : getTodayForInput(),
    startTime: '09:00',
    duration: 1,
    technician: '',
    notes: ''
  });

  useEffect(() => {
    const fetchTechnicians = async () => {
      if (isOpen) {
        try {
          const response = await technicianService.getAllTechnicians(true); // Fetch active technicians
          const fetchedTechnicians = response.data.data.technicians || [];
          const options = [
            { value: '', label: 'Select Technician' },
            ...fetchedTechnicians.map(tech => ({ value: tech._id, label: tech.name }))
          ];
          setTechnicianOptionsList(options);
        } catch (err) {
          console.error('Error fetching technicians:', err);
          setTechnicianOptionsList([{ value: '', label: 'Error loading technicians' }]);
          // Optionally set an error state to display to the user
        }
      }
    };

    fetchTechnicians();
  }, [isOpen]);

  useEffect(() => {
    const loadWorkOrder = async () => {
      if (!workOrderId) return;
      
      try {
        setLoading(true);
        const response = await WorkOrderService.getWorkOrder(workOrderId);
        const workOrderData = response.data.workOrder;
        
        if (workOrderData) {
          setWorkOrder(workOrderData);
          
          // Prefill notes from diagnostic notes if available
          if (workOrderData.diagnosticNotes) {
            setScheduleData(prev => ({
              ...prev,
              notes: workOrderData.diagnosticNotes
            }));
          }
        } else {
          setError('Work order not found');
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error loading work order:', err);
        setError('Failed to load work order data');
        setLoading(false);
      }
    };
    
    loadWorkOrder();
  }, [workOrderId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setScheduleData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSchedule = async () => {
    if (!workOrderId) {
      setError('No work order selected');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Calculate end time based on start time and duration
      const [hours, minutes] = scheduleData.startTime.split(':').map(Number);
      const startDate = new Date(scheduleData.date);
      startDate.setHours(hours, minutes, 0, 0);
      
      const endDate = new Date(startDate);
      endDate.setHours(startDate.getHours() + Math.floor(scheduleData.duration));
      endDate.setMinutes(startDate.getMinutes() + (scheduleData.duration % 1) * 60);
      
      // Create direct appointment from work order data
      const workOrderResponse = await WorkOrderService.getWorkOrder(workOrderId);
      const workOrderData = workOrderResponse.data.workOrder;
      
      if (!workOrderData) {
        throw new Error('Work order data not found');
      }
      
      // Get customer and vehicle IDs from work order
      const customerId = typeof workOrderData.customer === 'object' 
        ? workOrderData.customer._id 
        : workOrderData.customer;
        
      const vehicleId = typeof workOrderData.vehicle === 'object' 
        ? workOrderData.vehicle._id 
        : workOrderData.vehicle;
      
      // Create appointment data
      const appointmentData = {
        customer: customerId,
        vehicle: vehicleId,
        workOrder: workOrderId,
        serviceType: workOrderData.serviceRequested,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        technician: scheduleData.technician,
        notes: scheduleData.notes,
        status: 'Scheduled'
      };
      
      // Create the appointment directly
      // Server-side appointmentController handles the status update to "Appointment Scheduled"
      const result = await AppointmentService.createAppointment(appointmentData);

      // Call the onScheduled callback with the result
      onScheduled(result);
      
      // Close the modal
      onClose();
      
      // Navigate to the new appointment
      navigate(`/appointments/${result.data.appointment._id}`);
    } catch (err) {
      console.error('Error scheduling appointment:', err);
      setError('Failed to schedule appointment. Please try again.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900">Schedule Appointment</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <span className="sr-only">Close</span>
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {loading && !workOrder ? (
          <div className="py-4 text-center">
            <p>Loading work order data...</p>
          </div>
        ) : (
          <>
            {workOrder && (
              <div className="bg-blue-50 p-3 rounded-md mb-4">
                <p className="font-medium">Work Order: {workOrder.serviceRequested}</p>
                <p className="text-sm text-gray-600">
                  {workOrder.vehicle?.year} {workOrder.vehicle?.make} {workOrder.vehicle?.model}
                </p>
                <p className="text-sm text-gray-600">
                  Customer: {workOrder.customer?.name || 'Unknown Customer'}
                </p>
              </div>
            )}
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Date"
                  name="date"
                  type="date"
                  value={scheduleData.date}
                  onChange={handleInputChange}
                  required
                />
                <Input
                  label="Start Time"
                  name="startTime"
                  type="time"
                  value={scheduleData.startTime}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Duration (hours)"
                  name="duration"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={scheduleData.duration}
                  onChange={handleInputChange}
                  required
                />
                <SelectInput
                  label="Technician"
                  name="technician"
                  options={technicianOptionsList}
                  value={scheduleData.technician}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Appointment Notes
                </label>
                <textarea
                  name="notes"
                  rows="3"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={scheduleData.notes}
                  onChange={handleInputChange}
                ></textarea>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                type="button"
                variant="light"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSchedule}
                disabled={loading}
              >
                {loading ? 'Scheduling...' : 'Schedule Appointment'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default QuickScheduleModal;
