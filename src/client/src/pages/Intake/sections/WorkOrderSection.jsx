import React, { useState, useEffect } from 'react';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import WorkOrderService from '../../../services/workOrderService';
import QuoteService from '../../../services/quoteService';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import TextArea from '../../../components/common/TextArea';
import SelectInput from '../../../components/common/SelectInput';
import { getTodayForInput } from '../../../utils/formatters';

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
  skipDiagnostics: Yup.boolean()
});

const WorkOrderSection = ({ customer, vehicle, mode = 'workOrder', onSaved, onError }) => {
  const isQuoteMode = mode === 'quote';
  const [estimatedDuration, setEstimatedDuration] = useState(1);
  const [currentServices, setCurrentServices] = useState([{ description: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const duration = estimateServiceDuration(currentServices);
    setEstimatedDuration(duration);
  }, [currentServices]);

  const handleCreateWorkOrder = async (values, { setSubmitting }) => {
    try {
      setSaving(true);

      const data = {
        customer: customer._id,
        vehicle: vehicle._id,
        date: getTodayForInput(),
        currentMileage: values.currentMileage,
        services: values.services,
        serviceRequested: values.services.map(s => s.description).join('\n'),
        priority: values.priority,
        diagnosticNotes: values.diagnosticNotes,
        skipDiagnostics: isQuoteMode ? false : values.skipDiagnostics,
        parts: [],
        labor: []
      };

      if (isQuoteMode) {
        const response = await QuoteService.createQuote(data);
        onSaved(response.data.quote);
      } else {
        const response = await WorkOrderService.createWorkOrder(data);
        onSaved(response.data.workOrder);
      }
    } catch (err) {
      console.error(`Error creating ${isQuoteMode ? 'quote' : 'work order'}:`, err);
      onError(`Failed to create ${isQuoteMode ? 'quote' : 'work order'}. Please try again.`);
      setSubmitting(false);
    } finally {
      setSaving(false);
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
        totalHours += 1;
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
    <div className="space-y-4">
      {/* Context summary */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <span className="font-medium text-primary-900">Customer: </span>
            <span className="text-primary-700">{customer?.name}</span>
          </div>
          <div>
            <span className="font-medium text-primary-900">Vehicle: </span>
            <span className="text-primary-700">{vehicle?.year} {vehicle?.make} {vehicle?.model}</span>
          </div>
        </div>
      </div>

      <Formik
        initialValues={{
          services: [{ description: '' }],
          priority: 'Normal',
          diagnosticNotes: '',
          currentMileage: vehicle?.currentMileage || '',
          skipDiagnostics: false
        }}
        validationSchema={WorkOrderSchema}
        onSubmit={handleCreateWorkOrder}
      >
        {({ values, errors, touched, handleChange, handleBlur, setFieldValue, isSubmitting }) => {
          if (JSON.stringify(currentServices) !== JSON.stringify(values.services)) {
            setCurrentServices(values.services);
          }

          return (
            <Form className="space-y-4">
              {/* Services */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium text-gray-900 text-sm">Services Requested</h4>
                  <span className="text-xs text-gray-500">
                    Est. Duration: <span className="font-medium">{estimatedDuration}h</span>
                  </span>
                </div>

                <FieldArray name="services">
                  {({ remove, push }) => (
                    <div className="space-y-2">
                      {values.services && values.services.length > 0 ? (
                        values.services.map((service, index) => (
                          <div key={index} className="flex items-start space-x-2">
                            <div className="flex-1">
                              <Input
                                name={`services.${index}.description`}
                                value={service.description}
                                onChange={(e) => {
                                  handleChange(e);
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
                rows={3}
                placeholder="Any initial observations, customer complaints, or diagnostic notes..."
              />

              {/* Skip Diagnostics (not shown for quotes) */}
              {!isQuoteMode && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="skipDiagnostics"
                      name="skipDiagnostics"
                      checked={values.skipDiagnostics}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className="mr-3 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-0.5"
                    />
                    <div>
                      <label htmlFor="skipDiagnostics" className="text-sm font-medium text-gray-900 cursor-pointer">
                        This work order does not require diagnostics/inspection
                      </label>
                      <p className="text-xs text-gray-600 mt-1">
                        Check this for services that don't need diagnosis (e.g., oil changes, scheduled maintenance).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || saving}
                >
                  {isSubmitting || saving ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      {isQuoteMode ? 'Creating Quote...' : 'Creating Work Order...'}
                    </>
                  ) : (
                    <>
                      <i className={`fas ${isQuoteMode ? 'fa-file-alt' : 'fa-wrench'} mr-2`}></i>
                      {isQuoteMode ? 'Create Quote & Continue' : 'Create Work Order & Continue'}
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

export default WorkOrderSection;
