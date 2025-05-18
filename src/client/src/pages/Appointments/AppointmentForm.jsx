// src/client/src/pages/Appointments/AppointmentForm.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';
import Button from '../../components/common/Button';
import AppointmentService from '../../services/appointmentService';
import CustomerService from '../../services/customerService';
import WorkOrderService from '../../services/workOrderService';
import technicianService from '../../services/technicianService'; // Import technician service

// Validation schema
const AppointmentSchema = Yup.object().shape({
  customer: Yup.string().required('Customer is required'),
  vehicle: Yup.string().required('Vehicle is required'),
  serviceType: Yup.string().required('Service type is required'),
  startDate: Yup.string().required('Start date is required'),
  startTime: Yup.string().required('Start time is required'),
  endDate: Yup.string().required('End date is required'),
  endTime: Yup.string().required('End time is required'),
  status: Yup.string().required('Status is required'),
  technician: Yup.string()
});

const AppointmentForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [technicians, setTechnicians] = useState([]); // State for technicians
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [workOrder, setWorkOrder] = useState(null);
  
  // Get parameters from URL
  const customerIdParam = searchParams.get('customer');
  const vehicleIdParam = searchParams.get('vehicle');
  const workOrderIdParam = searchParams.get('workOrder');
  
  // Get current date and time, rounded to nearest 15 min
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  
  // Format date for input field (YYYY-MM-DD)
  const formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };
  
  // Format time for input field (HH:MM)
  const formatTime = (date) => {
    return date.toTimeString().slice(0, 5);
  };
  
  // Set one hour later for end time
  const laterTime = new Date(now);
  laterTime.setHours(now.getHours() + 1);

  const [initialValues, setInitialValues] = useState({
    customer: customerIdParam || '',
    vehicle: vehicleIdParam || '',
    serviceType: '',
    startDate: formatDate(now),
    startTime: formatTime(now),
    endDate: formatDate(laterTime),
    endTime: formatTime(laterTime),
    technician: '',
    status: 'Scheduled',
    notes: '',
    workOrder: workOrderIdParam || '',
    createWorkOrder: false
  });

  // Generate time options for dropdown (8:00 AM to 6:00 PM in 15 min increments)
  const generateTimeOptions = () => {
    const options = [];
    const start = 8 * 60; // 8:00 AM in minutes
    const end = 18 * 60;  // 6:00 PM in minutes
    const increment = 15; // 15 minute increments
    
    for (let i = start; i <= end; i += increment) {
      const hours = Math.floor(i / 60);
      const minutes = i % 60;
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
      
      const timeValue = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      const timeLabel = `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
      
      options.push({ value: timeValue, label: timeLabel });
    }
    
    return options;
  };
  
  const timeOptions = generateTimeOptions();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch customers for dropdown
        const customersResponse = await CustomerService.getAllCustomers();
        setCustomers(customersResponse.data.customers || []);

        // Fetch active technicians for dropdown
        const techniciansResponse = await technicianService.getAllTechnicians(true); // Fetch only active
        setTechnicians(techniciansResponse.data.data.technicians || []);
        
        // If editing existing appointment, fetch appointment data
        if (id) {
          const appointmentResponse = await AppointmentService.getAppointment(id);
          const appointmentData = appointmentResponse.data.appointment;
          
          // Extract date and time from datetime
          const startDateTime = new Date(appointmentData.startTime);
          const endDateTime = new Date(appointmentData.endTime);
          
          // Set initial form values
          setInitialValues({
            customer: typeof appointmentData.customer === 'object' 
              ? appointmentData.customer._id 
              : appointmentData.customer,
            vehicle: typeof appointmentData.vehicle === 'object' 
              ? appointmentData.vehicle._id 
              : appointmentData.vehicle,
            serviceType: appointmentData.serviceType || '',
            startDate: formatDate(startDateTime),
            startTime: formatTime(startDateTime),
            endDate: formatDate(endDateTime),
            endTime: formatTime(endDateTime),
            technician: appointmentData.technician?._id || appointmentData.technician || '', // Handle populated or ID
            status: appointmentData.status || 'Scheduled',
            notes: appointmentData.notes || '',
            workOrder: appointmentData.workOrder 
              ? (typeof appointmentData.workOrder === 'object' 
                  ? appointmentData.workOrder._id 
                  : appointmentData.workOrder)
              : '',
            createWorkOrder: false
          });
          
          // Load vehicles for the selected customer
          if (appointmentData.customer) {
            await fetchVehiclesForCustomer(
              typeof appointmentData.customer === 'object' 
                ? appointmentData.customer._id 
                : appointmentData.customer
            );
          }
          
          // If appointment has a work order, load it
          if (appointmentData.workOrder) {
            const workOrderId = typeof appointmentData.workOrder === 'object' 
              ? appointmentData.workOrder._id 
              : appointmentData.workOrder;
            await loadWorkOrder(workOrderId);
          }
        } 
        // If creating from a work order, load work order data
        else if (workOrderIdParam) {
          await loadWorkOrder(workOrderIdParam);
        } 
        // If customer is specified in URL params, fetch their vehicles
        else if (customerIdParam) {
          await fetchVehiclesForCustomer(customerIdParam);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again later.');
        setLoading(false);
      }
    };

    fetchData();
  }, [id, customerIdParam, vehicleIdParam, workOrderIdParam]);

  const loadWorkOrder = async (workOrderId) => {
    if (!workOrderId) return;
    
    try {
      const response = await WorkOrderService.getWorkOrder(workOrderId);
      const workOrderData = response.data.workOrder;
      setWorkOrder(workOrderData);
      
      // Update form values based on work order
      const customerId = typeof workOrderData.customer === 'object' 
        ? workOrderData.customer._id 
        : workOrderData.customer;
      
      const vehicleId = typeof workOrderData.vehicle === 'object' 
        ? workOrderData.vehicle._id 
        : workOrderData.vehicle;
      
      // Fetch vehicles for this customer
      await fetchVehiclesForCustomer(customerId);
      
      // Update form values
      // Ensure vehicles are loaded before setting the vehicle in initialValues
      await fetchVehiclesForCustomer(customerId); 

      setInitialValues(prev => ({
        ...prev,
        customer: customerId,
        vehicle: vehicleId, // This should now be available if fetchVehiclesForCustomer populates `vehicles` state correctly
        serviceType: workOrderData.services && workOrderData.services.length > 0 
          ? workOrderData.services.map(s => s.description).join(', ') 
          : workOrderData.serviceRequested || prev.serviceType,
        notes: workOrderData.diagnosticNotes || prev.notes, // Pre-fill notes from diagnostic notes
        workOrder: workOrderData._id, // Ensure we use the actual ID
        technician: workOrderData.assignedTechnician?._id || workOrderData.assignedTechnician || prev.technician, // Pre-fill technician
      }));
      
    } catch (err) {
      console.error('Error loading work order:', err);
      setError('Failed to load work order data.');
    }
  };

  const fetchVehiclesForCustomer = async (customerId) => {
    try {
      const vehiclesResponse = await CustomerService.getCustomerVehicles(customerId);
      setVehicles(vehiclesResponse.data.vehicles || []);
    } catch (err) {
      console.error('Error fetching vehicles for customer:', err);
      setError('Failed to load vehicles for the selected customer.');
    }
  };

  const handleCustomerChange = async (e, setFieldValue) => {
    const customerId = e.target.value;
    setFieldValue('customer', customerId);
    setFieldValue('vehicle', ''); // Reset vehicle when customer changes
    
    if (customerId) {
      try {
        await fetchVehiclesForCustomer(customerId);
      } catch (err) {
        console.error('Error fetching vehicles for customer:', err);
        setError('Failed to load vehicles for the selected customer.');
      }
    } else {
      setVehicles([]); // Clear vehicles if no customer selected
    }
  };

  const checkForConflicts = async (values) => {
    // Combine date and time fields into datetime strings
    const startDateTime = `${values.startDate}T${values.startTime}`;
    const endDateTime = `${values.endDate}T${values.endTime}`;
    
    if (!startDateTime || !endDateTime || !values.technician) {
      setHasConflicts(false);
      setConflictMessage('');
      return false;
    }
    
    try {
      // Prepare request data
      const requestData = {
        startTime: startDateTime,
        endTime: endDateTime,
        technician: values.technician
      };
      
      // For updates, exclude the current appointment
      const queryParams = id ? { appointmentId: id } : {};
      
      const response = await AppointmentService.checkConflicts(requestData, queryParams);
      const hasConflicts = response.data.hasConflicts;
      
      setHasConflicts(hasConflicts);
      if (hasConflicts) {
        const conflicts = response.data.conflicts || [];
        if (conflicts.length > 0) {
          setConflictMessage(`Found ${conflicts.length} scheduling conflict(s) with other appointments.`);
        } else {
          setConflictMessage('Scheduling conflict detected.');
        }
      } else {
        setConflictMessage('');
      }
      
      return hasConflicts;
    } catch (err) {
      console.error('Error checking for conflicts:', err);
      setError('Failed to check for scheduling conflicts. Please try again.');
      return false;
    }
  };

  const handleSubmit = async (values, { setSubmitting }) => {
    // Combine date and time fields into datetime strings
    const formattedValues = {
      ...values,
      startTime: `${values.startDate}T${values.startTime}`,
      endTime: `${values.endDate}T${values.endTime}`
    };
    
    // Remove individual date and time fields
    delete formattedValues.startDate;
    delete formattedValues.endDate;
    
    // Check for conflicts one last time
    const conflicts = await checkForConflicts(values);
    if (conflicts) {
      setSubmitting(false);
      return; // Don't submit if there are conflicts
    }
    
    try {
      if (id) {
        // Update existing appointment
        await AppointmentService.updateAppointment(id, formattedValues);
      } else {
        // Create new appointment
        await AppointmentService.createAppointment(formattedValues);
      }
      
      // Redirect to appointments list
      navigate('/appointments');
    } catch (err) {
      console.error('Error saving appointment:', err);
      setError('Failed to save appointment. Please try again later.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading data...</p>
      </div>
    );
  }

  // Create customer options for dropdown
  const customerOptions = customers.map(customer => ({
    value: customer._id,
    label: customer.name
  }));

  // Create vehicle options for dropdown
  const vehicleOptions = vehicles.map(vehicle => ({
    value: vehicle._id,
    label: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.licensePlate ? `(${vehicle.licensePlate})` : ''}`
  }));

  // Status options for dropdown
  const statusOptions = [
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Confirmed', label: 'Confirmed' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Cancelled', label: 'Cancelled' },
    { value: 'No-Show', label: 'No-Show' }
  ];

  // Create technician options for dropdown
  const technicianOptions = [
    { value: '', label: 'Select Technician (Optional)' },
    ...technicians.map(tech => ({
      value: tech._id,
      label: `${tech.name}${tech.specialization ? ` (${tech.specialization})` : ''}`
    }))
  ];

  // Function to validate if start time is before end time
  const validateTimes = (startDate, startTime, endDate, endTime) => {
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    return start < end;
  };

  // Function to estimate appointment duration based on work order
  const estimateAppointmentDuration = (workOrderData) => {
    // Default duration is 1 hour
    let durationHours = 1;
    
    if (workOrderData) {
      // Estimate based on labor hours if available
      if (workOrderData.labor && workOrderData.labor.length > 0) {
        const totalLaborHours = workOrderData.labor.reduce((sum, item) => sum + (parseFloat(item.hours) || 0), 0);
        durationHours = Math.max(1, totalLaborHours); // At least 1 hour
      }
      
      // Adjust based on service type keywords
      const service = workOrderData.serviceRequested?.toLowerCase() || '';
      if (service.includes('diagnos')) {
        durationHours = Math.max(1, durationHours);
      } else if (service.includes('oil change') || service.includes('inspection')) {
        durationHours = Math.max(0.5, durationHours);
      } else if (service.includes('brake') || service.includes('repair')) {
        durationHours = Math.max(2, durationHours);
      } else if (service.includes('engine') || service.includes('transmission')) {
        durationHours = Math.max(4, durationHours);
      }
    }
    
    return durationHours;
  };

  // Calculate end time based on start time and duration
  const calculateEndTime = (startDate, startTime, durationHours) => {
    const startDateTime = new Date(`${startDate}T${startTime}`);
    const hours = Math.floor(durationHours);
    const minutes = Math.round((durationHours - hours) * 60);
    
    startDateTime.setHours(startDateTime.getHours() + hours);
    startDateTime.setMinutes(startDateTime.getMinutes() + minutes);
    
    return {
      date: formatDate(startDateTime),
      time: formatTime(startDateTime)
    };
  };

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {id ? 'Edit Appointment' : 'Schedule New Appointment'}
        </h1>
        {workOrder && (
          <div className="mt-2 text-sm bg-blue-50 text-blue-700 p-2 rounded-md">
            Scheduling appointment for work order: <span className="font-bold">{workOrder.serviceRequested}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {hasConflicts && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          <p className="font-medium">Warning: Scheduling Conflict</p>
          <p>{conflictMessage}</p>
        </div>
      )}

      <Card>
        <Formik
          initialValues={initialValues}
          validationSchema={AppointmentSchema}
          onSubmit={handleSubmit}
          enableReinitialize
        >
          {({ isSubmitting, touched, errors, values, handleChange, handleBlur, setFieldValue }) => (
            <Form>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Work Order Selection - Only show if not tied to a specific work order already */}
                {!workOrderIdParam && !workOrder && (
                  <div className="md:col-span-2 border border-gray-200 rounded-lg p-4 mb-4">
                    <h3 className="text-lg font-semibold mb-2 text-gray-700">Link to Work Order (Optional)</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Appointments linked to work orders will automatically update with service information.
                    </p>
                    <div className="flex items-center space-x-2">
                      <Button
                        type="button"
                        onClick={() => navigate('/work-orders?needsScheduling=true')}
                        variant="primary"
                      >
                        Select Work Order
                      </Button>
                      <span className="text-gray-500">or</span>
                      <Button
                        type="button"
                        onClick={() => navigate('/work-orders/new?createAppointment=true')}
                        variant="secondary"
                      >
                        Create New Work Order
                      </Button>
                    </div>
                  </div>
                )}
                
                <div>
                  <SelectInput
                    label="Customer"
                    name="customer"
                    options={customerOptions}
                    value={values.customer}
                    onChange={(e) => handleCustomerChange(e, setFieldValue)}
                    onBlur={handleBlur}
                    error={errors.customer}
                    touched={touched.customer}
                    disabled={!!workOrder} // Disable if linked to work order
                    required
                  />
                </div>
                
                <div>
                  <SelectInput
                    label="Vehicle"
                    name="vehicle"
                    options={vehicleOptions}
                    value={values.vehicle}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.vehicle}
                    touched={touched.vehicle}
                    disabled={!values.customer || !!workOrder || vehicles.length === 0} // Disable if no customer or linked to work order
                    required
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Input
                    label="Service Type"
                    name="serviceType"
                    value={values.serviceType}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.serviceType}
                    touched={touched.serviceType}
                    disabled={!!workOrder} // Disable if linked to work order
                    required
                    placeholder="Oil Change, Brake Service, Diagnostic, etc."
                  />
                </div>
                
                {/* Date and Time Section - Start */}
                <div className="md:col-span-2">
                  <h3 className="font-medium text-gray-700 mb-2">Appointment Time</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Start Date <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="date"
                          name="startDate"
                          value={values.startDate}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            setFieldValue('startDate', newDate);
                            
                            // If end date is before start date, set end date to start date
                            if (new Date(`${newDate}T00:00`) > new Date(`${values.endDate}T00:00`)) {
                              setFieldValue('endDate', newDate);
                            }
                          }}
                          onBlur={handleBlur}
                          error={errors.startDate}
                          touched={touched.startDate}
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Start Time <span className="text-red-500">*</span>
                        </label>
                        <SelectInput
                          name="startTime"
                          options={timeOptions}
                          value={values.startTime}
                          onChange={(e) => {
                            const newTime = e.target.value;
                            setFieldValue('startTime', newTime);
                            
                            // Auto-adjust end time based on work order duration estimate
                            if (workOrder) {
                              const durationHours = estimateAppointmentDuration(workOrder);
                              const newEnd = calculateEndTime(values.startDate, newTime, durationHours);
                              setFieldValue('endDate', newEnd.date);
                              setFieldValue('endTime', newEnd.time);
                            }
                            // If same day and end time is before or equal to start time, add 1 hour
                            else if (values.startDate === values.endDate && 
                                newTime >= values.endTime) {
                              const newStartTime = new Date(`${values.startDate}T${newTime}`);
                              const newEndTime = new Date(newStartTime.getTime() + (60 * 60 * 1000));
                              setFieldValue('endTime', formatTime(newEndTime));
                            }
                            
                            // Check for conflicts after a small delay to allow values to update
                            setTimeout(() => {
                              if (values.technician) {
                                checkForConflicts({
                                  ...values,
                                  startTime: newTime
                                });
                              }
                            }, 100);
                          }}
                          onBlur={handleBlur}
                          error={errors.startTime}
                          touched={touched.startTime}
                          required
                        />
                      </div>
                    </div>
                    
                    <div>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          End Date <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="date"
                          name="endDate"
                          value={values.endDate}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            setFieldValue('endDate', newDate);
                            
                            // If end date is before start date, set start date to end date
                            if (new Date(`${newDate}T00:00`) < new Date(`${values.startDate}T00:00`)) {
                              setFieldValue('startDate', newDate);
                            }
                            
                            // Check for conflicts
                            if (values.technician) {
                              checkForConflicts({
                                ...values,
                                endDate: newDate
                              });
                            }
                          }}
                          onBlur={handleBlur}
                          error={errors.endDate}
                          touched={touched.endDate}
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          End Time <span className="text-red-500">*</span>
                        </label>
                        <SelectInput
                          name="endTime"
                          options={timeOptions}
                          value={values.endTime}
                          onChange={(e) => {
                            const newTime = e.target.value;
                            setFieldValue('endTime', newTime);
                            
                            // Check if end time is before start time on the same day
                            if (values.startDate === values.endDate && 
                                newTime <= values.startTime) {
                              // Show error or adjust the time
                              setError('End time must be after start time');
                            } else {
                              setError(null);
                            }
                            
                            // Check for conflicts
                            if (values.technician) {
                              checkForConflicts({
                                ...values,
                                endTime: newTime
                              });
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
                  
                  {/* Time validation error */}
                  {values.startDate && values.startTime && values.endDate && values.endTime && 
                   !validateTimes(values.startDate, values.startTime, values.endDate, values.endTime) && (
                    <div className="text-red-500 text-sm mt-2">
                      End time must be after start time
                    </div>
                  )}
                </div>
                {/* Date and Time Section - End */}
                
                <div>
                  <SelectInput
                    label="Technician"
                    name="technician"
                    options={technicianOptions}
                    value={values.technician}
                    onChange={(e) => {
                      const newTechnician = e.target.value;
                      setFieldValue('technician', newTechnician);
                      
                      // Check for conflicts if start and end times are set
                      if (values.startDate && values.startTime && 
                          values.endDate && values.endTime) {
                        checkForConflicts({
                          ...values,
                          technician: newTechnician
                        });
                      }
                    }}
                    onBlur={handleBlur}
                    error={errors.technician}
                    touched={touched.technician}
                  />
                </div>
                
                <div>
                  <SelectInput
                    label="Status"
                    name="status"
                    options={statusOptions}
                    value={values.status}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.status}
                    touched={touched.status}
                    required
                  />
                </div>
                
                <div className="md:col-span-2">
                  <TextArea
                    label="Notes"
                    name="notes"
                    value={values.notes}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.notes}
                    touched={touched.notes}
                    rows={4}
                  />
                </div>
                
                {/* Show create work order option only for new standalone appointments */}
                {!id && !workOrder && (
                  <div className="md:col-span-2 flex items-center">
                    <input
                      type="checkbox"
                      id="createWorkOrder"
                      name="createWorkOrder"
                      checked={values.createWorkOrder}
                      onChange={handleChange}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="createWorkOrder" className="ml-2 block text-sm text-gray-900">
                      Create work order from this appointment
                    </label>
                  </div>
                )}
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="light"
                  onClick={() => navigate(id ? `/appointments/${id}` : '/appointments')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || hasConflicts || 
                           !validateTimes(values.startDate, values.startTime, values.endDate, values.endTime)}
                >
                  {isSubmitting ? 'Saving...' : (id ? 'Update Appointment' : 'Schedule Appointment')}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </Card>
    </div>
  );
};

export default AppointmentForm;
