import React, { useState, useEffect } from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import VehicleService from '../../../services/vehicleService';
import Button from '../../common/Button';
import Input from '../../common/Input';

const VehicleSchema = Yup.object().shape({
  year: Yup.number().required('Required').min(1900),
  make: Yup.string().required('Required'),
  model: Yup.string().required('Required'),
});

const VehicleStep = ({ customer, onNext }) => {
  const [vehicles, setVehicles] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (customer) {
      VehicleService.getAllVehicles({ customer: customer.id })
        .then(response => setVehicles(response.data.vehicles))
        .catch(() => setError('Failed to load vehicles.'));
    }
  }, [customer]);

  const handleCreate = async (values) => {
    try {
      const newVehicle = await VehicleService.createVehicle({ ...values, customerId: customer.id });
      onNext(newVehicle);
    } catch (err) {
      setError('Failed to create vehicle.');
    }
  };

  return (
    <div>
      {!isCreating ? (
        <>
          <h3 className="text-lg font-semibold mb-2">Customer's Vehicles</h3>
          <div className="mt-4">
            {vehicles.map(vehicle => (
              <div key={vehicle.id} onClick={() => onNext(vehicle)} className="p-2 border-b cursor-pointer hover:bg-gray-100">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </div>
            ))}
          </div>
          <Button onClick={() => setIsCreating(true)} className="mt-4">Add New Vehicle</Button>
        </>
      ) : (
        <Formik
          initialValues={{ year: '', make: '', model: '', vin: '' }}
          validationSchema={VehicleSchema}
          onSubmit={handleCreate}
        >
          {({ errors, touched }) => (
            <Form>
              <Field name="year" as={Input} placeholder="Year" type="number" error={touched.year && errors.year} />
              <Field name="make" as={Input} placeholder="Make" error={touched.make && errors.make} />
              <Field name="model" as={Input} placeholder="Model" error={touched.model && errors.model} />
              <Field name="vin" as={Input} placeholder="VIN (Optional)" />
              <Button type="submit" className="mt-4">Create and Continue</Button>
              <Button onClick={() => setIsCreating(false)} className="ml-2">Back to List</Button>
            </Form>
          )}
        </Formik>
      )}
      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
};

export default VehicleStep;
