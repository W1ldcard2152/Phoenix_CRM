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
  
  // Get customer ID from URL query parameter if present
  const customerIdParam = searchParams.get('customerId'); // Changed 'customer' to 'customerId'
  
  const [initialValues, setInitialValues] = useState({
    customer: customerIdParam || '',
    year: new Date().getFullYear(),
    make: '',
    model: '',
    vin: 'N/A',
    licensePlate: '',
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
            year: vehicleData.year || new Date().getFullYear(),
            make: vehicleData.make || '',
            model: vehicleData.model || '',
            vin: vehicleData.vin || '',
            licensePlate: vehicleData.licensePlate || '',
            currentMileage: vehicleData.currentMileage || '',
            mileageHistory: vehicleData.mileageHistory || [],
            notes: vehicleData.notes || ''
          });
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
        const today = new Date().toISOString().split('T')[0];
        const hasTodayRecord = values.mileageHistory.some(record => 
          new Date(record.date).toISOString().split('T')[0] === today
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
      
      // Handle validation errors from server
      if (err.errors) {
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

  // Format date for input field
  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
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
                    label="VIN"
                    name="vin"
                    value={values.vin}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.vin}
                    touched={touched.vin}
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
                                date: new Date().toISOString().split('T')[0],
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
                                          value={formatDateForInput(record.date)}
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
