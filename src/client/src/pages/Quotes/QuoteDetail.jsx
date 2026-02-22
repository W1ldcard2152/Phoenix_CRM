import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import TextArea from '../../components/common/TextArea';
import QuoteService from '../../services/quoteService';
import WorkOrderService from '../../services/workOrderService';
import workOrderNotesService from '../../services/workOrderNotesService';
import QuoteDisplay from '../../components/quotes/QuoteDisplay';
import ConvertQuoteModal from '../../components/quotes/ConvertQuoteModal';
import { formatCurrency } from '../../utils/formatters';
import businessConfig from '../../config/businessConfig';
import { generatePdfFilename, generatePdfFromHtml, printHtml, generateDocumentHtml } from '../../utils/pdfUtils';

const QuoteDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const printableRef = useRef(); // Keep for QuoteDisplay component
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);

  const predefinedVendors = [
    'Walmart', 'Tractor Supply', 'Advance Auto Parts', 'Autozone',
    'Napa Auto Parts', 'Rock Auto', 'eBay.com', 'Amazon.com',
    'ECS Tuning', 'FCP Euro', 'Other'
  ];

  // Business settings from centralized config (for QuoteDisplay component)
  const businessSettings = {
    businessName: businessConfig.name,
    businessAddressLine1: businessConfig.addressLine1,
    businessAddressLine2: businessConfig.addressLine2,
    businessPhone: businessConfig.phone,
    businessEmail: businessConfig.email,
    businessWebsite: businessConfig.website,
    businessLogo: businessConfig.logo
  };

  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [laborModalOpen, setLaborModalOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // Notes state
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesFilter, setNotesFilter] = useState('all');
  const [newNote, setNewNote] = useState({ content: '', isCustomerFacing: false });
  const [addingNote, setAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState(null);

  // Parts/Labor editing
  const [editingPart, setEditingPart] = useState(null);
  const [editingLabor, setEditingLabor] = useState(null);
  const [isOtherVendor, setIsOtherVendor] = useState(false);
  const [newPart, setNewPart] = useState({
    name: '', partNumber: '', itemNumber: '', quantity: 1,
    price: 0, cost: 0, vendor: '', supplier: '', purchaseOrderNumber: ''
  });
  const [newLabor, setNewLabor] = useState({
    description: '', hours: 1, rate: 75
  });

  useEffect(() => {
    const fetchQuoteData = async () => {
      try {
        setLoading(true);
        const response = await QuoteService.getQuote(id);
        setQuote(response.data.workOrder);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching quote details:', err);
        setError('Failed to load quote details.');
        setLoading(false);
      }
    };
    fetchQuoteData();
  }, [id]);

  const fetchNotes = useCallback(async () => {
    try {
      setNotesLoading(true);
      const url = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/workorders/${id}/notes`;
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.data && data.data.notes) {
        const regularNotes = data.data.notes.filter(note => note.noteType !== 'interaction');
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

  useEffect(() => {
    if (quote) fetchNotes();
  }, [quote, fetchNotes]);

  // Vendor handler
  const handleVendorChange = (selectedVendor) => {
    if (selectedVendor === 'Other') {
      setIsOtherVendor(true);
      setNewPart({ ...newPart, vendor: '' });
    } else {
      setIsOtherVendor(false);
      setNewPart({ ...newPart, vendor: selectedVendor });
    }
  };

  // Parts CRUD
  const handleAddPart = async () => {
    if (!newPart.name) {
      setError('Part name is required');
      return;
    }
    try {
      const updatedQuote = { ...quote };
      updatedQuote.parts = [...(updatedQuote.parts || []), { ...newPart }];
      const response = await WorkOrderService.updateWorkOrder(id, updatedQuote);
      setQuote(response.data.workOrder);
      setPartModalOpen(false);
      setNewPart({ name: '', partNumber: '', itemNumber: '', quantity: 1, price: 0, cost: 0, vendor: '', supplier: '', purchaseOrderNumber: '' });
      setIsOtherVendor(false);
      setError(null);
    } catch (err) {
      console.error('Error adding part:', err);
      setError('Failed to add part.');
    }
  };

  const handleUpdatePart = async (partIndex, updatedPart) => {
    try {
      const updatedQuote = { ...quote };
      updatedQuote.parts = [...quote.parts];
      updatedQuote.parts[partIndex] = updatedPart;
      const response = await WorkOrderService.updateWorkOrder(id, updatedQuote);
      setQuote(response.data.workOrder);
      setEditingPart(null);
      setError(null);
    } catch (err) {
      console.error('Error updating part:', err);
      setError('Failed to update part.');
    }
  };

  const handleDeletePart = async (partIndex) => {
    if (!window.confirm('Remove this part from the quote?')) return;
    try {
      const updatedQuote = { ...quote };
      updatedQuote.parts = quote.parts.filter((_, i) => i !== partIndex);
      const response = await WorkOrderService.updateWorkOrder(id, updatedQuote);
      setQuote(response.data.workOrder);
      setError(null);
    } catch (err) {
      console.error('Error deleting part:', err);
      setError('Failed to remove part.');
    }
  };

  // Labor CRUD
  const handleAddLabor = async () => {
    if (!newLabor.description) {
      setError('Labor description is required');
      return;
    }
    try {
      const updatedQuote = { ...quote };
      updatedQuote.labor = [...(updatedQuote.labor || []), { ...newLabor }];
      const response = await WorkOrderService.updateWorkOrder(id, updatedQuote);
      setQuote(response.data.workOrder);
      setLaborModalOpen(false);
      setNewLabor({ description: '', hours: 1, rate: 75 });
      setError(null);
    } catch (err) {
      console.error('Error adding labor:', err);
      setError('Failed to add labor.');
    }
  };

  const handleUpdateLabor = async (laborIndex, updatedLabor) => {
    try {
      const updatedQuote = { ...quote };
      updatedQuote.labor = [...quote.labor];
      updatedQuote.labor[laborIndex] = updatedLabor;
      const response = await WorkOrderService.updateWorkOrder(id, updatedQuote);
      setQuote(response.data.workOrder);
      setEditingLabor(null);
      setError(null);
    } catch (err) {
      console.error('Error updating labor:', err);
      setError('Failed to update labor.');
    }
  };

  const handleDeleteLabor = async (laborIndex) => {
    if (!window.confirm('Remove this labor entry from the quote?')) return;
    try {
      const updatedQuote = { ...quote };
      updatedQuote.labor = quote.labor.filter((_, i) => i !== laborIndex);
      const response = await WorkOrderService.updateWorkOrder(id, updatedQuote);
      setQuote(response.data.workOrder);
      setError(null);
    } catch (err) {
      console.error('Error deleting labor:', err);
      setError('Failed to remove labor.');
    }
  };

  // Notes handlers
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

  // Convert to Work Order (via modal)
  const handleConvertToWorkOrder = async (data = {}) => {
    try {
      setConverting(true);
      const response = await QuoteService.convertToWorkOrder(id, data);

      // If partial conversion created a new WO
      if (response.data.quote) {
        // Partial conversion - refresh quote data
        setQuote(response.data.quote);
        setSuccessMessage(
          `Work order created successfully! `
        );
        setConverting(false);
        setConvertModalOpen(false);

        // If quote was archived (all items converted), show notice
        if (response.data.quoteArchived) {
          navigate(`/work-orders/${response.data.workOrder._id}`);
        }
      } else {
        // Full conversion - navigate to work order
        navigate(`/work-orders/${response.data.workOrder._id}`);
      }
    } catch (err) {
      console.error('Error converting quote:', err);
      setError('Failed to convert quote to work order.');
      setConverting(false);
    }
  };

  // Archive quote
  const handleArchiveQuote = async () => {
    if (!window.confirm('Archive this quote? It will be hidden from the active quotes list.')) return;
    try {
      setArchiving(true);
      await QuoteService.archiveQuote(id);
      navigate('/quotes');
    } catch (err) {
      console.error('Error archiving quote:', err);
      setError('Failed to archive quote.');
      setArchiving(false);
    }
  };

  // Unarchive quote
  const handleUnarchiveQuote = async () => {
    try {
      await QuoteService.unarchiveQuote(id);
      // Reload quote data
      const response = await QuoteService.getQuote(id);
      setQuote(response.data.workOrder);
    } catch (err) {
      console.error('Error unarchiving quote:', err);
      setError('Failed to unarchive quote.');
    }
  };

  // Delete quote
  const handleDeleteQuote = async () => {
    try {
      await QuoteService.deleteQuote(id);
      navigate('/quotes');
    } catch (err) {
      console.error('Error deleting quote:', err);
      setError('Failed to delete quote.');
    }
  };

  // Download PDF handler
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // Get document data for printing/PDF
  const getDocumentData = () => ({
    documentNumber: quote._id?.slice(-8).toUpperCase(),
    documentDate: quote.createdAt,
    status: quote.status,
    customer: quote.customer,
    vehicle: quote.vehicle,
    serviceRequested: quote.serviceRequested,
    parts: quote.parts || [],
    labor: quote.labor || [],
    customerFacingNotes: notes.filter(n => n.isCustomerFacing)
  });

  // Print handler
  const handlePrint = () => {
    if (!quote) return;
    const html = generateDocumentHtml('quote', getDocumentData());
    printHtml(html);
  };

  // Download PDF handler
  const handleDownloadPDF = async () => {
    if (!quote) return;
    setGeneratingPDF(true);
    try {
      const html = generateDocumentHtml('quote', getDocumentData());
      const filename = generatePdfFilename(
        quote.customer?.name,
        quote.vehicle?.make,
        quote.vehicle?.model
      );
      await generatePdfFromHtml(html, filename);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError(`Failed to generate PDF: ${err.message}`);
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading quote data...</p>
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="container mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="container mx-auto">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          Quote not found.
        </div>
      </div>
    );
  }

  // If the quote has been archived, show a notice with unarchive option
  if (quote.status === 'Quote - Archived') {
    return (
      <div className="container mx-auto">
        <div className="bg-gray-100 border border-gray-400 text-gray-700 px-4 py-3 rounded flex items-center justify-between">
          <span><i className="fas fa-archive mr-2"></i>This quote has been archived.</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleUnarchiveQuote}>
              <i className="fas fa-undo mr-1"></i>Unarchive
            </Button>
            <Button to="/quotes" variant="light" size="sm">
              Back to Quotes
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // If the quote has been converted to a work order, show a notice
  if (quote.status !== 'Quote' && quote.status !== 'Quote - Archived') {
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

  // Calculate totals
  const partsCost = (quote.parts || []).reduce((total, part) => total + (part.price * part.quantity), 0);
  const laborCost = (quote.labor || []).reduce((total, labor) => {
    const qty = labor.quantity || labor.hours || 0;
    return total + (qty * labor.rate);
  }, 0);
  const subtotal = partsCost + laborCost;
  const taxRate = 0.08;
  const taxAmount = subtotal * taxRate;
  const totalWithTax = subtotal + taxAmount;

  // Age
  const quoteAgeDays = Math.floor((new Date() - new Date(quote.date)) / (1000 * 60 * 60 * 24));
  const getAgeBadge = () => {
    if (quoteAgeDays <= 7) return 'bg-green-100 text-green-800';
    if (quoteAgeDays <= 30) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="container mx-auto">
      {/* Hidden printable section */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <QuoteDisplay
          ref={printableRef}
          quoteData={quote}
          businessSettings={businessSettings}
          partsCost={partsCost}
          laborCost={laborCost}
          subtotal={subtotal}
          taxRate={8}
          taxAmount={taxAmount}
          total={totalWithTax}
        />
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Quote: {quote.services && quote.services.length > 0
              ? quote.services[0].description
              : quote.serviceRequested || 'No Description'}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              Quote
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAgeBadge()}`}>
              {quoteAgeDays === 0 ? 'Today' : quoteAgeDays === 1 ? '1 day old' : `${quoteAgeDays} days old`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => setConvertModalOpen(true)}
            disabled={converting}
          >
            <i className="fas fa-arrow-right mr-1"></i>Convert to Work Order
          </Button>
          <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
            <i className="fas fa-trash mr-1"></i>Delete
          </Button>
          {/* More Actions Dropdown */}
          <div className="relative">
            <Button variant="outline" onClick={() => setMoreActionsOpen(!moreActionsOpen)}>
              More Actions<span className="ml-2">☰</span>
            </Button>
            {moreActionsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMoreActionsOpen(false)}></div>
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                  <Link
                    to={`/quotes/${id}/edit`}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setMoreActionsOpen(false)}
                  >
                    <i className="fas fa-edit mr-2"></i>Edit
                  </Link>
                  <button
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => { handlePrint(); setMoreActionsOpen(false); }}
                  >
                    <i className="fas fa-print mr-2"></i>Print
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => { handleDownloadPDF(); setMoreActionsOpen(false); }}
                    disabled={generatingPDF}
                  >
                    <i className={`fas ${generatingPDF ? 'fa-spinner fa-spin' : 'fa-download'} mr-2`}></i>
                    {generatingPDF ? 'Generating...' : 'Download'}
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => { handleArchiveQuote(); setMoreActionsOpen(false); }}
                    disabled={archiving}
                  >
                    <i className={`fas ${archiving ? 'fa-spinner fa-spin' : 'fa-archive'} mr-2`}></i>
                    {archiving ? 'Archiving...' : 'Archive'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Follow-up Banner */}
      {quoteAgeDays >= 8 && quoteAgeDays <= 14 && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-4 flex items-center">
          <i className="fas fa-phone mr-2"></i>
          This quote is 1+ weeks old. Consider a friendly check-in with the customer.
        </div>
      )}
      {quoteAgeDays >= 15 && quoteAgeDays <= 30 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-4 flex items-center">
          <i className="fas fa-phone mr-2"></i>
          This quote is 2+ weeks old. Follow up with the customer.
        </div>
      )}
      {quoteAgeDays >= 31 && quoteAgeDays <= 60 && (
        <div className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded mb-4 flex items-center">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          This quote is 1+ months old. Consider following up or archiving.
        </div>
      )}
      {quoteAgeDays > 60 && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 flex items-center">
          <i className="fas fa-archive mr-2"></i>
          This quote is over 2 months old. Consider archiving.
        </div>
      )}

      {/* Success Message */}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Customer & Vehicle Card */}
        <Card title="Customer & Vehicle">
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Customer</p>
              {quote.customer?._id ? (
                <Link
                  to={`/customers/${quote.customer._id}`}
                  className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
                >
                  {quote.customer.name}
                </Link>
              ) : (
                <p className="font-medium text-gray-400">Unknown Customer</p>
              )}
              {quote.customer?.phone && (
                <p className="text-sm text-gray-600">{quote.customer.phone}</p>
              )}
              {quote.customer?.email && (
                <p className="text-sm text-gray-600">{quote.customer.email}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">Vehicle</p>
              {quote.vehicle ? (
                <Link
                  to={`/vehicles/${quote.vehicle._id}`}
                  className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
                >
                  {quote.vehicle.year} {quote.vehicle.make} {quote.vehicle.model}
                </Link>
              ) : (
                <p className="font-medium text-gray-400">No Vehicle</p>
              )}
              {quote.vehicle?.vin && (
                <p className="text-sm text-gray-600">VIN: {quote.vehicle.vin}</p>
              )}
              {quote.vehicle?.licensePlate && (
                <p className="text-sm text-gray-600">Plate: {quote.vehicle.licensePlate}</p>
              )}
            </div>
            {quote.currentMileage > 0 && (
              <div>
                <p className="text-sm text-gray-500">Current Mileage</p>
                <p className="font-medium">{quote.currentMileage.toLocaleString()} mi</p>
              </div>
            )}
          </div>
        </Card>

        {/* Totals Card */}
        <Card title="Quote Summary">
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
              <span className="text-sm text-gray-600">Tax (8%)</span>
              <span className="font-medium">{formatCurrency(taxAmount)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="text-lg font-bold text-gray-900">Total</span>
              <span className="text-lg font-bold text-gray-900">{formatCurrency(totalWithTax)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Quote Details Card */}
      <Card title="Quote Details" className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">Date</p>
            <p className="font-medium">{new Date(quote.date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Priority</p>
            <p className="font-medium">{quote.priority}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Services</p>
            {quote.services && quote.services.length > 0 ? (
              <ul className="list-disc list-inside">
                {quote.services.map((service, index) => (
                  <li key={index} className="font-medium">{service.description}</li>
                ))}
              </ul>
            ) : (
              <p className="font-medium">{quote.serviceRequested || 'None specified'}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Parts Section */}
      <Card
        title="Parts"
        headerActions={
          <Button variant="primary" size="sm" onClick={() => setPartModalOpen(true)}>
            <i className="fas fa-plus mr-1"></i>Add Part
          </Button>
        }
        className="mb-6"
      >
        {quote.parts && quote.parts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Part</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Part #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {quote.parts.map((part, index) => (
                  <tr key={part._id || index}>
                    {editingPart === index ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={part.name}
                            onChange={(e) => {
                              const updated = [...quote.parts];
                              updated[index] = { ...updated[index], name: e.target.value };
                              setQuote({ ...quote, parts: updated });
                            }}
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={part.partNumber || ''}
                            onChange={(e) => {
                              const updated = [...quote.parts];
                              updated[index] = { ...updated[index], partNumber: e.target.value };
                              setQuote({ ...quote, parts: updated });
                            }}
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={part.vendor || ''}
                            onChange={(e) => {
                              const updated = [...quote.parts];
                              updated[index] = { ...updated[index], vendor: e.target.value };
                              setQuote({ ...quote, parts: updated });
                            }}
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="1"
                            value={part.quantity}
                            onChange={(e) => {
                              const updated = [...quote.parts];
                              updated[index] = { ...updated[index], quantity: parseInt(e.target.value) || 1 };
                              setQuote({ ...quote, parts: updated });
                            }}
                            className="w-20 border rounded px-2 py-1 text-sm text-right"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={part.price}
                            onChange={(e) => {
                              const updated = [...quote.parts];
                              updated[index] = { ...updated[index], price: parseFloat(e.target.value) || 0 };
                              setQuote({ ...quote, parts: updated });
                            }}
                            className="w-24 border rounded px-2 py-1 text-sm text-right"
                          />
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-medium">
                          {formatCurrency(part.price * part.quantity)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => handleUpdatePart(index, quote.parts[index])}
                            className="text-green-600 hover:text-green-800 mr-2"
                          >
                            <i className="fas fa-check"></i>
                          </button>
                          <button
                            onClick={() => setEditingPart(null)}
                            className="text-gray-600 hover:text-gray-800"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{part.name}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{part.partNumber || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{part.vendor || '-'}</td>
                        <td className="px-4 py-2 text-sm text-right">{part.quantity}</td>
                        <td className="px-4 py-2 text-sm text-right">{formatCurrency(part.price)}</td>
                        <td className="px-4 py-2 text-sm text-right font-medium">{formatCurrency(part.price * part.quantity)}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => setEditingPart(index)}
                            className="text-primary-600 hover:text-primary-800 mr-2"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDeletePart(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan="5" className="px-4 py-2 text-right text-sm font-medium text-gray-700">Parts Total:</td>
                  <td className="px-4 py-2 text-right text-sm font-bold">{formatCurrency(partsCost)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">No parts added yet.</p>
        )}
      </Card>

      {/* Labor Section */}
      <Card
        title="Labor"
        headerActions={
          <Button variant="primary" size="sm" onClick={() => setLaborModalOpen(true)}>
            <i className="fas fa-plus mr-1"></i>Add Labor
          </Button>
        }
        className="mb-6"
      >
        {quote.labor && quote.labor.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {quote.labor.map((labor, index) => (
                  <tr key={labor._id || index}>
                    {editingLabor === index ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={labor.description}
                            onChange={(e) => {
                              const updated = [...quote.labor];
                              updated[index] = { ...updated[index], description: e.target.value };
                              setQuote({ ...quote, labor: updated });
                            }}
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={labor.hours}
                            onChange={(e) => {
                              const updated = [...quote.labor];
                              updated[index] = { ...updated[index], hours: parseFloat(e.target.value) || 0 };
                              setQuote({ ...quote, labor: updated });
                            }}
                            className="w-20 border rounded px-2 py-1 text-sm text-right"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={labor.rate}
                            onChange={(e) => {
                              const updated = [...quote.labor];
                              updated[index] = { ...updated[index], rate: parseFloat(e.target.value) || 0 };
                              setQuote({ ...quote, labor: updated });
                            }}
                            className="w-24 border rounded px-2 py-1 text-sm text-right"
                          />
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-medium">
                          {formatCurrency(labor.hours * labor.rate)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => handleUpdateLabor(index, quote.labor[index])}
                            className="text-green-600 hover:text-green-800 mr-2"
                          >
                            <i className="fas fa-check"></i>
                          </button>
                          <button
                            onClick={() => setEditingLabor(null)}
                            className="text-gray-600 hover:text-gray-800"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{labor.description}</td>
                        <td className="px-4 py-2 text-sm text-right">{labor.quantity || labor.hours}{labor.billingType !== 'fixed' ? ' hrs' : ''}</td>
                        <td className="px-4 py-2 text-sm text-right">{formatCurrency(labor.rate)}{labor.billingType !== 'fixed' ? '/hr' : ''}</td>
                        <td className="px-4 py-2 text-sm text-right font-medium">{formatCurrency((labor.quantity || labor.hours) * labor.rate)}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => setEditingLabor(index)}
                            className="text-primary-600 hover:text-primary-800 mr-2"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteLabor(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan="3" className="px-4 py-2 text-right text-sm font-medium text-gray-700">Labor Total:</td>
                  <td className="px-4 py-2 text-right text-sm font-bold">{formatCurrency(laborCost)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">No labor added yet.</p>
        )}
      </Card>

      {/* Notes Section */}
      <Card title="Notes" className="mb-6">
        {/* Note filters */}
        <div className="flex space-x-2 mb-4">
          {['all', 'customer', 'private'].map((filter) => (
            <button
              key={filter}
              onClick={() => setNotesFilter(filter)}
              className={`px-3 py-1 rounded-full text-sm ${
                notesFilter === filter
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {filter === 'all' ? 'All' : filter === 'customer' ? 'Customer-Facing' : 'Private'}
            </button>
          ))}
        </div>

        {/* Notes list */}
        {notesLoading ? (
          <p className="text-gray-500 text-center py-4">Loading notes...</p>
        ) : getFilteredNotes().length > 0 ? (
          <div className="space-y-3 mb-4">
            {getFilteredNotes().map((note) => (
              <div key={note._id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      note.isCustomerFacing ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {note.isCustomerFacing ? 'Customer-Facing' : 'Private'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(note.createdAt).toLocaleString()}
                    </span>
                    {note.createdByName && (
                      <span className="text-xs text-gray-500">by {note.createdByName}</span>
                    )}
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setEditingNote(note)}
                      className="text-gray-400 hover:text-primary-600"
                    >
                      <i className="fas fa-edit text-xs"></i>
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note._id)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </button>
                  </div>
                </div>
                {editingNote && editingNote._id === note._id ? (
                  <div>
                    <textarea
                      value={editingNote.content}
                      onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                      className="w-full border rounded p-2 text-sm"
                      rows={3}
                    />
                    <div className="flex items-center space-x-2 mt-2">
                      <label className="flex items-center text-sm">
                        <input
                          type="checkbox"
                          checked={editingNote.isCustomerFacing}
                          onChange={(e) => setEditingNote({ ...editingNote, isCustomerFacing: e.target.checked })}
                          className="mr-2"
                        />
                        Customer-Facing
                      </label>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleUpdateNote(note._id, {
                          content: editingNote.content,
                          isCustomerFacing: editingNote.isCustomerFacing
                        })}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="light" onClick={() => setEditingNote(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-2 mb-4">No notes yet.</p>
        )}

        {/* Add note form */}
        <div className="border-t pt-4">
          <textarea
            value={newNote.content}
            onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
            placeholder="Add a note..."
            className="w-full border rounded p-2 text-sm"
            rows={3}
          />
          <div className="flex items-center justify-between mt-2">
            <label className="flex items-center text-sm text-gray-600">
              <input
                type="checkbox"
                checked={newNote.isCustomerFacing}
                onChange={(e) => setNewNote({ ...newNote, isCustomerFacing: e.target.checked })}
                className="mr-2"
              />
              Customer-Facing
            </label>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddNote}
              disabled={addingNote || !newNote.content.trim()}
            >
              {addingNote ? 'Adding...' : 'Add Note'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Add Part Modal */}
      {partModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Add Part</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Part Name *</label>
                <input
                  type="text"
                  value={newPart.name}
                  onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Part name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Part Number</label>
                  <input
                    type="text"
                    value={newPart.partNumber}
                    onChange={(e) => setNewPart({ ...newPart, partNumber: e.target.value })}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                  <select
                    value={isOtherVendor ? 'Other' : newPart.vendor}
                    onChange={(e) => handleVendorChange(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select Vendor</option>
                    {predefinedVendors.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  {isOtherVendor && (
                    <input
                      type="text"
                      value={newPart.vendor}
                      onChange={(e) => setNewPart({ ...newPart, vendor: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm mt-2"
                      placeholder="Enter vendor name"
                    />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={newPart.quantity}
                    onChange={(e) => setNewPart({ ...newPart, quantity: parseInt(e.target.value) || 1 })}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPart.price}
                    onChange={(e) => setNewPart({ ...newPart, price: parseFloat(e.target.value) || 0 })}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPart.cost}
                    onChange={(e) => setNewPart({ ...newPart, cost: parseFloat(e.target.value) || 0 })}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <Button variant="light" onClick={() => setPartModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleAddPart}>Add Part</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Labor Modal */}
      {laborModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Labor</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input
                  type="text"
                  value={newLabor.description}
                  onChange={(e) => setNewLabor({ ...newLabor, description: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Labor description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={newLabor.hours}
                    onChange={(e) => setNewLabor({ ...newLabor, hours: parseFloat(e.target.value) || 0 })}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rate ($/hr)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newLabor.rate}
                    onChange={(e) => setNewLabor({ ...newLabor, rate: parseFloat(e.target.value) || 0 })}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <Button variant="light" onClick={() => setLaborModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleAddLabor}>Add Labor</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Quote?</h3>
            <p className="text-gray-600 mb-4">
              This will permanently delete this quote and all associated data. This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <Button variant="light" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleDeleteQuote}>Delete Quote</Button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Quote Modal */}
      <ConvertQuoteModal
        isOpen={convertModalOpen}
        onClose={() => setConvertModalOpen(false)}
        quote={quote}
        onConvert={handleConvertToWorkOrder}
      />
    </div>
  );
};

export default QuoteDetail;
