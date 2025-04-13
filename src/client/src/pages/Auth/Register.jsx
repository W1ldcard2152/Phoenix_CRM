import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import SelectInput from '../../components/common/SelectInput';
import Button from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';

// Validation schema
const RegisterSchema = Yup.object().shape({
  name: Yup.string()
    .required('Name is required'),
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),
  password: Yup.string()
    .min(8, 'Password must be at least 8 characters')
    .required('Password is required'),
  passwordConfirm: Yup.string()
    .oneOf([Yup.ref('password'), null], 'Passwords must match')
    .required('Password confirmation is required'),
  role: Yup.string()
    .required('Role is required')
});

const Register = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [error, setError] = useState(null);

  const handleSubmit = async (values, { setSubmitting }) => {
    try {
      await register(values);
      navigate('/');
    } catch (err) {
      console.error('Registration error:', err);
      setError('Failed to register. Please try again.');
      setSubmitting(false);
    }
  };

  // Role options for dropdown
  const roleOptions = [
    { value: 'technician', label: 'Technician' },
    { value: 'service-writer', label: 'Service Writer' },
    { value: 'parts-manager', label: 'Parts Manager' }
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create New Account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Register for Auto Repair Shop CRM
          </p>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        <Card>
          <Formik
            initialValues={{ 
              name: '', 
              email: '', 
              password: '', 
              passwordConfirm: '', 
              role: 'technician' 
            }}
            validationSchema={RegisterSchema}
            onSubmit={handleSubmit}
          >
            {({ isSubmitting, touched, errors, values, handleChange, handleBlur }) => (
              <Form className="space-y-6">
                <Input
                  label="Name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={values.name}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.name}
                  touched={touched.name}
                  required
                />
                
                <Input
                  label="Email Address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.email}
                  touched={touched.email}
                  required
                />
                
                <Input
                  label="Password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={values.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.password}
                  touched={touched.password}
                  required
                />
                
                <Input
                  label="Confirm Password"
                  name="passwordConfirm"
                  type="password"
                  autoComplete="new-password"
                  value={values.passwordConfirm}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.passwordConfirm}
                  touched={touched.passwordConfirm}
                  required
                />
                
                <SelectInput
                  label="Role"
                  name="role"
                  options={roleOptions}
                  value={values.role}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.role}
                  touched={touched.role}
                  required
                />
                
                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Registering...' : 'Register'}
                  </Button>
                </div>
              </Form>
            )}
          </Formik>
          
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 hover:text-primary-800">
                Sign in
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Register;