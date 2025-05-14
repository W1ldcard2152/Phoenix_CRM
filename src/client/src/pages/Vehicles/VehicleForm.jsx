// src/client/src/pages/Vehicles/VehicleForm.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';
import Button from '../../components/common/Button';
import VehicleService from '../../services/vehicleService';
import CustomerService from '../../services/customerService';

// Validation schema - updated with required VIN
const VehicleSchema = Yup.object().shape({
  customer: Yup.string().required('Customer is required'),
  year: Yup.number()
    .required('Year is required')
    .min(1900, 'Year must be at least 1900')
    .max(new Date().getFullYear() + 1, 'Year cannot be in the future'),
  make: Yup.string().required('Make is required'),
  model: Yup.string().required('Model is required'),
  vin: Yup.string()
    .required('VIN is required') // Made VIN required
    .min(11, 'VIN must be at least 11 characters')
    .max(17, 'VIN cannot exceed 17 characters'),
  licensePlate: Yup.string(),
  notes: Yup.string()
});

const VehicleForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // No need to store the vehicle object since we use initialValues
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Get customer ID from URL query parameter if present
  const customerIdParam = searchParams.get('customer');
  
  const [initialValues, setInitialValues] = useState({
    customer: customerIdParam || '',
    year: new Date().getFullYear(),
    make: '',
    model: '',
    vin: '',
    licensePlate: '',
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
          // No need to set the vehicle state since we use initialValues
          
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
      console.log('Submitting vehicle:', values); // Debug log
      
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
          {({ isSubmitting, touched, errors, values, handleChange, handleBlur }) => (
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
                  <Input
                    label="Year"
                    name="year"
                    type="number"
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
                    required  // Added required prop here
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