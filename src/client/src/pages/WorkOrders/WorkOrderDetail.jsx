import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SelectInput from '../../components/common/SelectInput';
import TextArea from '../../components/common/TextArea';
import WorkOrderService from '../../services/workOrderService';
import workOrderNotesService from '../../services/workOrderNotesService';
import MediaService from '../../services/mediaService';
import PartsSelector from '../../components/parts/PartsSelector';
import SplitWorkOrderModal from '../../components/workorder/SplitWorkOrderModal';
import FileUpload from '../../components/common/FileUpload';
import FileList from '../../components/common/FileList';
// technicianService import removed as it's no longer needed for a dropdown

const WorkOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [partsSelectorOpen, setPartsSelectorOpen] = useState(false);
  const [laborModalOpen, setLaborModalOpen] = useState(false);
  const [diagnosticNotesModalOpen, setDiagnosticNotesModalOpen] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  
  // Work Order Notes state
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesFilter, setNotesFilter] = useState('all'); // 'all', 'customer', 'private'
  const [newNote, setNewNote] = useState({ content: '', isCustomerFacing: false });
  const [addingNote, setAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  
  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  
  const [editingPart, setEditingPart] = useState(null);
  const [editingLabor, setEditingLabor] = useState(null);
  const [editingDiagnosticNotes, setEditingDiagnosticNotes] = useState('');
  const [newPart, setNewPart] = useState({
    name: '',
    partNumber: '',
    quantity: 1,
    price: 0,
    ordered: false,
    received: false,
    vendor: '',
    purchaseOrderNumber: ''
  });
  const [newLabor, setNewLabor] = useState({
    description: '',
    hours: 1,
    rate: 75
  });

  useEffect(() => {
    const fetchWorkOrderData = async () => { // Renamed function
      try {
        setLoading(true);
        const workOrderResponse = await WorkOrderService.getWorkOrder(id);
        const fetchedWorkOrder = workOrderResponse.data.workOrder;
        setWorkOrder(fetchedWorkOrder);
        // setSelectedTechnician, technicianService.getAllTechnicians, and setTechnicians calls removed.
        setLoading(false);
      } catch (err) {
        console.error('Error fetching work order details:', err); // Updated error message
        setError('Failed to load work order details. Please try again later.');
        setLoading(false);
      }
    };

    fetchWorkOrderData(); // Call renamed function
  }, [id]);

  const fetchNotes = useCallback(async () => {
    try {
      setNotesLoading(true);
      const response = await workOrderNotesService.getNotes(id);
      
      if (response && response.data && response.data.notes) {
        setNotes(response.data.notes);
      } else {
        console.warn('No notes found in response:', response);
        setNotes([]);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
      setError('Failed to load notes');
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, [id]);

  // Fetch work order notes and files
  useEffect(() => {
    if (workOrder) {
      fetchNotes();
      fetchAttachedFiles();
    }
  }, [workOrder, fetchNotes]);

  const fetchAttachedFiles = useCallback(async () => {
    try {
      setFilesLoading(true);
      const response = await MediaService.getAllMedia({ workOrder: id });
      
      if (response && response.data && response.data.media) {
        setAttachedFiles(response.data.media);
      } else {
        setAttachedFiles([]);
      }
    } catch (err) {
      console.error('Error fetching attached files:', err);
      setAttachedFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, [id]);

  // Work Order Notes handlers
  const handleAddNote = async () => {
    if (!newNote.content.trim()) return;
    
    try {
      setAddingNote(true);
      await workOrderNotesService.createNote(id, newNote);
      setNewNote({ content: '', isCustomerFacing: false });
      await fetchNotes(); // Refresh notes list
    } catch (err) {
      console.error('Error adding note:', err);
      setError('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const handleUpdateNote = async (noteId, updateData) => {
    try {
      await workOrderNotesService.updateNote(id, noteId, updateData);
      await fetchNotes(); // Refresh notes list
      setEditingNote(null);
    } catch (err) {
      console.error('Error updating note:', err);
      setError('Failed to update note');
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    
    try {
      await workOrderNotesService.deleteNote(id, noteId);
      await fetchNotes(); // Refresh notes list
    } catch (err) {
      console.error('Error deleting note:', err);
      setError('Failed to delete note');
    }
  };

  const getFilteredNotes = () => {
    switch (notesFilter) {
      case 'customer':
        return notes.filter(note => note.isCustomerFacing);
      case 'private':
        return notes.filter(note => !note.isCustomerFacing);
      default:
        return notes;
    }
  };

  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    if (!newStatus || newStatus === workOrder.status) return;

    try {
      setStatusUpdateLoading(true);
      const response = await WorkOrderService.updateStatus(id, newStatus); 
      setWorkOrder(response.data.workOrder);
      
      // Show notification if status changed to "Parts Received"
      if (newStatus === 'Parts Received') {
        const customerName = workOrder.customer?.name || 'Customer';
        const phoneNumber = workOrder.customer?.phone;
        let message = `Parts received for ${customerName}! Schedule the work order for completion.`;
        
        if (phoneNumber) {
          message += ` Customer phone: ${phoneNumber}`;
        }
        
        // Show browser notification if permission is granted
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('Parts Received - Schedule Work Order', {
            body: message,
            icon: '/favicon.ico'
          });
        } else if (window.Notification && Notification.permission !== 'denied') {
          // Request permission for future notifications
          Notification.requestPermission();
        }
        
        // Show alert as backup
        alert(`🔔 NOTIFICATION: ${message}`);
      }
      
      setStatusUpdateLoading(false);
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update status. Please try again later.');
      setStatusUpdateLoading(false);
    }
  };

  // handleTechnicianChange function removed as technician is view-only here.

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

  const openAddPartModal = () => {
    setEditingPart(null);
    setNewPart({
      name: '',
      partNumber: '',
      quantity: 1,
      price: 0,
      ordered: false,
      received: false,
      vendor: '',
      purchaseOrderNumber: ''
    });
    setPartModalOpen(true);
  };

  const handlePartFromInventory = (selectedPart) => {
    setNewPart(selectedPart);
    setPartModalOpen(true);
  };

  const openEditPartModal = (part, index) => {
    setEditingPart({ ...part, index });
    setNewPart({
      name: part.name || '',
      partNumber: part.partNumber || '',
      quantity: part.quantity || 1,
      price: part.price || 0,
      ordered: part.ordered || false,
      received: part.received || false,
      vendor: part.vendor || '',
      purchaseOrderNumber: part.purchaseOrderNumber || ''
    });
    setPartModalOpen(true);
  };

  const openEditDiagnosticNotesModal = () => {
    setEditingDiagnosticNotes(workOrder.diagnosticNotes || '');
    setDiagnosticNotesModalOpen(true);
  };

  const handleUpdateDiagnosticNotes = async () => {
    try {
      const response = await WorkOrderService.updateWorkOrder(id, {
        ...workOrder,
        diagnosticNotes: editingDiagnosticNotes
      });
      setWorkOrder(response.data.workOrder);
      setDiagnosticNotesModalOpen(false);
    } catch (err) {
      console.error('Error updating diagnostic notes:', err);
      setError('Failed to update diagnostic notes. Please try again later.');
    }
  };

  const openAddLaborModal = () => {
    setEditingLabor(null);
    setNewLabor({
      description: '',
      hours: 1,
      rate: 75
    });
    setLaborModalOpen(true);
  };

  const openEditLaborModal = (labor, index) => {
    setEditingLabor({ ...labor, index });
    setNewLabor({
      description: labor.description || '',
      hours: labor.hours || 1,
      rate: labor.rate || 75
    });
    setLaborModalOpen(true);
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
        received: false,
        vendor: '',
        purchaseOrderNumber: ''
      });
    } catch (err) {
      console.error('Error adding part:', err);
      setError('Failed to add part. Please try again later.');
    }
  };

  const handleEditPart = async () => {
    try {
      // Create an updated work order with the edited part
      const updatedWorkOrder = { ...workOrder };
      const updatedParts = [...updatedWorkOrder.parts];
      updatedParts[editingPart.index] = {
        ...updatedParts[editingPart.index],
        ...newPart
      };
      updatedWorkOrder.parts = updatedParts;

      // Send the entire updated work order to the server
      const response = await WorkOrderService.updateWorkOrder(id, updatedWorkOrder);
      setWorkOrder(response.data.workOrder);
      setPartModalOpen(false);
      setEditingPart(null);
      setNewPart({
        name: '',
        partNumber: '',
        quantity: 1,
        price: 0,
        ordered: false,
        received: false,
        vendor: '',
        purchaseOrderNumber: ''
      });
    } catch (err) {
      console.error('Error updating part:', err);
      setError('Failed to update part. Please try again later.');
    }
  };

  const handleRemovePart = async (index) => {
    try {
      const updatedWorkOrder = { ...workOrder };
      updatedWorkOrder.parts = workOrder.parts.filter((_, idx) => idx !== index);
      
      const response = await WorkOrderService.updateWorkOrder(id, updatedWorkOrder);
      setWorkOrder(response.data.workOrder);
    } catch (err) {
      console.error('Error removing part:', err);
      setError('Failed to remove part. Please try again later.');
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

  const handleEditLabor = async () => {
    try {
      // Create an updated work order with the edited labor
      const updatedWorkOrder = { ...workOrder };
      const updatedLabor = [...updatedWorkOrder.labor];
      updatedLabor[editingLabor.index] = {
        ...updatedLabor[editingLabor.index],
        ...newLabor
      };
      updatedWorkOrder.labor = updatedLabor;

      // Send the entire updated work order to the server
      const response = await WorkOrderService.updateWorkOrder(id, updatedWorkOrder);
      setWorkOrder(response.data.workOrder);
      setLaborModalOpen(false);
      setEditingLabor(null);
      setNewLabor({
        description: '',
        hours: 1,
        rate: 75
      });
    } catch (err) {
      console.error('Error updating labor:', err);
      setError('Failed to update labor. Please try again later.');
    }
  };

  const handleRemoveLabor = async (index) => {
    try {
      const updatedWorkOrder = { ...workOrder };
      updatedWorkOrder.labor = workOrder.labor.filter((_, idx) => idx !== index);
      
      const response = await WorkOrderService.updateWorkOrder(id, updatedWorkOrder);
      setWorkOrder(response.data.workOrder);
    } catch (err) {
      console.error('Error removing labor:', err);
      setError('Failed to remove labor. Please try again later.');
    }
  };

  const handlePartStatusChange = async (partIndex, field, value) => {
    try {
      const updatedWorkOrder = { ...workOrder };
      const updatedParts = [...updatedWorkOrder.parts];
      
      // Update the specific field
      updatedParts[partIndex] = {
        ...updatedParts[partIndex],
        [field]: value
      };

      // If unchecking "ordered", also uncheck "received"
      if (field === 'ordered' && !value) {
        updatedParts[partIndex].received = false;
      }

      updatedWorkOrder.parts = updatedParts;

      const response = await WorkOrderService.updateWorkOrder(id, updatedWorkOrder);
      setWorkOrder(response.data.workOrder);
    } catch (err) {
      console.error('Error updating part status:', err);
      setError('Failed to update part status. Please try again later.');
    }
  };

  // File handling functions
  const handleFileUpload = async (formData) => {
    try {
      await MediaService.uploadMedia(formData);
      await fetchAttachedFiles(); // Refresh the file list
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  };

  const handleFileDelete = async (fileId) => {
    try {
      await MediaService.deleteMedia(fileId);
      await fetchAttachedFiles(); // Refresh the file list
    } catch (error) {
      console.error('File deletion failed:', error);
      setError('Failed to delete file. Please try again.');
    }
  };

  const handleFileShare = async (fileId, email) => {
    try {
      await MediaService.shareMediaViaEmail(fileId, email);
      await fetchAttachedFiles(); // Refresh the file list to show shared status
    } catch (error) {
      console.error('File sharing failed:', error);
      throw error;
    }
  };

  const generateInvoice = () => {
    // Navigate to the invoice generator with this work order ID as a search param
    navigate(`/invoices/generate?workOrder=${id}`);
  };

  const handleSplitWorkOrder = async (splitData) => {
    try {
      const response = await WorkOrderService.splitWorkOrder(id, splitData);
      
      // Update the current work order with the modified data
      setWorkOrder(response.data.originalWorkOrder);
      
      // Show success message and navigate to the new work order
      alert(`Work order split successfully! New work order created: ${response.data.newWorkOrder._id.slice(-6)}`);
      
      // Optionally navigate to the new work order
      if (window.confirm('Would you like to view the new work order?')) {
        navigate(`/work-orders/${response.data.newWorkOrder._id}`);
      }
    } catch (err) {
      console.error('Error splitting work order:', err);
      setError('Failed to split work order. Please try again.');
    }
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
    { value: 'Inspection In Progress', label: 'Inspection In Progress' },
    { value: 'Inspected/Parts Ordered', label: 'Inspected/Parts Ordered' },
    { value: 'Parts Received', label: 'Parts Received' },
    { value: 'Repair In Progress', label: 'Repair In Progress' },
    { value: 'Completed - Awaiting Payment', label: 'Completed - Awaiting Payment' },
    { value: 'Invoiced', label: 'Invoiced' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  // technicianOptions constant removed.

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
  
  const subtotalWithoutTax = partsCost + laborCost;
  const taxRate = 0.08; // 8% tax
  const totalWithTax = subtotalWithoutTax * (1 + taxRate);

  // Determine if an appointment exists and get its ID for linking
  const appointmentExists = workOrder && workOrder.appointmentId;
  const appointmentIdToLink = appointmentExists 
    ? (typeof workOrder.appointmentId === 'string' ? workOrder.appointmentId : workOrder.appointmentId?._id) 
    : null;

  // Diagnostic logging
  if (workOrder) {
    console.log('WorkOrderDetail Debug:', {
      workOrderId: workOrder._id,
      appointmentIdRaw: workOrder.appointmentId,
      typeofAppointmentId: typeof workOrder.appointmentId,
      appointmentId_id: workOrder.appointmentId ? workOrder.appointmentId._id : 'N/A',
      appointmentExists,
      appointmentIdToLink
    });
  }

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
            variant="secondary"
            onClick={() => setSplitModalOpen(true)}
            disabled={(!workOrder.parts || workOrder.parts.length === 0) && (!workOrder.labor || workOrder.labor.length === 0)}
          >
            Split Work Order
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
              {workOrder.customer?._id ? (
                <Link
                  to={`/customers/${workOrder.customer._id}`}
                  className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
                >
                  {workOrder.customer.name}
                </Link>
              ) : (
                <p className="font-medium text-gray-400">Unknown Customer</p>
              )}
              {workOrder.customer?.phone && (
                <p className="text-sm text-gray-600">{workOrder.customer.phone}</p>
              )}
              {workOrder.customer?.email && (
                <p className="text-sm text-gray-600">{workOrder.customer.email}</p>
              )}
            </div>
            <div className="pt-2">
              <p className="text-sm text-gray-500">Vehicle</p>
              {workOrder.vehicle?._id ? (
                <Link
                  to={`/vehicles/${workOrder.vehicle._id}`}
                  className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
                >
                  {workOrder.vehicle.year} {workOrder.vehicle.make} {workOrder.vehicle.model}
                </Link>
              ) : (
                <p className="font-medium text-gray-400">No Vehicle Assigned</p>
              )}
              {workOrder.vehicle?.vin && (
                <p className="text-sm text-gray-600">VIN: {workOrder.vehicle.vin}</p>
              )}
              {workOrder.vehicle?.licensePlate && (
                <p className="text-sm text-gray-600">License: {workOrder.vehicle.licensePlate}</p>
              )}
            </div>
            <div className="pt-2">
              <p className="text-sm text-gray-500">Assigned Technician</p>
              <p className="font-medium mt-1 text-gray-700">
                {workOrder?.appointmentId?.technician?.name || workOrder?.assignedTechnician?.name || 'Unassigned'}
              </p>
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
            {/* Appointment Link Section */}
            <div className="pt-2">
              <p className="text-sm text-gray-500">Associated Appointment</p>
              {appointmentExists && appointmentIdToLink ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/appointments/${appointmentIdToLink}`)}
                  className="mt-1"
                >
                  View Appointment
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const targetUrl = `/appointments/new?workOrder=${workOrder._id}&vehicle=${workOrder.vehicle?._id}`;
                    console.log('Navigating to AppointmentForm with URL:', targetUrl);
                    navigate(targetUrl);
                  }}
                  className="mt-1"
                >
                  Schedule Work Order
                </Button>
              )}
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
              <div className="flex justify-between font-medium">
                <span>Parts:</span>
                <span>{formatCurrency(partsCost)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Labor:</span>
                <span>{formatCurrency(laborCost)}</span>
              </div>
              <div className="h-px bg-gray-200 my-2"></div>
              <div className="flex justify-between font-medium">
                <span>Subtotal:</span>
                <span>{formatCurrency(subtotalWithoutTax)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Tax ({taxRate * 100}%):</span>
                <span>{formatCurrency(subtotalWithoutTax * taxRate)}</span>
              </div>
            </div>
            <div className="flex justify-between font-medium">
              <span>Total:</span>
              <span>{formatCurrency(totalWithTax)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Work Order Notes Section */}
      <div className="space-y-6">
        <Card title="Work Order Notes">
          <div className="space-y-4">
            {/* Add New Note Form */}
            <div className="border-b border-gray-200 pb-4">
              <div className="space-y-3">
                <TextArea
                  label="Add New Note"
                  value={newNote.content}
                  onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                  placeholder="Enter your note here..."
                  rows={3}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newNote.isCustomerFacing}
                      onChange={(e) => setNewNote({ ...newNote, isCustomerFacing: e.target.checked })}
                      className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">Customer-facing (will appear on invoice)</span>
                  </label>
                  <Button
                    onClick={handleAddNote}
                    disabled={!newNote.content.trim() || addingNote}
                    variant="primary"
                    size="sm"
                  >
                    {addingNote ? 'Adding...' : 'Add Note'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Notes Filter */}
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">Filter:</span>
              <div className="flex space-x-2">
                <button
                  onClick={() => setNotesFilter('all')}
                  className={`px-3 py-1 text-xs rounded-full ${
                    notesFilter === 'all' 
                      ? 'bg-primary-100 text-primary-800' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All ({notes.length})
                </button>
                <button
                  onClick={() => setNotesFilter('customer')}
                  className={`px-3 py-1 text-xs rounded-full ${
                    notesFilter === 'customer' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Customer-facing ({notes.filter(n => n.isCustomerFacing).length})
                </button>
                <button
                  onClick={() => setNotesFilter('private')}
                  className={`px-3 py-1 text-xs rounded-full ${
                    notesFilter === 'private' 
                      ? 'bg-yellow-100 text-yellow-800' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Private ({notes.filter(n => !n.isCustomerFacing).length})
                </button>
              </div>
            </div>

            {/* Notes List */}
            <div className="space-y-3">
              {notesLoading ? (
                <div className="text-center py-4">Loading notes...</div>
              ) : getFilteredNotes().length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  {notesFilter === 'all' ? 'No notes added yet.' : `No ${notesFilter} notes found.`}
                </div>
              ) : (
                getFilteredNotes().map((note) => (
                  <div key={note._id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${
                            note.isCustomerFacing 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {note.isCustomerFacing ? (
                              <>👁️ Customer-facing</>
                            ) : (
                              <>🔒 Private</>
                            )}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(note.createdAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          {note.createdBy?.name && (
                            <span className="text-xs text-gray-500">
                              by {note.createdBy.name}
                            </span>
                          )}
                        </div>
                        {editingNote?._id === note._id ? (
                          <div className="space-y-2">
                            <TextArea
                              value={editingNote.content}
                              onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                              rows={3}
                            />
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={editingNote.isCustomerFacing}
                                  onChange={(e) => setEditingNote({ ...editingNote, isCustomerFacing: e.target.checked })}
                                  className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                />
                                <span className="text-sm text-gray-700">Customer-facing</span>
                              </label>
                              <div className="flex space-x-2">
                                <Button
                                  onClick={() => handleUpdateNote(note._id, { content: editingNote.content, isCustomerFacing: editingNote.isCustomerFacing })}
                                  variant="primary"
                                  size="sm"
                                >
                                  Save
                                </Button>
                                <Button
                                  onClick={() => setEditingNote(null)}
                                  variant="outline"
                                  size="sm"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-700" style={{ whiteSpace: 'pre-line' }}>
                            {note.content}
                          </div>
                        )}
                      </div>
                      {editingNote?._id !== note._id && (
                        <div className="flex space-x-1 ml-4">
                          <Button
                            onClick={() => setEditingNote(note)}
                            variant="outline"
                            size="sm"
                          >
                            Edit
                          </Button>
                          <Button
                            onClick={() => handleDeleteNote(note._id)}
                            variant="danger"
                            size="sm"
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        <Card 
          title="Parts" 
          headerActions={
            <div className="flex space-x-2">
              <Button
                onClick={() => setPartsSelectorOpen(true)}
                variant="primary"
                size="sm"
              >
                Select from Inventory
              </Button>
              <Button
                onClick={openAddPartModal}
                variant="outline"
                size="sm"
              >
                Add Custom Part
              </Button>
            </div>
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
                      Vendor
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      PO/Order #
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
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
                            PN: {part.partNumber}
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
                        <div className="text-sm text-gray-900">
                          {part.vendor}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {part.purchaseOrderNumber}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex flex-col space-y-2">
                          <label className="flex items-center text-sm">
                            <input
                              type="checkbox"
                              checked={part.ordered || false}
                              onChange={(e) => handlePartStatusChange(index, 'ordered', e.target.checked)}
                              className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                            />
                            <span className={part.ordered ? 'text-yellow-600' : 'text-gray-500'}>
                              Ordered
                            </span>
                          </label>
                          <label className="flex items-center text-sm">
                            <input
                              type="checkbox"
                              checked={part.received || false}
                              disabled={!part.ordered}
                              onChange={(e) => handlePartStatusChange(index, 'received', e.target.checked)}
                              className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <span className={part.received ? 'text-green-600' : (part.ordered ? 'text-gray-700' : 'text-gray-400')}>
                              Received
                            </span>
                          </label>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-right">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => openEditPartModal(part, index)}
                            className="text-blue-600 hover:text-blue-800 text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemovePart(index)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Remove
                          </button>
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
              onClick={openAddLaborModal}
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
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
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
                      <td className="px-4 py-2 whitespace-nowrap text-right">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => openEditLaborModal(labor, index)}
                            className="text-blue-600 hover:text-blue-800 text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemoveLabor(index)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* File Attachments Section */}
        <Card title="Attached Documents">
          <div className="space-y-6">
            {/* Upload Section */}
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-4">Upload New Document</h4>
              <FileUpload
                onFileUpload={handleFileUpload}
                workOrderId={workOrder._id}
                vehicleId={workOrder.vehicle?._id}
                customerId={workOrder.customer?._id}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.txt,.doc,.docx,.xls,.xlsx"
              />
            </div>
            
            {/* Files List */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-gray-900">
                  Documents ({attachedFiles.length})
                </h4>
                {attachedFiles.length > 0 && (
                  <Button
                    onClick={() => fetchAttachedFiles()}
                    variant="outline"
                    size="sm"
                  >
                    Refresh
                  </Button>
                )}
              </div>
              <FileList
                files={attachedFiles}
                onDelete={handleFileDelete}
                onShare={handleFileShare}
                loading={filesLoading}
              />
            </div>
          </div>
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

      {/* Part Modal (Add/Edit) */}
      {partModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingPart ? 'Edit Part' : 'Add Part'}
            </h3>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor / Purchase Location
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.vendor}
                  onChange={(e) => setNewPart({ ...newPart, vendor: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PO / Order Number
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.purchaseOrderNumber}
                  onChange={(e) => setNewPart({ ...newPart, purchaseOrderNumber: e.target.value })}
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
                    onChange={(e) => setNewPart({ 
                      ...newPart, 
                      ordered: e.target.checked,
                      // If ordered is unchecked, received should also be unchecked
                      received: e.target.checked ? newPart.received : false
                    })}
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
                onClick={() => {
                  setPartModalOpen(false);
                  setEditingPart(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={editingPart ? handleEditPart : handleAddPart}
                disabled={!newPart.name}
              >
                {editingPart ? 'Update Part' : 'Add Part'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Labor Modal (Add/Edit) */}
      {laborModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingLabor ? 'Edit Labor' : 'Add Labor'}
            </h3>
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
              <div className="border p-3 rounded bg-gray-50">
                <p className="text-sm text-gray-600 mb-1">Calculated Total:</p>
                <p className="font-medium">{formatCurrency((newLabor.hours || 0) * (newLabor.rate || 0))}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                variant="light"
                onClick={() => {
                  setLaborModalOpen(false);
                  setEditingLabor(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={editingLabor ? handleEditLabor : handleAddLabor}
                disabled={!newLabor.description || !newLabor.hours || newLabor.rate < 0}
              >
                {editingLabor ? 'Update Labor' : 'Add Labor'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostic Notes Modal (Edit) */}
      {diagnosticNotesModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Diagnostic Notes</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="diagnosticNotes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <TextArea
                  id="diagnosticNotes"
                  value={editingDiagnosticNotes}
                  onChange={(e) => setEditingDiagnosticNotes(e.target.value)}
                  rows="8"
                  placeholder="Enter diagnostic notes here..."
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                variant="light"
                onClick={() => setDiagnosticNotesModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleUpdateDiagnosticNotes}
              >
                Save Notes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Parts Selector Modal */}
      {partsSelectorOpen && (
        <PartsSelector
          onPartSelect={handlePartFromInventory}
          onClose={() => setPartsSelectorOpen(false)}
        />
      )}

      {/* Split Work Order Modal */}
      <SplitWorkOrderModal
        isOpen={splitModalOpen}
        onClose={() => setSplitModalOpen(false)}
        workOrder={workOrder}
        onSplit={handleSplitWorkOrder}
      />
    </div>
  );
};

export default WorkOrderDetail;
