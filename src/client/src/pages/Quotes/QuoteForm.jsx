import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';
import Button from '../../components/common/Button';
import QuoteService from '../../services/quoteService';
import CustomerService from '../../services/customerService';
import VehicleService from '../../services/vehicleService';
import { formatDateForInput, getTodayForInput } from '../../utils/formatters';

const QuoteSchema = Yup.object().shape({
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
  diagnosticNotes: Yup.string()
});

const QuoteForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const customerIdParam = searchParams.get('customer');
  const vehicleIdParam = searchParams.get('vehicle');

  const [initialValues, setInitialValues] = useState({
    customer: customerIdParam || '',
    vehicle: vehicleIdParam || '',
    date: getTodayForInput(),
    currentMileage: '',
    services: [{ description: '' }],
    priority: 'Normal',
    diagnosticNotes: '',
    parts: [],
    labor: []
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const customersResponse = await CustomerService.getAllCustomers();
        const sortedCustomers = (customersResponse.data.customers || []).sort((a, b) => {
          const lastNameA = a.name.split(' ').pop();
          const lastNameB = b.name.split(' ').pop();
          return lastNameA.localeCompare(lastNameB);
        });
        setCustomers(sortedCustomers);

        if (id) {
          const quoteResponse = await QuoteService.getQuote(id);
          const quoteData = quoteResponse.data.workOrder;

          let servicesArray = [];
          if (quoteData.services && quoteData.services.length > 0) {
            servicesArray = quoteData.services;
          } else if (quoteData.serviceRequested) {
            servicesArray = quoteData.serviceRequested.split('\n')
              .filter(line => line.trim().length > 0)
              .map(line => ({ description: line.trim() }));
            if (servicesArray.length === 0) {
              servicesArray = [{ description: quoteData.serviceRequested }];
            }
          } else {
            servicesArray = [{ description: '' }];
          }

          const loadedVehicleId = typeof quoteData.vehicle === 'object'
            ? quoteData.vehicle._id
            : quoteData.vehicle;

          setInitialValues({
            customer: typeof quoteData.customer === 'object'
              ? quoteData.customer._id
              : quoteData.customer,
            vehicle: loadedVehicleId,
            currentMileage: quoteData.currentMileage || '',
            date: formatDateForInput(quoteData.date),
            services: servicesArray,
            priority: quoteData.priority || 'Normal',
            diagnosticNotes: quoteData.diagnosticNotes || '',
            parts: quoteData.parts || [],
            labor: quoteData.labor || []
          });

          if (quoteData.customer) {
            const customerIdToFetch = typeof quoteData.customer === 'object'
              ? quoteData.customer._id
              : quoteData.customer;
            await fetchVehiclesForCustomer(customerIdToFetch);
            if (loadedVehicleId && !quoteData.currentMileage) {
              await fetchAndSetLatestMileage(loadedVehicleId, (mileage) => {
                setInitialValues(prev => ({ ...prev, currentMileage: mileage }));
              });
            }
          }
        } else {
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
        const latestEntry = vehicleData.mileageHistory.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        setMileageCallback(latestEntry.mileage || '');
      } else if (vehicleData && vehicleData.currentMileage) {
        setMileageCallback(vehicleData.currentMileage || '');
      } else {
        setMileageCallback('');
      }
    } catch (error) {
      console.error('Error fetching vehicle details for mileage:', error);
      setMileageCallback('');
    }
  };

  const handleCustomerChange = async (e, setFieldValue) => {
    const customerId = e.target.value;
    setFieldValue('customer', customerId);
    setFieldValue('vehicle', '');
    setFieldValue('currentMileage', '');

    if (customerId) {
      try {
        const fetchedVehicles = await fetchVehiclesForCustomer(customerId);
        if (fetchedVehicles.length > 0) {
          const firstVehicleId = fetchedVehicles[0]._id;
          setFieldValue('vehicle', firstVehicleId);
          await fetchAndSetLatestMileage(firstVehicleId, (mileage) => {
            setFieldValue('currentMileage', mileage);
          });
        }
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
  };

  const handleSubmit = async (values, { setSubmitting }) => {
    try {
      const finalData = {
        ...values,
        serviceRequested: values.services.map(s => s.description).join('\n')
      };

      if (id) {
        await QuoteService.updateQuote(id, finalData);
        navigate(`/quotes/${id}`);
      } else {
        const response = await QuoteService.createQuote(finalData);
        const newQuoteId = response.data.quote._id;
        navigate(`/quotes/${newQuoteId}`);
      }
    } catch (err) {
      console.error('Error saving quote:', err);
      setError('Failed to save quote. Please try again later.');
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

  const customerOptions = customers
    .map(customer => ({
      value: customer._id,
      label: customer.name
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const vehicleOptions = [
    { value: '', label: 'No Vehicle' },
    ...vehicles.map(vehicle => ({
      value: vehicle._id,
      label: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.licensePlate ? `(${vehicle.licensePlate})` : ''}`
    }))
  ];

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
          {id ? 'Edit Quote' : 'Create New Quote'}
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
          validationSchema={QuoteSchema}
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

                {/* Services Section */}
                <div className="md:col-span-2">
                  <FieldArray name="services">
                    {({ remove, push }) => (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Services Quoted <span className="text-red-500">*</span>
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
                                  placeholder={`Service ${index + 1}`}
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

                <div className="md:col-span-2">
                  <TextArea
                    label="Notes (Customer Facing)"
                    name="diagnosticNotes"
                    value={values.diagnosticNotes}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.diagnosticNotes}
                    touched={touched.diagnosticNotes}
                    rows={4}
                    placeholder="Enter notes about the quote (visible to customer)"
                  />
                </div>
              </div>

              {id && (
                <div className="mt-6 text-gray-500 text-sm">
                  <p>
                    To add or update parts and labor, please use the Quote Details page after saving.
                  </p>
                </div>
              )}

              <div className="mt-6 flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="light"
                  onClick={() => navigate(id ? `/quotes/${id}` : '/quotes')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Quote'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </Card>
    </div>
  );
};

export default QuoteForm;
