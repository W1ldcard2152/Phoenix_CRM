import React, { useState, useEffect } from 'react';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import WorkOrderService from '../../../services/workOrderService';
import Button from '../../common/Button';
import Input from '../../common/Input';
import TextArea from '../../common/TextArea';
import SelectInput from '../../common/SelectInput';

const WorkOrderSchema = Yup.object().shape({
  services: Yup.array().of(
    Yup.object().shape({
      description: Yup.string().required('Service description is required')
    })
  ).min(1, 'At least one service item is required'),
  priority: Yup.string().required('Priority is required'),
  diagnosticNotes: Yup.string(),
  currentMileage: Yup.number()
    .min(0, 'Mileage cannot be negative')
    .nullable(),
});

const WorkOrderStep = ({ customer, vehicle, onWorkOrderCreate, onError, setLoading, loading }) => {
  const [estimatedDuration, setEstimatedDuration] = useState(1);
  const [currentServices, setCurrentServices] = useState([{ description: '' }]);

  // Update estimated duration when services change
  useEffect(() => {
    const duration = estimateServiceDuration(currentServices);
    setEstimatedDuration(duration);
  }, [currentServices]);

  const handleCreateWorkOrder = async (values, { setSubmitting }) => {
    try {
      setLoading(true);
      
      const workOrderData = {
        customer: customer._id,
        vehicle: vehicle._id,
        date: new Date().toISOString().split('T')[0],
        currentMileage: values.currentMileage,
        services: values.services,
        serviceRequested: values.services.map(s => s.description).join('\n'),
        priority: values.priority,
        status: 'Created',
        diagnosticNotes: values.diagnosticNotes,
        parts: [],
        labor: []
      };

      const response = await WorkOrderService.createWorkOrder(workOrderData);
      onWorkOrderCreate(response.data.workOrder);
    } catch (err) {
      console.error('Error creating work order:', err);
      onError('Failed to create work order. Please try again.');
      setSubmitting(false);
    } finally {
      setLoading(false);
    }
  };

  const estimateServiceDuration = (services) => {
    let totalHours = 0;
    
    services.forEach(service => {
      const desc = service.description.toLowerCase();
      if (desc.includes('oil change') || desc.includes('inspection')) {
        totalHours += 0.5;
      } else if (desc.includes('brake') || desc.includes('tire')) {
        totalHours += 2;
      } else if (desc.includes('engine') || desc.includes('transmission')) {
        totalHours += 4;
      } else if (desc.includes('diagnos')) {
        totalHours += 1;
      } else {
        totalHours += 1; // Default
      }
    });

    return Math.max(0.5, totalHours);
  };

  const priorityOptions = [
    { value: 'Low', label: 'Low Priority' },
    { value: 'Normal', label: 'Normal Priority' },
    { value: 'High', label: 'High Priority' },
    { value: 'Urgent', label: 'Urgent' }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Create Work Order</h3>
        <p className="text-sm text-gray-600">
          Service request for <span className="font-medium">{customer?.name}</span>'s{' '}
          <span className="font-medium">{vehicle?.year} {vehicle?.make} {vehicle?.model}</span>
        </p>
      </div>

      <Formik
        initialValues={{
          services: [{ description: '' }],
          priority: 'Normal',
          diagnosticNotes: '',
          currentMileage: vehicle?.currentMileage || ''
        }}
        validationSchema={WorkOrderSchema}
        onSubmit={handleCreateWorkOrder}
      >
        {({ values, errors, touched, handleChange, handleBlur, setFieldValue, isSubmitting }) => {
          // Update current services state when values change (but don't use useEffect here)
          if (JSON.stringify(currentServices) !== JSON.stringify(values.services)) {
            setCurrentServices(values.services);
          }

          return (
            <Form className="space-y-6">
              {/* Customer and Vehicle Summary */}
              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-medium text-primary-900">Customer</h4>
                    <p className="text-primary-700">{customer?.name}</p>
                    <p className="text-primary-600">{customer?.phone}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-primary-900">Vehicle</h4>
                    <p className="text-primary-700">{vehicle?.year} {vehicle?.make} {vehicle?.model}</p>
                    {vehicle?.licensePlate && (
                      <p className="text-primary-600">License: {vehicle.licensePlate}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Services Section */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium text-gray-900">Services Requested</h4>
                  <span className="text-sm text-gray-600">
                    Estimated Duration: <span className="font-medium">{estimatedDuration} hours</span>
                  </span>
                </div>

                <FieldArray name="services">
                  {({ insert, remove, push }) => (
                    <div className="space-y-3">
                      {values.services && values.services.length > 0 ? (
                        values.services.map((service, index) => (
                          <div key={index} className="flex items-start space-x-2">
                            <div className="flex-1">
                              <Input
                                name={`services.${index}.description`}
                                value={service.description}
                                onChange={(e) => {
                                  handleChange(e);
                                  // Update current services state when field changes
                                  const newServices = [...values.services];
                                  newServices[index] = { ...service, description: e.target.value };
                                  setCurrentServices(newServices);
                                }}
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
                                placeholder={`Service ${index + 1} (e.g., Oil Change, Brake Inspection)`}
                                required
                              />
                            </div>
                            {values.services.length > 1 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  remove(index);
                                  // Update current services state after removal
                                  const newServices = values.services.filter((_, i) => i !== index);
                                  setCurrentServices(newServices);
                                }}
                                className="mt-1"
                              >
                                <i className="fas fa-times"></i>
                              </Button>
                            )}
                          </div>
                        ))
                      ) : null}
                      
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          push({ description: '' });
                          // Update current services state after addition
                          setCurrentServices([...values.services, { description: '' }]);
                        }}
                      >
                        <i className="fas fa-plus mr-2"></i>
                        Add Another Service
                      </Button>
                      
                      {typeof errors.services === 'string' && (
                        <div className="text-red-500 text-sm">{errors.services}</div>
                      )}
                    </div>
                  )}
                </FieldArray>
              </div>

              {/* Priority and Mileage */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectInput
                  label="Priority Level"
                  name="priority"
                  options={priorityOptions}
                  value={values.priority}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.priority}
                  touched={touched.priority}
                  required
                />

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

              {/* Diagnostic Notes */}
              <TextArea
                label="Initial Diagnostic Notes"
                name="diagnosticNotes"
                value={values.diagnosticNotes}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.diagnosticNotes}
                touched={touched.diagnosticNotes}
                rows={4}
                placeholder="Any initial observations, customer complaints, or diagnostic notes..."
              />

              {/* Submit Button */}
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || loading}
                >
                  {isSubmitting || loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Creating Work Order...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-wrench mr-2"></i>
                      Create Work Order & Continue
                    </>
                  )}
                </Button>
              </div>
            </Form>
          );
        }}
      </Formik>
    </div>
  );
};

export default WorkOrderStep;
