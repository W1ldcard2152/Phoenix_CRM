import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import WorkOrderService from '../../services/workOrderService';
import VehicleService from '../../services/vehicleService';
import workOrderNotesService from '../../services/workOrderNotesService';
import { getTodayForInput } from '../../utils/formatters';

const TechnicianChecklist = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Checklist state
  const [checklist, setChecklist] = useState({
    currentMileage: {
      completed: false,
      value: '',
      required: true
    }
  });

  // Vehicle inspection checklist
  const [vehicleInspection, setVehicleInspection] = useState({
    engineOil: { status: '', required: true },
    engineCoolant: { status: '', required: true },
    brakeFluidLevel: { status: '', required: true },
    frontBrakes: { status: '', required: true },
    rearBrakes: { status: '', required: true },
    frontTires: { status: '', depth: '', required: true },
    rearTires: { status: '', depth: '', required: true }
  });

  useEffect(() => {
    fetchWorkOrder();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchWorkOrder = async () => {
    try {
      setLoading(true);
      const response = await WorkOrderService.getWorkOrder(id);
      const fetchedWorkOrder = response.data.workOrder;
      setWorkOrder(fetchedWorkOrder);
      
      // Check if checklist has already been completed for this work order
      try {
        const notesResponse = await workOrderNotesService.getNotes(id);
        const notes = notesResponse?.data?.notes || [];
        
        // Look for a vehicle inspection checklist note
        const hasInspectionChecklist = notes.some(note => 
          note.content && note.content.includes('Vehicle Inspection Checklist:')
        );
        
        if (hasInspectionChecklist) {
          // Checklist already completed, redirect to work order detail
          console.log('Checklist already completed for this work order, redirecting...');
          navigate(`/technician-portal/work-orders/${id}`);
          return;
        }
      } catch (notesErr) {
        console.warn('Could not check for existing checklist, proceeding with checklist:', notesErr);
      }
      
      // Pre-populate current mileage if available
      if (fetchedWorkOrder.vehicle?.currentMileage) {
        setChecklist(prev => ({
          ...prev,
          currentMileage: {
            ...prev.currentMileage,
            value: fetchedWorkOrder.vehicle.currentMileage.toString()
          }
        }));
      }
    } catch (err) {
      console.error('Error fetching work order:', err);
      setError('Failed to load work order details. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleChecklistChange = (item, field, value) => {
    setChecklist(prev => ({
      ...prev,
      [item]: {
        ...prev[item],
        [field]: value,
        // Auto-complete if value is entered and it's not the note field
        completed: field === 'value' ? !!value.trim() : 
                  field === 'note' ? prev[item].completed :
                  field === 'completed' ? value : prev[item].completed
      }
    }));
  };


  // Function to correlate tire depth with condition
  const getTireConditionFromDepth = (depth) => {
    const numericDepth = parseFloat(depth);
    if (isNaN(numericDepth) || numericDepth < 0) return '';
    
    if (numericDepth <= 3) {
      return 'Replace ASAP';
    } else if (numericDepth < 6) {
      return 'Replace Soon';
    } else {
      return 'Good Condition';
    }
  };

  const handleVehicleInspectionChange = (item, field, value) => {
    setVehicleInspection(prev => {
      const updatedItem = { ...prev[item], [field]: value };
      
      // If it's a tire and we're updating the depth, auto-set the condition
      if ((item === 'frontTires' || item === 'rearTires') && field === 'depth') {
        const autoCondition = getTireConditionFromDepth(value);
        if (autoCondition) {
          updatedItem.status = autoCondition;
        }
      }
      
      return {
        ...prev,
        [item]: updatedItem
      };
    });
  };

  const isChecklistComplete = () => {
    // Check if mileage has a value (since we removed the checkbox)
    const mileageComplete = checklist.currentMileage.value && checklist.currentMileage.value.trim();
    
    const vehicleInspectionComplete = Object.entries(vehicleInspection).every(([key, item]) => {
      if (!item.required) return true;
      if (item.status === '') return false;
      // For tires, also require depth measurement
      if ((key === 'frontTires' || key === 'rearTires') && item.depth === '') return false;
      return true;
    });

    return mileageComplete && vehicleInspectionComplete;
  };

  const handleSubmitChecklist = async () => {
    if (!isChecklistComplete()) {
      alert('Please complete all required checklist items before proceeding.');
      return;
    }

    try {
      setSubmitting(true);

      // 1. Update vehicle mileage if provided
      if (checklist.currentMileage.value && checklist.currentMileage.value.trim()) {
        await VehicleService.addMileageRecord(workOrder.vehicle._id, {
          date: getTodayForInput(),
          mileage: parseInt(checklist.currentMileage.value),
          notes: `Recorded from Work Order #${workOrder._id.slice(-6)} Pre-Work Checklist`
        });
      }

      // 2. Add vehicle inspection checklist as a note
      const inspectionItems = [];
      Object.entries(vehicleInspection).forEach(([key, item]) => {
        if (item.status) {
          const itemName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          let itemText = `${itemName}: ${item.status}`;
          
          // Add depth measurement for tires
          if ((key === 'frontTires' || key === 'rearTires') && item.depth) {
            itemText += ` (Depth: ${item.depth}/32")`;
          }
          
          inspectionItems.push(itemText);
        }
      });

      if (inspectionItems.length > 0) {
        const inspectionNote = `Vehicle Inspection Checklist:\n\n${inspectionItems.join('\n')}`;
        await workOrderNotesService.createNote(id, {
          content: inspectionNote,
          isCustomerFacing: true // Customer-facing note
        });
      }

      // 3. Navigate to work order detail
      navigate(`/technician-portal/work-orders/${id}`);
    } catch (err) {
      console.error('Error submitting checklist:', err);
      setError('Failed to submit checklist. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading work order...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <Button onClick={() => navigate('/technician-portal')} variant="outline">
          Back to Portal
        </Button>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="container mx-auto">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          Work order not found.
        </div>
        <Button onClick={() => navigate('/technician-portal')} variant="outline">
          Back to Portal
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <Button
          onClick={() => navigate('/technician-portal')}
          variant="outline"
          size="sm"
          className="mb-2"
        >
          <i className="fas fa-arrow-left mr-2"></i>
          Back to Portal
        </Button>
        <h1 className="text-2xl font-bold text-gray-800">
          Pre-Work Checklist
        </h1>
        <p className="text-gray-600 mt-1">
          Complete all required items before starting work on this order
        </p>
      </div>

      {/* Work Order Summary */}
      <Card title="Work Order Summary" className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Service</p>
            <p className="font-medium">
              {workOrder.services && workOrder.services.length > 0 
                ? workOrder.services[0].description 
                : workOrder.serviceRequested || 'No Description'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Customer</p>
            <p className="font-medium">{workOrder.customer?.name || 'Unknown Customer'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Vehicle</p>
            <p className="font-medium">
              {workOrder.vehicle ? 
                `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}` : 
                'No Vehicle Assigned'
              }
            </p>
            {workOrder.vehicle?.licensePlate && (
              <p className="text-sm text-gray-600">License: {workOrder.vehicle.licensePlate}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500">Work Order #</p>
            <p className="font-medium">#{workOrder._id.slice(-6)}</p>
          </div>
        </div>
      </Card>

      {/* Checklist Items */}
      <Card title="Required Checklist Items">
        <div className="space-y-6">
          {/* Current Mileage */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Current Mileage <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="number"
                  placeholder="Enter current mileage"
                  value={checklist.currentMileage.value}
                  onChange={(e) => handleChecklistChange('currentMileage', 'value', e.target.value)}
                  className="w-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  min="0"
                />
                <span className="text-sm text-gray-500">miles</span>
                {workOrder.vehicle?.currentMileage && (
                  <span className="text-sm text-gray-500">
                    (Last recorded: {workOrder.vehicle.currentMileage.toLocaleString()} miles)
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Record the current odometer reading to track vehicle usage
              </p>
            </div>
          </div>

        </div>
      </Card>

      {/* Vehicle Inspection Checklist */}
      <Card title="Vehicle Inspection Checklist" className="mb-6">
        <div className="space-y-4">
          {Object.entries(vehicleInspection).map(([key, item]) => {
            const displayName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            const isTire = key === 'frontTires' || key === 'rearTires';
            
            return (
              <div key={key} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      {displayName} <span className="text-red-500">*</span>
                    </h4>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => handleVehicleInspectionChange(key, 'status', 'Good Condition')}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        item.status === 'Good Condition'
                          ? 'bg-green-600 text-white shadow-md'
                          : 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-300'
                      }`}
                    >
                      Good Condition
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVehicleInspectionChange(key, 'status', 'Replace Soon')}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        item.status === 'Replace Soon'
                          ? 'bg-yellow-600 text-white shadow-md'
                          : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border border-yellow-300'
                      }`}
                    >
                      Replace Soon
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVehicleInspectionChange(key, 'status', 'Replace ASAP')}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        item.status === 'Replace ASAP'
                          ? 'bg-red-600 text-white shadow-md'
                          : 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-300'
                      }`}
                    >
                      Replace ASAP
                    </button>
                  </div>
                </div>
                
                {/* Tire depth input for tires */}
                {isTire && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tread Depth <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        placeholder="Enter depth"
                        value={item.depth}
                        onChange={(e) => handleVehicleInspectionChange(key, 'depth', e.target.value)}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        min="0"
                        max="32"
                        step="0.5"
                      />
                      <span className="text-sm text-gray-500">/32"</span>
                      <span className="text-xs text-gray-400">
                        (0-3/32": Replace ASAP, 4-5/32": Replace Soon, 6+/32": Good Condition)
                      </span>
                    </div>
                  </div>
                )}
                
                {item.status && (
                  <div className="mt-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      item.status === 'Good Condition' ? 'bg-green-100 text-green-800' :
                      item.status === 'Replace Soon' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      Status: {item.status}
                      {isTire && item.depth && ` - Depth: ${item.depth}/32"`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress Summary */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <div>
                Current Mileage: {Object.values(checklist).filter(item => item.completed).length} of {Object.values(checklist).filter(item => item.required).length} completed
              </div>
              <div>
                Vehicle Inspection: {Object.values(vehicleInspection).filter(item => item.status !== '').length} of {Object.values(vehicleInspection).filter(item => item.required).length} completed
              </div>
            </div>
            <div className="flex space-x-3">
              <Button
                onClick={() => navigate('/technician-portal')}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitChecklist}
                disabled={!isChecklistComplete() || submitting}
                variant="primary"
              >
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Processing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-check mr-2"></i>
                    Complete Checklist & Continue
                  </>
                )}
              </Button>
            </div>
          </div>
          {!isChecklistComplete() && (
            <p className="text-sm text-amber-600 mt-2">
              <i className="fas fa-exclamation-triangle mr-1"></i>
              Please complete all required items before proceeding
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};

export default TechnicianChecklist;