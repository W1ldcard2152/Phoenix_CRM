import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import CustomerService from '../../services/customerService';
import WorkOrderService from '../../services/workOrderService';

const CustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    const fetchCustomerData = async () => {
      try {
        setLoading(true);
        
        // Fetch customer details
        const customerResponse = await CustomerService.getCustomer(id);
        setCustomer(customerResponse.data.customer);
        
        // Fetch customer vehicles
        const vehiclesResponse = await CustomerService.getCustomerVehicles(id);
        setVehicles(vehiclesResponse.data.vehicles);
        
        // Fetch customer work orders
        const workOrdersResponse = await WorkOrderService.getAllWorkOrders({ customer: id });
        setWorkOrders(workOrdersResponse.data.workOrders);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching customer data:', err);
        setError('Failed to load customer data. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchCustomerData();
  }, [id]);

  const handleDeleteCustomer = async () => {
    try {
      await CustomerService.deleteCustomer(id);
      navigate('/customers');
    } catch (err) {
      console.error('Error deleting customer:', err);
      setError('Failed to delete customer. Please try again later.');
      setDeleteModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading customer data...</p>
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

  if (!customer) {
    return (
      <div className="container mx-auto">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          Customer not found.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">{customer.name}</h1>
        <div className="flex space-x-2">
          <Button
            to={`/customers/${id}/edit`}
            variant="primary"
          >
            Edit Customer
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
        <Card title="Contact Information">
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Phone</p>
              <p className="font-medium">{customer.phone}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">{customer.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Address</p>
              <p className="font-medium">
                {customer.address?.street && (
                  <>
                    {customer.address.street}<br />
                    {customer.address.city}, {customer.address.state} {customer.address.zip}
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Communication Preference</p>
              <p className="font-medium">{customer.communicationPreference}</p>
            </div>
          </div>
        </Card>

        <Card title="Customer Notes">
          <p className="text-gray-700">
            {customer.notes || 'No notes available for this customer.'}
          </p>
        </Card>

        <Card title="Customer Stats">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-blue-800 font-medium">Vehicles</h3>
              <p className="text-3xl font-bold">{vehicles.length}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="text-green-800 font-medium">Work Orders</h3>
              <p className="text-3xl font-bold">{workOrders.length}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card 
          title="Vehicles" 
          headerActions={
            <Button 
              to={`/vehicles/new?customer=${id}`} 
              variant="outline"
              size="sm"
            >
              Add Vehicle
            </Button>
          }
        >
          {vehicles.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p>No vehicles found for this customer.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {vehicles.map((vehicle) => (
                <div key={vehicle._id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="font-medium">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </p>
                    <p className="text-sm text-gray-600">
                      {vehicle.vin ? `VIN: ${vehicle.vin}` : 'No VIN'} 
                      {vehicle.licensePlate ? ` • License: ${vehicle.licensePlate}` : ''}
                    </p>
                  </div>
                  <div>
                    <Button 
                      to={`/vehicles/${vehicle._id}`} 
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
          title="Recent Work Orders"
          headerActions={
            <Button 
              to={`/work-orders/new?customer=${id}`} 
              variant="outline"
              size="sm"
            >
              New Work Order
            </Button>
          }
        >
          {workOrders.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p>No work orders found for this customer.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {workOrders.slice(0, 5).map((workOrder) => (
                <div key={workOrder._id} className="py-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        {workOrder.vehicle?.year} {workOrder.vehicle?.make} {workOrder.vehicle?.model}
                      </p>
                      <p className="text-sm text-gray-600 truncate max-w-xs">
                        {workOrder.serviceRequested}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(workOrder.date).toLocaleDateString()}
                      </p>
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
              {workOrders.length > 5 && (
                <div className="pt-3 text-center">
                  <Button 
                    to={`/work-orders?customer=${id}`}
                    variant="link"
                  >
                    View {workOrders.length - 5} more work orders
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
              Are you sure you want to delete this customer? This action cannot be undone.
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
                onClick={handleDeleteCustomer}
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

export default CustomerDetail;