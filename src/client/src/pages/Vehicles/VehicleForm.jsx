// src/client/src/pages/Vehicles/VehicleForm.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';
import Button from '../../components/common/Button';
import VehicleService from '../../services/vehicleService';
import CustomerService from '../../services/customerService';
import vinService from '../../services/vinService';
import RegistrationScanner from '../../components/vehicles/RegistrationScanner';
import { formatDateForInput, getTodayForInput } from '../../utils/formatters';

// Validation schema - updated with mileage history
const VehicleSchema = Yup.object().shape({
  customer: Yup.string().required('Customer is required'),
  year: Yup.number()
    .required('Year is required')
    .min(1900, 'Year must be at least 1900')
    .max(new Date().getFullYear() + 1, 'Year cannot be in the future'),
  make: Yup.string().required('Make is required'),
  model: Yup.string().required('Model is required'),
  vin: Yup.string(),
  licensePlate: Yup.string(),
  licensePlateState: Yup.string().max(2, 'State should be a 2-letter abbreviation'),
  currentMileage: Yup.number()
    .min(0, 'Mileage cannot be negative')
    .nullable(),
  mileageHistory: Yup.array().of(
    Yup.object().shape({
      date: Yup.date().required('Date is required'),
      mileage: Yup.number().required('Mileage is required').min(0, 'Mileage cannot be negative'),
      notes: Yup.string()
    })
  ),
  notes: Yup.string()
});

const VehicleForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vinDecoding, setVinDecoding] = useState(false);
  const [vinError, setVinError] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [scanSuccess, setScanSuccess] = useState(null);
  const [duplicateVinWarning, setDuplicateVinWarning] = useState(null);
  
  // Get customer ID from URL query parameter if present
  const customerIdParam = searchParams.get('customer'); // Look for 'customer' parameter from CustomerDetail
  
  const [initialValues, setInitialValues] = useState({
    customer: customerIdParam || '',
    year: '',
    make: '',
    model: '',
    vin: 'N/A',
    licensePlate: '',
    licensePlateState: '',
    currentMileage: '',
    mileageHistory: [],
    notes: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch customers for dropdown
        const customersResponse = await CustomerService.getAllCustomers();
        setCustomers(customersResponse.data.customers || []);
        
        // If editing existing vehicle, fetch vehicle data
        if (id) {
          const vehicleResponse = await VehicleService.getVehicle(id);
          const vehicleData = vehicleResponse.data.vehicle;
          
          // Set initial form values
          setInitialValues({
            customer: typeof vehicleData.customer === 'object' 
              ? vehicleData.customer._id 
              : vehicleData.customer,
            year: vehicleData.year || '',
            make: vehicleData.make || '',
            model: vehicleData.model || '',
            vin: vehicleData.vin || '',
            licensePlate: vehicleData.licensePlate || '',
            licensePlateState: vehicleData.licensePlateState || '',
            currentMileage: vehicleData.currentMileage || '',
            mileageHistory: vehicleData.mileageHistory || [],
            notes: vehicleData.notes || ''
          });
        } else if (customerIdParam) {
          // If creating new vehicle with customer parameter, update initial values
          setInitialValues(prev => ({
            ...prev,
            customer: customerIdParam
          }));
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again later.');
        setLoading(false);
      }
    };

    fetchData();
  }, [id, customerIdParam]);

  const handleSubmit = async (values, { setSubmitting, setErrors }) => {
    try {
      // Add current mileage to history if provided and no existing record for today
      if (values.currentMileage) {
        const today = getTodayForInput();
        const hasTodayRecord = values.mileageHistory.some(record =>
          formatDateForInputLocal(record.date) === today
        );

        if (!hasTodayRecord) {
          values.mileageHistory.push({
            date: today,
            mileage: values.currentMileage,
            notes: 'Auto-added from current mileage field'
          });
        }
      }

      // Sort mileage history by date (newest first)
      values.mileageHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

      if (id) {
        // Update existing vehicle
        await VehicleService.updateVehicle(id, values);
      } else {
        // Create new vehicle
        await VehicleService.createVehicle(values);
      }

      // Redirect to vehicle list or detail page
      if (values.customer) {
        navigate(`/customers/${values.customer}`);
      } else {
        navigate('/vehicles');
      }
    } catch (err) {
      console.error('Error saving vehicle:', err);

      // Check for duplicate VIN error (409 Conflict)
      if (err.response && err.response.status === 409 && err.response.data.data?.existingVehicle) {
        const existing = err.response.data.data.existingVehicle;
        setDuplicateVinWarning({
          message: err.response.data.message,
          vehicle: existing
        });
        setError(null);
      }
      // Handle validation errors from server
      else if (err.errors) {
        const formErrors = {};
        Object.keys(err.errors).forEach(key => {
          formErrors[key] = err.errors[key].message;
        });
        setErrors(formErrors);
      } else {
        setError('Failed to save vehicle. Please try again later.');
      }

      setSubmitting(false);
    }
  };

  // VIN decode function
  const handleVinDecode = async (vin, setFieldValue) => {
    if (!vin || vin.trim().length !== 17) {
      setVinError('Please enter a valid 17-character VIN');
      return;
    }

    setVinDecoding(true);
    setVinError(null);

    try {
      const result = await vinService.decodeVIN(vin);
      
      if (result.success) {
        // Auto-populate the fields
        if (result.data.year) {
          setFieldValue('year', result.data.year);
        }
        if (result.data.make) {
          setFieldValue('make', result.data.make);
        }
        if (result.data.model) {
          setFieldValue('model', result.data.model);
        }
        
        // Show success message
        setVinError(null);
        
        // Optional: Show a success message
        const vehicleName = vinService.getVehicleDisplayName(result.data);
        console.log(`VIN decoded successfully: ${vehicleName}`);
        
      } else {
        setVinError(result.error || 'Failed to decode VIN');
      }
    } catch (error) {
      console.error('VIN decode error:', error);
      setVinError('Failed to decode VIN. Please check the VIN and try again.');
    } finally {
      setVinDecoding(false);
    }
  };

  // Registration scanner handlers
  const handleRegistrationDataExtracted = (extractedData, setFieldValue) => {
    setScanError(null);
    
    if (extractedData.vin) {
      setFieldValue('vin', extractedData.vin);
      
      // Auto-decode VIN if it looks valid
      if (extractedData.vin.length === 17) {
        handleVinDecode(extractedData.vin, setFieldValue);
      }
    }
    
    if (extractedData.licensePlate) {
      setFieldValue('licensePlate', extractedData.licensePlate);
    }
    
    if (extractedData.licensePlateState) {
      setFieldValue('licensePlateState', extractedData.licensePlateState);
    }
    
    setScanSuccess('Registration scanned successfully! Vehicle information has been auto-filled.');
    
    // Clear success message after 5 seconds
    setTimeout(() => setScanSuccess(null), 5000);
  };

  const handleRegistrationScanError = (errorMessage) => {
    setScanError(errorMessage);
    setScanSuccess(null);
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

  // Format date for input field using the utility function
  const formatDateForInputLocal = (dateString) => {
    if (!dateString) return '';
    return formatDateForInput(dateString); // Use the imported utility
  };

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {id ? 'Edit Vehicle' : 'Add New Vehicle'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {duplicateVinWarning && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-bold">Duplicate VIN Detected</h3>
              <p className="text-sm mt-1">{duplicateVinWarning.message}</p>
              <div className="mt-2 text-sm">
                <p className="font-medium">Existing Vehicle:</p>
                <p>{duplicateVinWarning.vehicle.year} {duplicateVinWarning.vehicle.make} {duplicateVinWarning.vehicle.model}</p>
                <p className="mt-1">
                  <span className="font-medium">Owner: </span>
                  {duplicateVinWarning.vehicle.customer ? (
                    <a
                      href={`/customers/${duplicateVinWarning.vehicle.customer._id}`}
                      className="text-blue-700 hover:text-blue-900 underline font-medium"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {duplicateVinWarning.vehicle.customer.name}
                    </a>
                  ) : (
                    'Unknown'
                  )}
                </p>
              </div>
              <button
                type="button"
                className="mt-3 text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
                onClick={() => setDuplicateVinWarning(null)}
              >
                Dismiss Warning
              </button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <Formik
          initialValues={initialValues}
          validationSchema={VehicleSchema}
          onSubmit={handleSubmit}
          enableReinitialize
        >
          {({ isSubmitting, touched, errors, values, handleChange, handleBlur, setFieldValue }) => (
            <Form>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <SelectInput
                    label="Customer"
                    name="customer"
                    options={customerOptions}
                    value={values.customer}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.customer}
                    touched={touched.customer}
                    required
                  />
                </div>

                {/* Registration Scanner */}
                <div className="md:col-span-2">
                  {scanError && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                      {scanError}
                    </div>
                  )}
                  
                  {scanSuccess && (
                    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                      {scanSuccess}
                    </div>
                  )}
                  
                  <RegistrationScanner
                    onDataExtracted={(data) => handleRegistrationDataExtracted(data, setFieldValue)}
                    onError={handleRegistrationScanError}
                  />
                </div>

                {/* VIN Decoder - Full Width Row */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    VIN
                  </label>
                  <div className="flex gap-2">
                    <Input
                      name="vin"
                      value={values.vin}
                      onChange={(e) => {
                        handleChange(e);
                        setVinError(null); // Clear error when user types
                        setDuplicateVinWarning(null); // Clear duplicate warning when VIN is changed
                      }}
                      onBlur={handleBlur}
                      error={errors.vin || vinError}
                      touched={touched.vin}
                      placeholder="17-character VIN"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={() => handleVinDecode(values.vin, setFieldValue)}
                      disabled={vinDecoding || !values.vin || values.vin.length !== 17}
                      variant="secondary"
                      size="sm"
                      className="whitespace-nowrap"
                    >
                      {vinDecoding ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Decoding...
                        </>
                      ) : (
                        'Decode VIN'
                      )}
                    </Button>
                  </div>
                  {vinError && (
                    <p className="mt-1 text-sm text-red-600">{vinError}</p>
                  )}
                </div>
                
                <div>
                  <SelectInput
                    label="Year"
                    name="year"
                    options={Array.from(
                      new Array(new Date().getFullYear() + 1 - 1900 + 1),
                      (val, index) => {
                        const yearValue = new Date().getFullYear() + 1 - index;
                        return { value: yearValue, label: yearValue.toString() };
                      }
                    )}
                    value={values.year}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.year}
                    touched={touched.year}
                    required
                  />
                </div>
                
                <div>
                  <Input
                    label="Make"
                    name="make"
                    value={values.make}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.make}
                    touched={touched.make}
                    required
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Input
                    label="Model"
                    name="model"
                    value={values.model}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.model}
                    touched={touched.model}
                    required
                  />
                </div>
                
                <div>
                  <Input
                    label="License Plate"
                    name="licensePlate"
                    value={values.licensePlate}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.licensePlate}
                    touched={touched.licensePlate}
                  />
                </div>
                
                <div>
                  <Input
                    label="License Plate State"
                    name="licensePlateState"
                    value={values.licensePlateState}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.licensePlateState}
                    touched={touched.licensePlateState}
                    placeholder="e.g., NY, CA, TX"
                    maxLength={2}
                  />
                </div>
                
                <div>
                  <Input
                    label="Current Mileage"
                    name="currentMileage"
                    type="number"
                    min="0"
                    value={values.currentMileage}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.currentMileage}
                    touched={touched.currentMileage}
                    placeholder="Enter current odometer reading"
                  />
                </div>
                
                {/* Mileage History Section */}
                <div className="md:col-span-2 mt-4">
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-lg font-medium text-gray-700 mb-2">Mileage History</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Track mileage readings over time to maintain accurate service records. This helps with future maintenance scheduling.
                    </p>
                    
                    <FieldArray name="mileageHistory">
                      {({ insert, remove, push }) => (
                        <div>
                          <div className="mb-2 flex justify-end">
                            <Button
                              type="button"
                              onClick={() => push({ 
                                date: getTodayForInput(),
                                mileage: values.currentMileage || '',
                                notes: ''
                              })}
                              variant="primary"
                              size="sm"
                            >
                              Add Mileage Record
                            </Button>
                          </div>
                          
                          {values.mileageHistory.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Date
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Mileage
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Notes
                                    </th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Actions
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {values.mileageHistory.map((record, index) => (
                                    <tr key={index}>
                                      <td className="px-4 py-2 whitespace-nowrap">
                                        <Input
                                          type="date"
                                          name={`mileageHistory.${index}.date`}
                                          value={formatDateForInputLocal(record.date)}
                                          onChange={handleChange}
                                          onBlur={handleBlur}
                                          error={
                                            errors.mileageHistory && 
                                            errors.mileageHistory[index] && 
                                            errors.mileageHistory[index].date
                                          }
                                          touched={
                                            touched.mileageHistory && 
                                            touched.mileageHistory[index] && 
                                            touched.mileageHistory[index].date
                                          }
                                          className="w-full"
                                        />
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap">
                                        <Input
                                          type="number"
                                          name={`mileageHistory.${index}.mileage`}
                                          value={record.mileage}
                                          onChange={handleChange}
                                          onBlur={handleBlur}
                                          error={
                                            errors.mileageHistory && 
                                            errors.mileageHistory[index] && 
                                            errors.mileageHistory[index].mileage
                                          }
                                          touched={
                                            touched.mileageHistory && 
                                            touched.mileageHistory[index] && 
                                            touched.mileageHistory[index].mileage
                                          }
                                          placeholder="Miles"
                                          min="0"
                                          className="w-full"
                                        />
                                      </td>
                                      <td className="px-4 py-2">
                                        <Input
                                          type="text"
                                          name={`mileageHistory.${index}.notes`}
                                          value={record.notes || ''}
                                          onChange={handleChange}
                                          onBlur={handleBlur}
                                          placeholder="Service performed, etc."
                                          className="w-full"
                                        />
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap text-right">
                                        <button
                                          type="button"
                                          className="text-red-600 hover:text-red-800"
                                          onClick={() => remove(index)}
                                        >
                                          Remove
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="bg-gray-50 p-4 text-center text-gray-500 rounded">
                              No mileage records added yet. Click "Add Mileage Record" to track vehicle mileage.
                            </div>
                          )}
                        </div>
                      )}
                    </FieldArray>
                  </div>
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
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="light"
                  onClick={() => navigate(id ? `/vehicles/${id}` : '/vehicles')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Vehicle'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </Card>
    </div>
  );
};

export default VehicleForm;
