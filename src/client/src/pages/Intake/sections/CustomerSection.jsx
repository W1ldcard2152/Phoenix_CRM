import React, { useState, useEffect } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import CustomerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import SelectInput from '../../../components/common/SelectInput';
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

const CustomerSection = ({ onSaved, onError }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch all customers on mount
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await CustomerService.getAllCustomers();
        const customers = response.data.customers || [];
        setAllCustomers(customers);

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
  }, []);

  // Client-side search filter
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
    onSaved(customer);
  };

  const handleCreateCustomer = async (values, { setSubmitting }) => {
    try {
      setSaving(true);
      const response = await CustomerService.createCustomer(values);
      onSaved(response.data.customer);
    } catch (err) {
      console.error('Error creating customer:', err);
      onError('Failed to create customer. Please try again.');
      setSubmitting(false);
    } finally {
      setSaving(false);
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-900">Create New Customer</h4>
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

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || saving || !!duplicateWarning}
                >
                  {isSubmitting || saving ? (
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
    <div className="space-y-4">
      {/* Search and Create */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex space-x-2 flex-1 w-full">
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
            className="flex-1"
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
        >
          <i className="fas fa-user-plus mr-2"></i>
          New Customer
        </Button>
      </div>

      {/* Results */}
      <div>
        <h4 className="text-sm font-medium text-gray-500 mb-2">
          {searchQuery ? 'Search Results' : 'Recent Customers'} ({searchResults.length})
        </h4>

        {initialLoading ? (
          <div className="text-center py-6">
            <i className="fas fa-spinner fa-spin text-xl text-primary-600 mb-2"></i>
            <p className="text-gray-600 text-sm">Loading customers...</p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <i className="fas fa-users text-2xl text-gray-400 mb-2"></i>
            <p className="text-gray-600 text-sm">
              {searchQuery ? 'No customers found matching your search.' : 'No customers found.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {searchResults.map((customer) => (
              <div
                key={customer._id}
                onClick={() => handleCustomerSelect(customer)}
                className="bg-white p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-sm cursor-pointer transition-all duration-150 group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900 group-hover:text-primary-700">
                      {customer.name}
                    </span>
                    <div className="flex items-center space-x-3 text-sm text-gray-600">
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
                  <i className="fas fa-arrow-right text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerSection;
