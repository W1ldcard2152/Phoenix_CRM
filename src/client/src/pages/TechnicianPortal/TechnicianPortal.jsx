import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import WorkOrderService from '../../services/workOrderService';
import { useAuth } from '../../contexts/AuthContext';

const TechnicianPortal = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [inspectionWorkOrders, setInspectionWorkOrders] = useState([]);
  const [repairWorkOrders, setRepairWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAssignedWorkOrders();
  }, []);

  const fetchAssignedWorkOrders = async () => {
    try {
      setLoading(true);
      // For now, get all work orders - in the future this will be filtered by assigned technician
      const response = await WorkOrderService.getAllWorkOrders();
      
      // Filter work orders assigned to current user (when auth is implemented)
      // For now, show all work orders
      const workOrders = response.data.workOrders || [];
      
      // Filter inspection/diag work orders (only scheduled and in progress, not completed)
      const inspectionStatuses = [
        'Inspection/Diag Scheduled', 
        'Inspection In Progress'
      ];
      const inspectionWOs = workOrders.filter(wo => inspectionStatuses.includes(wo.status));
      
      // Filter repair work orders
      const repairStatuses = [
        'Parts Received', 
        'Repair Scheduled',
        'Repair In Progress'
      ];
      const repairWOs = workOrders.filter(wo => repairStatuses.includes(wo.status));
      
      setInspectionWorkOrders(inspectionWOs);
      setRepairWorkOrders(repairWOs);
    } catch (err) {
      console.error('Error fetching work orders:', err);
      setError('Failed to load assigned work orders');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Inspection/Diag Scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'Inspection In Progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'Inspection/Diag Complete':
        return 'bg-purple-100 text-purple-800';
      case 'Parts Received':
        return 'bg-green-100 text-green-800';
      case 'Repair Scheduled':
        return 'bg-indigo-100 text-indigo-800';
      case 'Repair In Progress':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High':
        return 'text-red-600';
      case 'Medium':
        return 'text-yellow-600';
      case 'Low':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const handleWorkOrderClick = async (workOrderId, currentStatus) => {
    try {
      // Update status to "in progress" when technician starts work
      let newStatus = null;
      if (currentStatus === 'Inspection/Diag Scheduled') {
        newStatus = 'Inspection In Progress';
      } else if (currentStatus === 'Repair Scheduled') {
        newStatus = 'Repair In Progress';
      } else if (currentStatus === 'Parts Received') {
        newStatus = 'Repair In Progress';
      }
      
      if (newStatus) {
        await WorkOrderService.updateStatus(workOrderId, newStatus);
      }
      
      // Navigate to checklist (which may redirect to work order detail if already completed)
      navigate(`/technician-portal/checklist/${workOrderId}`);
    } catch (err) {
      console.error('Error starting work on order:', err);
      // Still navigate even if status update fails
      navigate(`/technician-portal/checklist/${workOrderId}`);
    }
  };

  const renderWorkOrderCard = (workOrder) => (
    <div 
      key={workOrder._id}
      className="border border-gray-200 rounded p-2 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => handleWorkOrderClick(workOrder._id, workOrder.status)}
    >
      {/* First Row */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <span className="font-semibold text-gray-900 truncate">
            #{workOrder._id.slice(-6)}
          </span>
          <span className="text-gray-700 truncate flex-1">
            {workOrder.customer?.name || 'Unknown'}
          </span>
          <span className="text-gray-600 hidden sm:inline truncate">
            {workOrder.vehicle ? 
              `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}` : 
              'No Vehicle'
            }
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(workOrder.status)}`}>
            {workOrder.status.replace('Inspection/Diag', 'Insp.')}
          </span>
          <Button
            variant="primary"
            size="sm"
            className="px-2 py-1 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              handleWorkOrderClick(workOrder._id, workOrder.status);
            }}
          >
            Start
          </Button>
        </div>
      </div>
      
      {/* Second Row */}
      <div className="flex items-center justify-between text-xs text-gray-600 mt-1">
        <div className="flex items-center space-x-3">
          <span>
            <i className="fas fa-calendar mr-1"></i>
            {new Date(workOrder.date).toLocaleDateString()}
          </span>
          <span className={`font-medium ${getPriorityColor(workOrder.priority)}`}>
            {workOrder.priority}
          </span>
          <span className="truncate max-w-xs">
            {workOrder.services && workOrder.services.length > 0 
              ? workOrder.services[0].description 
              : workOrder.serviceRequested || 'No Description'}
          </span>
        </div>
        <div className="flex space-x-2">
          <span>{workOrder.parts?.length || 0} parts</span>
          <span>{workOrder.labor?.length || 0} labor</span>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading work orders...</p>
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

  return (
    <div className="container mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">
          Technician Portal
        </h1>
        <div className="text-sm text-gray-600">
          Welcome, {user?.name || 'Technician'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* Summary Cards */}
        <Card title="Total Work Orders">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-600">
              {inspectionWorkOrders.length + repairWorkOrders.length}
            </div>
            <p className="text-gray-600">Total assigned</p>
          </div>
        </Card>

        <Card title="Inspections/Diagnostics">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {inspectionWorkOrders.length}
            </div>
            <p className="text-gray-600">Inspection work</p>
          </div>
        </Card>

        <Card title="Repairs">
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">
              {repairWorkOrders.length}
            </div>
            <p className="text-gray-600">Repair work</p>
          </div>
        </Card>
      </div>

      {/* Inspection/Diagnostics Section */}
      <Card title="Inspection & Diagnostics" className="mb-6">
        {inspectionWorkOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <i className="fas fa-search text-4xl mb-4"></i>
            <p>No inspection or diagnostic work orders</p>
            <p className="text-sm">Check back later for new assignments</p>
          </div>
        ) : (
          <div className="space-y-2">
            {inspectionWorkOrders.map(renderWorkOrderCard)}
          </div>
        )}
      </Card>

      {/* Repairs Section */}
      <Card title="Repairs">
        {repairWorkOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <i className="fas fa-tools text-4xl mb-4"></i>
            <p>No repair work orders</p>
            <p className="text-sm">Check back later for new assignments</p>
          </div>
        ) : (
          <div className="space-y-2">
            {repairWorkOrders.map(renderWorkOrderCard)}
          </div>
        )}
      </Card>
    </div>
  );
};

export default TechnicianPortal;