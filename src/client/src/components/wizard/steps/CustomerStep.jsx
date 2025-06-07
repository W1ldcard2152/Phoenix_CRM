import React, { useState } from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import CustomerService from '../../../services/customerService';
import Button from '../../common/Button';
import Input from '../../common/Input';

const CustomerSchema = Yup.object().shape({
  name: Yup.string().required('Required'),
  phone: Yup.string().required('Required'),
  communicationPreference: Yup.string().required('Required'),
});

const CustomerStep = ({ onNext }) => {
  const [searchResults, setSearchResults] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (values) => {
    try {
      const results = await CustomerService.searchCustomers(values.searchTerm);
      setSearchResults(results);
    } catch (err) {
      setError('Failed to search for customers.');
    }
  };

  const handleCreate = async (values) => {
    try {
      const newCustomer = await CustomerService.createCustomer(values);
      onNext(newCustomer);
    } catch (err) {
      setError('Failed to create customer.');
    }
  };

  return (
    <div>
      {!isCreating ? (
        <>
          <Formik initialValues={{ searchTerm: '' }} onSubmit={handleSearch}>
            <Form>
              <Field name="searchTerm" as={Input} placeholder="Search by name or phone" />
              <Button type="submit" className="mt-2">Search</Button>
            </Form>
          </Formik>
          <div className="mt-4">
            {searchResults.map(customer => (
              <div key={customer.id} onClick={() => onNext(customer)} className="p-2 border-b cursor-pointer hover:bg-gray-100">
                {customer.name} - {customer.phone}
              </div>
            ))}
          </div>
          <Button onClick={() => setIsCreating(true)} className="mt-4">Create New Customer</Button>
        </>
      ) : (
        <Formik
          initialValues={{ name: '', phone: '', email: '', communicationPreference: 'email' }}
          validationSchema={CustomerSchema}
          onSubmit={handleCreate}
        >
          {({ errors, touched }) => (
            <Form>
              <Field name="name" as={Input} placeholder="Name" error={touched.name && errors.name} />
              <Field name="phone" as={Input} placeholder="Phone" error={touched.phone && errors.phone} />
              <Field name="email" as={Input} placeholder="Email" />
              <Field name="communicationPreference" as="select" className="mt-2 p-2 border rounded w-full">
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="sms">SMS</option>
              </Field>
              <Button type="submit" className="mt-4">Create and Continue</Button>
              <Button onClick={() => setIsCreating(false)} className="ml-2">Back to Search</Button>
            </Form>
          )}
        </Formik>
      )}
      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
};

export default CustomerStep;
