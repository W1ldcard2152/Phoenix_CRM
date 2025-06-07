import React, { useState } from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import WorkOrderService from '../../../services/workOrderService';
import Button from '../../common/Button';
import TextArea from '../../common/TextArea';
import SelectInput from '../../common/SelectInput';

const WorkOrderSchema = Yup.object().shape({
  serviceDescription: Yup.string().required('Required'),
  priority: Yup.string().required('Required'),
});

const WorkOrderStep = ({ customer, vehicle, onNext }) => {
  const [error, setError] = useState(null);

  const handleSubmit = async (values) => {
    try {
      const workOrderData = {
        ...values,
        customerId: customer.id,
        vehicleId: vehicle.id,
        status: 'Created',
      };
      const newWorkOrder = await WorkOrderService.createWorkOrder(workOrderData);
      onNext(newWorkOrder);
    } catch (err) {
      setError('Failed to create work order.');
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Work Order Details</h3>
      <p>Customer: {customer?.name}</p>
      <p>Vehicle: {vehicle?.year} {vehicle?.make} {vehicle?.model}</p>
      <Formik
        initialValues={{ serviceDescription: '', priority: 'Normal', initialNotes: '' }}
        validationSchema={WorkOrderSchema}
        onSubmit={handleSubmit}
      >
        {({ errors, touched }) => (
          <Form className="mt-4">
            <Field
              name="serviceDescription"
              as={TextArea}
              placeholder="Service Description"
              error={touched.serviceDescription && errors.serviceDescription}
            />
            <Field
              name="priority"
              as={SelectInput}
              label="Priority"
              error={touched.priority && errors.priority}
            >
              <option value="Low">Low</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
            </Field>
            <Field
              name="initialNotes"
              as={TextArea}
              placeholder="Initial Diagnostic Notes (Optional)"
            />
            <Button type="submit" className="mt-4">Create and Continue</Button>
          </Form>
        )}
      </Formik>
      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
};

export default WorkOrderStep;
