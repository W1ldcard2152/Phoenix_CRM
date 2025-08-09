import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import VehicleService from '../../services/vehicleService';
import AppointmentService from '../../services/appointmentService';

const VehicleDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [serviceHistory, setServiceHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [mileageModalOpen, setMileageModalOpen] = useState(false);
  const [newMileageRecord, setNewMileageRecord] = useState({
    date: new Date().toISOString().split('T')[0],
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
        
        // Fetch vehicle service history
        const historyResponse = await VehicleService.getVehicleServiceHistory(id);
        setServiceHistory(historyResponse.data.serviceHistory || []);
        
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
      setError('Failed to delete vehicle. Please try again later.');
      setDeleteModalOpen(false);
    }
  };

  const handleAddMileageRecord = async () => {
    if (!newMileageRecord.mileage) {
      setError('Mileage is required');
      return;
    }

    try {
      // Create a copy of vehicle with updated mileage history
      const updatedVehicle = {
        ...vehicle,
        mileageHistory: [
          ...vehicle.mileageHistory || [], 
          newMileageRecord
        ],
        currentMileage: Math.max(vehicle.currentMileage || 0, parseInt(newMileageRecord.mileage))
      };
      
      // Update the vehicle
      await VehicleService.updateVehicle(id, updatedVehicle);
      
      // Reload the vehicle data
      const vehicleResponse = await VehicleService.getVehicle(id);
      setVehicle(vehicleResponse.data.vehicle);
      
      // Reset the form and close modal
      setNewMileageRecord({
        date: new Date().toISOString().split('T')[0],
        mileage: '',
        notes: ''
      });
      
      setMileageModalOpen(false);
    } catch (err) {
      console.error('Error adding mileage record:', err);
      setError('Failed to add mileage record. Please try again later.');
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

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

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
            variant="danger"
            onClick={() => setDeleteModalOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
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
            <div>
              <p className="text-sm text-gray-500">Current Mileage</p>
              <p className="font-medium">
                {formatMileage(vehicle.currentMileage)}
                <button 
                  onClick={() => setMileageModalOpen(true)}
                  className="ml-2 text-blue-600 text-sm hover:text-blue-800"
                >
                  Update
                </button>
              </p>
            </div>
          </div>
        </Card>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mileage History Card */}
        <Card 
          title="Mileage History" 
          headerActions={
            <Button 
              onClick={() => setMileageModalOpen(true)} 
              variant="outline"
              size="sm"
            >
              Add Mileage
            </Button>
          }
        >
          {!vehicle.mileageHistory || vehicle.mileageHistory.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p>No mileage history recorded.</p>
              <p className="text-sm mt-2">Click "Add Mileage" to record the vehicle's odometer reading.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mileage
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Sort mileage history by date descending */}
                  {[...vehicle.mileageHistory]
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((record, index) => (
                      <tr key={index} className={index === 0 ? 'bg-blue-50' : ''}>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <div className="font-medium text-gray-900">
                            {formatDate(record.date)}
                          </div>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {formatMileage(record.mileage)}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-sm text-gray-900">
                            {record.notes || '-'}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card 
          title="Service History" 
          headerActions={
            <Button 
              to={`/work-orders/new?vehicle=${id}${customer ? `&customer=${customer._id}` : ''}`} 
              variant="outline"
              size="sm"
            >
              New Work Order
            </Button>
          }
        >
          {serviceHistory.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p>No service history found for this vehicle.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {serviceHistory.map((workOrder) => (
                <div key={workOrder._id} className="py-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{workOrder.serviceRequested}</p>
                      <p className="text-sm text-gray-500">
                        {formatDate(workOrder.date)}
                      </p>
                      {workOrder.diagnosticNotes && (
                        <p className="text-sm text-gray-600 mt-1">
                          {workOrder.diagnosticNotes.substring(0, 100)}
                          {workOrder.diagnosticNotes.length > 100 ? '...' : ''}
                        </p>
                      )}
                    </div>
                    <div>
                      <span 
                        className={`inline-block px-2 py-1 text-xs rounded-full ${
                          workOrder.status.includes('Completed') 
                            ? 'bg-green-100 text-green-800' 
                            : workOrder.status === 'Cancelled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {workOrder.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end space-x-2">
                    <Button 
                      to={`/work-orders/${workOrder._id}`} 
                      variant="outline"
                      size="sm"
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

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
