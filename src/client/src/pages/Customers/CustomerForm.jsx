import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Formik, Form, getIn } from 'formik';
// Import a modal component if available, or use window.confirm for simplicity
// For now, let's assume a simple window.confirm
import * as Yup from 'yup';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';
import Button from '../../components/common/Button';
import CustomerService from '../../services/customerService';

// Validation schema
const CustomerSchema = Yup.object().shape({
  name: Yup.string().required('Name is required'),
  phone: Yup.string().required('Phone number is required'),
  email: Yup.string().email('Invalid email'),
  address: Yup.object().shape({
    street: Yup.string(),
    city: Yup.string(),
    state: Yup.string(),
    zip: Yup.string(),
  }),
  communicationPreference: Yup.string().required('Communication preference is required'),
  notes: Yup.string()
});

const CustomerForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState(null);
  const [showAddVehiclePrompt, setShowAddVehiclePrompt] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState(null);
  const [initialValues, setInitialValues] = useState({
    name: '',
    phone: '',
    email: '',
    address: {
      street: '',
      city: '',
      state: '',
      zip: ''
    },
    communicationPreference: 'SMS',
    notes: ''
  });

  useEffect(() => {
    const fetchCustomer = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const response = await CustomerService.getCustomer(id);
        const customerData = response.data.customer;
        // We don't need to set the customer state since we use initialValues

        // Set initial form values
        setInitialValues({
          name: customerData.name || '',
          phone: customerData.phone || '',
          email: customerData.email || '',
          address: {
            street: customerData.address?.street || '',
            city: customerData.address?.city || '',
            state: customerData.address?.state || '',
            zip: customerData.address?.zip || ''
          },
          communicationPreference: customerData.communicationPreference || 'SMS',
          notes: customerData.notes || ''
        });

        setLoading(false);
      } catch (err) {
        console.error('Error fetching customer:', err);
        setError('Failed to load customer data. Please try again later.');
        setLoading(false);
      }
    };

    fetchCustomer();
  }, [id]);

  const handleSubmit = async (values, { setSubmitting }) => {
    try {
      if (id) {
        // Update existing customer
        await CustomerService.updateCustomer(id, values);
        navigate('/customers'); // Or to customer detail page
      } else {
        // Create new customer
        const response = await CustomerService.createCustomer(values);
        // Assuming the response contains the new customer's data including ID
        // Adjust based on actual API response structure
        if (response.data && response.data.customer && response.data.customer._id) {
          setNewCustomerId(response.data.customer._id);
          setShowAddVehiclePrompt(true);
        } else {
          // Fallback if ID is not returned as expected
          console.warn('New customer ID not found in response, navigating to customer list.');
          navigate('/customers');
        }
      }
    } catch (err) {
      console.error('Error saving customer:', err);
      setError('Failed to save customer. Please try again later.');
      setSubmitting(false);
    }
  };

  const communicationOptions = [
    { value: 'SMS', label: 'SMS' },
    { value: 'Email', label: 'Email' },
    { value: 'Phone', label: 'Phone' },
    { value: 'None', label: 'None' }
  ];

  const usStates = [
    { value: '', label: 'Select State' },
    { value: 'AL', label: 'Alabama' },
    { value: 'AK', label: 'Alaska' },
    { value: 'AZ', label: 'Arizona' },
    { value: 'AR', label: 'Arkansas' },
    { value: 'CA', label: 'California' },
    { value: 'CO', label: 'Colorado' },
    { value: 'CT', label: 'Connecticut' },
    { value: 'DE', label: 'Delaware' },
    { value: 'FL', label: 'Florida' },
    { value: 'GA', label: 'Georgia' },
    { value: 'HI', label: 'Hawaii' },
    { value: 'ID', label: 'Idaho' },
    { value: 'IL', label: 'Illinois' },
    { value: 'IN', label: 'Indiana' },
    { value: 'IA', label: 'Iowa' },
    { value: 'KS', label: 'Kansas' },
    { value: 'KY', label: 'Kentucky' },
    { value: 'LA', label: 'Louisiana' },
    { value: 'ME', label: 'Maine' },
    { value: 'MD', label: 'Maryland' },
    { value: 'MA', label: 'Massachusetts' },
    { value: 'MI', label: 'Michigan' },
    { value: 'MN', label: 'Minnesota' },
    { value: 'MS', label: 'Mississippi' },
    { value: 'MO', label: 'Missouri' },
    { value: 'MT', label: 'Montana' },
    { value: 'NE', label: 'Nebraska' },
    { value: 'NV', label: 'Nevada' },
    { value: 'NH', label: 'New Hampshire' },
    { value: 'NJ', label: 'New Jersey' },
    { value: 'NM', label: 'New Mexico' },
    { value: 'NY', label: 'New York' },
    { value: 'NC', label: 'North Carolina' },
    { value: 'ND', label: 'North Dakota' },
    { value: 'OH', label: 'Ohio' },
    { value: 'OK', label: 'Oklahoma' },
    { value: 'OR', label: 'Oregon' },
    { value: 'PA', label: 'Pennsylvania' },
    { value: 'RI', label: 'Rhode Island' },
    { value: 'SC', label: 'South Carolina' },
    { value: 'SD', label: 'South Dakota' },
    { value: 'TN', label: 'Tennessee' },
    { value: 'TX', label: 'Texas' },
    { value: 'UT', label: 'Utah' },
    { value: 'VT', label: 'Vermont' },
    { value: 'VA', label: 'Virginia' },
    { value: 'WA', label: 'Washington' },
    { value: 'WV', label: 'West Virginia' },
    { value: 'WI', label: 'Wisconsin' },
    { value: 'WY', label: 'Wyoming' }
  ];

  // New useEffect to handle the prompt after state update
  // Moved before the loading check to ensure hooks are called in the same order
  useEffect(() => {
    if (showAddVehiclePrompt && newCustomerId) {
      if (window.confirm('Customer created successfully. Would you like to add a vehicle for this customer?')) {
        navigate(`/vehicles/new?customerId=${newCustomerId}`);
      } else {
        navigate('/customers');
      }
      // Reset prompt state
      setShowAddVehiclePrompt(false);
      setNewCustomerId(null);
    }
  }, [showAddVehiclePrompt, newCustomerId, navigate]);

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading customer data...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {id ? 'Edit Customer' : 'Add New Customer'}
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
          validationSchema={CustomerSchema}
          onSubmit={handleSubmit}
          enableReinitialize
        >
          {({ isSubmitting, touched, errors, values, handleChange, handleBlur, setFieldValue }) => (
            <Form>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Name"
                    name="name"
                    value={values.name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.name}
                    touched={touched.name}
                    required
                  />
                </div>
                
                <div>
                  <Input
                    label="Phone"
                    name="phone"
                    value={values.phone}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.phone}
                    touched={touched.phone}
                    required
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Input
                    label="Email"
                    name="email"
                    type="email"
                    value={values.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.email}
                    touched={touched.email}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Input
                    label="Street Address"
                    name="address.street"
                    value={getIn(values, 'address.street')}
                    onChange={(e) => setFieldValue('address.street', e.target.value)}
                    onBlur={handleBlur}
                    error={getIn(errors, 'address.street')}
                    touched={getIn(touched, 'address.street')}
                  />
                </div>
                
                <div>
                  <Input
                    label="City"
                    name="address.city"
                    value={getIn(values, 'address.city')}
                    onChange={(e) => setFieldValue('address.city', e.target.value)}
                    onBlur={handleBlur}
                    error={getIn(errors, 'address.city')}
                    touched={getIn(touched, 'address.city')}
                  />
                </div>
                
                  <div className="grid grid-cols-2 gap-4">
                  <div>
                    <SelectInput
                      label="State"
                      name="address.state"
                      options={usStates}
                      value={getIn(values, 'address.state')}
                      onChange={(e) => setFieldValue('address.state', e.target.value)}
                      onBlur={handleBlur}
                      error={getIn(errors, 'address.state')}
                      touched={getIn(touched, 'address.state')}
                    />
                  </div>
                  
                  <div>
                    <Input
                      label="ZIP Code"
                      name="address.zip"
                      value={getIn(values, 'address.zip')}
                      onChange={(e) => setFieldValue('address.zip', e.target.value)}
                      onBlur={handleBlur}
                      error={getIn(errors, 'address.zip')}
                      touched={getIn(touched, 'address.zip')}
                    />
                  </div>
                </div>
                
                <div>
                  <SelectInput
                    label="Communication Preference"
                    name="communicationPreference"
                    options={communicationOptions}
                    value={values.communicationPreference}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.communicationPreference}
                    touched={touched.communicationPreference}
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
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="light"
                  onClick={() => navigate('/customers')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Customer'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </Card>
    </div>
  );
};

export default CustomerForm;
