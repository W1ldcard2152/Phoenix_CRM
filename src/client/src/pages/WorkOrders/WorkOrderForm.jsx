import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';
import Button from '../../components/common/Button';
import WorkOrderService from '../../services/workOrderService';
import CustomerService from '../../services/customerService';
import VehicleService from '../../services/vehicleService'; // Added VehicleService

// Validation schema - updated for services array
const WorkOrderSchema = Yup.object().shape({
  customer: Yup.string().required('Customer is required'),
  vehicle: Yup.string(),
  currentMileage: Yup.number()
    .typeError('Mileage must be a number')
    .nullable()
    .positive('Mileage must be a positive number')
    .integer('Mileage must be an integer'),
  services: Yup.array().of(
    Yup.object().shape({
      description: Yup.string().required('Service description is required')
    })
  ).min(1, 'At least one service item is required'),
  priority: Yup.string().required('Priority is required'),
  status: Yup.string().required('Status is required'),
  diagnosticNotes: Yup.string()
});

const WorkOrderForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // No need to maintain workOrder state since we use initialValues
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Get parameters from URL
  const customerIdParam = searchParams.get('customer');
  const vehicleIdParam = searchParams.get('vehicle');
  
  const [initialValues, setInitialValues] = useState({
    customer: customerIdParam || '',
    vehicle: vehicleIdParam || '',
    date: new Date().toISOString().split('T')[0],
    currentMileage: '', // Added currentMileage
    services: [{ description: '' }], // Initialize with one empty service item
    priority: 'Normal',
    status: 'Created',
    diagnosticNotes: '',
    parts: [],
    labor: []
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch customers for dropdown and sort them alphabetically by name
        const customersResponse = await CustomerService.getAllCustomers();
        const sortedCustomers = (customersResponse.data.customers || []).sort((a, b) => {
          const lastNameA = a.name.split(' ').pop();
          const lastNameB = b.name.split(' ').pop();
          return lastNameA.localeCompare(lastNameB);
        });
        setCustomers(sortedCustomers);
        
        // If editing existing work order, fetch work order data
        if (id) {
          const workOrderResponse = await WorkOrderService.getWorkOrder(id);
          const workOrderData = workOrderResponse.data.workOrder;
          // No need to set workOrder since we use initialValues
          
          // Convert existing serviceRequested to services array if needed
          let servicesArray = [];
          if (workOrderData.services && workOrderData.services.length > 0) {
            servicesArray = workOrderData.services;
          } else if (workOrderData.serviceRequested) {
            // Handle legacy data - split by newlines if present
            servicesArray = workOrderData.serviceRequested.split('\n')
              .filter(line => line.trim().length > 0)
              .map(line => ({ description: line.trim() }));
            
            // If no newlines, just use the whole string
            if (servicesArray.length === 0) {
              servicesArray = [{ description: workOrderData.serviceRequested }];
            }
          } else {
            servicesArray = [{ description: '' }];
          }
          
          // Set initial form values
          const loadedVehicleId = typeof workOrderData.vehicle === 'object' 
            ? workOrderData.vehicle._id 
            : workOrderData.vehicle;

          setInitialValues({
            customer: typeof workOrderData.customer === 'object' 
              ? workOrderData.customer._id 
              : workOrderData.customer,
            vehicle: loadedVehicleId,
            currentMileage: workOrderData.currentMileage || '', // Load current mileage if exists
            date: new Date(workOrderData.date).toISOString().split('T')[0],
            services: servicesArray,
            priority: workOrderData.priority || 'Normal',
            status: workOrderData.status || 'Created',
            diagnosticNotes: workOrderData.diagnosticNotes || '',
            parts: workOrderData.parts || [],
            labor: workOrderData.labor || []
          });
          
          if (workOrderData.customer) {
            const customerIdToFetch = typeof workOrderData.customer === 'object' 
              ? workOrderData.customer._id 
              : workOrderData.customer;
            await fetchVehiclesForCustomer(customerIdToFetch);
            if (loadedVehicleId && !workOrderData.currentMileage) { // If not pre-filled by WO, try to get from vehicle
              await fetchAndSetLatestMileage(loadedVehicleId, (mileage) => {
                setInitialValues(prev => ({ ...prev, currentMileage: mileage }));
              });
            }
          }
        } else { // Creating new work order
          if (customerIdParam) {
            await fetchVehiclesForCustomer(customerIdParam);
            if (vehicleIdParam) {
               await fetchAndSetLatestMileage(vehicleIdParam, (mileage) => {
                setInitialValues(prev => ({ ...prev, vehicle: vehicleIdParam, currentMileage: mileage }));
              });
            }
          }
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
      return vehiclesResponse.data.vehicles || [];
    } catch (err) {
      console.error('Error fetching vehicles for customer:', err);
      setError('Failed to load vehicles for the selected customer.');
      return [];
    }
  };

  const fetchAndSetLatestMileage = async (vehicleId, setMileageCallback) => {
    if (!vehicleId) {
      setMileageCallback('');
      return;
    }
    try {
      const response = await VehicleService.getVehicle(vehicleId);
      const vehicleData = response.data.vehicle;
      if (vehicleData && vehicleData.mileageHistory && vehicleData.mileageHistory.length > 0) {
        // Sort by date descending to get the latest entry
        const latestEntry = vehicleData.mileageHistory.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        setMileageCallback(latestEntry.mileage || '');
      } else if (vehicleData && vehicleData.currentMileage) { // Fallback to currentMileage if no history
        setMileageCallback(vehicleData.currentMileage || '');
      } else {
        setMileageCallback('');
      }
    } catch (error) {
      console.error('Error fetching vehicle details for mileage:', error);
      // Don't set error state here not to overwrite form-level errors, but clear mileage
      setMileageCallback('');
    }
  };

  const handleCustomerChange = async (e, setFieldValue) => {
    const customerId = e.target.value;
    setFieldValue('customer', customerId);
    setFieldValue('vehicle', ''); 
    setFieldValue('currentMileage', ''); // Reset mileage when customer changes
    
    if (customerId) {
      try {
        const fetchedVehicles = await fetchVehiclesForCustomer(customerId);
        // Don't auto-select a vehicle anymore since it's now optional
        // Leave vehicle field empty so user can choose
      } catch (err) {
        console.error('Error fetching vehicles for customer:', err);
        setError('Failed to load vehicles for the selected customer.');
        setVehicles([]);
      }
    } else {
      setVehicles([]); 
    }
  };

  const handleVehicleChange = async (e, setFieldValue) => {
    const vehicleId = e.target.value;
    setFieldValue('vehicle', vehicleId);
    if (vehicleId) {
      await fetchAndSetLatestMileage(vehicleId, (mileage) => setFieldValue('currentMileage', mileage));
    } else {
      setFieldValue('currentMileage', ''); // Clear mileage when no vehicle selected
    }
  };

  const handleSubmit = async (values, { setSubmitting }) => {
    try {
      // Prepare final data - ensure services array is properly formatted
      const finalData = {
        ...values,
        // Generate serviceRequested for backward compatibility
        serviceRequested: values.services.map(s => s.description).join('\n')
      };
      
      if (id) {
        // Update existing work order
        await WorkOrderService.updateWorkOrder(id, finalData);
      } else {
        // Create new work order
        await WorkOrderService.createWorkOrder(finalData);
      }
      
      // Redirect to work order list or detail page
      navigate('/work-orders');
    } catch (err) {
      console.error('Error saving work order:', err);
      setError('Failed to save work order. Please try again later.');
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

  // Create customer options for dropdown, sorted alphabetically by name
  const customerOptions = customers
    .map(customer => ({
      value: customer._id,
      label: customer.name
    }))
    .sort((a, b) => a.label.localeCompare(b.label));


  // Create vehicle options for dropdown
  const vehicleOptions = [
    { value: '', label: 'No Vehicle' },
    ...vehicles.map(vehicle => ({
      value: vehicle._id,
      label: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.licensePlate ? `(${vehicle.licensePlate})` : ''}`
    }))
  ];

  // Status options for dropdown
  const statusOptions = [
    { value: 'Created', label: 'Created' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Inspected - Need Parts Ordered', label: 'Inspected - Need Parts' },
    { value: 'Parts Ordered', label: 'Parts Ordered' },
    { value: 'Parts Received', label: 'Parts Received' },
    { value: 'Repair In Progress', label: 'Repair In Progress' },
    { value: 'Completed - Need Payment', label: 'Completed - Need Payment' },
    { value: 'Completed - Paid', label: 'Completed - Paid' },
    { value: 'Invoiced', label: 'Invoiced' }, // Added Invoiced status
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  // Priority options for dropdown
  const priorityOptions = [
    { value: 'Low', label: 'Low' },
    { value: 'Normal', label: 'Normal' },
    { value: 'High', label: 'High' },
    { value: 'Urgent', label: 'Urgent' }
  ];

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {id ? 'Edit Work Order' : 'Create New Work Order'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <Card>
        <Formik
          initialValues={initialValues}
          validationSchema={WorkOrderSchema}
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
                    label="Vehicle (Optional)"
                    name="vehicle"
                    options={vehicleOptions}
                    value={values.vehicle}
                    onChange={(e) => handleVehicleChange(e, setFieldValue)}
                    onBlur={handleBlur}
                    error={errors.vehicle}
                    touched={touched.vehicle}
                    disabled={!values.customer}
                  />
                </div>

                <div>
                  <Input
                    label="Current Mileage"
                    name="currentMileage"
                    type="number"
                    value={values.currentMileage}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.currentMileage}
                    touched={touched.currentMileage}
                    placeholder="e.g., 12345"
                  />
                </div>
                
                <div>
                  <Input
                    label="Date"
                    name="date"
                    type="date"
                    value={values.date}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.date}
                    touched={touched.date}
                    required
                  />
                </div>
                
                <div>
                  <SelectInput
                    label="Priority"
                    name="priority"
                    options={priorityOptions}
                    value={values.priority}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.priority}
                    touched={touched.priority}
                    required
                  />
                </div>
                
                {/* Services Section - Multiple services can be added */}
                <div className="md:col-span-2">
                  <FieldArray name="services">
                    {({ insert, remove, push }) => (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Services Requested <span className="text-red-500">*</span>
                          </label>
                          <button
                            type="button"
                            className="text-primary-600 hover:text-primary-800 text-sm"
                            onClick={() => push({ description: '' })}
                          >
                            + Add Another Service
                          </button>
                        </div>
                        
                        {values.services && values.services.length > 0 ? (
                          values.services.map((service, index) => (
                            <div key={index} className="flex items-center mb-2">
                              <div className="flex-grow">
                                <Input
                                  name={`services.${index}.description`}
                                  value={service.description}
                                  onChange={handleChange}
                                  onBlur={handleBlur}
                                  error={
                                    errors.services && 
                                    errors.services[index] && 
                                    errors.services[index].description
                                  }
                                  touched={
                                    touched.services && 
                                    touched.services[index] && 
                                    touched.services[index].description
                                  }
                                  placeholder={`Service request ${index + 1}`}
                                  required
                                />
                              </div>
                              {values.services.length > 1 && (
                                <button
                                  type="button"
                                  className="ml-2 text-red-600 hover:text-red-800"
                                  onClick={() => remove(index)}
                                >
                                  <i className="fas fa-times"></i>
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <button
                            type="button"
                            className="text-primary-600 hover:text-primary-800"
                            onClick={() => push({ description: '' })}
                          >
                            Add a service
                          </button>
                        )}
                        {typeof errors.services === 'string' && (
                          <div className="text-red-500 text-sm mt-1">{errors.services}</div>
                        )}
                      </div>
                    )}
                  </FieldArray>
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
                    label="Diagnostic Notes"
                    name="diagnosticNotes"
                    value={values.diagnosticNotes}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.diagnosticNotes}
                    touched={touched.diagnosticNotes}
                    rows={4}
                  />
                </div>
              </div>
              
              {id && (
                <div className="mt-6 text-gray-500 text-sm">
                  <p>
                    To add or update parts and labor, please use the Work Order Details page after saving.
                  </p>
                </div>
              )}
              
              <div className="mt-6 flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="light"
                  onClick={() => navigate(id ? `/work-orders/${id}` : '/work-orders')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Work Order'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </Card>
    </div>
  );
};

export default WorkOrderForm;
