import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SelectInput from '../../components/common/SelectInput';
import TextArea from '../../components/common/TextArea';
import DocumentService from '../../services/documentService';
import WorkOrderService from '../../services/workOrderService';
import workOrderNotesService from '../../services/workOrderNotesService';
import MediaService from '../../services/mediaService';
import SplitWorkOrderModal from '../../components/workorder/SplitWorkOrderModal';
import OnHoldReasonModal from '../../components/workorder/OnHoldReasonModal';
import ConvertQuoteModal from '../../components/quotes/ConvertQuoteModal';
import FileUpload from '../../components/common/FileUpload';
import { formatDate, formatDateTime } from '../../utils/formatters';
import FileList from '../../components/common/FileList';
import ReceiptImportModal from '../../components/common/ReceiptImportModal';
import InventoryPickerModal from '../../components/workorder/InventoryPickerModal';
import ServicePackageModal from '../../components/workorder/ServicePackageModal';
import ServicePackageCommitModal from '../../components/workorder/ServicePackageCommitModal';
import ServicePackageRemovalModal from '../../components/workorder/ServicePackageRemovalModal';
import PartCommitModal from '../../components/workorder/PartCommitModal';
import PartRemovalModal from '../../components/workorder/PartRemovalModal';
import UncommittedServicesWarningModal from '../../components/workorder/UncommittedServicesWarningModal';
import ChecklistViewModal from '../../components/workorder/ChecklistViewModal';
import DiscountModal from '../../components/common/DiscountModal';
import FollowUpModal from '../../components/followups/FollowUpModal';
import invoiceService from '../../services/invoiceService';
import UrlExtractButton from '../../components/common/UrlExtractButton';
import SettingsService from '../../services/settingsService';
import { formatCurrency } from '../../utils/formatters';
import { generatePdfFilename, generatePdfFromHtml, printHtml, generateDocumentHtml } from '../../utils/pdfUtils';
import { calculateDiscountAmount, describeDiscount } from '../../utils/discountUtils';
import { getCustomerFacingName } from '../../utils/nameUtils';
import { useAuth } from '../../contexts/AuthContext';
import { permissions, isOfficeStaff, isAdminOrManagement } from '../../utils/permissions';

const DocumentDetail = () => {
  const { currentUser } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isQuoteRoute = location.pathname.startsWith('/quotes');

  // Default vendor hostname map (used as fallback if settings haven't loaded yet)
  const defaultVendorHostnames = {
    'walmart.com': 'Walmart', 'tractorsupply.com': 'Tractor Supply',
    'advanceautoparts.com': 'Advance Auto Parts', 'autozone.com': 'Autozone',
    'napaonline.com': 'Napa Auto Parts', 'rockauto.com': 'Rock Auto',
    'ebay.com': 'eBay.com', 'amazon.com': 'Amazon.com',
    'ecstuning.com': 'ECS Tuning', 'fcpeuro.com': 'FCP Euro'
  };

  // Convert array of {hostname, vendor} to a lookup object
  const hostnameArrayToMap = (arr) => {
    if (!Array.isArray(arr)) return defaultVendorHostnames;
    const map = {};
    arr.forEach(item => { if (item.hostname && item.vendor) map[item.hostname] = item.vendor; });
    return Object.keys(map).length > 0 ? map : defaultVendorHostnames;
  };

  // Core state
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [laborModalOpen, setLaborModalOpen] = useState(false);
  const [diagnosticNotesModalOpen, setDiagnosticNotesModalOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);

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
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [inventoryModalLoading, setInventoryModalLoading] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceModalLoading, setServiceModalLoading] = useState(false);
  const [serviceCommitModalOpen, setServiceCommitModalOpen] = useState(false);
  const [serviceCommitModalData, setServiceCommitModalData] = useState(null);
  const [serviceCommitLoading, setServiceCommitLoading] = useState(false);
  const [uncommittedWarningModalOpen, setUncommittedWarningModalOpen] = useState(false);
  const [uncommittedPackagesForWarning, setUncommittedPackagesForWarning] = useState([]);
  const [serviceRemovalModalOpen, setServiceRemovalModalOpen] = useState(false);
  const [serviceRemovalData, setServiceRemovalData] = useState(null);
  const [partCommitModalOpen, setPartCommitModalOpen] = useState(false);
  const [partCommitModalData, setPartCommitModalData] = useState(null);
  const [partCommitLoading, setPartCommitLoading] = useState(false);
  const [partRemovalModalOpen, setPartRemovalModalOpen] = useState(false);
  const [partRemovalData, setPartRemovalData] = useState(null);
  const [uncommittedPartsForWarning, setUncommittedPartsForWarning] = useState([]);

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
  const defaultPart = {
    name: '', partNumber: '', quantity: 1,
    price: 0, cost: 0, ordered: false, received: false,
    vendor: '', supplier: '', purchaseOrderNumber: '', receiptImageUrl: '',
    url: '', notes: '', warranty: '', category: '', coreCharge: 0, coreChargeInvoiceable: false,
    vin: '', stockNumber: ''
  };
  const [newPart, setNewPart] = useState({ ...defaultPart });
  const [expandedPartIndex, setExpandedPartIndex] = useState(null);
  const [isOtherVendor, setIsOtherVendor] = useState(false);
  const [markupPercentage, setMarkupPercentage] = useState(30);
  const [overridePrice, setOverridePrice] = useState(false);
  const [partsSortConfig, setPartsSortConfig] = useState([]);
  const [vendorList, setVendorList] = useState([]);
  const [categoryList, setCategoryList] = useState([]);
  const [isOtherCategory, setIsOtherCategory] = useState(false);
  const [addingNewVendor, setAddingNewVendor] = useState(false);
  const [addingNewCategory, setAddingNewCategory] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorHostname, setNewVendorHostname] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [managingVendors, setManagingVendors] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [vendorHostnameMap, setVendorHostnameMap] = useState(defaultVendorHostnames);
  const [detectedHostname, setDetectedHostname] = useState(null); // { hostname, suggestedName } when URL has unrecognized domain

  // Add Part dropdown menu (From Inventory / Manual Entry)
  const [addPartMenuOpen, setAddPartMenuOpen] = useState(false);
  const addPartMenuRef = useRef(null);

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
    setDetectedHostname(null);
    if (selectedVendor === 'Other') {
      setIsOtherVendor(true);
      setAddingNewVendor(false);
      setNewPart({ ...newPart, vendor: '' });
    } else if (selectedVendor === '__add_new__') {
      setAddingNewVendor(true);
      setNewVendorName('');
    } else {
      setIsOtherVendor(false);
      setAddingNewVendor(false);
      setNewPart({ ...newPart, vendor: selectedVendor });
    }
  };

  const handleCategoryChange = (selectedCategory) => {
    if (selectedCategory === 'Other') {
      setIsOtherCategory(true);
      setAddingNewCategory(false);
      setNewPart({ ...newPart, category: '' });
    } else if (selectedCategory === '__add_new__') {
      setAddingNewCategory(true);
      setNewCategoryName('');
    } else {
      setIsOtherCategory(false);
      setAddingNewCategory(false);
      setNewPart({ ...newPart, category: selectedCategory });
    }
  };

  const handleSaveNewVendor = async () => {
    if (!newVendorName.trim()) return;
    try {
      const response = await SettingsService.addVendor(newVendorName.trim(), newVendorHostname.trim() || undefined);
      const updatedSettings = response.data.settings;
      setVendorList(updatedSettings.customVendors);
      if (updatedSettings.vendorHostnames) {
        setVendorHostnameMap(hostnameArrayToMap(updatedSettings.vendorHostnames));
      }
      setNewPart(prev => ({ ...prev, vendor: newVendorName.trim() }));
      setAddingNewVendor(false);
      setIsOtherVendor(false);
      setNewVendorName('');
      setNewVendorHostname('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add vendor');
    }
  };

  const handleRemoveVendor = async (vendor) => {
    if (!window.confirm(`Remove "${vendor}" from the vendor list? This won't affect existing parts.`)) return;
    try {
      const response = await SettingsService.removeVendor(vendor);
      const updatedSettings = response.data.settings;
      setVendorList(updatedSettings.customVendors);
      if (updatedSettings.vendorHostnames) {
        setVendorHostnameMap(hostnameArrayToMap(updatedSettings.vendorHostnames));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove vendor');
    }
  };

  const handleSaveNewCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const response = await SettingsService.addCategory(newCategoryName.trim());
      setCategoryList(response.data.settings.customCategories);
      setNewPart(prev => ({ ...prev, category: newCategoryName.trim() }));
      setAddingNewCategory(false);
      setIsOtherCategory(false);
      setNewCategoryName('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add category');
    }
  };

  const handleRemoveCategory = async (category) => {
    if (!window.confirm(`Remove "${category}" from the category list? This won't affect existing parts.`)) return;
    try {
      const response = await SettingsService.removeCategory(category);
      setCategoryList(response.data.settings.customCategories);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove category');
    }
  };

  const extractHostname = (url) => {
    if (!url) return null;
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return null;
    }
  };

  const detectVendorFromUrl = (hostname) => {
    if (!hostname) return null;
    for (const [domain, vendorName] of Object.entries(vendorHostnameMap)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return vendorName;
      }
    }
    return null;
  };

  // Format a hostname into a readable vendor name suggestion (e.g. "ebay.com" → "eBay")
  const formatHostnameAsName = (hostname) => {
    const name = hostname.replace(/\.(com|net|org|co|io)$/i, '');
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const handleUrlChange = (url) => {
    const hostname = extractHostname(url);
    setNewPart(prev => {
      const updated = { ...prev, url };
      // Only auto-fill vendor if currently empty
      if (!prev.vendor) {
        const detected = detectVendorFromUrl(hostname);
        if (detected) {
          updated.vendor = detected;
          setIsOtherVendor(!vendorList.includes(detected));
          setDetectedHostname(null);
        } else if (hostname) {
          // Unrecognized domain — show suggestion
          setDetectedHostname({ hostname, suggestedName: formatHostnameAsName(hostname) });
        }
      }
      return updated;
    });
  };

  const getCategoryBadgeColor = (category) => {
    const colorMap = {
      'Maintenance': 'bg-blue-100 text-blue-800',
      'Repair': 'bg-purple-100 text-purple-800',
      'Fluid': 'bg-teal-100 text-teal-800',
      'Software/License': 'bg-yellow-100 text-yellow-800'
    };
    return colorMap[category] || 'bg-gray-100 text-gray-800';
  };

  // ==================== Parts Sorting ====================
  const handlePartSort = (columnName) => {
    setPartsSortConfig(prev => {
      const existingIndex = prev.findIndex(s => s.column === columnName);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        if (existing.direction === 'asc') {
          const updated = [...prev];
          updated[existingIndex] = { column: columnName, direction: 'desc' };
          return updated;
        } else {
          return prev.filter((_, i) => i !== existingIndex);
        }
      } else {
        return [...prev, { column: columnName, direction: 'asc' }].slice(0, 3);
      }
    });
  };

  const renderPartSortIndicator = (columnName) => {
    const index = partsSortConfig.findIndex(s => s.column === columnName);
    if (index < 0) return null;
    const arrow = partsSortConfig[index].direction === 'asc' ? '\u25B2' : '\u25BC';
    return <span className="ml-1 text-xs">{arrow}{partsSortConfig.length > 1 ? <sup>{index + 1}</sup> : ''}</span>;
  };

  const applyPartsSorting = (parts) => {
    if (partsSortConfig.length === 0) return parts;
    return [...parts].sort((a, b) => {
      for (const config of partsSortConfig) {
        let comparison = 0;
        switch (config.column) {
          case 'name':
            comparison = (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
            break;
          case 'price':
            comparison = (a.price || 0) - (b.price || 0);
            break;
          case 'vendor':
            comparison = (a.vendor || '').toLowerCase().localeCompare((b.vendor || '').toLowerCase());
            break;
          case 'category':
            comparison = (a.category || '').toLowerCase().localeCompare((b.category || '').toLowerCase());
            break;
          default:
            break;
        }
        if (comparison !== 0) {
          return config.direction === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  };

  // Save sort config when it changes
  useEffect(() => {
    if (workOrder && partsSortConfig !== undefined) {
      const currentConfig = JSON.stringify(workOrder.partsSortConfig || []);
      const newConfig = JSON.stringify(partsSortConfig);
      if (currentConfig !== newConfig) {
        DocumentService.updateDocument(id, { partsSortConfig }).catch(() => {});
      }
    }
  }, [partsSortConfig]); // eslint-disable-line react-hooks/exhaustive-deps

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

        // Fetch settings and document in parallel
        const [docResponse, settingsResponse] = await Promise.all([
          DocumentService.getDocument(id),
          SettingsService.getSettings().catch(() => ({ data: { settings: { partMarkupPercentage: 30, customVendors: [], customCategories: [] } } }))
        ]);

        const fetchedDoc = docResponse.data.workOrder;
        const settings = settingsResponse.data.settings;
        setWorkOrder(fetchedDoc);
        setMarkupPercentage(settings.partMarkupPercentage);
        setVendorList(settings.customVendors || []);
        setCategoryList(settings.customCategories || []);
        if (settings.vendorHostnames) {
          setVendorHostnameMap(hostnameArrayToMap(settings.vendorHostnames));
        }
        setPartsSortConfig(fetchedDoc.partsSortConfig || []);

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

  // Close Add Part menu on outside click
  useEffect(() => {
    if (!addPartMenuOpen) return;
    const handleClickOutside = (e) => {
      if (addPartMenuRef.current && !addPartMenuRef.current.contains(e.target)) {
        setAddPartMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addPartMenuOpen]);

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
    setOverridePrice(false);
    setNewPart({ ...defaultPart });
    setPartModalOpen(true);
  };

  const openEditPartModal = (part, index) => {
    setEditingPart({ ...part, index });
    setOverridePrice(false);
    const vendor = part.vendor || '';
    const isCustomVendor = vendor && !vendorList.includes(vendor);
    const multiplier = 1 + markupPercentage / 100;
    setNewPart({
      name: part.name || '', partNumber: part.partNumber || '',
      quantity: part.quantity || 1,
      cost: part.cost || (part.price ? parseFloat((part.price / multiplier).toFixed(2)) : 0),
      price: part.price || 0, ordered: part.ordered || false, received: part.received || false,
      vendor: vendor, supplier: part.supplier || '', purchaseOrderNumber: part.purchaseOrderNumber || '',
      url: part.url || '', notes: part.notes || '', warranty: part.warranty || '',
      category: part.category || '', coreCharge: part.coreCharge || 0,
      coreChargeInvoiceable: part.coreChargeInvoiceable || false,
      vin: part.vin || '', stockNumber: part.stockNumber || ''
    });
    setIsOtherVendor(isCustomVendor);
    const cat = part.category || '';
    setIsOtherCategory(cat && !categoryList.includes(cat));
    setAddingNewVendor(false);
    setAddingNewCategory(false);
    setManagingVendors(false);
    setManagingCategories(false);
    setDetectedHostname(null);
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
      setNewPart({ ...defaultPart });
      setIsOtherVendor(false);
      setIsOtherCategory(false);
      setAddingNewVendor(false);
      setAddingNewCategory(false);
      setManagingVendors(false);
      setManagingCategories(false);
      setDetectedHostname(null);
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
      setNewPart({ ...defaultPart });
      setIsOtherVendor(false);
      setIsOtherCategory(false);
      setAddingNewVendor(false);
      setAddingNewCategory(false);
      setManagingVendors(false);
      setManagingCategories(false);
      setDetectedHostname(null);
    } catch (err) {
      console.error('Error updating part:', err);
      setError('Failed to update part. Please try again later.');
    }
  };

  const handleRemovePart = (index) => {
    const part = workOrder.parts?.[index];
    if (!part) return;
    setPartRemovalData({ partIndex: index, part });
    setPartRemovalModalOpen(true);
  };

  const handleConfirmRemovePart = async (returnToInventory) => {
    if (!partRemovalData) return;
    const { partIndex, part } = partRemovalData;
    try {
      // Manually-entered parts (no inventory link) just splice — go through the bulk update path.
      // Inventory-linked parts go through the dedicated endpoint so restock can be requested.
      if (part.inventoryItemId) {
        // For drafts (committed === false) restock is irrelevant; for committed and
        // pre-migration parts (committed undefined) we forward the user's choice.
        const payload = part.committed === false ? { partIndex } : { partIndex, returnToInventory };
        const response = await DocumentService.removePart(id, payload);
        setWorkOrder(response.data.workOrder);
      } else {
        const updatedParts = workOrder.parts.filter((_, idx) => idx !== partIndex);
        const response = await DocumentService.updateDocument(id, { parts: updatedParts });
        setWorkOrder(response.data.workOrder);
      }
      setPartRemovalModalOpen(false);
      setPartRemovalData(null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to remove part';
      alert(`Error: ${msg}`);
    }
  };

  // Add part from inventory as a draft (no deduction yet)
  const handleAddFromInventory = async ({ inventoryItemId, quantity }) => {
    setInventoryModalLoading(true);
    try {
      const response = await DocumentService.addPartFromInventory(id, { inventoryItemId, quantity });
      setWorkOrder(response.data.workOrder);
      setInventoryModalOpen(false);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add inventory item';
      setError(msg);
    } finally {
      setInventoryModalLoading(false);
    }
  };

  const handleCommitPart = (partIndex) => {
    const part = workOrder.parts?.[partIndex];
    if (!part) return;
    setPartCommitModalData({ partIndex, part });
    setPartCommitModalOpen(true);
  };

  const handleConfirmCommitPart = async () => {
    if (!partCommitModalData) return;
    try {
      setPartCommitLoading(true);
      const response = await DocumentService.commitPart(id, { partIndex: partCommitModalData.partIndex });
      setWorkOrder(response.data.workOrder);
      setPartCommitModalOpen(false);
      setPartCommitModalData(null);

      if (response.lowStockWarning) {
        const w = response.lowStockWarning;
        alert(`Part pulled from inventory.\n\nLow stock warning: "${w.itemName}" now has ${w.currentQoh} ${w.unit} remaining (reorder point: ${w.reorderPoint})`);
      }

      // If invoked from the pre-invoice warning, re-check whether anything is still uncommitted.
      if (uncommittedPackagesForWarning.length > 0 || uncommittedPartsForWarning.length > 0) {
        setTimeout(() => {
          const wo = response.data.workOrder;
          const remainingPackages = (wo.servicePackages || [])
            .map((pkg, idx) => ({ ...pkg, packageIndex: idx }))
            .filter(pkg => !pkg.committed);
          const remainingParts = (wo.parts || [])
            .map((p, idx) => ({ ...p, partIndex: idx }))
            .filter(p => p.inventoryItemId && p.committed === false);
          if (remainingPackages.length === 0 && remainingParts.length === 0) {
            navigate(`/invoices/generate?workOrder=${id}`);
          } else {
            setUncommittedPackagesForWarning(remainingPackages);
            setUncommittedPartsForWarning(remainingParts);
            setUncommittedWarningModalOpen(true);
          }
        }, 300);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to commit part';
      alert(`Error: ${msg}`);
    } finally {
      setPartCommitLoading(false);
    }
  };

  // Add service package
  const handleAddServicePackage = async ({ servicePackageId, selections }) => {
    setServiceModalLoading(true);
    try {
      const response = await DocumentService.addServicePackage(id, { servicePackageId, selections });
      setWorkOrder(response.data.workOrder);
      setServiceModalOpen(false);
      if (response.lowStockWarnings?.length > 0) {
        const warnings = response.lowStockWarnings.map(w =>
          `"${w.itemName}": ${w.currentQoh} ${w.unit} remaining`
        ).join('\n');
        alert(`Low stock warnings:\n${warnings}`);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add service package';
      setError(msg);
    } finally {
      setServiceModalLoading(false);
    }
  };

  const handleCommitServicePackage = (packageIndex) => {
    const pkg = workOrder.servicePackages?.[packageIndex];
    if (!pkg) {
      alert('Package not found!');
      return;
    }

    // Open the commit modal with validation
    setServiceCommitModalData({ packageIndex, package: pkg });
    setServiceCommitModalOpen(true);
    console.log('Modal should be open now. State:', { serviceCommitModalOpen: true, pkg });
  };

  const handleConfirmCommitServicePackage = async () => {
    if (!serviceCommitModalData) return;

    try {
      setServiceCommitLoading(true);
      const response = await DocumentService.commitServicePackage(id, { packageIndex: serviceCommitModalData.packageIndex });
      setWorkOrder(response.data.workOrder);
      setServiceCommitModalOpen(false);
      setServiceCommitModalData(null);

      // Show low stock warnings if any
      if (response.lowStockWarnings?.length > 0) {
        const warnings = response.lowStockWarnings.map(w =>
          `"${w.itemName}": ${w.currentQoh} ${w.unit} remaining`
        ).join('\n');
        alert(`Service package committed successfully!\n\nLow stock warnings:\n${warnings}`);
      } else {
        alert('Service package committed successfully!');
      }

      // If we came from the uncommitted warning modal, re-check for any remaining uncommitted items.
      if (uncommittedPackagesForWarning.length > 0 || uncommittedPartsForWarning.length > 0) {
        setTimeout(() => {
          const wo = response.data.workOrder;
          const remainingPackages = (wo.servicePackages || [])
            .map((pkg, idx) => ({ ...pkg, packageIndex: idx }))
            .filter(pkg => !pkg.committed);
          const remainingParts = (wo.parts || [])
            .map((p, idx) => ({ ...p, partIndex: idx }))
            .filter(p => p.inventoryItemId && p.committed === false);

          if (remainingPackages.length === 0 && remainingParts.length === 0) {
            navigate(`/invoices/generate?workOrder=${id}`);
          } else {
            setUncommittedPackagesForWarning(remainingPackages);
            setUncommittedPartsForWarning(remainingParts);
            setUncommittedWarningModalOpen(true);
          }
        }, 500);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to commit service package';
      alert(`Error: ${msg}`);
    } finally {
      setServiceCommitLoading(false);
    }
  };

  const handleRemoveServicePackage = (packageIndex) => {
    const pkg = workOrder.servicePackages?.[packageIndex];
    if (!pkg) return;

    setServiceRemovalData({ packageIndex, package: pkg });
    setServiceRemovalModalOpen(true);
  };

  const handleConfirmRemoveServicePackage = async (returnToInventory) => {
    if (!serviceRemovalData) return;
    const { packageIndex, package: pkg } = serviceRemovalData;

    try {
      const payload = pkg.committed ? { packageIndex, returnToInventory } : { packageIndex };
      const response = await DocumentService.removeServicePackage(id, payload);
      setWorkOrder(response.data.workOrder);
      setServiceRemovalModalOpen(false);
      setServiceRemovalData(null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to remove service package';
      alert(`Error: ${msg}`);
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

    // Check for uncommitted service packages and inventory-linked parts
    const uncommittedPackages = (workOrder.servicePackages || [])
      .map((pkg, idx) => ({ ...pkg, packageIndex: idx }))
      .filter(pkg => !pkg.committed);
    const uncommittedParts = (workOrder.parts || [])
      .map((p, idx) => ({ ...p, partIndex: idx }))
      .filter(p => p.inventoryItemId && p.committed === false);

    if (uncommittedPackages.length > 0 || uncommittedParts.length > 0) {
      setUncommittedPackagesForWarning(uncommittedPackages);
      setUncommittedPartsForWarning(uncommittedParts);
      setUncommittedWarningModalOpen(true);
      return;
    }

    navigate(`/invoices/generate?workOrder=${id}`);
  };

  const handleProceedWithInvoiceAnyway = () => {
    setUncommittedWarningModalOpen(false);
    setUncommittedPackagesForWarning([]);
    setUncommittedPartsForWarning([]);
    navigate(`/invoices/generate?workOrder=${id}`);
  };

  const handleCommitFromWarningModal = (packageIndex) => {
    // Close the warning modal and open the commit modal for this package
    setUncommittedWarningModalOpen(false);
    const pkg = workOrder.servicePackages?.[packageIndex];
    if (pkg) {
      setServiceCommitModalData({ packageIndex, package: pkg });
      setServiceCommitModalOpen(true);
    }
  };

  const handleCommitPartFromWarningModal = (partIndex) => {
    setUncommittedWarningModalOpen(false);
    const part = workOrder.parts?.[partIndex];
    if (part) {
      setPartCommitModalData({ partIndex, part });
      setPartCommitModalOpen(true);
    }
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
    parts: applyPartsSorting(workOrder.parts || []),
    labor: workOrder.labor || [],
    servicePackages: workOrder.servicePackages || [],
    discount: workOrder.discount
      ? { ...workOrder.discount, amount: discountAmount }
      : null,
    customerFacingNotes: notes.filter(n => n.isCustomerFacing),
    technicianName: getCustomerFacingName(workOrder.assignedTechnician),
    serviceAdvisorName: getCustomerFacingName(workOrder.createdBy)
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
    { value: 'No-Show', label: 'No-Show' },
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
  const partsCost = (workOrder.parts || []).reduce((total, part) => {
    const lineTotal = part.price * part.quantity;
    const core = (part.coreChargeInvoiceable && part.coreCharge) ? part.coreCharge : 0;
    return total + lineTotal + core;
  }, 0);
  const partsCostAtCost = (workOrder.parts || []).reduce(
    (total, part) => total + ((part.cost || 0) * (part.quantity || 0)),
    0
  );
  const partsTotalQty = (workOrder.parts || []).reduce((total, part) => total + (part.quantity || 0), 0);
  const laborCost = (workOrder.labor || []).reduce((total, labor) => {
    const qty = labor.quantity || labor.hours || 0;
    return total + (qty * labor.rate);
  }, 0);
  const laborTotalQty = (workOrder.labor || []).reduce(
    (total, labor) => total + (labor.quantity || labor.hours || 0),
    0
  );
  const servicePackagesCost = (workOrder.servicePackages || []).reduce((total, pkg) => total + (pkg.price || 0), 0);
  const subtotal = partsCost + laborCost + servicePackagesCost;
  const discountAmount = calculateDiscountAmount(
    workOrder.parts,
    workOrder.labor,
    workOrder.servicePackages,
    workOrder.discount
  );
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const taxRate = 0.08;
  const taxAmount = discountedSubtotal * taxRate;
  const totalWithTax = discountedSubtotal + taxAmount;

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

          <Button variant="outline" onClick={() => setFollowUpModalOpen(true)}>
            <i className="fas fa-thumbtack mr-1"></i>Follow-Up
          </Button>

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
            {servicePackagesCost > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Services</span>
                <span className="font-medium">{formatCurrency(servicePackagesCost)}</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="text-sm text-gray-600">Subtotal</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            {workOrder.discount ? (
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => setDiscountModalOpen(true)}
                    className="text-sm text-blue-700 hover:text-blue-900 hover:underline text-left truncate"
                    title="Edit coupon"
                  >
                    {workOrder.discount.description || 'Coupon'}
                  </button>
                  <div className="text-xs text-gray-500">{describeDiscount(workOrder.discount)}</div>
                  {(workOrder.discount.appliedTo || []).length === 0 && (
                    <div className="text-xs text-amber-600">No lines selected</div>
                  )}
                </div>
                <span className="font-medium text-green-700 ml-3">−{formatCurrency(discountAmount)}</span>
              </div>
            ) : (
              <div>
                <button
                  onClick={() => setDiscountModalOpen(true)}
                  className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded"
                >
                  Add Coupon
                </button>
              </div>
            )}
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
                    Schedule Appointment
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

        {/* ===== SERVICES SECTION ===== */}
        {(!isQuote || (workOrder.servicePackages || []).length > 0) && (
          <Card
            title="Services"
            headerActions={
              !isQuote && permissions.workOrders.canAddParts(currentUser) && (
                <Button onClick={() => setServiceModalOpen(true)} variant="primary" size="sm">
                  Add Service
                </Button>
              )
            }
          >
            {(workOrder.servicePackages || []).length === 0 ? (
              <div className="text-center py-6 text-gray-500"><p>No services added.</p></div>
            ) : (
              <div className="space-y-3">
                {workOrder.servicePackages.map((pkg, pkgIndex) => (
                  <div
                    key={pkgIndex}
                    className={`border rounded-lg p-4 ${
                      pkg.committed
                        ? 'border-purple-200 bg-purple-50/30'
                        : 'border-yellow-300 bg-yellow-50/30 border-dashed'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-gray-900">{pkg.name}</div>
                        {pkg.committed ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                            <i className="fas fa-check mr-0.5"></i>Pulled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">
                            Draft
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-purple-700">{formatCurrency(pkg.price)}</span>
                        {!pkg.committed && (
                          <button
                            onClick={() => handleCommitServicePackage(pkgIndex)}
                            className="px-2 py-1 text-xs font-semibold bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            <i className="fas fa-arrow-down mr-1"></i>Pull from Inventory
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveServicePackage(pkgIndex)}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {pkg.includedItems && pkg.includedItems.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-gray-500 mb-1">
                          {pkg.committed ? 'Included items (pulled from inventory):' : 'Included items (not yet pulled):'}
                        </div>
                        <div className="space-y-1">
                          {pkg.includedItems.map((item, itemIdx) => (
                            <div key={itemIdx} className="flex items-center justify-between text-sm text-gray-700">
                              <span>
                                {item.name}
                                {item.partNumber && <span className="text-xs text-gray-400 ml-1">({item.partNumber})</span>}
                              </span>
                              <span className="text-gray-500">
                                {item.quantity} {item.unit || ''}
                                {showCost && item.cost > 0 && (
                                  <span className="ml-2 text-gray-400">@ {formatCurrency(item.cost)}</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 border-t border-gray-200 text-sm">
                  <span className="font-bold text-gray-900">Total ({workOrder.servicePackages.length} {workOrder.servicePackages.length === 1 ? 'service' : 'services'})</span>
                  <span className="font-bold text-gray-900">{formatCurrency(servicePackagesCost)}</span>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ===== PARTS SECTION ===== */}
        <Card
          title="Parts"
          headerActions={
            (isQuote || permissions.workOrders.canAddParts(currentUser)) && (
              <div className="flex space-x-2">
                <Button onClick={() => setReceiptModalOpen(true)} variant="outline" size="sm">
                  <i className="fas fa-file-import mr-1"></i>Import
                </Button>
                {isQuote ? (
                  <Button onClick={openAddPartModal} variant="primary" size="sm">
                    Add Part
                  </Button>
                ) : (
                  <div className="relative" ref={addPartMenuRef}>
                    <Button onClick={() => setAddPartMenuOpen(!addPartMenuOpen)} variant="primary" size="sm">
                      Add Part <i className="fas fa-chevron-down ml-1 text-xs"></i>
                    </Button>
                    {addPartMenuOpen && (
                      <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                        <button
                          onClick={() => { setAddPartMenuOpen(false); setInventoryModalOpen(true); }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <i className="fas fa-boxes-stacked mr-2 text-gray-400"></i>From Inventory
                        </button>
                        <button
                          onClick={() => { setAddPartMenuOpen(false); openAddPartModal(); }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100"
                        >
                          <i className="fas fa-pen mr-2 text-gray-400"></i>Manual Entry
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          }
        >
          {(workOrder.parts || []).length === 0 ? (
            <div className="text-center py-6 text-gray-500"><p>No parts added.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                      onClick={() => handlePartSort('name')}>
                      Part{renderPartSortIndicator('name')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <span className="inline-flex items-center gap-1">
                        <span className="cursor-pointer hover:text-gray-700" onClick={() => handlePartSort('price')}>
                          {!isQuote && showCost ? 'Cost' : 'Price'}{renderPartSortIndicator('price')}
                        </span>
                        {!isQuote && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowCost(!showCost); }}
                            className="text-gray-400 hover:text-gray-600"
                            title={showCost ? 'Hide cost (show price)' : 'Show cost'}
                          >
                            <i className={`fas fa-${showCost ? 'eye-slash' : 'eye'} text-xs`}></i>
                          </button>
                        )}
                      </span>
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                      onClick={() => handlePartSort('vendor')}>
                      Vendor{renderPartSortIndicator('vendor')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                      onClick={() => handlePartSort('category')}>
                      Cat.{renderPartSortIndicator('category')}
                    </th>
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
                  {applyPartsSorting(
                    workOrder.parts.map((part, originalIndex) => ({ ...part, originalIndex }))
                  ).map((part) => (
                    <React.Fragment key={part.originalIndex}>
                    <tr
                      className={`cursor-pointer ${
                        part.inventoryItemId && part.committed === false
                          ? 'bg-yellow-50/40 hover:bg-yellow-50'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setExpandedPartIndex(expandedPartIndex === part.originalIndex ? null : part.originalIndex)}
                    >
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900 flex items-center flex-wrap gap-x-2">
                          <i className={`fas fa-chevron-${expandedPartIndex === part.originalIndex ? 'down' : 'right'} text-xs text-gray-400 mr-2`}></i>
                          {part.name}
                          {part.serviceIncluded && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">incl.</span>
                          )}
                          {part.inventoryItemId && part.committed === false && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-700 rounded">Draft</span>
                          )}
                          {part.inventoryItemId && part.committed !== false && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">
                              <i className="fas fa-check mr-0.5"></i>Pulled
                            </span>
                          )}
                        </div>
                        {part.partNumber && <div className="text-xs text-gray-500">PN: {part.partNumber}</div>}
                        {part.warranty && <div className="text-xs text-green-600 italic">Part Warranty: {part.warranty}</div>}
                        {part.coreCharge > 0 && (
                          <div className="text-xs text-orange-600">
                            Core: {formatCurrency(part.coreCharge)}{part.coreChargeInvoiceable ? '' : ' (internal)'}
                          </div>
                        )}
                        {!isQuote && part.receiptImageUrl && (
                          <button onClick={async (e) => { e.stopPropagation();
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
                          ? (part.cost > 0 ? part.cost : (part.price / (1 + markupPercentage / 100)))
                          : (part.price || 0)
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {part.vendor}
                          {part.url && (
                            <a href={part.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-1 text-blue-500 hover:text-blue-700" title="Product link">
                              <i className="fas fa-external-link-alt text-xs"></i>
                            </a>
                          )}
                        </div>
                        {part.supplier && <div className="text-xs text-gray-500">Seller: {part.supplier}</div>}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {part.category && (
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${getCategoryBadgeColor(part.category)}`}>
                            {part.category}
                          </span>
                        )}
                      </td>
                      {!isQuote && (
                        <>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{part.purchaseOrderNumber}</td>
                          <td className="px-4 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
                      <td className="px-4 py-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end items-center space-x-2">
                          {part.inventoryItemId && part.committed === false && (
                            <button
                              onClick={() => handleCommitPart(part.originalIndex)}
                              className="px-2 py-1 text-xs font-semibold bg-green-600 text-white rounded hover:bg-green-700"
                              title="Pull this part from inventory"
                            >
                              <i className="fas fa-arrow-down mr-1"></i>Pull
                            </button>
                          )}
                          <button onClick={() => openEditPartModal(part, part.originalIndex)} className="text-blue-600 hover:text-blue-800 text-xs">Edit</button>
                          <button onClick={() => handleRemovePart(part.originalIndex)} className="text-red-600 hover:text-red-800 text-xs">Remove</button>
                        </div>
                      </td>
                    </tr>
                    {expandedPartIndex === part.originalIndex && (
                      <tr>
                        <td colSpan={isQuote ? 7 : 8} className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                            {part.url && (
                              <div>
                                <span className="font-medium text-gray-500">Product URL:</span>{' '}
                                <a href={part.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline break-all">
                                  {part.url.length > 50 ? part.url.substring(0, 50) + '...' : part.url}
                                  <i className="fas fa-external-link-alt text-xs ml-1"></i>
                                </a>
                              </div>
                            )}
                            {part.supplier && (
                              <div><span className="font-medium text-gray-500">Seller:</span> {part.supplier}</div>
                            )}
                            {part.purchaseOrderNumber && (
                              <div><span className="font-medium text-gray-500">PO/Order #:</span> {part.purchaseOrderNumber}</div>
                            )}
                            {part.vin && (
                              <div><span className="font-medium text-gray-500">Source VIN:</span> <span className="font-mono">{part.vin}</span></div>
                            )}
                            {part.stockNumber && (
                              <div><span className="font-medium text-gray-500">Stock #:</span> {part.stockNumber}</div>
                            )}
                            {part.warranty && (
                              <div><span className="font-medium text-gray-500">Warranty:</span> <span className="text-green-700">{part.warranty}</span></div>
                            )}
                            {part.coreCharge > 0 && (
                              <div><span className="font-medium text-gray-500">Core Charge:</span> {formatCurrency(part.coreCharge)}{part.coreChargeInvoiceable ? '' : ' (internal)'}</div>
                            )}
                            {part.notes && (
                              <div className="col-span-2 md:col-span-3"><span className="font-medium text-gray-500">Notes:</span> {part.notes}</div>
                            )}
                            {!part.url && !part.supplier && !part.vin && !part.stockNumber && !part.warranty && !part.notes && !(part.coreCharge > 0) && (
                              <div className="text-gray-400 italic">No additional details</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-2 text-sm font-bold text-gray-900">Total</td>
                    <td className="px-4 py-2 text-sm font-bold text-gray-900">{partsTotalQty}</td>
                    {isQuote ? (
                      <>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">{formatCurrency(partsCost)}</td>
                        <td></td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-sm font-bold text-gray-900">
                          {formatCurrency(showCost ? partsCostAtCost : partsCost)}
                        </td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        {/* ===== LABOR SECTION ===== */}
        <Card
          title="Labor"
          headerActions={
            (isQuote || permissions.workOrders.canAddLabor(currentUser) || permissions.workOrders.canAddLaborOwn(currentUser)) && (
              <Button onClick={openAddLaborModal} variant="primary" size="sm">Add Labor</Button>
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
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{formatCurrency(labor.rate)}{isHourly ? '/hr' : '/ea'}</td>
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
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-2 text-sm font-bold text-gray-900">Total</td>
                    <td className="px-4 py-2 text-sm font-bold text-gray-900">{laborTotalQty}</td>
                    <td></td>
                    <td className="px-4 py-2 text-sm font-bold text-gray-900">{formatCurrency(laborCost)}</td>
                    <td></td>
                  </tr>
                </tfoot>
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
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{editingPart ? 'Edit Part' : 'Add Part'}</h3>
              <button onClick={() => { setPartModalOpen(false); setEditingPart(null); setDetectedHostname(null); }}
                className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Part Name</label>
                <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.name} onChange={(e) => setNewPart({ ...newPart, name: e.target.value })} required autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Part Number</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.partNumber} onChange={(e) => setNewPart({ ...newPart, partNumber: e.target.value })} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Category</label>
                    {isAdminOrManagement(currentUser) && (
                      <button type="button" onClick={() => setManagingCategories(!managingCategories)}
                        className="text-xs text-gray-400 hover:text-gray-600" title="Manage categories">
                        <i className={`fas fa-${managingCategories ? 'times' : 'cog'}`}></i>
                      </button>
                    )}
                  </div>
                  {managingCategories ? (
                    <div className="border border-gray-300 rounded-md p-2 space-y-1 max-h-40 overflow-y-auto">
                      {categoryList.map(cat => (
                        <div key={cat} className="flex items-center justify-between py-1 px-2 hover:bg-gray-50 rounded">
                          <span className="text-sm text-gray-700">{cat}</span>
                          <button type="button" onClick={() => handleRemoveCategory(cat)}
                            className="text-red-400 hover:text-red-600 ml-2" title={`Remove ${cat}`}>
                            <i className="fas fa-minus-circle text-sm"></i>
                          </button>
                        </div>
                      ))}
                      {categoryList.length === 0 && <p className="text-xs text-gray-400 text-center py-1">No categories</p>}
                      <button type="button" onClick={() => { setManagingCategories(false); setAddingNewCategory(true); setNewCategoryName(''); }}
                        className="w-full text-xs text-green-600 hover:text-green-800 py-1 border-t border-gray-200 mt-1">
                        Add Category
                      </button>
                    </div>
                  ) : (
                    <>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        value={isOtherCategory ? 'Other' : (addingNewCategory ? '__add_new__' : newPart.category)}
                        onChange={(e) => handleCategoryChange(e.target.value)}>
                        <option value="">None</option>
                        {categoryList.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                        <option value="Other">Other</option>
                        {isAdminOrManagement(currentUser) && (
                          <option value="__add_new__">+ Add Category</option>
                        )}
                      </select>
                      {isOtherCategory && (
                        <input type="text" placeholder="Enter custom category"
                          className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={newPart.category} onChange={(e) => setNewPart({ ...newPart, category: e.target.value })} />
                      )}
                      {addingNewCategory && (
                        <div className="mt-2 flex gap-1 items-center">
                          <input type="text" placeholder="New category name"
                            className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-sm"
                            value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewCategory(); } }} />
                          <button type="button" onClick={handleSaveNewCategory}
                            className="p-1.5 bg-green-600 text-white rounded-md hover:bg-green-700" title="Save">
                            <i className="fas fa-check text-xs"></i>
                          </button>
                          <button type="button" onClick={() => { setAddingNewCategory(false); setNewPart({ ...newPart, category: '' }); }}
                            className="p-1.5 border border-gray-300 text-gray-500 rounded-md hover:bg-gray-50" title="Cancel">
                            <i className="fas fa-times text-xs"></i>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Vendor / Purchase Location</label>
                  {isAdminOrManagement(currentUser) && (
                    <button type="button" onClick={() => setManagingVendors(!managingVendors)}
                      className="text-xs text-gray-400 hover:text-gray-600" title="Manage vendors">
                      <i className={`fas fa-${managingVendors ? 'times' : 'cog'}`}></i>
                    </button>
                  )}
                </div>
                {managingVendors ? (
                  <div className="border border-gray-300 rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
                    {vendorList.map(vendor => (
                      <div key={vendor} className="flex items-center justify-between py-1 px-2 hover:bg-gray-50 rounded">
                        <span className="text-sm text-gray-700">{vendor}</span>
                        <button type="button" onClick={() => handleRemoveVendor(vendor)}
                          className="text-red-400 hover:text-red-600 ml-2" title={`Remove ${vendor}`}>
                          <i className="fas fa-minus-circle text-sm"></i>
                        </button>
                      </div>
                    ))}
                    {vendorList.length === 0 && <p className="text-xs text-gray-400 text-center py-1">No vendors</p>}
                    <button type="button" onClick={() => { setManagingVendors(false); setAddingNewVendor(true); setNewVendorName(''); setNewVendorHostname(''); }}
                      className="w-full text-xs text-green-600 hover:text-green-800 py-1 border-t border-gray-200 mt-1">
                      Add Vendor
                    </button>
                  </div>
                ) : (
                  <>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 mb-2"
                      value={isOtherVendor ? 'Other' : (addingNewVendor ? '__add_new__' : newPart.vendor)}
                      onChange={(e) => handleVendorChange(e.target.value)}>
                      <option value="">Select a vendor...</option>
                      {vendorList.map(vendor => (<option key={vendor} value={vendor}>{vendor}</option>))}
                      <option value="Other">Other</option>
                      {isAdminOrManagement(currentUser) && (
                        <option value="__add_new__">+ Add Vendor</option>
                      )}
                    </select>
                    {detectedHostname && !newPart.vendor && !addingNewVendor && (
                      <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between text-sm">
                        <span className="text-blue-800">
                          <i className="fas fa-globe mr-1"></i>
                          Detected: <strong>{detectedHostname.hostname}</strong>
                        </span>
                        <div className="flex gap-1 ml-2">
                          {isAdminOrManagement(currentUser) && (
                            <button type="button" onClick={() => {
                              setAddingNewVendor(true);
                              setNewVendorName(detectedHostname.suggestedName);
                              setNewVendorHostname(detectedHostname.hostname);
                              setDetectedHostname(null);
                            }} className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
                              Add as Vendor
                            </button>
                          )}
                          <button type="button" onClick={() => {
                            setNewPart(prev => ({ ...prev, vendor: detectedHostname.suggestedName }));
                            setIsOtherVendor(true);
                            setDetectedHostname(null);
                          }} className="px-2 py-1 border border-blue-300 text-blue-700 rounded text-xs hover:bg-blue-100">
                            Use Once
                          </button>
                        </div>
                      </div>
                    )}
                    {isOtherVendor && (
                      <input type="text" placeholder="Enter custom vendor name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        value={newPart.vendor} onChange={(e) => setNewPart({ ...newPart, vendor: e.target.value })} />
                    )}
                    {addingNewVendor && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input type="text" placeholder="New vendor name"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                            value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewVendor(); } }} />
                        </div>
                        <input type="text" placeholder="Website URL for auto-detect (optional, e.g. testcorp.com)"
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-sm"
                          value={newVendorHostname} onChange={(e) => setNewVendorHostname(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNewVendor(); } }} />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleSaveNewVendor}
                            className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm">Save</button>
                          <button type="button" onClick={() => { setAddingNewVendor(false); setNewVendorName(''); setNewVendorHostname(''); setNewPart({ ...newPart, vendor: '' }); }}
                            className="px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm">Cancel</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product URL</label>
                <div className="flex items-start">
                  <input type="url" placeholder="https://..." className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.url} onChange={(e) => handleUrlChange(e.target.value)} />
                  <UrlExtractButton
                    url={newPart.url}
                    onExtracted={(data) => setNewPart(prev => ({
                      ...prev,
                      name: prev.name || data.name || '',
                      partNumber: prev.partNumber || data.partNumber || '',
                      cost: prev.cost || (data.cost != null ? data.cost : data.price != null ? data.price : 0),
                      price: prev.price || (data.price != null ? data.price : 0),
                      vendor: prev.vendor || data.vendor || '',
                      brand: prev.brand || data.brand || '',
                      warranty: prev.warranty || data.warranty || ''
                    }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PO / Order Number</label>
                <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.purchaseOrderNumber} onChange={(e) => setNewPart({ ...newPart, purchaseOrderNumber: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source VIN <span className="text-xs text-gray-500">(used parts)</span></label>
                  <input type="text" placeholder="VIN of source vehicle" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.vin} onChange={(e) => setNewPart({ ...newPart, vin: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock Number <span className="text-xs text-gray-500">(used parts)</span></label>
                  <input type="text" placeholder="Stock # of source vehicle" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.stockNumber} onChange={(e) => setNewPart({ ...newPart, stockNumber: e.target.value })} />
                </div>
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
                      if (overridePrice) {
                        setNewPart({ ...newPart, cost });
                      } else {
                        const multiplier = 1 + markupPercentage / 100;
                        setNewPart({ ...newPart, cost, price: parseFloat((cost * multiplier).toFixed(2)) });
                      }
                    }} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retail Price</label>
                  <input type="number" min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.price} onChange={(e) => {
                      const price = parseFloat(e.target.value) || 0;
                      if (overridePrice) {
                        setNewPart({ ...newPart, price });
                      } else {
                        const multiplier = 1 + markupPercentage / 100;
                        setNewPart({ ...newPart, price, cost: parseFloat((price / multiplier).toFixed(2)) });
                      }
                    }} />
                </div>
              </div>
              <div className="flex items-center">
                <input type="checkbox" id="overridePrice" className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  checked={overridePrice} onChange={(e) => setOverridePrice(e.target.checked)} />
                <label htmlFor="overridePrice" className="ml-2 block text-sm text-gray-700">Override price calculations</label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Core Charge</label>
                  <input type="number" min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={newPart.coreCharge} onChange={(e) => setNewPart({ ...newPart, coreCharge: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center">
                    <input type="checkbox" className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      checked={newPart.coreChargeInvoiceable} onChange={(e) => setNewPart({ ...newPart, coreChargeInvoiceable: e.target.checked })} />
                    <span className="ml-2 text-sm text-gray-700">Show on invoice</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Part Warranty <span className="text-xs text-gray-500">(customer-facing)</span></label>
                <input type="text" placeholder="e.g., 2 year / 24,000 mile" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.warranty} onChange={(e) => setNewPart({ ...newPart, warranty: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes <span className="text-xs text-gray-500">(not shown on invoice)</span></label>
                <textarea rows="2" placeholder="Internal notes about this part..." className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={newPart.notes} onChange={(e) => setNewPart({ ...newPart, notes: e.target.value })} />
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
              <Button variant="light" onClick={() => { setPartModalOpen(false); setEditingPart(null); setDetectedHostname(null); }}>Cancel</Button>
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


      {/* Import Parts Modal */}
      <ReceiptImportModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        entityId={id}
        onSuccess={handleReceiptImportSuccess}
        markupPercentage={markupPercentage}
      />

      {/* Inventory & Service modals */}
      <InventoryPickerModal
        isOpen={inventoryModalOpen}
        onClose={() => setInventoryModalOpen(false)}
        onConfirm={handleAddFromInventory}
        isLoading={inventoryModalLoading}
      />
      <ServicePackageModal
        isOpen={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        onConfirm={handleAddServicePackage}
        isLoading={serviceModalLoading}
      />
      <ServicePackageCommitModal
        isOpen={serviceCommitModalOpen}
        onClose={() => {
          setServiceCommitModalOpen(false);
          setServiceCommitModalData(null);
        }}
        onConfirm={handleConfirmCommitServicePackage}
        servicePackage={serviceCommitModalData?.package}
        isLoading={serviceCommitLoading}
      />
      <UncommittedServicesWarningModal
        isOpen={uncommittedWarningModalOpen}
        onClose={() => {
          setUncommittedWarningModalOpen(false);
          setUncommittedPackagesForWarning([]);
          setUncommittedPartsForWarning([]);
        }}
        uncommittedPackages={uncommittedPackagesForWarning}
        uncommittedParts={uncommittedPartsForWarning}
        onProceedAnyway={handleProceedWithInvoiceAnyway}
        onCommitPackage={handleCommitFromWarningModal}
        onCommitPart={handleCommitPartFromWarningModal}
      />
      <ServicePackageRemovalModal
        isOpen={serviceRemovalModalOpen}
        onClose={() => {
          setServiceRemovalModalOpen(false);
          setServiceRemovalData(null);
        }}
        onConfirm={handleConfirmRemoveServicePackage}
        servicePackage={serviceRemovalData?.package}
      />
      <PartCommitModal
        isOpen={partCommitModalOpen}
        onClose={() => {
          setPartCommitModalOpen(false);
          setPartCommitModalData(null);
        }}
        onConfirm={handleConfirmCommitPart}
        part={partCommitModalData?.part}
        isLoading={partCommitLoading}
      />
      <PartRemovalModal
        isOpen={partRemovalModalOpen}
        onClose={() => {
          setPartRemovalModalOpen(false);
          setPartRemovalData(null);
        }}
        onConfirm={handleConfirmRemovePart}
        part={partRemovalData?.part}
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
      <FollowUpModal
        isOpen={followUpModalOpen}
        onClose={() => setFollowUpModalOpen(false)}
        entityType={isQuote ? 'quote' : 'workOrder'}
        entityId={id}
      />
      <DiscountModal
        isOpen={discountModalOpen}
        onClose={() => setDiscountModalOpen(false)}
        existingDiscount={workOrder.discount}
        parts={workOrder.parts || []}
        labor={workOrder.labor || []}
        servicePackages={workOrder.servicePackages || []}
        onApply={async (discount) => {
          try {
            const response = await DocumentService.updateDocument(id, { discount });
            setWorkOrder(response.data.workOrder);
            setDiscountModalOpen(false);
          } catch (err) {
            console.error('Error applying discount:', err);
            setError('Failed to apply coupon.');
          }
        }}
        onRemove={async () => {
          try {
            const response = await DocumentService.updateDocument(id, { discount: null });
            setWorkOrder(response.data.workOrder);
            setDiscountModalOpen(false);
          } catch (err) {
            console.error('Error removing discount:', err);
            setError('Failed to remove coupon.');
          }
        }}
      />
    </div>
  );
};

export default DocumentDetail;
