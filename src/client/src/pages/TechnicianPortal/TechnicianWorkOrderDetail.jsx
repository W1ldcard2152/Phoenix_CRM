import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SelectInput from '../../components/common/SelectInput';
import TextArea from '../../components/common/TextArea';
import WorkOrderService from '../../services/workOrderService';
import workOrderNotesService from '../../services/workOrderNotesService';
import MediaService from '../../services/mediaService';
import FileUpload from '../../components/common/FileUpload';
import FileList from '../../components/common/FileList';

const TechnicianWorkOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [completingService, setCompletingService] = useState(false);
  
  // Work Order Notes state
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesFilter, setNotesFilter] = useState('all');
  const [newNote, setNewNote] = useState({ content: '', isCustomerFacing: false });
  const [addingNote, setAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  
  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);

  useEffect(() => {
    const fetchWorkOrderData = async () => {
      try {
        setLoading(true);
        const workOrderResponse = await WorkOrderService.getWorkOrder(id);
        const fetchedWorkOrder = workOrderResponse.data.workOrder;
        setWorkOrder(fetchedWorkOrder);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching work order details:', err);
        setError('Failed to load work order details. Please try again later.');
        setLoading(false);
      }
    };

    fetchWorkOrderData();
  }, [id]);

  const fetchNotes = useCallback(async () => {
    try {
      setNotesLoading(true);
      const response = await workOrderNotesService.getNotes(id);
      
      if (response && response.data && response.data.notes) {
        setNotes(response.data.notes);
      } else {
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

  // Fetch work order notes and files
  useEffect(() => {
    if (workOrder) {
      fetchNotes();
      fetchAttachedFiles();
    }
  }, [workOrder, fetchNotes]);

  // Work Order Notes handlers
  const handleAddNote = async () => {
    if (!newNote.content.trim()) return;
    
    try {
      setAddingNote(true);
      await workOrderNotesService.createNote(id, newNote);
      setNewNote({ content: '', isCustomerFacing: false });
      await fetchNotes();
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
      await fetchNotes();
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
      await fetchNotes();
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


  // File handling functions
  const handleFileUpload = async (formData) => {
    try {
      await MediaService.uploadMedia(formData);
      await fetchAttachedFiles();
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  };

  const handleFileDelete = async (fileId) => {
    try {
      await MediaService.deleteMedia(fileId);
      await fetchAttachedFiles();
    } catch (error) {
      console.error('File deletion failed:', error);
      setError('Failed to delete file. Please try again.');
    }
  };

  const handleFileShare = async (fileId, email) => {
    try {
      await MediaService.shareMediaViaEmail(fileId, email);
      await fetchAttachedFiles();
    } catch (error) {
      console.error('File sharing failed:', error);
      throw error;
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  // Get status color for display
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
      case 'Repair Complete - Awaiting Payment':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Check if service can be completed
  const canCompleteService = () => {
    if (!workOrder) return false;
    
    // Only allow completion for "in progress" statuses
    const completableStatuses = ['Inspection In Progress', 'Repair In Progress'];
    if (!completableStatuses.includes(workOrder.status)) return false;
    
    // For inspections, require at least one non-system note
    if (workOrder.status === 'Inspection In Progress') {
      const nonSystemNotes = notes.filter(note => 
        !note.content.includes('Vehicle Inspection Checklist:') && 
        note.createdBy !== 'System'
      );
      return nonSystemNotes.length > 0;
    }
    
    // For repairs, no additional requirements
    return true;
  };

  // Get the next status after completion
  const getNextStatus = (currentStatus) => {
    switch (currentStatus) {
      case 'Inspection In Progress':
        return 'Inspection/Diag Complete';
      case 'Repair In Progress':
        return 'Repair Complete - Awaiting Payment';
      default:
        return currentStatus;
    }
  };

  // Handle service completion
  const handleCompleteService = async () => {
    if (!canCompleteService()) {
      if (workOrder.status === 'Inspection In Progress') {
        alert('Please add at least one progress note before marking the inspection as complete.');
      }
      return;
    }

    const nextStatus = getNextStatus(workOrder.status);
    const confirmMessage = `Mark service as complete and change status to "${nextStatus}"?`;
    
    if (!window.confirm(confirmMessage)) return;

    try {
      setCompletingService(true);
      await WorkOrderService.updateStatus(id, nextStatus);
      // Navigate back to technician portal after successful completion
      navigate('/technician-portal');
    } catch (err) {
      console.error('Error completing service:', err);
      setError('Failed to complete service. Please try again.');
      setCompletingService(false);
    }
  };

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

  // Calculate totals
  const partsCost = workOrder.parts.reduce((total, part) => {
    return total + (part.price * part.quantity);
  }, 0);
  
  const laborCost = workOrder.labor.reduce((total, labor) => {
    return total + (labor.hours * labor.rate);
  }, 0);
  
  const subtotalWithoutTax = partsCost + laborCost;
  const taxRate = 0.08;
  const totalWithTax = subtotalWithoutTax * (1 + taxRate);

  return (
    <div className="container mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
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
            Work Order: {workOrder.services && workOrder.services.length > 0 
              ? workOrder.services[0].description 
              : workOrder.serviceRequested || 'No Description'}
          </h1>
        </div>
        <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
          Technician View
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card title="Customer & Vehicle">
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Customer</p>
              <p className="font-medium">{workOrder.customer?.name || 'Unknown Customer'}</p>
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
                {workOrder.vehicle ? 
                  `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}` : 
                  'No Vehicle Assigned'
                }
              </p>
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
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(workOrder.status)}`}>
                  {workOrder.status}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Totals">
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
        <Card title="Work Order Notes & Progress">
          <div className="space-y-4">
            {/* Add New Note Form */}
            <div className="border-b border-gray-200 pb-4">
              <div className="space-y-3">
                <TextArea
                  label="Add Diagnostic Note"
                  value={newNote.content}
                  onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                  placeholder="Document work progress, findings, or next steps..."
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
                    <span className="text-sm text-gray-700">Share with customer (will appear on invoice)</span>
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

        {/* Parts Section - Read Only */}
        <Card title="Parts">
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
                        <div className="space-y-1">
                          <div className={`text-xs px-2 py-1 rounded-full inline-block ${
                            part.ordered ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {part.ordered ? 'Ordered' : 'Not Ordered'}
                          </div>
                          {part.ordered && (
                            <div className={`text-xs px-2 py-1 rounded-full inline-block ${
                              part.received ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {part.received ? 'Received' : 'Pending'}
                            </div>
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

        {/* Labor Section - Read Only */}
        <Card title="Labor">
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

        {/* File Attachments Section */}
        <Card title="Work Progress Photos & Documents">
          <div className="space-y-6">
            {/* Upload Section */}
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-4">Upload Work Progress Photos</h4>
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
                  Attached Files ({attachedFiles.length})
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

        {/* Service Complete Button */}
        {(workOrder.status === 'Inspection In Progress' || workOrder.status === 'Repair In Progress') && (
          <Card title="Complete Service">
            <div className="space-y-4">
              {workOrder.status === 'Inspection In Progress' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-blue-800">
                        Inspection Requirements
                      </h4>
                      <p className="text-sm text-blue-700 mt-1">
                        Before completing the inspection, please add at least one progress note documenting your findings, 
                        recommendations, or diagnostic results.
                      </p>
                      {!canCompleteService() && (
                        <p className="text-sm text-red-600 mt-2 font-medium">
                          ⚠️ Missing required progress note
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    Ready to complete this {workOrder.status === 'Inspection In Progress' ? 'inspection' : 'repair'}?
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    This will advance the work order to the next stage: "{getNextStatus(workOrder.status)}"
                  </p>
                </div>
                <Button
                  onClick={handleCompleteService}
                  disabled={!canCompleteService() || completingService}
                  variant={canCompleteService() ? "primary" : "outline"}
                  size="lg"
                  className="ml-4"
                >
                  {completingService ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Completing...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle mr-2"></i>
                      Service Complete
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TechnicianWorkOrderDetail;