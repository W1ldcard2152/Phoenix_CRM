import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import VehicleService from '../../services/vehicleService';
import WorkOrderService from '../../services/workOrderService';
import AppointmentService from '../../services/appointmentService';

const VehicleDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [serviceHistory, setServiceHistory] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

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
        const appointmentsResponse = await AppointmentService.getVehicleAppointments(id);
        setAppointments(appointmentsResponse.data.appointments || []);
        
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
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="container mx-auto">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          Vehicle not found.
        </div>
      </div>
    );
  }

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
        <Card 
          title="Service History" 
          headerActions={
            <Button 
              to={`/work-orders/new?vehicle=${id}`} 
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
                        {new Date(workOrder.date).toLocaleDateString()}
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

        <Card 
          title="Upcoming Appointments"
          headerActions={
            <Button 
              to={`/appointments/new?vehicle=${id}`} 
              variant="outline"
              size="sm"
            >
              Schedule Appointment
            </Button>
          }
        >
          {appointments.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p>No appointments scheduled for this vehicle.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {appointments
                .filter(appointment => new Date(appointment.startTime) >= new Date())
                .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
                .slice(0, 5)
                .map((appointment) => (
                  <div key={appointment._id} className="py-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{appointment.serviceType}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(appointment.startTime).toLocaleDateString()} at {
                            new Date(appointment.startTime).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })
                          }
                        </p>
                        {appointment.technician && (
                          <p className="text-sm text-gray-500">
                            Technician: {appointment.technician}
                          </p>
                        )}
                      </div>
                      <div>
                        <span 
                          className={`inline-block px-2 py-1 text-xs rounded-full ${
                            appointment.status === 'Confirmed' 
                              ? 'bg-green-100 text-green-800' 
                              : appointment.status === 'Cancelled'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {appointment.status}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end space-x-2">
                      <Button 
                        to={`/appointments/${appointment._id}`}
                        variant="outline"
                        size="sm"
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              {appointments.filter(appointment => new Date(appointment.startTime) >= new Date()).length > 5 && (
                <div className="pt-3 text-center">
                  <Button
                    to={`/appointments?vehicle=${id}`}
                    variant="link"
                  >
                    View all appointments
                  </Button>
                </div>
              )}
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
    </div>
  );
};

export default VehicleDetail;