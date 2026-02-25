import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SelectInput from '../../components/common/SelectInput';
import TextArea from '../../components/common/TextArea';
import DocumentService from '../../services/documentService';
import WorkOrderService from '../../services/workOrderService';
import workOrderNotesService from '../../services/workOrderNotesService';
import MediaService from '../../services/mediaService';
import PartsSelector from '../../components/parts/PartsSelector';
import SplitWorkOrderModal from '../../components/workorder/SplitWorkOrderModal';
import OnHoldReasonModal from '../../components/workorder/OnHoldReasonModal';
import ConvertQuoteModal from '../../components/quotes/ConvertQuoteModal';
import FileUpload from '../../components/common/FileUpload';
import { formatDate, formatDateTime } from '../../utils/formatters';
import FileList from '../../components/common/FileList';
import ReceiptImportModal from '../../components/common/ReceiptImportModal';
import ChecklistViewModal from '../../components/workorder/ChecklistViewModal';
import invoiceService from '../../services/invoiceService';
import { formatCurrency } from '../../utils/formatters';
import { generatePdfFilename, generatePdfFromHtml, printHtml, generateDocumentHtml } from '../../utils/pdfUtils';
import { useAuth } from '../../contexts/AuthContext';
import { permissions, isOfficeStaff } from '../../utils/permissions';

const DocumentDetail = () => {
  const { currentUser } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isQuoteRoute = location.pathname.startsWith('/quotes');

  // Predefined vendors list
  const predefinedVendors = [
    'Walmart', 'Tractor Supply', 'Advance Auto Parts', 'Autozone',
    'Napa Auto Parts', 'Rock Auto', 'eBay.com', 'Amazon.com',
    'ECS Tuning', 'FCP Euro', 'Other'
  ];

  // Core state
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [partsSelectorOpen, setPartsSelectorOpen] = useState(false);
  const [laborModalOpen, setLaborModalOpen] = useState(false);
  const [diagnosticNotesModalOpen, setDiagnosticNotesModalOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // WO-specific state
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [onHoldModalOpen, setOnHoldModalOpen] = useState(false);
  const [generatingQuote, setGeneratingQuote] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');
  const [inspectionChecklistModalOpen, setInspectionChecklistModalOpen] = useState(false);
  const [repairChecklistModalOpen, setRepairChecklistModalOpen] = useState(false);
  const [linkedInvoice, setLinkedInvoice] = useState(null);

  // Customer Interactions state (WO only)
  const [interactionNotes, setInteractionNotes] = useState([]);
  const [interactionNotesLoading, setInteractionNotesLoading] = useState(false);
  const [newInteraction, setNewInteraction] = useState({ content: '' });
  const [addingInteraction, setAddingInteraction] = useState(false);
  const [editingInteraction, setEditingInteraction] = useState(null);

  // File attachment state (WO only)
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // Quote-specific state
  const [converting, setConverting] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // Receipt import state
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  // Notes state (shared)
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesFilter, setNotesFilter] = useState('all');
  const [newNote, setNewNote] = useState({ content: '', isCustomerFacing: false });
  const [addingNote, setAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState(null);

  // Parts/Labor editing state (shared)
  const [editingPart, setEditingPart] = useState(null);
  const [editingLabor, setEditingLabor] = useState(null);
  const [editingDiagnosticNotes, setEditingDiagnosticNotes] = useState('');
  const [newPart, setNewPart] = useState({
    name: '', partNumber: '', itemNumber: '', quantity: 1,
    price: 0, cost: 0, ordered: false, received: false,
    vendor: '', supplier: '', purchaseOrderNumber: '', receiptImageUrl: ''
  });
  const [isOtherVendor, setIsOtherVendor] = useState(false);
  const [bulkOrderModalOpen, setBulkOrderModalOpen] = useState(false);
  const [bulkOrderData, setBulkOrderData] = useState({ vendor: '', orderNumber: '' });
  const [newLabor, setNewLabor] = useState({
    description: '', billingType: 'hourly', quantity: 1, rate: 75
  });

  // Derived state
  const isQuote = workOrder?.status === 'Quote' || workOrder?.status === 'Quote - Archived';
  const isArchived = workOrder?.status === 'Quote - Archived';
  const basePath = isQuote ? '/quotes' : '/work-orders';
  const typeLabel = isQuote ? 'Quote' : 'Work Order';

  // ==================== Vendor Helpers ====================
  const handleVendorChange = (selectedVendor) => {
    if (selectedVendor === 'Other') {
      setIsOtherVendor(true);
      setNewPart({ ...newPart, vendor: '' });
    } else {
      setIsOtherVendor(false);
      setNewPart({ ...newPart, vendor: selectedVendor });
    }
  };

  const getUniqueVendors = () => {
    if (!workOrder?.parts) return [];
    const vendors = [...new Set(workOrder.parts.map(part => part.vendor).filter(vendor => vendor && vendor.trim() !== ''))];
    return vendors.sort();
  };

  // ==================== Parts Status Helper (WO only) ====================
  const checkAndUpdatePartsStatus = async (updatedWorkOrder) => {
    if (isQuote) return updatedWorkOrder; // Skip for quotes

    if (updatedWorkOrder.parts && updatedWorkOrder.parts.length > 0) {
      const preOrderStatuses = [
        'Work Order Created', 'Appointment Scheduled', 'Appointment Complete',
        'Inspection In Progress', 'Inspection/Diag Complete'
      ];
      const preReceivedStatuses = ['Parts Ordered', ...preOrderStatuses];

      const allPartsOrdered = updatedWorkOrder.parts.every(part => part.ordered === true);
      if (allPartsOrdered && preOrderStatuses.includes(updatedWorkOrder.status)) {
        updatedWorkOrder.status = 'Parts Ordered';
      }

      const allPartsReceived = updatedWorkOrder.parts.every(part => part.received === true);
      if (allPartsReceived && preReceivedStatuses.includes(updatedWorkOrder.status)) {
        updatedWorkOrder.status = 'Parts Received';
      }
    }
    return updatedWorkOrder;
  };

  // ==================== Data Fetching ====================
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await DocumentService.getDocument(id);
        const fetchedDoc = response.data.workOrder;
        setWorkOrder(fetchedDoc);

        // Fetch linked invoice (WO only - determined after we know the status)
        const docIsQuote = fetchedDoc.status === 'Quote' || fetchedDoc.status === 'Quote - Archived';
        if (!docIsQuote) {
          try {
            const invoiceResponse = await invoiceService.getAllInvoices({ workOrder: id });
            const invoices = invoiceResponse.data?.invoices || [];
            setLinkedInvoice(invoices.length > 0 ? invoices[0] : null);
          } catch (invoiceErr) {
            console.error('Error fetching linked invoice:', invoiceErr);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching document details:', err);
        setError('Failed to load details. Please try again later.');
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // ==================== Notes Fetching ====================
  const fetchNotes = useCallback(async () => {
    try {
      setNotesLoading(true);
      const response = await workOrderNotesService.getNotes(id);
      if (response && response.data && response.data.notes) {
        const regularNotes = response.data.notes.filter(note => note.noteType !== 'interaction');
        setNotes(regularNotes);
      } else {
        setNotes([]);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, [id]);

  const fetchInteractionNotes = useCallback(async () => {
    try {
      setInteractionNotesLoading(true);
      const response = await workOrderNotesService.getNotes(id, { noteType: 'interaction' });
      if (response && response.data && response.data.notes) {
        setInteractionNotes(response.data.notes);
      } else {
        setInteractionNotes([]);
      }
    } catch (err) {
      console.error('Error fetching interaction notes:', err);
      setInteractionNotes([]);
    } finally {
      setInteractionNotesLoading(false);
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

  useEffect(() => {
    if (workOrder) {
      fetchNotes();
      if (!isQuote) {
        fetchInteractionNotes();
        fetchAttachedFiles();
      }
    }
  }, [workOrder, fetchNotes, fetchInteractionNotes, fetchAttachedFiles, isQuote]);

  // ==================== Notes Handlers ====================
  const handleAddNote = async () => {
    if (!newNote.content.trim()) return;
    try {
      setAddingNote(true);
      const noteType = newNote.isCustomerFacing ? 'customer-facing' : 'internal';
      await workOrderNotesService.createNote(id, { ...newNote, noteType });
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
      case 'customer': return notes.filter(note => note.isCustomerFacing);
      case 'private': return notes.filter(note => !note.isCustomerFacing);
      default: return notes;
    }
  };

  // ==================== Customer Interaction Handlers (WO only) ====================
  const handleAddInteraction = async () => {
    if (!newInteraction.content.trim()) return;
    try {
      setAddingInteraction(true);
      const url = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/workorders/${id}/notes`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newInteraction.content, noteType: 'interaction', isCustomerFacing: false })
      });
      if (!response.ok) throw new Error('Failed to add interaction');
      setNewInteraction({ content: '' });
      await fetchInteractionNotes();
    } catch (err) {
      console.error('Error adding interaction:', err);
      setError('Failed to add interaction');
    } finally {
      setAddingInteraction(false);
    }
  };

  const handleUpdateInteraction = async (noteId, updateData) => {
    try {
      const url = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/workorders/${id}/notes/${noteId}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updateData, noteType: 'interaction' })
      });
      if (!response.ok) throw new Error('Failed to update interaction');
      await fetchInteractionNotes();
      setEditingInteraction(null);
    } catch (err) {
      console.error('Error updating interaction:', err);
      setError('Failed to update interaction');
    }
  };

  const handleDeleteInteraction = async (noteId) => {
    if (!window.confirm('Are you sure you want to delete this interaction note?')) return;
    try {
      const url = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/workorders/${id}/notes/${noteId}`;
      const response = await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) throw new Error('Failed to delete interaction');
      await fetchInteractionNotes();
    } catch (err) {
      console.error('Error deleting interaction:', err);
      setError('Failed to delete interaction');
    }
  };

  // ==================== Status Change Handler (WO only) ====================
  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    if (!newStatus || newStatus === workOrder.status) return;

    if (newStatus === 'On Hold') {
      setOnHoldModalOpen(true);
      e.target.value = workOrder.status;
      return;
    }

    if (newStatus === 'Parts Ordered') {
      const partsCount = workOrder.parts?.length || 0;
      if (partsCount > 0) {
        const unorderedParts = workOrder.parts.filter(part => !part.ordered);
        if (unorderedParts.length > 0) {
          let msg = `Changing status to "Parts Ordered" will automatically mark ALL ${partsCount} parts as ordered.\n\n`;
          msg += `This will mark ${unorderedParts.length} parts that are currently NOT marked as ordered:\n`;
          unorderedParts.slice(0, 3).forEach(part => { msg += `• ${part.name}\n`; });
          if (unorderedParts.length > 3) msg += `• ...and ${unorderedParts.length - 3} more\n`;
          msg += '\nAre you sure you want to proceed?';
          if (!window.confirm(msg)) { e.target.value = workOrder.status; return; }
        }
      }
    }

    if (newStatus === 'Parts Received') {
      const partsCount = workOrder.parts?.length || 0;
      if (partsCount > 0) {
        const unreceivedParts = workOrder.parts.filter(part => !part.received);
        let msg = `Changing status to "Parts Received" will automatically mark ALL ${partsCount} parts as received.\n\n`;
        if (unreceivedParts.length > 0) {
          msg += `This will mark ${unreceivedParts.length} parts that are currently NOT marked as received:\n`;
          unreceivedParts.slice(0, 3).forEach(part => { msg += `• ${part.name}\n`; });
          if (unreceivedParts.length > 3) msg += `• ...and ${unreceivedParts.length - 3} more\n`;
          msg += '\n';
        }
        msg += 'Are you sure all parts have been received and you want to proceed?';
        if (!window.confirm(msg)) { e.target.value = workOrder.status; return; }
      }
    }

    try {
      setStatusUpdateLoading(true);
      const response = await DocumentService.updateStatus(id, newStatus);
      setWorkOrder(response.data.workOrder);

      if (newStatus === 'Parts Received') {
        const customerName = workOrder.customer?.name || 'Customer';
        const phoneNumber = workOrder.customer?.phone;
        let message = `Parts received for ${customerName}! Schedule the work order for completion.`;
        if (phoneNumber) message += ` Customer phone: ${phoneNumber}`;
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('Parts Received - Schedule Work Order', { body: message, icon: '/favicon.ico' });
        } else if (window.Notification && Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
        alert(`NOTIFICATION: ${message}`);
      }
      setStatusUpdateLoading(false);
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update status. Please try again later.');
      setStatusUpdateLoading(false);
    }
  };

  const handleOnHoldConfirm = async ({ holdReason, holdReasonOther }) => {
    try {
      setStatusUpdateLoading(true);
      const response = await DocumentService.updateStatus(id, 'On Hold', { holdReason, holdReasonOther });
      setWorkOrder(response.data.workOrder);
      setOnHoldModalOpen(false);
      setStatusUpdateLoading(false);
    } catch (err) {
      console.error('Error placing on hold:', err);
      setError('Failed to update status. Please try again later.');
      setStatusUpdateLoading(false);
    }
  };

  // ==================== Quote-specific Handlers ====================
  const handleConvertToWorkOrder = async (data = {}) => {
    try {
      setConverting(true);
      const response = await DocumentService.convertToWorkOrder(id, data);

      if (response.data.quote) {
        setWorkOrder(response.data.quote);
        setSuccessMessage('Work order created successfully!');
        setConverting(false);
        setConvertModalOpen(false);
        if (response.data.quoteArchived) {
          navigate(`/work-orders/${response.data.workOrder._id}`);
        }
      } else {
        navigate(`/work-orders/${response.data.workOrder._id}`);
      }
    } catch (err) {
      console.error('Error converting quote:', err);
      setError('Failed to convert quote to work order.');
      setConverting(false);
    }
  };

  const handleArchiveQuote = async () => {
    if (!window.confirm('Archive this quote? It will be hidden from the active quotes list.')) return;
    try {
      setArchiving(true);
      await DocumentService.archiveQuote(id);
      navigate('/quotes');
    } catch (err) {
      console.error('Error archiving quote:', err);
      setError('Failed to archive quote.');
      setArchiving(false);
    }
  };

  const handleUnarchiveQuote = async () => {
    try {
      await DocumentService.unarchiveQuote(id);
      const response = await DocumentService.getDocument(id);
      setWorkOrder(response.data.workOrder);
    } catch (err) {
      console.error('Error unarchiving quote:', err);
      setError('Failed to unarchive quote.');
    }
  };

  // ==================== Generate Quote from WO ====================
  const handleGenerateQuote = async () => {
    if (!window.confirm('Generate a quote from this work order? All parts and labor will be copied to a new quote.')) return;
    try {
      setGeneratingQuote(true);
      const response = await DocumentService.generateFromWorkOrder(id);
      navigate(`/quotes/${response.data.quote._id}`);
    } catch (err) {
      console.error('Error generating quote:', err);
      setError('Failed to generate quote. Please try again.');
      setGeneratingQuote(false);
    }
  };

  // ==================== Delete Handler ====================
  const handleDelete = async () => {
    try {
      await DocumentService.deleteDocument(id);
      navigate(isQuote ? '/quotes' : '/work-orders');
    } catch (err) {
      console.error('Error deleting:', err);
      const errorMessage = err.response?.data?.message || `Failed to delete ${typeLabel.toLowerCase()}.`;
      setError(errorMessage);
      setDeleteModalOpen(false);
    }
  };

  // ==================== Parts Handlers ====================
  const openAddPartModal = () => {
    setEditingPart(null);
    setNewPart({
      name: '', partNumber: '', quantity: 1, cost: 0, price: 0,
      ordered: false, received: false, vendor: '', purchaseOrderNumber: ''
    });
    setPartModalOpen(true);
  };

  const handlePartFromInventory = (selectedPart) => {
    setNewPart(selectedPart);
    setPartModalOpen(true);
  };

  const openEditPartModal = (part, index) => {
    setEditingPart({ ...part, index });
    const vendor = part.vendor || '';
    const isCustomVendor = vendor && !predefinedVendors.slice(0, -1).includes(vendor);
    setNewPart({
      name: part.name || '', partNumber: part.partNumber || '',
      quantity: part.quantity || 1,
      cost: part.cost || (part.price ? parseFloat((part.price / 1.3).toFixed(2)) : 0),
      price: part.price || 0, ordered: part.ordered || false, received: part.received || false,
      vendor: vendor, purchaseOrderNumber: part.purchaseOrderNumber || ''
    });
    setIsOtherVendor(isCustomVendor);
    setPartModalOpen(true);
  };

  const handleAddPart = async () => {
    try {
      const response = await DocumentService.addPart(id, newPart);
      let updatedWorkOrder = response.data.workOrder;
      updatedWorkOrder = await checkAndUpdatePartsStatus(updatedWorkOrder);
      if (updatedWorkOrder.status !== response.data.workOrder.status) {
        const statusResponse = await DocumentService.updateDocument(id, { status: updatedWorkOrder.status });
        setWorkOrder(statusResponse.data.workOrder);
      } else {
        setWorkOrder(updatedWorkOrder);
      }
      setPartModalOpen(false);
      setNewPart({ name: '', partNumber: '', quantity: 1, cost: 0, price: 0, ordered: false, received: false, vendor: '', purchaseOrderNumber: '' });
      setIsOtherVendor(false);
    } catch (err) {
      console.error('Error adding part:', err);
      setError('Failed to add part. Please try again later.');
    }
  };

  const handleEditPart = async () => {
    try {
      const updatedParts = [...workOrder.parts];
      updatedParts[editingPart.index] = { ...updatedParts[editingPart.index], ...newPart };
      const updateData = { parts: updatedParts, status: workOrder.status };
      await checkAndUpdatePartsStatus(updateData);
      const response = await DocumentService.updateDocument(id, updateData);
      setWorkOrder(response.data.workOrder);
      setPartModalOpen(false);
      setEditingPart(null);
      setNewPart({ name: '', partNumber: '', quantity: 1, cost: 0, price: 0, ordered: false, received: false, vendor: '', purchaseOrderNumber: '' });
      setIsOtherVendor(false);
    } catch (err) {
      console.error('Error updating part:', err);
      setError('Failed to update part. Please try again later.');
    }
  };

  const handleRemovePart = async (index) => {
    try {
      const updatedParts = workOrder.parts.filter((_, idx) => idx !== index);
      const response = await DocumentService.updateDocument(id, { parts: updatedParts });
      setWorkOrder(response.data.workOrder);
    } catch (err) {
      console.error('Error removing part:', err);
      setError('Failed to remove part. Please try again later.');
    }
  };

  const handlePartStatusChange = async (partIndex, field, value) => {
    try {
      const updatedParts = [...workOrder.parts];
      updatedParts[partIndex] = { ...updatedParts[partIndex], [field]: value };
      if (field === 'ordered' && !value) updatedParts[partIndex].received = false;
      const updateData = { parts: updatedParts, status: workOrder.status };
      await checkAndUpdatePartsStatus(updateData);
      const response = await DocumentService.updateDocument(id, updateData);
      setWorkOrder(response.data.workOrder);
    } catch (err) {
      console.error('Error updating part status:', err);
      setError('Failed to update part status. Please try again later.');
    }
  };

  const handleBulkOrderAssignment = async () => {
    if (!bulkOrderData.vendor || !bulkOrderData.orderNumber) {
      setError('Please select a vendor and enter an order number');
      return;
    }
    try {
      let updatedCount = 0;
      const updatedParts = workOrder.parts.map(part => {
        if (part.vendor === bulkOrderData.vendor) {
          updatedCount++;
          return { ...part, purchaseOrderNumber: bulkOrderData.orderNumber, ordered: true };
        }
        return part;
      });
      const updateData = { parts: updatedParts, status: workOrder.status };
      await checkAndUpdatePartsStatus(updateData);
      const response = await DocumentService.updateDocument(id, updateData);
      setWorkOrder(response.data.workOrder);
      setBulkOrderModalOpen(false);
      setBulkOrderData({ vendor: '', orderNumber: '' });
      setError(null);
      alert(`Successfully updated ${updatedCount} parts with order number ${bulkOrderData.orderNumber}`);
    } catch (err) {
      console.error('Error updating bulk order numbers:', err);
      setError('Failed to update order numbers. Please try again.');
    }
  };

  // ==================== Receipt Import Handler ====================
  const handleReceiptImportSuccess = (updatedWorkOrder, addedParts) => {
    setWorkOrder(updatedWorkOrder);
    fetchAttachedFiles();
    alert(`Successfully extracted and added ${addedParts.length} part(s)!`);
  };

  // ==================== Labor Handlers ====================
  const openAddLaborModal = () => {
    setEditingLabor(null);
    setNewLabor({ description: '', billingType: 'hourly', quantity: 1, rate: 75 });
    setLaborModalOpen(true);
  };

  const openEditLaborModal = (labor, index) => {
    setEditingLabor({ ...labor, index });
    setNewLabor({
      description: labor.description || '', billingType: labor.billingType || 'hourly',
      quantity: labor.quantity || labor.hours || 1, rate: labor.rate || 75
    });
    setLaborModalOpen(true);
  };

  const handleAddLabor = async () => {
    try {
      const response = await DocumentService.addLabor(id, newLabor);
      setWorkOrder(response.data.workOrder);
      setLaborModalOpen(false);
      setNewLabor({ description: '', billingType: 'hourly', quantity: 1, rate: 75 });
    } catch (err) {
      console.error('Error adding labor:', err);
      setError('Failed to add labor. Please try again later.');
    }
  };

  const handleEditLabor = async () => {
    try {
      const updatedLabor = [...workOrder.labor];
      updatedLabor[editingLabor.index] = { ...updatedLabor[editingLabor.index], ...newLabor };
      const response = await DocumentService.updateDocument(id, { labor: updatedLabor });
      setWorkOrder(response.data.workOrder);
      setLaborModalOpen(false);
      setEditingLabor(null);
      setNewLabor({ description: '', billingType: 'hourly', quantity: 1, rate: 75 });
    } catch (err) {
      console.error('Error updating labor:', err);
      setError('Failed to update labor. Please try again later.');
    }
  };

  const handleRemoveLabor = async (index) => {
    try {
      const updatedLabor = workOrder.labor.filter((_, idx) => idx !== index);
      const response = await DocumentService.updateDocument(id, { labor: updatedLabor });
      setWorkOrder(response.data.workOrder);
    } catch (err) {
      console.error('Error removing labor:', err);
      setError('Failed to remove labor. Please try again later.');
    }
  };

  // ==================== Diagnostic Notes ====================
  const openEditDiagnosticNotesModal = () => {
    setEditingDiagnosticNotes(workOrder.diagnosticNotes || '');
    setDiagnosticNotesModalOpen(true);
  };

  const handleUpdateDiagnosticNotes = async () => {
    try {
      const response = await DocumentService.updateDocument(id, { diagnosticNotes: editingDiagnosticNotes });
      setWorkOrder(response.data.workOrder);
      setDiagnosticNotesModalOpen(false);
    } catch (err) {
      console.error('Error updating diagnostic notes:', err);
      setError('Failed to update diagnostic notes.');
    }
  };

  // ==================== File Handlers (WO only) ====================
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

  const handleFileView = async (fileId, fileName) => {
    try {
      const response = await fetch(`/api/media/${fileId}/signed-url`);
      const data = await response.json();
      if (data.status === 'success') {
        setViewerUrl(data.data.signedUrl);
        setViewerTitle(fileName);
        setViewerModalOpen(true);
      } else {
        throw new Error('Failed to get file URL');
      }
    } catch (error) {
      console.error('View failed:', error);
      alert('Failed to view file. Please try again.');
    }
  };

  // ==================== Invoice & Split (WO only) ====================
  const generateInvoice = () => {
    if (linkedInvoice) {
      navigate(`/invoices/${linkedInvoice._id}`);
      return;
    }
    navigate(`/invoices/generate?workOrder=${id}`);
  };

  const handleSplitWorkOrder = async (splitData) => {
    try {
      const response = await WorkOrderService.splitWorkOrder(id, splitData);
      setWorkOrder(response.data.originalWorkOrder);
      alert(`Work order split successfully! New work order created: ${response.data.newWorkOrder._id.slice(-6)}`);
      if (window.confirm('Would you like to view the new work order?')) {
        navigate(`/work-orders/${response.data.newWorkOrder._id}`);
      }
    } catch (err) {
      console.error('Error splitting work order:', err);
      setError('Failed to split work order. Please try again.');
    }
  };

  // ==================== Print / PDF ====================
  const getDocumentData = () => ({
    documentNumber: workOrder._id?.slice(-6).toUpperCase(),
    documentDate: workOrder.createdAt,
    status: workOrder.status,
    customer: workOrder.customer,
    vehicle: workOrder.vehicle,
    vehicleMileage: workOrder.vehicleMileage,
    serviceRequested: workOrder.serviceRequested,
    diagnosticNotes: workOrder.diagnosticNotes,
    parts: workOrder.parts || [],
    labor: workOrder.labor || [],
    customerFacingNotes: notes.filter(n => n.isCustomerFacing)
  });

  const handlePrint = () => {
    if (!workOrder) return;
    const html = generateDocumentHtml(isQuote ? 'quote' : 'workorder', getDocumentData());
    printHtml(html);
  };

  const handleDownloadPDF = async () => {
    if (!workOrder) return;
    setGeneratingPDF(true);
    try {
      const html = generateDocumentHtml(isQuote ? 'quote' : 'workorder', getDocumentData());
      const filename = generatePdfFilename(workOrder.customer?.name, workOrder.vehicle?.make, workOrder.vehicle?.model);
      await generatePdfFromHtml(html, filename);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError(`Failed to generate PDF: ${err.message}`);
    } finally {
      setGeneratingPDF(false);
    }
  };

  // ==================== Status Options (WO only) ====================
  const statusOptions = [
    { value: 'Work Order Created', label: 'Work Order Created' },
    { value: 'Appointment Scheduled', label: 'Appointment Scheduled' },
    { value: 'Appointment Complete', label: 'Appointment Complete' },
    { value: 'Inspection In Progress', label: 'Inspection In Progress' },
    { value: 'Inspection/Diag Complete', label: 'Inspection/Diag Complete' },
    { value: 'Parts Ordered', label: 'Parts Ordered' },
    { value: 'Parts Received', label: 'Parts Received' },
    { value: 'Repair In Progress', label: 'Repair In Progress' },
    { value: 'Repair Complete - Awaiting Payment', label: 'Repair Complete - Awaiting Payment' },
    { value: 'Repair Complete - Invoiced', label: 'Repair Complete - Invoiced' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  // ==================== Loading / Error States ====================
  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading {isQuoteRoute ? 'quote' : 'work order'} data...</p>
      </div>
    );
  }

  if (error && !workOrder) {
    return (
      <div className="container mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="container mx-auto">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          {isQuoteRoute ? 'Quote' : 'Work order'} not found.
        </div>
      </div>
    );
  }

  // If viewing a quote route but the document has been converted to a WO
  if (isQuoteRoute && !isQuote) {
    return (
      <div className="container mx-auto">
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded flex items-center justify-between">
          <span>This quote has been converted to a work order.</span>
          <Button to={`/work-orders/${id}`} variant="primary" size="sm">
            View Work Order
          </Button>
        </div>
      </div>
    );
  }

  // If archived quote
  if (isArchived) {
    return (
      <div className="container mx-auto">
        <div className="bg-gray-100 border border-gray-400 text-gray-700 px-4 py-3 rounded flex items-center justify-between">
          <span><i className="fas fa-archive mr-2"></i>This quote has been archived.</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleUnarchiveQuote}>
              <i className="fas fa-undo mr-1"></i>Unarchive
            </Button>
            <Button to="/quotes" variant="light" size="sm">Back to Quotes</Button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== Calculate Totals ====================
  const partsCost = (workOrder.parts || []).reduce((total, part) => total + (part.price * part.quantity), 0);
  const laborCost = (workOrder.labor || []).reduce((total, labor) => {
    const qty = labor.quantity || labor.hours || 0;
    return total + (qty * labor.rate);
  }, 0);
  const subtotal = partsCost + laborCost;
  const taxRate = 0.08;
  const taxAmount = subtotal * taxRate;
  const totalWithTax = subtotal + taxAmount;

  // Quote age (quote only)
  const quoteAgeDays = isQuote ? Math.floor((new Date() - new Date(workOrder.date)) / (1000 * 60 * 60 * 24)) : 0;
  const getAgeBadge = () => {
    if (quoteAgeDays <= 7) return 'bg-green-100 text-green-800';
    if (quoteAgeDays <= 30) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // ==================== RENDER ====================
  return (
    <div className="container mx-auto">
      {/* ===== HEADER ===== */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {typeLabel}: {workOrder.services && workOrder.services.length > 0
              ? workOrder.services[0].description
              : workOrder.serviceRequested || 'No Description'}
          </h1>
          {isQuote && (
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Quote
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAgeBadge()}`}>
                {quoteAgeDays === 0 ? 'Today' : quoteAgeDays === 1 ? '1 day old' : `${quoteAgeDays} days old`}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Quote primary buttons */}
          {isQuote && (
            <Button variant="primary" onClick={() => setConvertModalOpen(true)} disabled={converting}>
              <i className="fas fa-arrow-right mr-1"></i>Convert to Work Order
            </Button>
          )}

          {/* WO primary buttons */}
          {!isQuote && permissions.workOrders.canEdit(currentUser) && (
            <Button to={`/work-orders/${id}/edit`} variant="primary">Edit Work Order</Button>
          )}

          <Button variant="outline" onClick={handlePrint}>
            <i className="fas fa-print mr-1"></i>Print
          </Button>

          {/* More Actions Dropdown */}
          {(isQuote || isOfficeStaff(currentUser)) && (
            <div className="relative">
              <Button variant="outline" onClick={() => setMoreActionsOpen(!moreActionsOpen)}>
                More Actions<span className="ml-2">&#9776;</span>
              </Button>
              {moreActionsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMoreActionsOpen(false)}></div>
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                    {/* Quote-specific actions */}
                    {isQuote && (
                      <>
                        <Link to={`/quotes/${id}/edit`} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setMoreActionsOpen(false)}>
                          <i className="fas fa-edit mr-2"></i>Edit
                        </Link>
                        <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => { handleDownloadPDF(); setMoreActionsOpen(false); }} disabled={generatingPDF}>
                          <i className={`fas ${generatingPDF ? 'fa-spinner fa-spin' : 'fa-download'} mr-2`}></i>
                          {generatingPDF ? 'Generating...' : 'Download'}
                        </button>
                        <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => { handleArchiveQuote(); setMoreActionsOpen(false); }} disabled={archiving}>
                          <i className={`fas ${archiving ? 'fa-spinner fa-spin' : 'fa-archive'} mr-2`}></i>
                          {archiving ? 'Archiving...' : 'Archive'}
                        </button>
                        <button className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          onClick={() => { setDeleteModalOpen(true); setMoreActionsOpen(false); }}>
                          <i className="fas fa-trash mr-2"></i>Delete
                        </button>
                      </>
                    )}

                    {/* WO-specific actions */}
                    {!isQuote && (
                      <>
                        <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => { handleDownloadPDF(); setMoreActionsOpen(false); }} disabled={generatingPDF}>
                          <i className={`fas ${generatingPDF ? 'fa-spinner fa-spin' : 'fa-download'} mr-2`}></i>
                          {generatingPDF ? 'Generating...' : 'Download'}
                        </button>
                        {permissions.workOrders.canSplit(currentUser) && (
                          <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                            onClick={() => { setSplitModalOpen(true); setMoreActionsOpen(false); }}
                            disabled={(!workOrder.parts || workOrder.parts.length === 0) && (!workOrder.labor || workOrder.labor.length === 0)}>
                            <i className="fas fa-code-branch mr-2"></i>Split Work Order
                          </button>
                        )}
                        <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                          onClick={() => { handleGenerateQuote(); setMoreActionsOpen(false); }} disabled={generatingQuote}>
                          <i className={`fas ${generatingQuote ? 'fa-spinner fa-spin' : 'fa-file-alt'} mr-2`}></i>
                          {generatingQuote ? 'Generating...' : 'Generate Quote'}
                        </button>
                        {permissions.workOrders.canDelete(currentUser) && (
                          <button className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            onClick={() => { setDeleteModalOpen(true); setMoreActionsOpen(false); }}>
                            <i className="fas fa-trash mr-2"></i>Delete
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== QUOTE FOLLOW-UP BANNERS ===== */}
      {isQuote && quoteAgeDays >= 8 && quoteAgeDays <= 14 && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-4 flex items-center">
          <i className="fas fa-phone mr-2"></i>
          This quote is 1+ weeks old. Consider a friendly check-in with the customer.
        </div>
      )}
      {isQuote && quoteAgeDays >= 15 && quoteAgeDays <= 30 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-4 flex items-center">
          <i className="fas fa-phone mr-2"></i>
          This quote is 2+ weeks old. Follow up with the customer.
        </div>
      )}
      {isQuote && quoteAgeDays >= 31 && quoteAgeDays <= 60 && (
        <div className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded mb-4 flex items-center">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          This quote is 1+ months old. Consider following up or archiving.
        </div>
      )}
      {isQuote && quoteAgeDays > 60 && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 flex items-center">
          <i className="fas fa-archive mr-2"></i>
          This quote is over 2 months old. Consider archiving.
        </div>
      )}

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {successMessage}
          <button onClick={() => setSuccessMessage(null)} className="float-right font-bold">&times;</button>
        </div>
      )}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">&times;</button>
        </div>
      )}

      {/* ===== ROW 1: Customer & Vehicle | Totals ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card title="Customer & Vehicle">
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Customer</p>
              {workOrder.customer?._id ? (
                <Link to={`/customers/${workOrder.customer._id}`}
                  className="font-medium text-primary-600 hover:text-primary-800 hover:underline">
                  {workOrder.customer.name}
                </Link>
              ) : (
                <p className="font-medium text-gray-400">Unknown Customer</p>
              )}
              {workOrder.customer?.phone && <p className="text-sm text-gray-600">{workOrder.customer.phone}</p>}
              {workOrder.customer?.email && <p className="text-sm text-gray-600">{workOrder.customer.email}</p>}
            </div>
            <div className="pt-2">
              <p className="text-sm text-gray-500">Vehicle</p>
              {workOrder.vehicle?._id ? (
                <Link to={`/vehicles/${workOrder.vehicle._id}`}
                  className="font-medium text-primary-600 hover:text-primary-800 hover:underline">
                  {workOrder.vehicle.year} {workOrder.vehicle.make} {workOrder.vehicle.model}
                </Link>
              ) : (
                <p className="font-medium text-gray-400">No Vehicle Assigned</p>
              )}
              {workOrder.vehicle?.vin && <p className="text-sm text-gray-600">VIN: {workOrder.vehicle.vin}</p>}
              {workOrder.vehicle?.licensePlate && <p className="text-sm text-gray-600">License: {workOrder.vehicle.licensePlate}</p>}
            </div>
            {workOrder.currentMileage > 0 && (
              <div className="pt-2">
                <p className="text-sm text-gray-500">Current Mileage</p>
                <p className="font-medium">{workOrder.currentMileage.toLocaleString()} mi</p>
              </div>
            )}
            {!isQuote && (
              <div className="pt-2">
                <p className="text-sm text-gray-500">Assigned Technician</p>
                <p className="font-medium mt-1 text-gray-700">
                  {workOrder?.appointmentId?.technician?.name || workOrder?.assignedTechnician?.name || 'Unassigned'}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Totals Card */}
        <Card
          title={isQuote ? 'Quote Summary' : 'Totals'}
          headerActions={
            !isQuote ? (
              <div className="flex items-center space-x-2">
                {linkedInvoice ? (
                  <Link to={`/invoices/${linkedInvoice._id}`}
                    className={`inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded ${
                      linkedInvoice.status === 'Paid' ? 'bg-green-100 text-green-800 hover:bg-green-200' :
                      linkedInvoice.status === 'Partial' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' :
                      linkedInvoice.status === 'Overdue' ? 'bg-red-100 text-red-800 hover:bg-red-200' :
                      'bg-blue-100 text-blue-800 hover:bg-blue-200'
                    }`}>
                    View Invoice #{linkedInvoice.invoiceNumber || linkedInvoice._id.slice(-6)} ({linkedInvoice.status || 'Issued'})
                  </Link>
                ) : (
                  <Button onClick={generateInvoice} variant="primary" size="sm">Generate Invoice</Button>
                )}
              </div>
            ) : null
          }
        >
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Parts</span>
              <span className="font-medium">{formatCurrency(partsCost)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Labor</span>
              <span className="font-medium">{formatCurrency(laborCost)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="text-sm text-gray-600">Subtotal</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Tax ({taxRate * 100}%)</span>
              <span className="font-medium">{formatCurrency(taxAmount)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="text-lg font-bold text-gray-900">Total</span>
              <span className="text-lg font-bold text-gray-900">{formatCurrency(totalWithTax)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ===== ROW 2: Customer Interactions (WO) | Details ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Customer Interactions - WO only */}
        {!isQuote && (
          <Card title="Customer Interactions">
            <div className="space-y-4">
              <div className="border-b border-gray-200 pb-4">
                <div className="space-y-3">
                  <TextArea label="Log Customer Interaction" value={newInteraction.content}
                    onChange={(e) => setNewInteraction({ content: e.target.value })}
                    placeholder="e.g., Called left message to call back re: diagnostic findings" rows={3} />
                  <div className="flex justify-end">
                    <Button onClick={handleAddInteraction} disabled={!newInteraction.content.trim() || addingInteraction}
                      variant="primary" size="sm">
                      {addingInteraction ? 'Adding...' : 'Add Interaction'}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {interactionNotesLoading ? (
                  <div className="text-center py-4">Loading interactions...</div>
                ) : interactionNotes.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">No customer interactions logged yet.</div>
                ) : (
                  interactionNotes.map((note) => (
                    <div key={note._id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-xs text-gray-500">
                              {formatDateTime(note.createdAt)}
                            </span>
                            {note.createdBy?.name && <span className="text-xs text-gray-500">by {note.createdBy.name}</span>}
                          </div>
                          {editingInteraction?._id === note._id ? (
                            <div className="space-y-2">
                              <TextArea value={editingInteraction.content}
                                onChange={(e) => setEditingInteraction({ ...editingInteraction, content: e.target.value })} rows={3} />
                              <div className="flex space-x-2">
                                <Button onClick={() => handleUpdateInteraction(note._id, { content: editingInteraction.content })}
                                  variant="primary" size="sm">Save</Button>
                                <Button onClick={() => setEditingInteraction(null)} variant="outline" size="sm">Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-gray-700" style={{ whiteSpace: 'pre-line' }}>{note.content}</div>
                          )}
                        </div>
                        {editingInteraction?._id !== note._id && (
                          <div className="flex space-x-1 ml-4">
                            <Button onClick={() => setEditingInteraction(note)} variant="outline" size="sm">Edit</Button>
                            <Button onClick={() => handleDeleteInteraction(note._id)} variant="danger" size="sm">Delete</Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Details Card */}
        <Card title={`${typeLabel} Details`} className={isQuote ? 'md:col-span-2' : ''}>
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Date</p>
              <p className="font-medium">{formatDate(workOrder.date)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{isQuote ? 'Services Quoted' : 'Services Requested'}</p>
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

            {/* Status dropdown - WO only */}
            {!isQuote && (
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <div className="mt-1">
                  <SelectInput name="status" options={statusOptions} value={workOrder.status}
                    onChange={handleStatusChange} disabled={statusUpdateLoading} />
                  {workOrder.status === 'On Hold' && workOrder.holdReason && (
                    <p className="text-xs text-gray-500 mt-1">
                      <i className="fas fa-info-circle mr-1"></i>
                      Reason: {workOrder.holdReason === 'Other' ? workOrder.holdReasonOther : workOrder.holdReason}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Appointments - WO only */}
            {!isQuote && (
              <div className="pt-2">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-gray-700">Appointments</p>
                  <Button variant="outline" size="sm"
                    onClick={() => navigate(`/appointments/new?workOrder=${workOrder._id}&vehicle=${workOrder.vehicle?._id}`)}>
                    + Schedule Appointment
                  </Button>
                </div>
                {workOrder.appointments && workOrder.appointments.length > 0 ? (
                  <div className="space-y-2">
                    {workOrder.appointments
                      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
                      .map((appointment) => (
                      <div key={appointment._id} className="bg-gray-50 border border-gray-200 rounded p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">{appointment.serviceType || 'Appointment'}</div>
                            <div className="text-xs text-gray-600 mt-1">
                              {formatDateTime(appointment.startTime, 'ddd, MMM D, YYYY')}
                              {' at '}
                              {formatDateTime(appointment.startTime, 'h:mm A')}
                            </div>
                            {appointment.technician && (
                              <div className="text-xs text-gray-500 mt-1">Tech: {appointment.technician.name}</div>
                            )}
                          </div>
                          <Button variant="primary" size="sm" onClick={() => navigate(`/appointments/${appointment._id}`)}>View</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No appointments scheduled</p>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ===== NOTES, PARTS, LABOR, DOCUMENTS ===== */}
      <div className="space-y-6">
        {/* Notes Section */}
        <Card
          title={isQuote ? 'Notes' : 'Work Order Notes'}
          headerActions={
            !isQuote ? (
              <div className="flex space-x-2">
                <Button onClick={() => setInspectionChecklistModalOpen(true)} variant="outline" size="sm"
                  className="bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200">
                  Inspection Checklist
                </Button>
                <Button onClick={() => setRepairChecklistModalOpen(true)} variant="outline" size="sm"
                  className="bg-green-100 text-green-800 border-green-300 hover:bg-green-200">
                  Repair Checklist
                </Button>
              </div>
            ) : null
          }
        >
          <div className="space-y-4">
            <div className="border-b border-gray-200 pb-4">
              <div className="space-y-3">
                <TextArea label="Add New Note" value={newNote.content}
                  onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                  placeholder="Enter your note here..." rows={3} />
                <div className="flex items-center justify-between">
                  <label className="flex items-center">
                    <input type="checkbox" checked={newNote.isCustomerFacing}
                      onChange={(e) => setNewNote({ ...newNote, isCustomerFacing: e.target.checked })}
                      className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
                    <span className="text-sm text-gray-700">Customer-facing (will appear on invoice)</span>
                  </label>
                  <Button onClick={handleAddNote} disabled={!newNote.content.trim() || addingNote} variant="primary" size="sm">
                    {addingNote ? 'Adding...' : 'Add Note'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">Filter:</span>
              <div className="flex space-x-2">
                <button onClick={() => setNotesFilter('all')}
                  className={`px-3 py-1 text-xs rounded-full ${notesFilter === 'all' ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  All ({notes.length})
                </button>
                <button onClick={() => setNotesFilter('customer')}
                  className={`px-3 py-1 text-xs rounded-full ${notesFilter === 'customer' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  Customer-facing ({notes.filter(n => n.isCustomerFacing).length})
                </button>
                <button onClick={() => setNotesFilter('private')}
                  className={`px-3 py-1 text-xs rounded-full ${notesFilter === 'private' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  Private ({notes.filter(n => !n.isCustomerFacing).length})
                </button>
              </div>
            </div>

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
                            note.isCustomerFacing ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {note.isCustomerFacing ? 'Customer-facing' : 'Private'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDateTime(note.createdAt)}
                          </span>
                          {note.createdBy?.name && <span className="text-xs text-gray-500">by {note.createdBy.name}</span>}
                          {note.createdByName && <span className="text-xs text-gray-500">by {note.createdByName}</span>}
                        </div>
                        {editingNote?._id === note._id ? (
                          <div className="space-y-2">
                            <TextArea value={editingNote.content}
                              onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })} rows={3} />
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center">
                                <input type="checkbox" checked={editingNote.isCustomerFacing}
                                  onChange={(e) => setEditingNote({ ...editingNote, isCustomerFacing: e.target.checked })}
                                  className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
                                <span className="text-sm text-gray-700">Customer-facing</span>
                              </label>
                              <div className="flex space-x-2">
                                <Button onClick={() => handleUpdateNote(note._id, { content: editingNote.content, isCustomerFacing: editingNote.isCustomerFacing })}
                                  variant="primary" size="sm">Save</Button>
                                <Button onClick={() => setEditingNote(null)} variant="outline" size="sm">Cancel</Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-700" style={{ whiteSpace: 'pre-line' }}>{note.content}</div>
                        )}
                      </div>
                      {editingNote?._id !== note._id && (
                        <div className="flex space-x-1 ml-4">
                          <Button onClick={() => setEditingNote(note)} variant="outline" size="sm">Edit</Button>
                          <Button onClick={() => handleDeleteNote(note._id)} variant="danger" size="sm">Delete</Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        {/* ===== PARTS SECTION ===== */}
        <Card
          title="Parts"
          headerActions={
            <div className="flex space-x-2">
              {!isQuote && workOrder?.parts?.length > 0 && (
                <Button onClick={() => setShowCost(!showCost)} variant="light" size="sm">
                  <i className={`fas fa-${showCost ? 'eye-slash' : 'eye'} mr-1`}></i>
                  {showCost ? 'Hide' : 'Show'} Cost
                </Button>
              )}
              {!isQuote && workOrder?.parts?.length > 0 && getUniqueVendors().length > 0 && (
                <Button onClick={() => setBulkOrderModalOpen(true)} variant="secondary" size="sm">
                  <i className="fas fa-list-ul mr-1"></i>Bulk Order #
                </Button>
              )}
              {(isQuote || permissions.workOrders.canAddParts(currentUser)) && (
                <>
                  <Button onClick={() => setReceiptModalOpen(true)} variant="success" size="sm">
                    <i className="fas fa-file-import mr-1"></i>Import Parts
                  </Button>
                  <Button onClick={() => setPartsSelectorOpen(true)} variant="primary" size="sm">
                    Select from Inventory
                  </Button>
                  <Button onClick={openAddPartModal} variant="outline" size="sm">
                    Add Custom Part
                  </Button>
                </>
              )}
            </div>
          }
        >
          {(workOrder.parts || []).length === 0 ? (
            <div className="text-center py-6 text-gray-500"><p>No parts added.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Part</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {!isQuote && showCost ? 'Cost' : 'Price'}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                    {!isQuote && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO/Order #</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </>
                    )}
                    {isQuote && (
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    )}
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workOrder.parts
                    .map((part, originalIndex) => ({ ...part, originalIndex }))
                    .sort((a, b) => {
                      const vendorA = (a.vendor || '').toLowerCase();
                      const vendorB = (b.vendor || '').toLowerCase();
                      if (!vendorA && !vendorB) return 0;
                      if (!vendorA) return 1;
                      if (!vendorB) return -1;
                      return vendorA.localeCompare(vendorB);
                    })
                    .map((part) => (
                    <tr key={part.originalIndex}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{part.name}</div>
                        {part.partNumber && <div className="text-xs text-gray-500">PN: {part.partNumber}</div>}
                        {part.itemNumber && <div className="text-xs text-gray-500">SKU: {part.itemNumber}</div>}
                        {!isQuote && part.receiptImageUrl && (
                          <button onClick={async () => {
                            try {
                              const response = await fetch(
                                `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/workorders/receipt-signed-url?key=${encodeURIComponent(part.receiptImageUrl)}`
                              );
                              const data = await response.json();
                              if (data.status === 'success') {
                                setViewerUrl(data.data.signedUrl);
                                setViewerTitle(part.receiptImageUrl.split('/').pop() || 'receipt.png');
                                setViewerModalOpen(true);
                              } else { alert('Failed to load receipt'); }
                            } catch (err) { console.error('Error fetching receipt:', err); alert('Failed to load receipt'); }
                          }} className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                            View Receipt
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{part.quantity}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(!isQuote && showCost
                          ? (part.cost > 0 ? part.cost : (part.price / 1.3))
                          : (part.price || 0)
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{part.vendor}</div>
                        {part.supplier && <div className="text-xs text-gray-500">Seller: {part.supplier}</div>}
                      </td>
                      {!isQuote && (
                        <>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{part.purchaseOrderNumber}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="flex flex-col space-y-2">
                              <label className="flex items-center text-sm">
                                <input type="checkbox" checked={part.ordered || false}
                                  onChange={(e) => handlePartStatusChange(part.originalIndex, 'ordered', e.target.checked)}
                                  className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
                                <span className={part.ordered ? 'text-yellow-600' : 'text-gray-500'}>Ordered</span>
                              </label>
                              <label className="flex items-center text-sm">
                                <input type="checkbox" checked={part.received || false} disabled={!part.ordered}
                                  onChange={(e) => handlePartStatusChange(part.originalIndex, 'received', e.target.checked)}
                                  className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed" />
                                <span className={part.received ? 'text-green-600' : (part.ordered ? 'text-gray-700' : 'text-gray-400')}>Received</span>
                              </label>
                            </div>
                          </td>
                        </>
                      )}
                      {isQuote && (
                        <td className="px-4 py-2 text-sm text-right font-medium">{formatCurrency(part.price * part.quantity)}</td>
                      )}
                      <td className="px-4 py-2 whitespace-nowrap text-right">
                        <div className="flex justify-end space-x-2">
                          <button onClick={() => openEditPartModal(part, part.originalIndex)} className="text-blue-600 hover:text-blue-800 text-xs">Edit</button>
                          <button onClick={() => handleRemovePart(part.originalIndex)} className="text-red-600 hover:text-red-800 text-xs">Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {isQuote && (
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan="4" className="px-4 py-2 text-right text-sm font-medium text-gray-700">Parts Total:</td>
                      <td className="px-4 py-2 text-right text-sm font-bold">{formatCurrency(partsCost)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>

        {/* ===== LABOR SECTION ===== */}
        <Card
          title="Labor"
          headerActions={
            (isQuote || permissions.workOrders.canAddLabor(currentUser) || permissions.workOrders.canAddLaborOwn(currentUser)) && (
              <Button onClick={openAddLaborModal} variant="outline" size="sm">Add Labor</Button>
            )
          }
        >
          {(workOrder.labor || []).length === 0 ? (
            <div className="text-center py-6 text-gray-500"><p>No labor entries added.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workOrder.labor.map((labor, index) => {
                    const qty = labor.quantity || labor.hours || 0;
                    const isHourly = labor.billingType !== 'fixed';
                    return (
                      <tr key={index}>
                        <td className="px-4 py-2"><div className="font-medium text-gray-900">{labor.description}</div></td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{qty}{isHourly ? ' hrs' : ''}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{formatCurrency(labor.rate)}{isHourly ? '/hr' : ''}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{formatCurrency(qty * labor.rate)}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-right">
                          <div className="flex justify-end space-x-2">
                            <button onClick={() => openEditLaborModal(labor, index)} className="text-blue-600 hover:text-blue-800 text-xs">Edit</button>
                            <button onClick={() => handleRemoveLabor(index)} className="text-red-600 hover:text-red-800 text-xs">Remove</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {isQuote && (
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan="3" className="px-4 py-2 text-right text-sm font-medium text-gray-700">Labor Total:</td>
                      <td className="px-4 py-2 text-right text-sm font-bold">{formatCurrency(laborCost)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>

        {/* ===== FILE ATTACHMENTS - WO only ===== */}
        {!isQuote && (
          <Card title="Attached Documents">
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-4">Upload New Document</h4>
                <FileUpload onFileUpload={handleFileUpload} workOrderId={workOrder._id}
                  vehicleId={workOrder.vehicle?._id} customerId={workOrder.customer?._id}
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.txt,.doc,.docx,.xls,.xlsx" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-medium text-gray-900">Documents ({attachedFiles.length})</h4>
                  {attachedFiles.length > 0 && (
                    <Button onClick={() => fetchAttachedFiles()} variant="outline" size="sm">Refresh</Button>
                  )}
                </div>
                <FileList files={attachedFiles} onDelete={handleFileDelete} onShare={handleFileShare}
                  onView={handleFileView} loading={filesLoading} />
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ==================== MODALS ==================== */}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Delete {typeLabel}?</h3>
            <p className="text-gray-700 mb-6">
              This will permanently delete this {typeLabel.toLowerCase()} and all associated data. This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <Button variant="light" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Delete {typeLabel}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Part Modal (Add/Edit) */}
      {partModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editingPart ? 'Edit Part' : 'Add Part'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Part Name</label>
                <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.name} onChange={(e) => setNewPart({ ...newPart, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Part Number</label>
                <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.partNumber} onChange={(e) => setNewPart({ ...newPart, partNumber: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor / Purchase Location</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 mb-2"
                  value={isOtherVendor ? 'Other' : newPart.vendor} onChange={(e) => handleVendorChange(e.target.value)}>
                  <option value="">Select a vendor...</option>
                  {predefinedVendors.map(vendor => (<option key={vendor} value={vendor}>{vendor}</option>))}
                </select>
                {isOtherVendor && (
                  <input type="text" placeholder="Enter custom vendor name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.vendor} onChange={(e) => setNewPart({ ...newPart, vendor: e.target.value })} />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PO / Order Number</label>
                <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.purchaseOrderNumber} onChange={(e) => setNewPart({ ...newPart, purchaseOrderNumber: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input type="number" min="1" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.quantity} onChange={(e) => setNewPart({ ...newPart, quantity: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost</label>
                  <input type="number" min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.cost} onChange={(e) => {
                      const cost = parseFloat(e.target.value) || 0;
                      setNewPart({ ...newPart, cost, price: parseFloat((cost * 1.3).toFixed(2)) });
                    }} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retail Price</label>
                  <input type="number" min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.price} onChange={(e) => {
                      const price = parseFloat(e.target.value) || 0;
                      setNewPart({ ...newPart, price, cost: parseFloat((price / 1.3).toFixed(2)) });
                    }} />
                </div>
              </div>
              {!isQuote && (
                <div className="flex space-x-4">
                  <div className="flex items-center">
                    <input type="checkbox" id="ordered" className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      checked={newPart.ordered} onChange={(e) => setNewPart({ ...newPart, ordered: e.target.checked, received: e.target.checked ? newPart.received : false })} />
                    <label htmlFor="ordered" className="ml-2 block text-sm text-gray-700">Ordered</label>
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" id="received" className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      checked={newPart.received} onChange={(e) => setNewPart({ ...newPart, received: e.target.checked })} disabled={!newPart.ordered} />
                    <label htmlFor="received" className="ml-2 block text-sm text-gray-700">Received</label>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="light" onClick={() => { setPartModalOpen(false); setEditingPart(null); }}>Cancel</Button>
              <Button variant="primary" onClick={editingPart ? handleEditPart : handleAddPart} disabled={!newPart.name}>
                {editingPart ? 'Update Part' : 'Add Part'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Labor Modal (Add/Edit) */}
      {laborModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editingLabor ? 'Edit Labor' : 'Add Labor'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newLabor.description} onChange={(e) => setNewLabor({ ...newLabor, description: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Billing Type</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newLabor.billingType} onChange={(e) => setNewLabor({ ...newLabor, billingType: e.target.value })}>
                  <option value="hourly">Hourly (hours x rate/hr)</option>
                  <option value="fixed">Fixed Price (qty x unit price)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {newLabor.billingType === 'hourly' ? 'Hours' : 'Quantity'}
                  </label>
                  <input type="number" min="0.1" step={newLabor.billingType === 'hourly' ? '0.1' : '1'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newLabor.quantity} onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || value === '.') { setNewLabor({ ...newLabor, quantity: value }); }
                      else { const parsed = parseFloat(value); setNewLabor({ ...newLabor, quantity: isNaN(parsed) ? 0 : parsed }); }
                    }}
                    onBlur={(e) => { const value = parseFloat(e.target.value) || 0; setNewLabor({ ...newLabor, quantity: value }); }} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {newLabor.billingType === 'hourly' ? 'Rate/hr' : 'Unit Price'}
                  </label>
                  <input type="number" min="0" step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newLabor.rate} onChange={(e) => setNewLabor({ ...newLabor, rate: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="border p-3 rounded bg-gray-50">
                <p className="text-sm text-gray-600 mb-1">Calculated Total:</p>
                <p className="font-medium">{formatCurrency((newLabor.quantity || 0) * (newLabor.rate || 0))}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="light" onClick={() => { setLaborModalOpen(false); setEditingLabor(null); }}>Cancel</Button>
              <Button variant="primary" onClick={editingLabor ? handleEditLabor : handleAddLabor}
                disabled={!newLabor.description || !newLabor.quantity || newLabor.rate < 0}>
                {editingLabor ? 'Update Labor' : 'Add Labor'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostic Notes Modal */}
      {diagnosticNotesModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Diagnostic Notes</h3>
            <TextArea id="diagnosticNotes" value={editingDiagnosticNotes}
              onChange={(e) => setEditingDiagnosticNotes(e.target.value)} rows="8" placeholder="Enter diagnostic notes here..." />
            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="light" onClick={() => setDiagnosticNotesModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleUpdateDiagnosticNotes}>Save Notes</Button>
            </div>
          </div>
        </div>
      )}

      {/* Parts Selector Modal */}
      {partsSelectorOpen && (
        <PartsSelector onPartSelect={handlePartFromInventory} onClose={() => setPartsSelectorOpen(false)} />
      )}

      {/* Bulk Order Number Modal (WO only) */}
      {!isQuote && bulkOrderModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Assign Order Number by Vendor</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Vendor</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={bulkOrderData.vendor} onChange={(e) => setBulkOrderData({ ...bulkOrderData, vendor: e.target.value })}>
                  <option value="">Select a vendor...</option>
                  {getUniqueVendors().map(vendor => {
                    const partsCount = workOrder.parts.filter(part => part.vendor === vendor).length;
                    return (<option key={vendor} value={vendor}>{vendor} ({partsCount} part{partsCount !== 1 ? 's' : ''})</option>);
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order Number</label>
                <input type="text" placeholder="Enter order number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={bulkOrderData.orderNumber} onChange={(e) => setBulkOrderData({ ...bulkOrderData, orderNumber: e.target.value })} />
              </div>
              {bulkOrderData.vendor && (
                <div className="bg-blue-50 p-3 rounded-md">
                  <p className="text-sm text-blue-800">
                    This will update the order number for all parts from <strong>{bulkOrderData.vendor}</strong> ({workOrder.parts.filter(part => part.vendor === bulkOrderData.vendor).length} parts).
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <Button variant="light" onClick={() => { setBulkOrderModalOpen(false); setBulkOrderData({ vendor: '', orderNumber: '' }); }}>Cancel</Button>
              <Button variant="primary" onClick={handleBulkOrderAssignment} disabled={!bulkOrderData.vendor || !bulkOrderData.orderNumber}>Apply Order Number</Button>
            </div>
          </div>
        </div>
      )}

      {/* Import Parts Modal */}
      <ReceiptImportModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        entityId={id}
        onSuccess={handleReceiptImportSuccess}
      />

      {/* WO-specific modals */}
      {!isQuote && (
        <>
          <SplitWorkOrderModal isOpen={splitModalOpen} onClose={() => setSplitModalOpen(false)}
            workOrder={workOrder} onSplit={handleSplitWorkOrder} />
          <OnHoldReasonModal isOpen={onHoldModalOpen} onClose={() => setOnHoldModalOpen(false)}
            onConfirm={handleOnHoldConfirm} loading={statusUpdateLoading} />
          <ChecklistViewModal isOpen={inspectionChecklistModalOpen} onClose={() => setInspectionChecklistModalOpen(false)}
            checklist={workOrder?.inspectionChecklist} type="inspection" workOrder={workOrder} />
          <ChecklistViewModal isOpen={repairChecklistModalOpen} onClose={() => setRepairChecklistModalOpen(false)}
            checklist={workOrder?.repairChecklist} type="repair" workOrder={workOrder} />
        </>
      )}

      {/* Quote-specific modals */}
      {isQuote && (
        <ConvertQuoteModal isOpen={convertModalOpen} onClose={() => setConvertModalOpen(false)}
          quote={workOrder} onConvert={handleConvertToWorkOrder} />
      )}

      {/* File Viewer Modal */}
      {viewerModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">{viewerTitle}</h3>
              <button onClick={() => { setViewerModalOpen(false); setViewerUrl(''); setViewerTitle(''); }}
                className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100">
              {(() => {
                const fileExtension = viewerTitle.split('.').pop().toLowerCase();
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(fileExtension);
                const isPdf = fileExtension === 'pdf';
                if (isImage) {
                  return (
                    <div className="p-4 flex items-center justify-center min-h-full">
                      <img src={viewerUrl} alt={viewerTitle} className="max-w-full h-auto mx-auto shadow-lg" style={{ maxHeight: 'calc(90vh - 160px)' }} />
                    </div>
                  );
                } else if (isPdf) {
                  return <iframe src={viewerUrl} title={viewerTitle} className="w-full h-full" style={{ minHeight: 'calc(90vh - 160px)' }} />;
                } else {
                  return (
                    <div className="p-8 flex flex-col items-center justify-center min-h-full">
                      <div className="text-center">
                        <p className="text-lg font-medium text-gray-900 mb-2">{viewerTitle}</p>
                        <p className="text-sm text-gray-500 mb-4">Preview not available for this file type</p>
                        <a href={viewerUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors">
                          Open in New Tab
                        </a>
                      </div>
                    </div>
                  );
                }
              })()}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between items-center">
              <span className="text-sm text-gray-500">{viewerTitle.split('.').pop().toUpperCase()} File</span>
              <a href={viewerUrl} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors">
                Open in New Tab
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentDetail;
