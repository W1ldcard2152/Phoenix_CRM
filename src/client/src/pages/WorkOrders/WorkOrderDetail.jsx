import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SelectInput from '../../components/common/SelectInput';
import WorkOrderService from '../../services/workOrderService';

const WorkOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [laborModalOpen, setLaborModalOpen] = useState(false);
  const [newPart, setNewPart] = useState({
    name: '',
    partNumber: '',
    quantity: 1,
    price: 0,
    ordered: false,
    received: false
  });
  const [newLabor, setNewLabor] = useState({
    description: '',
    hours: 1,
    rate: 75
  });

  useEffect(() => {
    const fetchWorkOrder = async () => {
      try {
        setLoading(true);
        const response = await WorkOrderService.getWorkOrder(id);
        setWorkOrder(response.data.workOrder);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching work order:', err);
        setError('Failed to load work order. Please try again later.');
        setLoading(false);
      }
    };

    fetchWorkOrder();
  }, [id]);

  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    if (!newStatus || newStatus === workOrder.status) return;

    try {
      setStatusUpdateLoading(true);
      const response = await WorkOrderService.updateStatus(id, newStatus);
      setWorkOrder(response.data.workOrder);
      setStatusUpdateLoading(false);
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update status. Please try again later.');
      setStatusUpdateLoading(false);
    }
  };

  const handleDeleteWorkOrder = async () => {
    try {
      await WorkOrderService.deleteWorkOrder(id);
      navigate('/work-orders');
    } catch (err) {
      console.error('Error deleting work order:', err);
      setError('Failed to delete work order. Please try again later.');
      setDeleteModalOpen(false);
    }
  };

  const handleAddPart = async () => {
    try {
      const response = await WorkOrderService.addPart(id, newPart);
      setWorkOrder(response.data.workOrder);
      setPartModalOpen(false);
      setNewPart({
        name: '',
        partNumber: '',
        quantity: 1,
        price: 0,
        ordered: false,
        received: false
      });
    } catch (err) {
      console.error('Error adding part:', err);
      setError('Failed to add part. Please try again later.');
    }
  };

  const handleAddLabor = async () => {
    try {
      const response = await WorkOrderService.addLabor(id, newLabor);
      setWorkOrder(response.data.workOrder);
      setLaborModalOpen(false);
      setNewLabor({
        description: '',
        hours: 1,
        rate: 75
      });
    } catch (err) {
      console.error('Error adding labor:', err);
      setError('Failed to add labor. Please try again later.');
    }
  };
const generateInvoice = () => {
  // Navigate to the invoice generator with this work order ID as a search param
  navigate(`/invoices/generate?workOrder=${id}`);
};

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  // Status options for dropdown
  const statusOptions = [
    { value: 'Created', label: 'Created' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Inspected - Need Parts Ordered', label: 'Inspected - Need Parts' },
    { value: 'Parts Ordered', label: 'Parts Ordered' },
    { value: 'Parts Received', label: 'Parts Received' },
    { value: 'Repair In Progress', label: 'Repair In Progress' },
    { value: 'Completed - Need Payment', label: 'Completed - Need Payment' },
    { value: 'Completed - Paid', label: 'Completed - Paid' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading work order data...</p>
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

  if (!workOrder) {
    return (
      <div className="container mx-auto">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          Work order not found.
        </div>
      </div>
    );
  }

  // Calculate totals
  const partsCost = workOrder.parts.reduce((total, part) => {
    return total + (part.price * part.quantity);
  }, 0);
  
  const laborCost = workOrder.labor.reduce((total, labor) => {
    return total + (labor.hours * labor.rate);
  }, 0);
  
  const totalCost = partsCost + laborCost;

  return (
    <div className="container mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">
          Work Order: {workOrder.services && workOrder.services.length > 0 
            ? workOrder.services[0].description 
            : workOrder.serviceRequested || 'No Description'}
        </h1>
        <div className="flex space-x-2">
          <Button
            to={`/work-orders/${id}/edit`}
            variant="primary"
          >
            Edit Work Order
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
        <Card title="Customer & Vehicle">
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Customer</p>
              <p className="font-medium">
                {workOrder.customer?.name || 'Unknown Customer'}
              </p>
              {workOrder.customer?.phone && (
                <p className="text-sm text-gray-600">{workOrder.customer.phone}</p>
              )}
              {workOrder.customer?.email && (
                <p className="text-sm text-gray-600">{workOrder.customer.email}</p>
              )}
            </div>
            <div className="pt-2">
              <p className="text-sm text-gray-500">Vehicle</p>
              <p className="font-medium">
                {workOrder.vehicle?.year} {workOrder.vehicle?.make} {workOrder.vehicle?.model}
              </p>
              {workOrder.vehicle?.vin && (
                <p className="text-sm text-gray-600">VIN: {workOrder.vehicle.vin}</p>
              )}
              {workOrder.vehicle?.licensePlate && (
                <p className="text-sm text-gray-600">License: {workOrder.vehicle.licensePlate}</p>
              )}
            </div>
          </div>
        </Card>

        <Card title="Work Order Details">
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Date</p>
              <p className="font-medium">
                {new Date(workOrder.date).toLocaleDateString()}
              </p>
            </div>
            
            {/* Services Requested - Updated to display multiple services */}
            <div>
              <p className="text-sm text-gray-500">Services Requested</p>
              <div className="font-medium space-y-1">
                {workOrder.services && workOrder.services.length > 0 ? (
                  workOrder.services.map((service, index) => (
                    <div key={index} className="py-1">
                      {index > 0 && <div className="border-t border-gray-100 my-1"></div>}
                      <p>{service.description}</p>
                    </div>
                  ))
                ) : workOrder.serviceRequested ? (
                  // Backward compatibility: Display serviceRequested if services array is empty
                  workOrder.serviceRequested.split('\n').map((line, idx) => (
                    <div key={idx} className="py-1">
                      {idx > 0 && <div className="border-t border-gray-100 my-1"></div>}
                      <p>{line}</p>
                    </div>
                  ))
                ) : (
                  <p>No services specified</p>
                )}
              </div>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">Priority</p>
              <p className="font-medium">{workOrder.priority}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <div className="mt-1">
                <SelectInput
                  name="status"
                  options={statusOptions}
                  value={workOrder.status}
                  onChange={handleStatusChange}
                  disabled={statusUpdateLoading}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card 
          title="Totals" 
          headerActions={
            <div className="flex space-x-2">
              <Button
                onClick={generateInvoice}
                variant="primary"
                size="sm"
              >
                Generate Invoice
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span>Parts:</span>
                <span>{formatCurrency(partsCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Labor:</span>
                <span>{formatCurrency(laborCost)}</span>
              </div>
              <div className="h-px bg-gray-200 my-2"></div>
              <div className="flex justify-between font-medium">
                <span>Total:</span>
                <span>{formatCurrency(totalCost)}</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Estimate</p>
              <p className="font-medium">{formatCurrency(workOrder.totalEstimate)}</p>
            </div>
            {workOrder.status.includes('Completed') && (
              <div>
                <p className="text-sm text-gray-500">Actual</p>
                <p className="font-medium">{formatCurrency(workOrder.totalActual)}</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card 
          title="Diagnostic Notes" 
          className="md:col-span-2"
        >
          <p className="text-gray-700">
            {workOrder.diagnosticNotes || 'No diagnostic notes available.'}
          </p>
        </Card>

        <Card 
          title="Parts" 
          headerActions={
            <Button
              onClick={() => setPartModalOpen(true)}
              variant="outline"
              size="sm"
            >
              Add Part
            </Button>
          }
        >
          {workOrder.parts.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p>No parts added.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Part
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Qty
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workOrder.parts.map((part, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="font-medium text-gray-900">
                          {part.name}
                        </div>
                        {part.partNumber && (
                          <div className="text-xs text-gray-500">
                            {part.partNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {part.quantity}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatCurrency(part.price)}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm">
                          {part.ordered ? (
                            part.received ? (
                              <span className="text-green-600">Received</span>
                            ) : (
                              <span className="text-yellow-600">Ordered</span>
                            )
                          ) : (
                            <span className="text-gray-500">Not Ordered</span>
                          )}
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
          title="Labor" 
          headerActions={
            <Button
              onClick={() => setLaborModalOpen(true)}
              variant="outline"
              size="sm"
            >
              Add Labor
            </Button>
          }
        >
          {workOrder.labor.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p>No labor entries added.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hours
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rate
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workOrder.labor.map((labor, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">
                          {labor.description}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {labor.hours}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatCurrency(labor.rate)}/hr
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatCurrency(labor.hours * labor.rate)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              Are you sure you want to delete this work order? This action cannot be undone.
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
                onClick={handleDeleteWorkOrder}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Part Modal */}
      {partModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Add Part</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Part Name
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.name}
                  onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Part Number
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.partNumber}
                  onChange={(e) => setNewPart({ ...newPart, partNumber: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.quantity}
                    onChange={(e) => setNewPart({ ...newPart, quantity: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.price}
                    onChange={(e) => setNewPart({ ...newPart, price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex space-x-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="ordered"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    checked={newPart.ordered}
                    onChange={(e) => setNewPart({ ...newPart, ordered: e.target.checked })}
                  />
                  <label htmlFor="ordered" className="ml-2 block text-sm text-gray-700">
                    Ordered
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="received"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    checked={newPart.received}
                    onChange={(e) => setNewPart({ ...newPart, received: e.target.checked })}
                    disabled={!newPart.ordered}
                  />
                  <label htmlFor="received" className="ml-2 block text-sm text-gray-700">
                    Received
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                variant="light"
                onClick={() => setPartModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleAddPart}
                disabled={!newPart.name}
              >
                Add Part
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Labor Modal */}
      {laborModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Add Labor</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newLabor.description}
                  onChange={(e) => setNewLabor({ ...newLabor, description: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hours
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newLabor.hours}
                    onChange={(e) => setNewLabor({ ...newLabor, hours: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hourly Rate
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newLabor.rate}
                    onChange={(e) => setNewLabor({ ...newLabor, rate: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                variant="light"
                onClick={() => setLaborModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleAddLabor}
                disabled={!newLabor.description || !newLabor.hours || !newLabor.rate}
              >
                Add Labor
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkOrderDetail;