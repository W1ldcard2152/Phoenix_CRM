import React, { useState, useEffect } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import moment from 'moment-timezone';
import AppointmentService from '../../../services/appointmentService';
import technicianService from '../../../services/technicianService';
import WorkOrderService from '../../../services/workOrderService';
import Button from '../../common/Button';
import Input from '../../common/Input';
import TextArea from '../../common/TextArea';
import SelectInput from '../../common/SelectInput';

const AppointmentSchema = Yup.object().shape({
  startDate: Yup.string().required('Start date is required'),
  startTime: Yup.string().required('Start time is required'),
  endDate: Yup.string().required('End date is required'),
  endTime: Yup.string().required('End time is required'),
  technician: Yup.string(),
  notes: Yup.string()
});

const AppointmentStep = ({ customer, vehicle, workOrder, onAppointmentCreate, onError, setLoading, loading }) => {
  const [technicians, setTechnicians] = useState([]);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');

  const AMERICA_NEW_YORK = 'America/New_York';

  // Fetch technicians
  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        const response = await technicianService.getAllTechnicians(true);
        setTechnicians(response.data.data.technicians || []);
      } catch (err) {
        console.error('Error fetching technicians:', err);
        onError('Failed to load technicians. Please try again.');
      }
    };

    fetchTechnicians();
  }, [onError]);

  const generateTimeOptions = () => {
    const options = [];
    const start = 8 * 60; // 8 AM
    const end = 18 * 60; // 6 PM
    const increment = 15; // 15-minute intervals
    
    for (let i = start; i <= end; i += increment) {
      const hours = Math.floor(i / 60);
      const minutes = i % 60;
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
      const timeValue = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      const timeLabel = `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
      options.push({ value: timeValue, label: timeLabel });
    }
    
    return options;
  };

  const timeOptions = generateTimeOptions();

  const checkForConflicts = async (values) => {
    if (!values.startDate || !values.startTime || !values.endDate || !values.endTime || !values.technician) {
      setHasConflicts(false);
      setConflictMessage('');
      return false;
    }

    try {
      const startDateTime = moment.tz(`${values.startDate} ${values.startTime}`, 'YYYY-MM-DD HH:mm', AMERICA_NEW_YORK).toISOString();
      const endDateTime = moment.tz(`${values.endDate} ${values.endTime}`, 'YYYY-MM-DD HH:mm', AMERICA_NEW_YORK).toISOString();

      const response = await AppointmentService.checkConflicts({
        startTime: startDateTime,
        endTime: endDateTime,
        technician: values.technician
      });

      setHasConflicts(response.data.hasConflicts);
      setConflictMessage(
        response.data.hasConflicts 
          ? `Found ${response.data.conflicts?.length || 1} scheduling conflict(s).`
          : ''
      );
      
      return response.data.hasConflicts;
    } catch (err) {
      console.error('Error checking conflicts:', err);
      return false;
    }
  };

  const handleCreateAppointment = async (values, { setSubmitting }) => {
    try {
      setLoading(true);

      // Convert date/time to UTC for server
      const startTimeForServer = moment.tz(`${values.startDate} ${values.startTime}`, 'YYYY-MM-DD HH:mm', AMERICA_NEW_YORK).toISOString();
      const endTimeForServer = moment.tz(`${values.endDate} ${values.endTime}`, 'YYYY-MM-DD HH:mm', AMERICA_NEW_YORK).toISOString();

      const appointmentData = {
        customer: customer._id,
        vehicle: vehicle._id,
        workOrder: workOrder._id,
        serviceType: workOrder.services?.map(s => s.description).join(', ') || workOrder.serviceRequested,
        startTime: startTimeForServer,
        endTime: endTimeForServer,
        technician: values.technician,
        notes: values.notes,
        status: 'Scheduled'
      };

      const response = await AppointmentService.createAppointment(appointmentData);
      
      // Update work order status to Inspection/Diag Scheduled (since this is a new service request)
      await WorkOrderService.updateStatus(workOrder._id, 'Inspection/Diag Scheduled');
      
      onAppointmentCreate(response.data.appointment);
    } catch (err) {
      console.error('Error creating appointment:', err);
      onError('Failed to create appointment. Please try again.');
      setSubmitting(false);
    } finally {
      setLoading(false);
    }
  };

  // Calculate duration and end time based on work order
  const estimateAppointmentDuration = (wo) => {
    let durationHours = 1;
    
    if (wo?.labor && wo.labor.length > 0) {
      const totalLaborHours = wo.labor.reduce((sum, item) => sum + (parseFloat(item.hours) || 0), 0);
      durationHours = Math.max(1, totalLaborHours);
    } else if (wo?.services) {
      // Estimate based on service types
      wo.services.forEach(service => {
        const desc = service.description.toLowerCase();
        if (desc.includes('oil change') || desc.includes('inspection')) {
          durationHours = Math.max(0.5, durationHours);
        } else if (desc.includes('brake') || desc.includes('tire')) {
          durationHours = Math.max(2, durationHours);
        } else if (desc.includes('engine') || desc.includes('transmission')) {
          durationHours = Math.max(4, durationHours);
        }
      });
    }
    
    return durationHours;
  };

  const calculateEndTime = (startDate, startTime, durationHours) => {
    const startMoment = moment.tz(`${startDate} ${startTime}`, 'YYYY-MM-DD HH:mm', AMERICA_NEW_YORK);
    const endMoment = startMoment.clone().add(durationHours, 'hours');
    return {
      date: endMoment.format('YYYY-MM-DD'),
      time: endMoment.format('HH:mm')
    };
  };

  const technicianOptions = [
    { value: '', label: 'Select Technician (Optional)' },
    ...technicians.map(t => ({ 
      value: t._id, 
      label: `${t.name}${t.specialization ? ` (${t.specialization})` : ''}` 
    }))
  ];

  // Initial form values
  const nowET = moment.tz(AMERICA_NEW_YORK);
  nowET.minutes(Math.ceil(nowET.minutes() / 15) * 15).seconds(0).milliseconds(0);
  const estimatedDuration = estimateAppointmentDuration(workOrder);
  const endTime = calculateEndTime(
    nowET.format('YYYY-MM-DD'), 
    nowET.format('HH:mm'), 
    estimatedDuration
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Schedule Appointment</h3>
        <p className="text-sm text-gray-600">
          Final step: Schedule the work order for completion
        </p>
      </div>

      {/* Work Order Summary */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-medium text-green-900 mb-2">Work Order Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-green-700">
              <span className="font-medium">Customer:</span> {customer?.name}
            </p>
            <p className="text-green-700">
              <span className="font-medium">Vehicle:</span> {vehicle?.year} {vehicle?.make} {vehicle?.model}
            </p>
          </div>
          <div>
            <p className="text-green-700">
              <span className="font-medium">Priority:</span> {workOrder?.priority}
            </p>
            <p className="text-green-700">
              <span className="font-medium">Estimated Duration:</span> {estimatedDuration} hours
            </p>
          </div>
        </div>
        <div className="mt-2">
          <p className="text-green-700">
            <span className="font-medium">Services:</span>
          </p>
          <ul className="text-green-600 text-sm ml-4">
            {workOrder?.services?.map((service, index) => (
              <li key={index}>• {service.description}</li>
            )) || (
              <li>• {workOrder?.serviceRequested}</li>
            )}
          </ul>
        </div>
      </div>

      {/* Conflict Warning */}
      {hasConflicts && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          <div className="flex items-center">
            <i className="fas fa-exclamation-triangle mr-2"></i>
            <div>
              <p className="font-medium">Scheduling Conflict</p>
              <p className="text-sm">{conflictMessage}</p>
            </div>
          </div>
        </div>
      )}

      <Formik
        initialValues={{
          startDate: nowET.format('YYYY-MM-DD'),
          startTime: nowET.format('HH:mm'),
          endDate: endTime.date,
          endTime: endTime.time,
          technician: '',
          notes: workOrder?.diagnosticNotes || ''
        }}
        validationSchema={AppointmentSchema}
        onSubmit={handleCreateAppointment}
      >
        {({ values, errors, touched, handleChange, handleBlur, setFieldValue, isSubmitting }) => (
          <Form className="space-y-6">
            {/* Date and Time Selection */}
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900">Appointment Time</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="mb-4">
                    <Input
                      label="Start Date"
                      name="startDate"
                      type="date"
                      value={values.startDate}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setFieldValue('startDate', newDate);
                        
                        // Update end date if it's before start date
                        if (new Date(newDate) > new Date(values.endDate)) {
                          setFieldValue('endDate', newDate);
                        }
                      }}
                      onBlur={handleBlur}
                      error={errors.startDate}
                      touched={touched.startDate}
                      required
                    />
                  </div>
                  
                  <SelectInput
                    label="Start Time"
                    name="startTime"
                    options={timeOptions}
                    value={values.startTime}
                    onChange={(e) => {
                      const newTime = e.target.value;
                      setFieldValue('startTime', newTime);
                      
                      // Auto-calculate end time
                      const newEnd = calculateEndTime(values.startDate, newTime, estimatedDuration);
                      setFieldValue('endDate', newEnd.date);
                      setFieldValue('endTime', newEnd.time);
                      
                      // Check for conflicts
                      if (values.technician) {
                        checkForConflicts({
                          ...values,
                          startTime: newTime,
                          endDate: newEnd.date,
                          endTime: newEnd.time
                        });
                      }
                    }}
                    onBlur={handleBlur}
                    error={errors.startTime}
                    touched={touched.startTime}
                    required
                  />
                </div>

                <div>
                  <div className="mb-4">
                    <Input
                      label="End Date"
                      name="endDate"
                      type="date"
                      value={values.endDate}
                      min={values.startDate}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setFieldValue('endDate', newDate);
                        
                        if (values.technician) {
                          checkForConflicts({ ...values, endDate: newDate });
                        }
                      }}
                      onBlur={handleBlur}
                      error={errors.endDate}
                      touched={touched.endDate}
                      required
                    />
                  </div>
                  
                  <SelectInput
                    label="End Time"
                    name="endTime"
                    options={timeOptions}
                    value={values.endTime}
                    onChange={(e) => {
                      const newTime = e.target.value;
                      setFieldValue('endTime', newTime);
                      
                      if (values.technician) {
                        checkForConflicts({ ...values, endTime: newTime });
                      }
                    }}
                    onBlur={handleBlur}
                    error={errors.endTime}
                    touched={touched.endTime}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Technician Selection */}
            <SelectInput
              label="Assigned Technician"
              name="technician"
              options={technicianOptions}
              value={values.technician}
              onChange={(e) => {
                const newTech = e.target.value;
                setFieldValue('technician', newTech);
                
                if (newTech && values.startDate && values.startTime && values.endDate && values.endTime) {
                  checkForConflicts({ ...values, technician: newTech });
                }
              }}
              onBlur={handleBlur}
              error={errors.technician}
              touched={touched.technician}
            />

            {/* Notes */}
            <TextArea
              label="Appointment Notes"
              name="notes"
              value={values.notes}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.notes}
              touched={touched.notes}
              rows={3}
              placeholder="Any special instructions or notes for this appointment..."
            />

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || loading}
              >
                {isSubmitting || loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Scheduling Appointment...
                  </>
                ) : (
                  <>
                    <i className="fas fa-calendar-check mr-2"></i>
                    Complete Service Request
                  </>
                )}
              </Button>
            </div>
          </Form>
        )}
      </Formik>
    </div>
  );
};

export default AppointmentStep;
