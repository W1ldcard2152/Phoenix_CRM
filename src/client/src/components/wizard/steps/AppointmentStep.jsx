import React, { useState, useEffect } from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import AppointmentService from '../../../services/appointmentService';
import TechnicianService from '../../../services/technicianService';
import Button from '../../common/Button';
import Input from '../../common/Input';
import SelectInput from '../../common/SelectInput';

const AppointmentSchema = Yup.object().shape({
  appointmentDateTime: Yup.date().required('Required'),
  estimatedDuration: Yup.number().required('Required').min(15),
});

const AppointmentStep = ({ workOrder, onNext }) => {
  const [technicians, setTechnicians] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    TechnicianService.getAllTechnicians()
      .then(response => setTechnicians(response.data))
      .catch(() => setError('Failed to load technicians.'));
  }, []);

  const handleSubmit = async (values) => {
    try {
      const appointmentData = {
        ...values,
        workOrderId: workOrder.id,
        customerId: workOrder.customerId,
        vehicleId: workOrder.vehicleId,
        status: 'Scheduled',
      };
      await AppointmentService.createAppointment(appointmentData);
      onNext();
    } catch (err) {
      setError('Failed to create appointment.');
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Schedule Appointment</h3>
      <Formik
        initialValues={{
          appointmentDateTime: '',
          technicianId: '',
          estimatedDuration: 60,
          notes: '',
        }}
        validationSchema={AppointmentSchema}
        onSubmit={handleSubmit}
      >
        {({ errors, touched }) => (
          <Form className="mt-4">
            <Field
              name="appointmentDateTime"
              type="datetime-local"
              as={Input}
              label="Appointment Time"
              error={touched.appointmentDateTime && errors.appointmentDateTime}
            />
            <Field
              name="estimatedDuration"
              type="number"
              as={Input}
              label="Estimated Duration (minutes)"
              error={touched.estimatedDuration && errors.estimatedDuration}
            />
            <Field
              name="technicianId"
              as={SelectInput}
              label="Assign Technician (Optional)"
            >
              <option value="">Select Technician</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </Field>
            <Field
              name="notes"
              as={Input}
              placeholder="Appointment Notes (Optional)"
            />
            <Button type="submit" className="mt-4">Schedule Appointment</Button>
          </Form>
        )}
      </Formik>
      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
};

export default AppointmentStep;
