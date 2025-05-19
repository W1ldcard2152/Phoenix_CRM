import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Formik, Form } from 'formik';
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
  'address.street': Yup.string(),
  'address.city': Yup.string(),
  'address.state': Yup.string(),
  'address.zip': Yup.string(),
  communicationPreference: Yup.string().required('Communication preference is required'),
  notes: Yup.string()
});

const CustomerForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  // No need to store customer state since we use initialValues
  const [loading, setLoading] = useState(id ? true : false);
  const [error, setError] = useState(null);
  const [initialValues, setInitialValues] = useState({
    name: '',
    phone: '',
    email: '',
    'address.street': '',
    'address.city': '',
    'address.state': '',
    'address.zip': '',
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
          'address.street': customerData.address?.street || '',
          'address.city': customerData.address?.city || '',
          'address.state': customerData.address?.state || '',
          'address.zip': customerData.address?.zip || '',
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
    // Transform the address fields back into an object
    const formattedValues = {
      ...values,
      address: {
        street: values['address.street'],
        city: values['address.city'],
        state: values['address.state'],
        zip: values['address.zip']
      }
    };

    // Remove the flattened address fields
    delete formattedValues['address.street'];
    delete formattedValues['address.city'];
    delete formattedValues['address.state'];
    delete formattedValues['address.zip'];

    try {
      if (id) {
        // Update existing customer
        await CustomerService.updateCustomer(id, formattedValues);
      } else {
        // Create new customer
        await CustomerService.createCustomer(formattedValues);
      }
      
      // Redirect to customer list
      navigate('/customers');
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
          {({ isSubmitting, touched, errors, values, handleChange, handleBlur }) => (
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
                    value={values['address.street']}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors['address.street']}
                    touched={touched['address.street']}
                  />
                </div>
                
                <div>
                  <Input
                    label="City"
                    name="address.city"
                    value={values['address.city']}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors['address.city']}
                    touched={touched['address.city']}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Input
                      label="State"
                      name="address.state"
                      value={values['address.state']}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      error={errors['address.state']}
                      touched={touched['address.state']}
                    />
                  </div>
                  
                  <div>
                    <Input
                      label="ZIP Code"
                      name="address.zip"
                      value={values['address.zip']}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      error={errors['address.zip']}
                      touched={touched['address.zip']}
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
