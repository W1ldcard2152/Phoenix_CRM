import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import VehicleService from '../../services/vehicleService';
import AppointmentService from '../../services/appointmentService';
import { getTodayForInput, formatDate } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { permissions } from '../../utils/permissions';
import FollowUpModal from '../../components/followups/FollowUpModal';
import RelatedRecordsTabs from '../../components/common/RelatedRecordsTabs';

const VehicleDetail = () => {
  const { currentUser } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [mileageModalOpen, setMileageModalOpen] = useState(false);
  const [mileageHistoryModalOpen, setMileageHistoryModalOpen] = useState(false);
  const [newMileageRecord, setNewMileageRecord] = useState({
    date: getTodayForInput(),
    mileage: '',
    notes: ''
  });

  useEffect(() => {
    const fetchVehicleData = async () => {
      try {
        setLoading(true);
        
        // Fetch vehicle details
        const vehicleResponse = await VehicleService.getVehicle(id);
        setVehicle(vehicleResponse.data.vehicle);
        
        // If customer is included in the response, set it
        if (vehicleResponse.data.vehicle.customer && typeof vehicleResponse.data.vehicle.customer === 'object') {
          setCustomer(vehicleResponse.data.vehicle.customer);
        }

        // Fetch vehicle appointments
        try {
          await AppointmentService.getVehicleAppointments(id);
          // setAppointments(appointmentsResponse.data.appointments || []); // Removed as appointments state is unused
        } catch (apptErr) {
          console.error('Error loading appointments:', apptErr);
          // Don't fail the entire load if just appointments fail
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching vehicle data:', err);
        setError('Failed to load vehicle data. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchVehicleData();
  }, [id]);

  const handleDeleteVehicle = async () => {
    try {
      await VehicleService.deleteVehicle(id);
      navigate('/vehicles');
    } catch (err) {
      console.error('Error deleting vehicle:', err);
      const errorMessage = err.response?.data?.message || 'Failed to delete vehicle. Please try again later.';
      setError(errorMessage);
      setDeleteModalOpen(false);
    }
  };

  const handleAddMileageRecord = async () => {
    if (!newMileageRecord.mileage) {
      setError('Mileage is required');
      return;
    }

    try {
      const response = await VehicleService.addMileageRecord(id, newMileageRecord);
      setVehicle(response.data.vehicle);

      setNewMileageRecord({ date: getTodayForInput(), mileage: '', notes: '' });
      setMileageModalOpen(false);
    } catch (err) {
      console.error('Error adding mileage record:', err);
      setError('Failed to add mileage record. Please try again later.');
    }
  };

  const handleDeleteMileageRecord = async (recordIndex) => {
    if (!window.confirm('Are you sure you want to delete this mileage record?')) {
      return;
    }

    try {
      // Create a copy of vehicle with the mileage record removed
      const updatedMileageHistory = [...vehicle.mileageHistory];
      updatedMileageHistory.splice(recordIndex, 1);
      
      // Recalculate current mileage from remaining records
      let newCurrentMileage = 0;
      if (updatedMileageHistory.length > 0) {
        newCurrentMileage = Math.max(...updatedMileageHistory.map(record => record.mileage));
      }

      const updateData = {
        mileageHistory: updatedMileageHistory,
        currentMileage: newCurrentMileage
      };

      // Update the vehicle
      await VehicleService.updateVehicle(id, updateData);
      
      // Reload the vehicle data
      const vehicleResponse = await VehicleService.getVehicle(id);
      setVehicle(vehicleResponse.data.vehicle);
      
    } catch (err) {
      console.error('Error deleting mileage record:', err);
      setError('Failed to delete mileage record. Please try again later.');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading vehicle data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="container mx-auto">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          Vehicle not found.
        </div>
      </div>
    );
  }

  // Format mileage with commas
  const formatMileage = (mileage) => {
    if (mileage === undefined || mileage === null) return 'Not recorded';
    return new Intl.NumberFormat().format(mileage) + ' miles';
  };

  return (
    <div className="container mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </h1>
        <div className="flex space-x-2">
          <Button
            to={`/vehicles/${id}/edit`}
            variant="primary"
          >
            Edit Vehicle
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFollowUpModalOpen(true)}
          >
            <i className="fas fa-thumbtack mr-1"></i>Follow-Up
          </Button>
          {permissions.vehicles.canDelete(currentUser) && (
            <Button
              variant="danger"
              onClick={() => setDeleteModalOpen(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      <FollowUpModal
        isOpen={followUpModalOpen}
        onClose={() => setFollowUpModalOpen(false)}
        entityType="vehicle"
        entityId={id}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card title="Vehicle Information">
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Year, Make, Model</p>
              <p className="font-medium">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </p>
            </div>
            {vehicle.vin && (
              <div>
                <p className="text-sm text-gray-500">VIN</p>
                <p className="font-medium">{vehicle.vin}</p>
              </div>
            )}
            {vehicle.licensePlate && (
              <div>
                <p className="text-sm text-gray-500">License Plate</p>
                <p className="font-medium">{vehicle.licensePlate}</p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium text-gray-700">
                Mileage History
                {vehicle.mileageHistory && vehicle.mileageHistory.length > 3 && (
                  <button
                    onClick={() => setMileageHistoryModalOpen(true)}
                    className="ml-2 text-sm text-blue-600 hover:text-blue-800 font-normal"
                  >
                    View All ({vehicle.mileageHistory.length})
                  </button>
                )}
              </p>
              <Button
                onClick={() => setMileageModalOpen(true)}
                variant="outline"
                size="sm"
              >
                Add
              </Button>
            </div>
            {vehicle.mileageHistory && vehicle.mileageHistory.length > 0 ? (
              <div className="space-y-1.5">
                {[...vehicle.mileageHistory]
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .slice(0, 3)
                  .map((record, idx) => (
                    <div key={idx} className="text-sm flex justify-between items-baseline gap-2">
                      <span className="text-gray-500 whitespace-nowrap">
                        {formatDate(record.date)}
                        {idx === 0 && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-800 font-medium">
                            Current
                          </span>
                        )}
                      </span>
                      <span className="font-medium text-gray-900">{formatMileage(record.mileage)}</span>
                    </div>
                  ))}
              </div>
            ) : vehicle.currentMileage != null ? (
              <div className="text-sm flex justify-between items-baseline gap-2">
                <span className="text-gray-500">
                  <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-800 font-medium">
                    Current
                  </span>
                </span>
                <span className="font-medium text-gray-900">{formatMileage(vehicle.currentMileage)}</span>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No mileage recorded yet.</p>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Owner Information">
            <div className="space-y-2">
              {customer ? (
                <>
                  <div>
                    <p className="text-sm text-gray-500">Customer Name</p>
                    <p className="font-medium">{customer.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Contact</p>
                    <p className="font-medium">{customer.phone}</p>
                    <p className="text-sm text-gray-600">{customer.email}</p>
                  </div>
                  <div className="pt-2">
                    <Button
                      to={`/customers/${customer._id}`}
                      variant="outline"
                      size="sm"
                    >
                      View Customer Details
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-gray-700">Owner information not available.</p>
              )}
            </div>
          </Card>

          <Card title="Vehicle Notes">
            <p className="text-gray-700">
              {vehicle.notes || 'No notes available for this vehicle.'}
            </p>
          </Card>
        </div>
      </div>

      <div className="mb-6">
        <RelatedRecordsTabs vehicleId={id} customerId={customer?._id} />
      </div>

      {/* Mileage History Modal (full list) */}
      {mileageHistoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Mileage History</h3>
              <button
                onClick={() => setMileageHistoryModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {!vehicle.mileageHistory || vehicle.mileageHistory.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <p>No mileage history recorded.</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mileage</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {[...vehicle.mileageHistory]
                      .map((record, originalIndex) => ({ ...record, originalIndex }))
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .map((record, sortedIndex) => (
                        <tr key={record.originalIndex} className={sortedIndex === 0 ? 'bg-blue-50' : ''}>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{formatDate(record.date)}</div>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{formatMileage(record.mileage)}</div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="text-sm text-gray-900">{record.notes || '-'}</div>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-right">
                            <button
                              onClick={() => handleDeleteMileageRecord(record.originalIndex)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                              title="Delete mileage record"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
              <Button variant="light" onClick={() => setMileageHistoryModalOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this vehicle? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="light"
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteVehicle}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Mileage Modal */}
      {mileageModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Update Mileage</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newMileageRecord.date}
                  onChange={(e) => setNewMileageRecord({ ...newMileageRecord, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mileage (mi)
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newMileageRecord.mileage}
                  onChange={(e) => setNewMileageRecord({ ...newMileageRecord, mileage: e.target.value })}
                  placeholder="Enter current odometer reading"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newMileageRecord.notes}
                  onChange={(e) => setNewMileageRecord({ ...newMileageRecord, notes: e.target.value })}
                  placeholder="Service performed, service center, etc."
                  rows="3"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                variant="light"
                onClick={() => setMileageModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleAddMileageRecord}
                disabled={!newMileageRecord.mileage}
              >
                Save Mileage
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleDetail;
