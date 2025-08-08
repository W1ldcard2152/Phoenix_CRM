// src/client/src/pages/Appointments/AppointmentForm.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import moment from 'moment-timezone';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';
import Button from '../../components/common/Button';
import AppointmentService from '../../services/appointmentService';
import CustomerService from '../../services/customerService';
import WorkOrderService from '../../services/workOrderService';
import technicianService from '../../services/technicianService';

const AppointmentSchema = Yup.object().shape({
  customer: Yup.string().required('Customer is required'),
  vehicle: Yup.string().when('workOrder', {
    is: (workOrder) => !workOrder || workOrder.trim() === '', // If workOrder is null, undefined, or empty string (standalone)
    then: (schema) => schema.notRequired(), // Then vehicle is NOT required
    otherwise: (schema) => schema.required('Vehicle is required'), // Otherwise (work order attached), vehicle IS required
  }),
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

  // We will now get specific params *inside* useEffect

  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [workOrderContext, setWorkOrderContext] = useState(null);

  const AMERICA_NEW_YORK = 'America/New_York';

  // Helper to format moment objects for form fields
  const formatDateForField = (momentDate) => momentDate.format('YYYY-MM-DD');
  const formatTimeForField = (momentDate) => momentDate.format('HH:mm');

  // nowET and laterTimeET will be defined inside useEffect

  const [initialValues, setInitialValues] = useState({
    customer: '',
    vehicle: '',
    serviceType: '',
    startDate: '', // Will be set in useEffect
    startTime: '', // Will be set in useEffect
    endDate: '',   // Will be set in useEffect
    endTime: '',   // Will be set in useEffect
    technician: '',
    status: 'Scheduled',
    notes: '',
    workOrder: '',
    createWorkOrder: false
  });

  const generateTimeOptions = () => {
    const options = [];
    const start = 8 * 60;
    const end = 18 * 60;
    const increment = 15;
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

  const fetchVehiclesForCustomer = async (customerId) => {
    console.log('fetchVehiclesForCustomer - customerId:', customerId);
    if (!customerId) {
      setVehicles([]);
      return [];
    }
    try {
      const response = await CustomerService.getCustomerVehicles(customerId);
      const fetchedVehicles = response.data.vehicles || [];
      setVehicles(fetchedVehicles);
      console.log('fetchVehiclesForCustomer - fetched:', fetchedVehicles);
      return fetchedVehicles;
    } catch (err) {
      console.error('Error fetching vehicles:', err);
      setError('Failed to load vehicles.');
      setVehicles([]);
      return [];
    }
  };
  
  useEffect(() => {
    // Get params inside useEffect, using the searchParams object from the hook
    const workOrderIdFromEffect = searchParams.get('workOrder');
    const customerIdFromEffect = searchParams.get('customer');
    const vehicleIdFromEffect = searchParams.get('vehicle');

    console.log('useEffect[loadInitialData] - START - Params from hook inside effect:', { 
      id, 
      workOrderIdFromEffect, 
      customerIdFromEffect,
      vehicleIdFromEffect 
    });

    const loadInitialData = async () => {
      setLoading(true);
      setError(null);

      // Define nowET and laterTimeET inside the effect
      const nowET = moment.tz(AMERICA_NEW_YORK);
      nowET.minutes(Math.ceil(nowET.minutes() / 15) * 15).seconds(0).milliseconds(0);
      const laterTimeET = nowET.clone().add(1, 'hour');

      try {
        const customerListResponse = await CustomerService.getAllCustomers();
        setCustomers(customerListResponse.data.customers || []);

        const technicianListResponse = await technicianService.getAllTechnicians(true);
        setTechnicians(technicianListResponse.data.data.technicians || []);

        // Default initial values based on current date/time
        let currentInitialValues = {
            customer: '',
            vehicle: '',
            serviceType: '',
            startDate: formatDateForField(nowET), // Use nowET defined in effect
            startTime: formatTimeForField(nowET), // Use nowET defined in effect
            endDate: formatDateForField(laterTimeET),   // Use laterTimeET defined in effect
            endTime: formatTimeForField(laterTimeET),   // Use laterTimeET defined in effect
            technician: '',
            status: 'Scheduled',
            notes: '',
            workOrder: workOrderIdFromEffect || '', // Use param from effect
            createWorkOrder: false
        };

        if (id) { 
          console.log('useEffect - Editing mode for appointment ID:', id);
          const appointmentResponse = await AppointmentService.getAppointment(id);
          const appt = appointmentResponse.data.appointment;
          const apptCustomerId = appt.customer?._id || appt.customer;
          
          if (apptCustomerId) {
            await fetchVehiclesForCustomer(apptCustomerId); 
          }

          currentInitialValues = {
            ...currentInitialValues, // Keep date/time defaults unless overwritten
            customer: apptCustomerId || '',
            vehicle: appt.vehicle?._id || appt.vehicle || '',
            serviceType: appt.serviceType || '',
            startDate: formatDateForField(moment.utc(appt.startTime).tz(AMERICA_NEW_YORK)),
            startTime: formatTimeForField(moment.utc(appt.startTime).tz(AMERICA_NEW_YORK)),
            endDate: formatDateForField(moment.utc(appt.endTime).tz(AMERICA_NEW_YORK)),
            endTime: formatTimeForField(moment.utc(appt.endTime).tz(AMERICA_NEW_YORK)),
            technician: appt.technician?._id || appt.technician || '',
            status: appt.status || 'Scheduled',
            notes: appt.notes || '',
            workOrder: appt.workOrder?._id || appt.workOrder || '',
          };
          if (appt.workOrder) {
             const woResponse = await WorkOrderService.getWorkOrder(appt.workOrder?._id || appt.workOrder);
             setWorkOrderContext(woResponse.data.workOrder);
          }
        } else if (workOrderIdFromEffect) { 
          console.log('useEffect - Scheduling from work order ID:', workOrderIdFromEffect);
          const woResponse = await WorkOrderService.getWorkOrder(workOrderIdFromEffect);
          const wo = woResponse.data.workOrder;
          setWorkOrderContext(wo);
          const woCustomerId = wo.customer?._id || wo.customer;
          const woVehicleId = wo.vehicle?._id || wo.vehicle;

          if (woCustomerId) {
            await fetchVehiclesForCustomer(woCustomerId); 
          }
          
          currentInitialValues = {
            ...currentInitialValues, // Keep date/time defaults
            customer: woCustomerId || '',
            vehicle: woVehicleId || '',
            serviceType: wo.services?.map(s => s.description).join(', ') || wo.serviceRequested || '',
            notes: wo.diagnosticNotes || '',
            workOrder: wo._id,
            technician: wo.assignedTechnician?._id || wo.assignedTechnician || '',
          };
        } else if (customerIdFromEffect) { 
            console.log('useEffect - New appointment with customer ID:', customerIdFromEffect);
            await fetchVehiclesForCustomer(customerIdFromEffect);
            currentInitialValues = {
                ...currentInitialValues, // Keep date/time defaults
                customer: customerIdFromEffect,
                vehicle: vehicleIdFromEffect || '', 
            };
        } else {
             console.log('useEffect - New blank appointment.');
        }
        
        console.log('useEffect - Final initialValues to be set:', currentInitialValues);
        setInitialValues(currentInitialValues);

      } catch (err) {
        console.error("Error in loadInitialData:", err);
        setError("Failed to load initial appointment data.");
      } finally {
        setLoading(false);
        console.log('useEffect[loadInitialData] - END');
      }
    };

    loadInitialData();
  }, [id, searchParams]); // Removed nowET and laterTimeET from dependencies

  const handleCustomerChange = async (e, setFieldValue) => {
    const customerId = e.target.value;
    setFieldValue('customer', customerId);
    setFieldValue('vehicle', ''); 
    await fetchVehiclesForCustomer(customerId);
  };

  const checkForConflicts = async (values) => {
    const startDateTime = moment.tz(`${values.startDate} ${values.startTime}`, 'YYYY-MM-DD HH:mm', AMERICA_NEW_YORK).toISOString();
    const endDateTime = moment.tz(`${values.endDate} ${values.endTime}`, 'YYYY-MM-DD HH:mm', AMERICA_NEW_YORK).toISOString();

    if (!values.startDate || !values.startTime || !values.endDate || !values.endTime || !values.technician) {
      setHasConflicts(false);
      setConflictMessage('');
      return false;
    }
    try {
      const response = await AppointmentService.checkConflicts({
        startTime: startDateTime,
        endTime: endDateTime,
        technician: values.technician
      }, id ? { appointmentId: id } : {});
      setHasConflicts(response.data.hasConflicts);
      setConflictMessage(response.data.hasConflicts ? (response.data.conflicts?.length > 0 ? `Found ${response.data.conflicts.length} scheduling conflict(s).` : 'Scheduling conflict detected.') : '');
      return response.data.hasConflicts;
    } catch (err) {
      setError('Failed to check conflicts.');
      return false;
    }
  };

  const handleSubmit = async (values, { setSubmitting }) => {
    // Combine date and time, then format as ISO string (UTC) for the server
    const startTimeForServer = moment.tz(`${values.startDate} ${values.startTime}`, 'YYYY-MM-DD HH:mm', AMERICA_NEW_YORK).toISOString();
    const endTimeForServer = moment.tz(`${values.endDate} ${values.endTime}`, 'YYYY-MM-DD HH:mm', AMERICA_NEW_YORK).toISOString();

    const formattedValues = {
      ...values,
      startTime: startTimeForServer,
      endTime: endTimeForServer,
    };
    delete formattedValues.startDate;
    delete formattedValues.endDate;

    // Call checkForConflicts to update the warning message, but don't block submission
    await checkForConflicts(values); 

    try {
      if (id) {
        await AppointmentService.updateAppointment(id, formattedValues);
      } else {
        await AppointmentService.createAppointment(formattedValues);
      }
      navigate('/appointments');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save appointment.');
      setSubmitting(false);
    }
  };
  
  const estimateAppointmentDuration = (wo) => {
    let durationHours = 1;
    if (wo) {
      if (wo.labor && wo.labor.length > 0) {
        const totalLaborHours = wo.labor.reduce((sum, item) => sum + (parseFloat(item.hours) || 0), 0);
        durationHours = Math.max(1, totalLaborHours);
      }
      const service = wo.serviceRequested?.toLowerCase() || '';
      if (service.includes('diagnos')) durationHours = Math.max(1, durationHours);
      else if (service.includes('oil change') || service.includes('inspection')) durationHours = Math.max(0.5, durationHours);
      else if (service.includes('brake') || service.includes('repair')) durationHours = Math.max(2, durationHours);
      else if (service.includes('engine') || service.includes('transmission')) durationHours = Math.max(4, durationHours);
    }
    return durationHours;
  };

  const calculateEndTime = (startDate, startTime, durationHours) => {
    const startMoment = moment.tz(`${startDate} ${startTime}`, 'YYYY-MM-DD HH:mm', AMERICA_NEW_YORK);
    const endMoment = startMoment.clone().add(durationHours, 'hours');
    return {
      date: formatDateForField(endMoment),
      time: formatTimeForField(endMoment)
    };
  };

  if (loading) {
    return <div className="container mx-auto flex justify-center items-center h-48"><p>Loading form...</p></div>;
  }

  // Create customer options for dropdown, sorted alphabetically by name
  const customerOptions = customers
    .map(c => ({ value: c._id, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const vehicleOptions = vehicles.map(v => ({ value: v._id, label: `${v.year} ${v.make} ${v.model} ${v.licensePlate ? `(${v.licensePlate})` : ''}` }));
  const statusOptions = [ 
    { value: 'Scheduled', label: 'Scheduled' }, { value: 'Confirmed', label: 'Confirmed' },
    { value: 'In Progress', label: 'In Progress' }, { value: 'Completed', label: 'Completed' },
    { value: 'Cancelled', label: 'Cancelled' }, { value: 'No-Show', label: 'No-Show' }
  ];
  const technicianOptions = [{ value: '', label: 'Select Technician (Optional)' }, ...technicians.map(t => ({ value: t._id, label: `${t.name}${t.specialization ? ` (${t.specialization})` : ''}` }))];
  const validateTimes = (startD, startT, endD, endT) => !startD || !startT || !endD || !endT || new Date(`${startD}T${startT}`) < new Date(`${endD}T${endT}`);

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {id ? 'Edit Appointment' : 'Schedule New Appointment'}
        </h1>
        {workOrderContext && (
          <div className="mt-2 text-sm bg-blue-50 text-blue-700 p-2 rounded-md">
            Scheduling for Work Order: <span className="font-bold">{workOrderContext.serviceRequested || (workOrderContext.services && workOrderContext.services[0]?.description)}</span>
          </div>
        )}
      </div>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
      {hasConflicts && <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4"><p className="font-medium">Warning: Scheduling Conflict</p><p>{conflictMessage}</p></div>}

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
                  <SelectInput label="Customer" name="customer" options={[{ value: '', label: 'Select Customer'}, ...customerOptions]} value={values.customer} onChange={(e) => handleCustomerChange(e, setFieldValue)} onBlur={handleBlur} error={errors.customer} touched={touched.customer} disabled={!!workOrderContext} required />
                </div>
                <div>
                  <SelectInput label="Vehicle" name="vehicle" options={[{ value: '', label: 'Select Vehicle'}, ...vehicleOptions]} value={values.vehicle} onChange={handleChange} onBlur={handleBlur} error={errors.vehicle} touched={touched.vehicle} disabled={!values.customer || !!workOrderContext || vehicles.length === 0} required={!!values.workOrder} />
                </div>
                <div className="md:col-span-2">
                  <Input label="Service Type" name="serviceType" value={values.serviceType} onChange={handleChange} onBlur={handleBlur} error={errors.serviceType} touched={touched.serviceType} disabled={!!workOrderContext} required placeholder="Oil Change, Brake Service, etc." />
                </div>
                
                <div className="md:col-span-2">
                  <h3 className="font-medium text-gray-700 mb-2">Appointment Time</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                        <Input type="date" name="startDate" value={values.startDate} onChange={(e) => { const newDate = e.target.value; setFieldValue('startDate', newDate); if (new Date(newDate) > new Date(values.endDate)) setFieldValue('endDate', newDate); }} onBlur={handleBlur} error={errors.startDate} touched={touched.startDate} required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time <span className="text-red-500">*</span></label>
                        <SelectInput name="startTime" options={timeOptions} value={values.startTime} onChange={(e) => { const newTime = e.target.value; setFieldValue('startTime', newTime); const duration = workOrderContext ? estimateAppointmentDuration(workOrderContext) : 1; const newEnd = calculateEndTime(values.startDate, newTime, duration); setFieldValue('endDate', newEnd.date); setFieldValue('endTime', newEnd.time); if (values.technician) checkForConflicts({...values, startTime: newTime, endDate: newEnd.date, endTime: newEnd.time }); }} onBlur={handleBlur} error={errors.startTime} touched={touched.startTime} required />
                      </div>
                    </div>
                    <div>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date <span className="text-red-500">*</span></label>
                        <Input type="date" name="endDate" value={values.endDate} min={values.startDate} onChange={(e) => { const newDate = e.target.value; setFieldValue('endDate', newDate); if (values.technician) checkForConflicts({...values, endDate: newDate}); }} onBlur={handleBlur} error={errors.endDate} touched={touched.endDate} required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Time <span className="text-red-500">*</span></label>
                        <SelectInput name="endTime" options={timeOptions} value={values.endTime} onChange={(e) => { const newTime = e.target.value; setFieldValue('endTime', newTime); if (values.technician) checkForConflicts({...values, endTime: newTime}); }} onBlur={handleBlur} error={errors.endTime} touched={touched.endTime} required />
                      </div>
                    </div>
                  </div>
                  {values.startDate && values.startTime && values.endDate && values.endTime && !validateTimes(values.startDate, values.startTime, values.endDate, values.endTime) && <div className="text-red-500 text-sm mt-2">End time must be after start time.</div>}
                </div>
                
                <div>
                  <SelectInput label="Technician" name="technician" options={technicianOptions} value={values.technician} onChange={(e) => { const newTech = e.target.value; setFieldValue('technician', newTech); if (values.startDate && values.startTime && values.endDate && values.endTime) checkForConflicts({...values, technician: newTech}); }} onBlur={handleBlur} error={errors.technician} touched={touched.technician} />
                </div>
                <div>
                  <SelectInput label="Status" name="status" options={statusOptions} value={values.status} onChange={handleChange} onBlur={handleBlur} error={errors.status} touched={touched.status} required />
                </div>
                <div className="md:col-span-2">
                  <TextArea label="Notes" name="notes" value={values.notes} onChange={handleChange} onBlur={handleBlur} error={errors.notes} touched={touched.notes} rows={4} />
                </div>
                
                {!id && !workOrderContext && (
                  <div className="md:col-span-2 flex items-center">
                    <input type="checkbox" id="createWorkOrder" name="createWorkOrder" checked={values.createWorkOrder} onChange={handleChange} className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
                    <label htmlFor="createWorkOrder" className="ml-2 block text-sm text-gray-900">Create work order from this appointment</label>
                  </div>
                )}
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <Button type="button" variant="light" onClick={() => navigate(id ? `/appointments/${id}` : '/appointments')}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={isSubmitting || !validateTimes(values.startDate, values.startTime, values.endDate, values.endTime)}>{isSubmitting ? 'Saving...' : (id ? 'Update Appointment' : 'Schedule Appointment')}</Button>
              </div>
            </Form>
          )}
        </Formik>
      </Card>
    </div>
  );
};

export default AppointmentForm;
