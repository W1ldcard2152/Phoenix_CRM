import React, { useState, useEffect } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import CustomerService from '../../../services/customerService';
import VehicleService from '../../../services/vehicleService';
import vinService from '../../../services/vinService';
import Button from '../../common/Button';
import Input from '../../common/Input';
import SelectInput from '../../common/SelectInput';

const VehicleSchema = Yup.object().shape({
  year: Yup.number()
    .required('Year is required')
    .min(1900, 'Year must be at least 1900')
    .max(new Date().getFullYear() + 1, 'Year cannot be in the future'),
  make: Yup.string().required('Make is required'),
  model: Yup.string().required('Model is required'),
  vin: Yup.string(),
  licensePlate: Yup.string(),
  currentMileage: Yup.number()
    .min(0, 'Mileage cannot be negative')
    .nullable(),
});

const VehicleStep = ({ customer, onVehicleSelect, onError, setLoading, loading }) => {
  const [vehicles, setVehicles] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [vinDecoding, setVinDecoding] = useState(false);
  const [vinError, setVinError] = useState(null);

  // Fetch customer's vehicles
  useEffect(() => {
    const fetchVehicles = async () => {
      if (!customer?._id) {
        setInitialLoading(false);
        return;
      }

      try {
        const response = await CustomerService.getCustomerVehicles(customer._id);
        setVehicles(response.data.vehicles || []);
      } catch (err) {
        console.error('Error fetching vehicles:', err);
        onError('Failed to load customer vehicles. Please try again.');
      } finally {
        setInitialLoading(false);
      }
    };

    fetchVehicles();
  }, [customer?._id]); // Only depend on customer ID

  const handleVehicleSelect = (vehicle) => {
    onVehicleSelect(vehicle);
  };

  const handleCreateVehicle = async (values, { setSubmitting }) => {
    try {
      setLoading(true);
      
      // Add customer ID to vehicle data
      const vehicleData = {
        ...values,
        customer: customer._id
      };

      const response = await VehicleService.createVehicle(vehicleData);
      onVehicleSelect(response.data.vehicle);
    } catch (err) {
      console.error('Error creating vehicle:', err);
      onError('Failed to create vehicle. Please try again.');
      setSubmitting(false);
    } finally {
      setLoading(false);
    }
  };

  // VIN decode function
  const handleVinDecode = async (vin, setFieldValue) => {
    if (!vin || vin.trim().length !== 17) {
      setVinError('Please enter a valid 17-character VIN');
      return;
    }

    setVinDecoding(true);
    setVinError(null);

    try {
      const result = await vinService.decodeVIN(vin);
      
      if (result.success) {
        // Auto-populate the fields
        if (result.data.year) {
          setFieldValue('year', result.data.year);
        }
        if (result.data.make) {
          setFieldValue('make', result.data.make);
        }
        if (result.data.model) {
          setFieldValue('model', result.data.model);
        }
        
        // Clear any previous error
        setVinError(null);
        
      } else {
        setVinError(result.error || 'Failed to decode VIN');
      }
    } catch (error) {
      console.error('VIN decode error:', error);
      setVinError('Failed to decode VIN. Please check the VIN and try again.');
    } finally {
      setVinDecoding(false);
    }
  };

  // Generate year options
  const yearOptions = Array.from(
    new Array(new Date().getFullYear() + 1 - 1900 + 1),
    (val, index) => {
      const yearValue = new Date().getFullYear() + 1 - index;
      return { value: yearValue, label: yearValue.toString() };
    }
  );

  if (isCreating) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Add New Vehicle</h3>
            <p className="text-sm text-gray-600">
              Adding vehicle for: <span className="font-medium">{customer?.name}</span>
            </p>
          </div>
          <Button
            onClick={() => setIsCreating(false)}
            variant="outline"
            size="sm"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Back to Selection
          </Button>
        </div>

        <Formik
          initialValues={{
            year: new Date().getFullYear(),
            make: '',
            model: '',
            vin: '',
            licensePlate: '',
            currentMileage: ''
          }}
          validationSchema={VehicleSchema}
          onSubmit={handleCreateVehicle}
        >
          {({ values, errors, touched, handleChange, handleBlur, isSubmitting, setFieldValue }) => (
            <Form className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SelectInput
                  label="Year"
                  name="year"
                  options={yearOptions}
                  value={values.year}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.year}
                  touched={touched.year}
                  required
                />

                <Input
                  label="Make"
                  name="make"
                  value={values.make}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.make}
                  touched={touched.make}
                  required
                  placeholder="Toyota, Ford, BMW, etc."
                />

                <Input
                  label="Model"
                  name="model"
                  value={values.model}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.model}
                  touched={touched.model}
                  required
                  placeholder="Camry, F-150, X3, etc."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    VIN
                  </label>
                  <div className="flex gap-2">
                    <Input
                      name="vin"
                      value={values.vin}
                      onChange={(e) => {
                        handleChange(e);
                        setVinError(null); // Clear error when user types
                      }}
                      onBlur={handleBlur}
                      error={errors.vin || vinError}
                      touched={touched.vin}
                      placeholder="17-character VIN (optional)"
                      maxLength={17}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={() => handleVinDecode(values.vin, setFieldValue)}
                      disabled={vinDecoding || !values.vin || values.vin.length !== 17}
                      variant="secondary"
                      size="sm"
                      className="whitespace-nowrap"
                    >
                      {vinDecoding ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Decoding...
                        </>
                      ) : (
                        'Decode VIN'
                      )}
                    </Button>
                  </div>
                  {vinError && (
                    <p className="mt-1 text-sm text-red-600">{vinError}</p>
                  )}
                </div>

                <Input
                  label="License Plate"
                  name="licensePlate"
                  value={values.licensePlate}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.licensePlate}
                  touched={touched.licensePlate}
                  placeholder="ABC-1234"
                />
              </div>

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

              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || loading}
                >
                  {isSubmitting || loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Creating Vehicle...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-car mr-2"></i>
                      Add Vehicle & Continue
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
        <h3 className="text-lg font-semibold text-gray-900">Select Vehicle</h3>
        <p className="text-sm text-gray-600">
          Choose a vehicle for <span className="font-medium">{customer?.name}</span>
        </p>
      </div>

      {/* Add New Vehicle Button */}
      <div className="flex justify-center">
        <Button
          onClick={() => setIsCreating(true)}
          variant="primary"
          size="lg"
        >
          <i className="fas fa-plus mr-2"></i>
          Add New Vehicle
        </Button>
      </div>

      {/* Vehicle List */}
      <div className="flex-1 flex flex-col min-h-0">
        <h4 className="font-medium text-gray-700 text-center mb-4">
          Customer Vehicles ({vehicles.length})
        </h4>
        
        {initialLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <i className="fas fa-spinner fa-spin text-2xl text-primary-600 mb-2"></i>
              <p className="text-gray-600">Loading vehicles...</p>
            </div>
          </div>
        ) : vehicles.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-gray-300 px-8">
              <i className="fas fa-car text-3xl text-gray-400 mb-2"></i>
              <p className="text-gray-600">No vehicles found for this customer.</p>
              <p className="text-sm text-gray-500">Click "Add New Vehicle" to create one.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4">
            <div className="space-y-3 max-w-3xl mx-auto">
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle._id}
                  onClick={() => handleVehicleSelect(vehicle)}
                  className="bg-white p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-md cursor-pointer transition-all duration-200 group wizard-vehicle-card"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900 group-hover:text-primary-700">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </h5>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        {vehicle.licensePlate && (
                          <span>
                            <i className="fas fa-id-card mr-1"></i>
                            {vehicle.licensePlate}
                          </span>
                        )}
                        {vehicle.vin && (
                          <span>
                            <i className="fas fa-barcode mr-1"></i>
                            VIN: {vehicle.vin.substring(0, 8)}...
                          </span>
                        )}
                        {vehicle.currentMileage && (
                          <span>
                            <i className="fas fa-tachometer-alt mr-1"></i>
                            {vehicle.currentMileage.toLocaleString()} mi
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

export default VehicleStep;
