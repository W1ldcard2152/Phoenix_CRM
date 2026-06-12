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
import AvailabilityCalendar from '../../components/appointments/AvailabilityCalendar';
import AppointmentService from '../../services/appointmentService';
import CustomerService from '../../services/customerService';
import WorkOrderService from '../../services/workOrderService';
import technicianService from '../../services/technicianService';
import SettingsService from '../../services/settingsService';
import { TIMEZONE } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminOrManagement } from '../../utils/permissions';
import { getOpenIntervals, addBusinessMinutes, businessMinutesBetween } from '../../utils/businessTime';

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
  duration: Yup.number().min(15, 'Duration is required').required('Duration is required'),
  status: Yup.string().required('Status is required'),
  technician: Yup.string().required('Technician is required')
});

// Duration choices: 15-min steps to 2h, 30-min to 8h, then hourly to 16h
const DURATION_OPTIONS = (() => {
  const opts = [];
  for (let m = 15; m <= 120; m += 15) opts.push(m);
  for (let m = 150; m <= 480; m += 30) opts.push(m);
  for (let m = 540; m <= 960; m += 60) opts.push(m);
  return opts.map(m => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const label = h > 0 ? (mm > 0 ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`;
    return { value: m, label };
  });
})();

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
  const [showCalendar, setShowCalendar] = useState(false);
  const [shopHoursMap, setShopHoursMap] = useState(null);
  const { user } = useAuth();


  // Helper to format moment objects for form fields
  const formatDateForField = (momentDate) => momentDate.format('YYYY-MM-DD');
  const formatTimeForField = (momentDate) => momentDate.format('HH:mm');

  // nowET and laterTimeET will be defined inside useEffect

  const [initialValues, setInitialValues] = useState({
    customer: '',
    vehicle: '',
    serviceType: '',
    serviceTypeCustom: '', // For "Other" option
    details: '',
    startDate: '', // Will be set in useEffect
    startTime: '', // Will be set in useEffect
    duration: 60,  // Shop-time minutes; end time is computed by flowing through shop hours
    technician: '',
    status: 'Scheduled',
    notes: '',
    workOrder: '',
    createWorkOrder: false
  });

  const minutesToTimeOption = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
    return {
      value: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
      label: `${hour12}:${String(mins).padStart(2, '0')} ${period}`
    };
  };

  /**
   * Start-time choices for the selected date: 15-min steps within that
   * day's open intervals (excludes lunch). A closed date falls back to
   * default 8-6 hours, so appointments can still be placed there.
   */
  const generateTimeOptions = (dateStr, currentValue = '') => {
    const day = dateStr ? moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE) : moment.tz(TIMEZONE);
    const intervals = getOpenIntervals(day, shopHoursMap, day.format('YYYY-MM-DD'));
    const options = [];
    intervals.forEach(({ start, end }) => {
      const startMin = start.hour() * 60 + start.minute();
      const endMin = end.hour() * 60 + end.minute();
      for (let m = startMin; m < endMin; m += 15) {
        options.push(minutesToTimeOption(m));
      }
    });
    // Keep a legacy/out-of-hours value selectable so editing doesn't blank it
    if (currentValue && !options.some(o => o.value === currentValue)) {
      const [h, m] = currentValue.split(':').map(Number);
      options.push(minutesToTimeOption(h * 60 + m));
      options.sort((a, b) => a.value.localeCompare(b.value));
    }
    return options;
  };

  /**
   * Computed end: start + duration flowed through shop hours (wraps past
   * close into the next open day, skips lunch and closed days).
   */
  const computeEnd = (startDate, startTime, duration) => {
    if (!startDate || !startTime || !duration) return null;
    const start = moment.tz(`${startDate} ${startTime}`, 'YYYY-MM-DD HH:mm', TIMEZONE);
    if (!start.isValid()) return null;
    return addBusinessMinutes(start, Number(duration), shopHoursMap, startDate);
  };

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

      // Define nowET inside the effect
      const nowET = moment.tz(TIMEZONE);
      nowET.minutes(Math.ceil(nowET.minutes() / 15) * 15).seconds(0).milliseconds(0);

      try {
        const customerListResponse = await CustomerService.getAllCustomers();
        setCustomers(customerListResponse.data.customers || []);

        const technicianListResponse = await technicianService.getAllTechnicians(true);
        setTechnicians(technicianListResponse.data.data.technicians || []);

        // Shop hours drive start-time options and end-time flow computation
        let hoursMap = null;
        try {
          const settingsRes = await SettingsService.getSettings();
          const hours = settingsRes.data?.settings?.shopHours;
          if (hours && hours.length > 0) {
            hoursMap = {};
            hours.forEach(d => { hoursMap[d.dayOfWeek] = d; });
          }
        } catch (settingsErr) {
          console.error('Failed to load shop hours, using defaults:', settingsErr);
        }
        setShopHoursMap(hoursMap);

        // Default initial values based on current date/time
        let currentInitialValues = {
            customer: '',
            vehicle: '',
            serviceType: '',
            details: '',
            startDate: formatDateForField(nowET), // Use nowET defined in effect
            startTime: formatTimeForField(nowET), // Use nowET defined in effect
            duration: 60,
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

          // If reschedule=true, override status to 'Scheduled' so the user reschedules the appointment
          const isReschedule = searchParams.get('reschedule') === 'true';

          // Seed duration from the existing range, measured in shop-open time
          const apptStartET = moment.utc(appt.startTime).tz(TIMEZONE);
          const apptEndET = moment.utc(appt.endTime).tz(TIMEZONE);
          let editDuration = businessMinutesBetween(apptStartET, apptEndET, hoursMap, apptStartET.format('YYYY-MM-DD'));
          if (editDuration <= 0) {
            editDuration = apptEndET.diff(apptStartET, 'minutes'); // legacy range outside open hours
          }
          editDuration = Math.max(15, Math.round(editDuration / 15) * 15);

          currentInitialValues = {
            ...currentInitialValues, // Keep date/time defaults unless overwritten
            customer: apptCustomerId || '',
            vehicle: appt.vehicle?._id || appt.vehicle || '',
            serviceType: appt.serviceType || '',
            details: appt.details || '',
            startDate: formatDateForField(isReschedule ? nowET : apptStartET),
            startTime: formatTimeForField(isReschedule ? nowET : apptStartET),
            duration: editDuration,
            technician: appt.technician?._id || appt.technician || '',
            status: isReschedule ? 'Scheduled' : (appt.status || 'Scheduled'),
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
            duration: Math.min(960, Math.max(15, Math.round(estimateAppointmentDuration(wo) * 60 / 15) * 15)),
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

    if (customerId) {
      const fetchedVehicles = await fetchVehiclesForCustomer(customerId);
      // Auto-select first vehicle if available
      if (fetchedVehicles && fetchedVehicles.length > 0) {
        setFieldValue('vehicle', fetchedVehicles[0]._id);
      }
    }
  };

  const checkForConflicts = async (values) => {
    if (!values.startDate || !values.startTime || !values.duration || !values.technician) {
      setHasConflicts(false);
      setConflictMessage('');
      return false;
    }

    const startDateTime = moment.tz(`${values.startDate} ${values.startTime}`, 'YYYY-MM-DD HH:mm', TIMEZONE).toISOString();
    const computedEnd = computeEnd(values.startDate, values.startTime, values.duration);
    if (!computedEnd) {
      setHasConflicts(false);
      setConflictMessage('');
      return false;
    }
    const endDateTime = computedEnd.toISOString();
    try {
      const conflictCheckData = {
        startTime: startDateTime,
        endTime: endDateTime,
        technician: values.technician
      };

      // Include appointmentId when editing to exclude current appointment from conflict check
      if (id) {
        conflictCheckData.appointmentId = id;
      }

      const response = await AppointmentService.checkConflicts(conflictCheckData);
      setHasConflicts(response.data.hasConflicts);

      if (response.data.hasConflicts) {
        const parts = [];
        if (response.data.conflicts?.length > 0) {
          const apptLabels = response.data.conflicts.map(a => {
            const customerName = a.customer?.name || 'Unknown customer';
            const v = a.vehicle;
            const vehicleLabel = v ? `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() : '';
            return vehicleLabel ? `${customerName} (${vehicleLabel})` : customerName;
          }).join(', ');
          parts.push(`appointment conflict(s): ${apptLabels}`);
        }
        if (response.data.scheduleBlockConflicts?.length > 0) {
          const blockConflicts = response.data.scheduleBlockConflicts;
          if (isAdminOrManagement(user)) {
            const blockNames = blockConflicts.map(b => b.title).join(', ');
            parts.push(`task conflict(s): ${blockNames}`);
          } else {
            const unavailableTimes = blockConflicts.map(b => {
              const start = moment.utc(b.startTime).tz(TIMEZONE).format('h:mm A');
              const end = moment.utc(b.endTime).tz(TIMEZONE).format('h:mm A');
              return `${start} to ${end}`;
            }).join(', ');
            parts.push(`This technician is unavailable from ${unavailableTimes}`);
          }
        }
        setConflictMessage(parts.length > 0 ? `Found ${parts.join(' and ')}.` : 'Scheduling conflict detected.');
      } else {
        setConflictMessage('');
      }

      return response.data.hasConflicts;
    } catch (err) {
      setError('Failed to check conflicts.');
      return false;
    }
  };

  const handleSubmit = async (values, { setSubmitting }) => {
    // Combine date and time; the end flows through shop hours from start + duration
    const startTimeForServer = moment.tz(`${values.startDate} ${values.startTime}`, 'YYYY-MM-DD HH:mm', TIMEZONE).toISOString();
    const endTimeForServer = computeEnd(values.startDate, values.startTime, values.duration).toISOString();

    const formattedValues = {
      ...values,
      startTime: startTimeForServer,
      endTime: endTimeForServer,
      // Use custom service type if "Other" is selected
      serviceType: values.serviceType === 'Other' ? values.serviceTypeCustom : values.serviceType
    };
    delete formattedValues.startDate;
    delete formattedValues.duration;
    delete formattedValues.serviceTypeCustom; // Don't send this to server

    // Call checkForConflicts to update the warning message, but don't block submission
    await checkForConflicts(values); 

    try {
      if (id) {
        await AppointmentService.updateAppointment(id, formattedValues);
      } else {
        await AppointmentService.createAppointment(formattedValues);
      }
      
      // Redirect back to the originating page
      const fromParam = searchParams.get('from');
      const workOrderParam = searchParams.get('workOrder');
      if (fromParam) {
        navigate(fromParam);
      } else if (workOrderParam) {
        navigate('/work-orders');
      } else {
        navigate('/appointments');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save appointment.');
      setSubmitting(false);
    }
  };
  
  const estimateAppointmentDuration = (wo) => {
    let durationHours = 1;
    if (wo) {
      if (wo.labor && wo.labor.length > 0) {
        const totalLaborHours = wo.labor.reduce((sum, item) => sum + (parseFloat(item.quantity) || parseFloat(item.hours) || 0), 0);
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

  if (loading) {
    return <div className="container mx-auto flex justify-center items-center h-48"><p>Loading form...</p></div>;
  }

  // Create customer options for dropdown, sorted alphabetically by name
  const customerOptions = customers
    .map(c => ({ value: c._id, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const vehicleOptions = vehicles.map(v => ({ value: v._id, label: `${v.year} ${v.make} ${v.model} ${v.licensePlate ? `(${v.licensePlate})` : ''}` }));
  const statusOptions = [
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Confirmed', label: 'Confirmed' },
    { value: 'Inspection/Diag Scheduled', label: 'Inspection/Diag Scheduled' },
    { value: 'Inspection In Progress', label: 'Inspection In Progress' },
    { value: 'Inspection/Diag Complete', label: 'Inspection/Diag Complete' },
    { value: 'Repair Scheduled', label: 'Repair Scheduled' },
    { value: 'Repair In Progress', label: 'Repair In Progress' },
    { value: 'Repair Complete - Awaiting Payment', label: 'Repair Complete - Awaiting Payment' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Cancelled', label: 'Cancelled' },
    { value: 'No-Show', label: 'No-Show' }
  ];
  const technicianOptions = [{ value: '', label: 'Select Technician' }, ...technicians.map(t => ({ value: t._id, label: `${t.name}${t.specialization ? ` (${t.specialization})` : ''}` }))];

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

      {/* Calendar Toggle */}
      <div className="mb-4">
        <Button
          type="button"
          variant={showCalendar ? 'primary' : 'outline'}
          onClick={() => setShowCalendar(!showCalendar)}
          size="sm"
        >
          <i className={`fas fa-calendar-alt mr-2`}></i>
          {showCalendar ? 'Hide Availability' : 'View Availability'}
        </Button>
      </div>

      {/* Compact Availability Calendar */}
      {showCalendar && (
        <div className="mb-4">
          <AvailabilityCalendar />
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
                  <SelectInput label="Customer" name="customer" options={[{ value: '', label: 'Select Customer'}, ...customerOptions]} value={values.customer} onChange={(e) => handleCustomerChange(e, setFieldValue)} onBlur={handleBlur} error={errors.customer} touched={touched.customer} disabled={!!workOrderContext} required />
                </div>
                <div>
                  <SelectInput label="Vehicle" name="vehicle" options={[{ value: '', label: 'Select Vehicle'}, ...vehicleOptions]} value={values.vehicle} onChange={handleChange} onBlur={handleBlur} error={errors.vehicle} touched={touched.vehicle} disabled={!values.customer || !!workOrderContext || vehicles.length === 0} required={!!values.workOrder} />
                </div>
                <div className="md:col-span-2">
                  <SelectInput
                    label="Service Type"
                    name="serviceType"
                    options={[
                      { value: '', label: 'Select Service Type' },
                      { value: 'Maintenance', label: 'Maintenance' },
                      { value: 'Inspection', label: 'Inspection' },
                      { value: 'Repair', label: 'Repair' },
                      { value: 'Diagnostic Work', label: 'Diagnostic Work' },
                      { value: 'Road Test', label: 'Road Test' },
                      { value: 'Other', label: 'Other' }
                    ]}
                    value={values.serviceType}
                    onChange={(e) => {
                      handleChange(e);
                      // Clear custom field if not "Other"
                      if (e.target.value !== 'Other') {
                        setFieldValue('serviceTypeCustom', '');
                      }
                    }}
                    onBlur={handleBlur}
                    error={errors.serviceType}
                    touched={touched.serviceType}
                    required
                  />
                  {values.serviceType === 'Other' && (
                    <div className="mt-2">
                      <Input
                        label="Custom Service Type"
                        name="serviceTypeCustom"
                        value={values.serviceTypeCustom}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="Enter custom service type"
                        required
                      />
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <Input
                    label="Appointment Details"
                    name="details"
                    value={values.details}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="e.g. Prep for paint, Oil change, etc."
                  />
                  {values.serviceType && values.details && (
                    <p className="text-xs text-gray-500 mt-1">
                      Calendar title: <span className="font-medium">{values.serviceType === 'Other' ? (values.serviceTypeCustom || 'Other') : values.serviceType}: {values.details}</span>
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <h3 className="font-medium text-gray-700 mb-2">Appointment Time</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                      <Input type="date" name="startDate" value={values.startDate} onChange={(e) => { const newDate = e.target.value; setFieldValue('startDate', newDate); if (values.technician) checkForConflicts({ ...values, startDate: newDate }); }} onBlur={handleBlur} error={errors.startDate} touched={touched.startDate} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time <span className="text-red-500">*</span></label>
                      <SelectInput name="startTime" options={generateTimeOptions(values.startDate, values.startTime)} value={values.startTime} onChange={(e) => { const newTime = e.target.value; setFieldValue('startTime', newTime); if (values.technician) checkForConflicts({ ...values, startTime: newTime }); }} onBlur={handleBlur} error={errors.startTime} touched={touched.startTime} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Duration <span className="text-red-500">*</span></label>
                      <SelectInput
                        name="duration"
                        options={(() => {
                          // Keep an out-of-range seeded duration (e.g. a long multi-day edit) selectable
                          const current = Number(values.duration);
                          if (!current || DURATION_OPTIONS.some(o => o.value === current)) return DURATION_OPTIONS;
                          const h = Math.floor(current / 60);
                          const mm = current % 60;
                          const label = h > 0 ? (mm > 0 ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`;
                          return [...DURATION_OPTIONS, { value: current, label }].sort((a, b) => a.value - b.value);
                        })()}
                        value={values.duration}
                        onChange={(e) => { const newDuration = Number(e.target.value); setFieldValue('duration', newDuration); if (values.technician) checkForConflicts({ ...values, duration: newDuration }); }}
                        onBlur={handleBlur}
                        error={errors.duration}
                        touched={touched.duration}
                        required
                      />
                    </div>
                  </div>
                  {(() => {
                    const end = computeEnd(values.startDate, values.startTime, values.duration);
                    if (!end) return null;
                    const wraps = end.format('YYYY-MM-DD') !== values.startDate;
                    return (
                      <div className="text-sm mt-2 text-gray-700">
                        Ends: <span className="font-medium">{end.format('ddd, MMM D · h:mm A')}</span>
                        {wraps && (
                          <span className="text-amber-600"> — wraps past close into the next open day</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                
                <div>
                  <SelectInput label="Technician" name="technician" options={technicianOptions} value={values.technician} onChange={(e) => { const newTech = e.target.value; setFieldValue('technician', newTech); if (values.startDate && values.startTime && values.duration) checkForConflicts({...values, technician: newTech}); }} onBlur={handleBlur} error={errors.technician} touched={touched.technician} required />
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
                <Button type="button" variant="light" onClick={() => navigate(searchParams.get('from') || (id ? `/appointments/${id}` : '/appointments'))}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={isSubmitting || !computeEnd(values.startDate, values.startTime, values.duration)}>{isSubmitting ? 'Saving...' : (id ? 'Update Appointment' : 'Schedule Appointment')}</Button>
              </div>
            </Form>
          )}
        </Formik>
      </Card>
    </div>
  );
};

export default AppointmentForm;
