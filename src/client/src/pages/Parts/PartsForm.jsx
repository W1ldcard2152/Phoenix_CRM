import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';
import Button from '../../components/common/Button';
import partService from '../../services/partService';

const PartSchema = Yup.object().shape({
  name: Yup.string()
    .required('Part name is required')
    .max(200, 'Part name cannot exceed 200 characters'),
  partNumber: Yup.string()
    .required('Part number is required'),
  price: Yup.number()
    .required('Price is required')
    .min(0, 'Price must be positive'),
  cost: Yup.number()
    .required('Cost is required')
    .min(0, 'Cost must be positive'),
  vendor: Yup.string()
    .required('Vendor is required')
    .max(100, 'Vendor name cannot exceed 100 characters'),
  category: Yup.string()
    .required('Category is required'),
  brand: Yup.string()
    .required('Brand is required')
    .max(50, 'Brand cannot exceed 50 characters'),
  warranty: Yup.string()
    .max(100, 'Warranty cannot exceed 100 characters'),
  notes: Yup.string()
    .max(500, 'Notes cannot exceed 500 characters'),
  url: Yup.string()
    .url('Please enter a valid URL')
});

const PartsForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [existingVendors, setExistingVendors] = useState([]);
  const [existingBrands, setExistingBrands] = useState([]);

  const isEditing = !!id;

  const initialValues = {
    name: '',
    partNumber: '',
    price: '',
    cost: '',
    vendor: '',
    category: '',
    brand: '',
    warranty: '',
    notes: '',
    url: '',
    isActive: true
  };

  const [formValues, setFormValues] = useState(initialValues);

  const categoryOptions = [
    { value: '', label: 'Select Category' },
    { value: 'Engine', label: 'Engine' },
    { value: 'Transmission', label: 'Transmission' },
    { value: 'Brakes', label: 'Brakes' },
    { value: 'Suspension', label: 'Suspension' },
    { value: 'Electrical', label: 'Electrical' },
    { value: 'Exhaust', label: 'Exhaust' },
    { value: 'Cooling', label: 'Cooling' },
    { value: 'Fuel System', label: 'Fuel System' },
    { value: 'Air & Filters', label: 'Air & Filters' },
    { value: 'Fluids & Chemicals', label: 'Fluids & Chemicals' },
    { value: 'Belts & Hoses', label: 'Belts & Hoses' },
    { value: 'Ignition', label: 'Ignition' },
    { value: 'Body Parts', label: 'Body Parts' },
    { value: 'Interior', label: 'Interior' },
    { value: 'Tires & Wheels', label: 'Tires & Wheels' },
    { value: 'Tools & Equipment', label: 'Tools & Equipment' },
    { value: 'Other', label: 'Other' }
  ];

  useEffect(() => {
    fetchExistingOptions();
    if (isEditing) {
      fetchPartData();
    }
  }, [id, isEditing]);

  const fetchExistingOptions = async () => {
    try {
      const [vendorsRes, brandsRes] = await Promise.all([
        partService.getVendors(),
        partService.getBrands()
      ]);
      
      setExistingVendors(vendorsRes.data.data.vendors);
      setExistingBrands(brandsRes.data.data.brands);
    } catch (err) {
      console.error('Error fetching existing options:', err);
    }
  };

  const fetchPartData = async () => {
    try {
      setLoading(true);
      const response = await partService.getPart(id);
      const part = response.data.data.part;
      
      setFormValues({
        name: part.name || '',
        partNumber: part.partNumber || '',
        price: part.price?.toString() || '',
        cost: part.cost?.toString() || '',
        vendor: part.vendor || '',
        category: part.category || '',
        brand: part.brand || '',
        warranty: part.warranty || '',
        notes: part.notes || '',
        url: part.url || '',
        isActive: part.isActive !== undefined ? part.isActive : true
      });
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching part:', err);
      setError('Failed to load part data. Please try again.');
      setLoading(false);
    }
  };

  const handleSubmit = async (values, { setSubmitting }) => {
    try {
      const partData = {
        ...values,
        price: parseFloat(values.price),
        cost: parseFloat(values.cost)
      };

      if (isEditing) {
        await partService.updatePart(id, partData);
      } else {
        await partService.createPart(partData);
      }

      navigate('/parts');
    } catch (err) {
      console.error('Error saving part:', err);
      setError(err.response?.data?.message || 'Failed to save part. Please try again.');
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading part data...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {isEditing ? 'Edit Part' : 'Add New Part'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <Card>
        <Formik
          initialValues={formValues}
          validationSchema={PartSchema}
          onSubmit={handleSubmit}
          enableReinitialize
        >
          {({ isSubmitting, touched, errors, values, handleChange, handleBlur, setFieldValue }) => (
            <Form>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Part Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
                    Part Information
                  </h3>
                  
                  <Input
                    label="Part Name"
                    name="name"
                    value={values.name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.name}
                    touched={touched.name}
                    required
                    placeholder="Oil Filter"
                  />

                  <Input
                    label="Part Number"
                    name="partNumber"
                    value={values.partNumber}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.partNumber}
                    touched={touched.partNumber}
                    required
                    placeholder="OF-12345"
                  />

                  <SelectInput
                    label="Category"
                    name="category"
                    options={categoryOptions}
                    value={values.category}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.category}
                    touched={touched.category}
                    required
                  />

                  <Input
                    label="Brand"
                    name="brand"
                    value={values.brand}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.brand}
                    touched={touched.brand}
                    required
                    placeholder="Bosch"
                    list="brands-list"
                  />
                  <datalist id="brands-list">
                    {existingBrands.map(brand => (
                      <option key={brand} value={brand} />
                    ))}
                  </datalist>

                  <Input
                    label="Vendor/Supplier"
                    name="vendor"
                    value={values.vendor}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.vendor}
                    touched={touched.vendor}
                    required
                    placeholder="AutoZone"
                    list="vendors-list"
                  />
                  <datalist id="vendors-list">
                    {existingVendors.map(vendor => (
                      <option key={vendor} value={vendor} />
                    ))}
                  </datalist>
                </div>

                {/* Pricing & Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
                    Pricing & Details
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Cost (Wholesale)"
                      name="cost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={values.cost}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      error={errors.cost}
                      touched={touched.cost}
                      required
                      placeholder="0.00"
                    />

                    <Input
                      label="Selling Price"
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={values.price}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      error={errors.price}
                      touched={touched.price}
                      required
                      placeholder="0.00"
                    />
                  </div>

                  {/* Profit Calculation */}
                  {values.cost && values.price && parseFloat(values.cost) > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-medium text-green-800 mb-2">Profit Analysis</h4>
                      <div className="text-sm text-green-700 space-y-1">
                        <div>Markup: {formatCurrency(parseFloat(values.price) - parseFloat(values.cost))}</div>
                        <div>
                          Margin: {(((parseFloat(values.price) - parseFloat(values.cost)) / parseFloat(values.cost)) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  )}

                  <Input
                    label="Warranty"
                    name="warranty"
                    value={values.warranty}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.warranty}
                    touched={touched.warranty}
                    placeholder="1 year / 12,000 miles"
                  />

                  <Input
                    label="Product URL"
                    name="url"
                    type="url"
                    value={values.url}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.url}
                    touched={touched.url}
                    placeholder="https://www.vendor.com/product-page"
                  />

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isActive"
                      name="isActive"
                      checked={values.isActive}
                      onChange={handleChange}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                      Active (available for use)
                    </label>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="mt-6">
                <TextArea
                  label="Notes"
                  name="notes"
                  value={values.notes}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.notes}
                  touched={touched.notes}
                  rows={3}
                  placeholder="Additional notes about this part..."
                />
              </div>

              {/* Actions */}
              <div className="mt-8 flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="light"
                  onClick={() => navigate('/parts')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : (isEditing ? 'Update Part' : 'Create Part')}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </Card>
    </div>
  );
};

export default PartsForm;