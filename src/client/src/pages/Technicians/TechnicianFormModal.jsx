import React, { useState, useEffect } from 'react';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import Button from '../../components/common/Button';
import technicianService from '../../services/technicianService';

const TechnicianFormModal = ({ technician, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    specialization: '',
    hourlyRate: '',
    notes: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (technician) {
      setFormData({
        name: technician.name || '',
        phone: technician.phone || '',
        email: technician.email || '',
        specialization: technician.specialization || '',
        hourlyRate: technician.hourlyRate || '',
        notes: technician.notes || '',
        isActive: technician.isActive !== undefined ? technician.isActive : true,
      });
    } else {
      // Reset for new technician
      setFormData({
        name: '',
        phone: '',
        email: '',
        specialization: '',
        hourlyRate: '',
        notes: '',
        isActive: true,
      });
    }
  }, [technician]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic validation
    if (!formData.name.trim()) {
      setError('Technician name is required.');
      setLoading(false);
      return;
    }
    
    // Ensure hourlyRate is a number or empty string (which will be omitted)
    const payload = {
      ...formData,
      hourlyRate: formData.hourlyRate === '' ? undefined : Number(formData.hourlyRate),
    };
    // Remove empty fields that are not explicitly set to null/false by schema
    Object.keys(payload).forEach(key => {
        if (payload[key] === '') {
            delete payload[key];
        }
    });


    try {
      if (technician && technician._id) {
        await technicianService.updateTechnician(technician._id, payload);
      } else {
        await technicianService.createTechnician(payload);
      }
      onSave(); // Callback to refresh list and close modal
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${technician ? 'update' : 'create'} technician.`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            {technician ? 'Edit Technician' : 'Add New Technician'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>

        {error && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Input
              label="Full Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., John Doe"
              required
            />
            <Input
              label="Phone Number"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              placeholder="e.g., (555) 123-4567"
            />
          </div>
          <div className="mb-4">
            <Input
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="e.g., john.doe@example.com"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Input
              label="Specialization"
              name="specialization"
              value={formData.specialization}
              onChange={handleChange}
              placeholder="e.g., Engine Expert"
            />
            <Input
              label="Hourly Rate ($)"
              name="hourlyRate"
              type="number"
              value={formData.hourlyRate}
              onChange={handleChange}
              placeholder="e.g., 50"
              min="0"
              step="0.01"
            />
          </div>
          <div className="mb-4">
            <TextArea
              label="Notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Any relevant notes about the technician..."
              rows="3"
            />
          </div>
          
          {technician && ( // Only show isActive toggle when editing
            <div className="mb-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleChange}
                  className="form-checkbox h-5 w-5 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Active Technician</span>
              </label>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <Button type="button" onClick={onClose} variant="secondary" disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary-600 hover:bg-primary-700" disabled={loading}>
              {loading ? (technician ? 'Saving...' : 'Adding...') : (technician ? 'Save Changes' : 'Add Technician')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TechnicianFormModal;
