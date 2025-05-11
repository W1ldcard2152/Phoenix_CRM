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


// Validation schema
const AppointmentSchema = Yup.object().shape({
  customer: Yup.string().required('Customer is required'),
  vehicle: Yup.string().required('Vehicle is required'),
  serviceType: Yup.string().required('Service type is required'),
  startTime: Yup.string().required('Start time is required'),
  endTime: Yup.string().required('End time is required'),
  status: Yup.string().required('Status is required'),
  technician: Yup.string()
});

const AppointmentForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [, setAppointment] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  
  // Get parameters from URL
  const customerIdParam = searchParams.get('customer');
  const vehicleIdParam = searchParams.get('vehicle');
  
  // Get current date and time
  const now = new Date();
  const localStartTime = new Date(now.setMinutes(now.getMinutes() + (30 - (now.getMinutes() % 30)), 0))
    .toISOString().slice(0, 16);
  const localEndTime = new Date(now.setHours(now.getHours() + 1))
    .toISOString().slice(0, 16);

  const [initialValues, setInitialValues] = useState({
    customer: customerIdParam || '',
    vehicle: vehicleIdParam || '',
    serviceType: '',
    startTime: localStartTime,
    endTime: localEndTime,
    technician: '',
    status: 'Scheduled',
    notes: '',
    createWorkOrder: false
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch customers for dropdown
        const customersResponse = await CustomerService.getAllCustomers();
        setCustomers(customersResponse.data.customers || []);
        
        // If editing existing appointment, fetch appointment data
        if (id) {
          const appointmentResponse = await AppointmentService.getAppointment(id);
          const appointmentData = appointmentResponse.data.appointment;
          setAppointment(appointmentData);
          
          // Format date for form inputs
          const formatDateForInput = (dateStr) => {
            const date = new Date(dateStr);
            return date.toISOString().slice(0, 16);
          };
          
          // Set initial form values
          setInitialValues({
            customer: typeof appointmentData.customer === 'object' 
              ? appointmentData.customer._id 
              : appointmentData.customer,
            vehicle: typeof appointmentData.vehicle === 'object' 
              ? appointmentData.vehicle._id 
              : appointmentData.vehicle,
            serviceType: appointmentData.serviceType || '',
            startTime: formatDateForInput(appointmentData.startTime),
            endTime: formatDateForInput(appointmentData.endTime),
            technician: appointmentData.technician || '',
            status: appointmentData.status || 'Scheduled',
            notes: appointmentData.notes || '',
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
        } else if (customerIdParam) {
          // If customer is specified in URL params, fetch their vehicles
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
  }, [id, customerIdParam, vehicleIdParam]);

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
    if (!values.startTime || !values.endTime || !values.technician) {
      setHasConflicts(false);
      setConflictMessage('');
      return false;
    }
    
    try {
      // Prepare request data
      const requestData = {
        startTime: values.startTime,
        endTime: values.endTime,
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
    // Check for conflicts one last time
    const conflicts = await checkForConflicts(values);
    if (conflicts) {
      setSubmitting(false);
      return; // Don't submit if there are conflicts
    }
    
    try {
      if (id) {
        // Update existing appointment
        await AppointmentService.updateAppointment(id, values);
      } else {
        // Create new appointment
        await AppointmentService.createAppointment(values);
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

  // Technician options (should come from settings in real app)
  const technicianOptions = [
    { value: '', label: 'Select Technician' },
    { value: 'Mike', label: 'Mike' },
    { value: 'Sarah', label: 'Sarah' },
    { value: 'John', label: 'John' }
  ];

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {id ? 'Edit Appointment' : 'Schedule New Appointment'}
        </h1>
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
                    disabled={!values.customer || vehicles.length === 0}
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
                    required
                    placeholder="Oil Change, Brake Service, Diagnostic, etc."
                  />
                </div>
                
                <div>
                  <Input
                    label="Start Time"
                    name="startTime"
                    type="datetime-local"
                    value={values.startTime}
                    onChange={handleChange}
                    onBlur={(e) => {
                      handleBlur(e);
                      if (values.technician) {
                        checkForConflicts(values);
                      }
                    }}
                    error={errors.startTime}
                    touched={touched.startTime}
                    required
                  />
                </div>
                
                <div>
                  <Input
                    label="End Time"
                    name="endTime"
                    type="datetime-local"
                    value={values.endTime}
                    onChange={handleChange}
                    onBlur={(e) => {
                      handleBlur(e);
                      if (values.technician) {
                        checkForConflicts(values);
                      }
                    }}
                    error={errors.endTime}
                    touched={touched.endTime}
                    required
                  />
                </div>
                
                <div>
                  <SelectInput
                    label="Technician"
                    name="technician"
                    options={technicianOptions}
                    value={values.technician}
                    onChange={handleChange}
                    onBlur={(e) => {
                      handleBlur(e);
                      if (values.startTime && values.endTime) {
                        checkForConflicts(values);
                      }
                    }}
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
                
                {!id && (
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
                  disabled={isSubmitting || hasConflicts}
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