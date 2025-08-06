import React, { useState, useEffect } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import CustomerService from '../../../services/customerService';
import Button from '../../common/Button';
import Input from '../../common/Input';
import SelectInput from '../../common/SelectInput';
import { capitalizeWords } from '../../../utils/formatters';

// Phone number formatter
const formatPhoneNumber = (value) => {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, '');
  const phoneNumberLength = phoneNumber.length;

  if (phoneNumberLength < 4) return phoneNumber;
  if (phoneNumberLength < 7) {
    return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3)}`;
  }
  return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
};

const CustomerSchema = Yup.object().shape({
  name: Yup.string().required('Name is required'),
  phone: Yup.string()
    .required('Phone number is required')
    .matches(/^\d{3}-\d{3}-\d{4}$/, 'Phone number must be in xxx-xxx-xxxx format'),
  email: Yup.string().email('Invalid email'),
  communicationPreference: Yup.string().required('Communication preference is required'),
});

const CustomerStep = ({ onCustomerSelect, onError, setLoading, loading }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch all customers on component mount
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await CustomerService.getAllCustomers();
        const customers = response.data.customers || [];
        setAllCustomers(customers);
        
        // Show recent customers if no search - sort by newest first
        if (!searchQuery) {
          const sortedCustomers = customers.sort((a, b) => new Date(b.createdAt || b._id) - new Date(a.createdAt || a._id));
          setSearchResults(sortedCustomers.slice(0, 20));
        }
      } catch (err) {
        console.error('Error fetching customers:', err);
        onError('Failed to load customers. Please try again.');
      } finally {
        setInitialLoading(false);
      }
    };

    fetchCustomers();
  }, []); // Remove setLoading and onError from dependencies

  // Search customers as user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      const sortedCustomers = allCustomers.sort((a, b) => new Date(b.createdAt || b._id) - new Date(a.createdAt || a._id));
      setSearchResults(sortedCustomers.slice(0, 20));
      return;
    }

    const filtered = allCustomers.filter(customer => 
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone.includes(searchQuery) ||
      (customer.email && customer.email.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    
    setSearchResults(filtered.slice(0, 20));
  }, [searchQuery, allCustomers]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setIsSearching(true);
      const response = await CustomerService.searchCustomers(searchQuery);
      setSearchResults(response.data.customers || []);
    } catch (err) {
      console.error('Error searching customers:', err);
      onError('Failed to search customers. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleCustomerSelect = (customer) => {
    onCustomerSelect(customer);
  };

  const handleCreateCustomer = async (values, { setSubmitting }) => {
    try {
      setLoading(true);
      const response = await CustomerService.createCustomer(values);
      onCustomerSelect(response.data.customer);
    } catch (err) {
      console.error('Error creating customer:', err);
      onError('Failed to create customer. Please try again.');
      setSubmitting(false);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneCheck = async (phoneNumber) => {
    if (!phoneNumber || phoneNumber.length < 12) {
      setDuplicateWarning(null);
      return;
    }

    try {
      const response = await CustomerService.checkExistingCustomerByPhone(phoneNumber);
      if (response.exists) {
        setDuplicateWarning({
          message: `A customer with phone number ${phoneNumber} already exists: ${response.data.customer.name}`,
          customer: response.data.customer
        });
      } else {
        setDuplicateWarning(null);
      }
    } catch (err) {
      console.error('Error checking phone number:', err);
      setDuplicateWarning(null);
    }
  };

  const communicationOptions = [
    { value: 'SMS', label: 'SMS/Text' },
    { value: 'Email', label: 'Email' },
    { value: 'Phone', label: 'Phone Call' },
    { value: 'None', label: 'No Contact' }
  ];

  if (isCreating) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Create New Customer</h3>
            <p className="text-sm text-gray-600">Enter the customer's information below</p>
          </div>
          <Button
            onClick={() => {
              setIsCreating(false);
              setDuplicateWarning(null);
            }}
            variant="outline"
            size="sm"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Back to Search
          </Button>
        </div>

        <Formik
          initialValues={{
            name: '',
            phone: '',
            email: '',
            communicationPreference: 'SMS'
          }}
          validationSchema={CustomerSchema}
          onSubmit={handleCreateCustomer}
        >
          {({ values, errors, touched, handleChange, handleBlur, setFieldValue, isSubmitting }) => (
            <Form className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Customer Name"
                  name="name"
                  value={values.name}
                  onChange={handleChange}
                  onBlur={(e) => {
                    handleBlur(e);
                    setFieldValue('name', capitalizeWords(e.target.value));
                  }}
                  error={errors.name}
                  touched={touched.name}
                  required
                  placeholder="John Doe"
                />

                <Input
                  label="Phone Number"
                  name="phone"
                  value={formatPhoneNumber(values.phone)}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setFieldValue('phone', formatted);
                    setDuplicateWarning(null);
                  }}
                  onBlur={(e) => {
                    handleBlur(e);
                    handlePhoneCheck(e.target.value);
                  }}
                  error={errors.phone}
                  touched={touched.phone}
                  required
                  placeholder="555-123-4567"
                />
              </div>

              <Input
                label="Email Address"
                name="email"
                type="email"
                value={values.email}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.email}
                touched={touched.email}
                placeholder="john.doe@example.com"
              />

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

              {duplicateWarning && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
                  <div className="flex items-start">
                    <i className="fas fa-exclamation-triangle mt-0.5 mr-2"></i>
                    <div>
                      <p className="font-medium">Duplicate Phone Number</p>
                      <p className="text-sm">{duplicateWarning.message}</p>
                      <Button
                        type="button"
                        onClick={() => handleCustomerSelect(duplicateWarning.customer)}
                        variant="outline"
                        size="sm"
                        className="mt-2"
                      >
                        Use Existing Customer
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || loading || !!duplicateWarning}
                >
                  {isSubmitting || loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Creating Customer...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-user-plus mr-2"></i>
                      Create Customer & Continue
                    </>
                  )}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Select or Create Customer</h3>
        <p className="text-sm text-gray-600">Search for an existing customer or create a new one</p>
      </div>

      {/* Search Section */}
      <div className="flex flex-col items-center space-y-4">
        <div className="flex space-x-2 max-w-lg mx-auto">
          <Input
            placeholder="Search by name, phone, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            className="w-80"
          />
          <Button
            onClick={handleSearch}
            variant="secondary"
            disabled={isSearching}
          >
            {isSearching ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-search"></i>
            )}
          </Button>
        </div>

        <Button
          onClick={() => setIsCreating(true)}
          variant="primary"
          size="lg"
        >
          <i className="fas fa-user-plus mr-2"></i>
          Create New Customer
        </Button>
      </div>

      {/* Search Results */}
      <div className="flex-1 flex flex-col min-h-0">
        <h4 className="font-medium text-gray-700 text-center mb-4">
          {searchQuery ? 'Search Results' : 'Recent Customers'} ({searchResults.length})
        </h4>
        
        {initialLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <i className="fas fa-spinner fa-spin text-2xl text-primary-600 mb-2"></i>
              <p className="text-gray-600">Loading customers...</p>
            </div>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-gray-300 px-8">
              <i className="fas fa-users text-3xl text-gray-400 mb-2"></i>
              <p className="text-gray-600">
                {searchQuery ? 'No customers found matching your search.' : 'No customers found.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4">
            <div className="space-y-3 max-w-3xl mx-auto">
              {searchResults.map((customer) => (
                <div
                  key={customer._id}
                  onClick={() => handleCustomerSelect(customer)}
                  className="bg-white p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-md cursor-pointer transition-all duration-200 group wizard-customer-card"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900 group-hover:text-primary-700">
                        {customer.name}
                      </h5>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>
                          <i className="fas fa-phone mr-1"></i>
                          {customer.phone}
                        </span>
                        {customer.email && (
                          <span>
                            <i className="fas fa-envelope mr-1"></i>
                            {customer.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <i className="fas fa-arrow-right"></i>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerStep;
