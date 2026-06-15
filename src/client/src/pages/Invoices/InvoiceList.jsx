import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import invoiceService from '../../services/invoiceService';
import workOrderNotesService from '../../services/workOrderNotesService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import { MobileCard, MobileSection, MobileContainer } from '../../components/common/ResponsiveTable';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { generatePdfFilename, generatePdfFromHtml, printHtml, generateDocumentHtml } from '../../utils/pdfUtils';
import { getCustomerFacingName } from '../../utils/nameUtils';
import settingsService from '../../services/settingsService';
import usePersistedState from '../../hooks/usePersistedState';

// Status presentation: pill className + icon + sort priority.
// Lower priority = floats to top when sorting by status.
const STATUS_META = {
  Overdue:   { label: 'Overdue',     className: 'bg-red-100 text-red-800',       icon: 'fa-exclamation-triangle', priority: 0 },
  Partial:   { label: 'Partial',     className: 'bg-yellow-100 text-yellow-800', icon: 'fa-adjust',               priority: 1 },
  Issued:    { label: 'Payment Due', className: 'bg-blue-100 text-blue-800',     icon: 'fa-envelope-open-text',   priority: 2 },
  Draft:     { label: 'Draft',       className: 'bg-gray-100 text-gray-700',     icon: 'fa-pencil-alt',           priority: 3 },
  Paid:      { label: 'Paid',        className: 'bg-green-100 text-green-800',   icon: 'fa-check-circle',         priority: 4 },
  Cancelled: { label: 'Cancelled',   className: 'bg-gray-100 text-gray-500',     icon: 'fa-ban',                  priority: 5 }
};

const STATUS_OPTIONS = ['Draft', 'Issued', 'Partial', 'Paid', 'Overdue', 'Cancelled'];
const TERMINAL_STATUSES = new Set(['Paid', 'Cancelled']);

const InvoiceList = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showServiceAdvisorOnInvoice, setShowServiceAdvisorOnInvoice] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTerminal, setShowTerminal] = usePersistedState('invoices:showTerminal', false);
  // Default sort: status (Overdue → top), then date desc as a tiebreaker via single key.
  const [sortConfig, setSortConfig] = usePersistedState('invoices:sortConfig:v1', [{ key: 'status', direction: 'asc' }]);
  const [generatingPDFId, setGeneratingPDFId] = useState(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(null); // invoiceId
  // Fixed-position coords for the open status menu so it escapes the table's overflow
  // clipping (the menu was getting cut off at the bottom edge of the table).
  const [statusMenuPos, setStatusMenuPos] = useState({ top: 0, right: 0 });
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        const [response, appSettings] = await Promise.all([
          invoiceService.getAllInvoices(),
          settingsService.getSettings()
        ]);
        setShowServiceAdvisorOnInvoice(appSettings.data?.settings?.showServiceAdvisorOnInvoice || false);
        if (response && response.data && Array.isArray(response.data.invoices)) {
          setInvoices(response.data.invoices);
        } else if (response && Array.isArray(response.invoices)) {
          setInvoices(response.invoices);
        } else {
          console.warn('Received unexpected data structure for invoices:', response);
          setInvoices([]);
        }
        setError(null);
      } catch (err) {
        console.error('Error fetching invoices:', err);
        setError(err.message || 'Failed to fetch invoices.');
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  // Close the status popover when clicking outside of it.
  // Use a data-attribute instead of a ref because renderStatusBadge runs in both the
  // desktop table and the mobile card layout (both stay in the DOM, hidden via CSS),
  // so a single ref would only point at one copy and report the other's clicks as outside.
  useEffect(() => {
    if (!statusMenuOpen) return;
    const onDocClick = (e) => {
      if (!e.target.closest('[data-invoice-status-menu]')) {
        setStatusMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [statusMenuOpen]);

  const getStatusMeta = (status) => STATUS_META[status] || { label: status || 'Unknown', className: 'bg-gray-100 text-gray-700', icon: null, priority: 99 };

  // Search filtering — customer, vehicle, invoice #, WO suffix.
  const filteredInvoices = useMemo(() => {
    let list = invoices;
    if (!showTerminal) {
      list = list.filter(inv => !TERMINAL_STATUSES.has(inv.status));
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(inv => {
      const customer = (inv.customer?.name || '').toLowerCase();
      const vehicle = `${inv.vehicle?.year || ''} ${inv.vehicle?.make || ''} ${inv.vehicle?.model || ''}`.toLowerCase();
      const invoiceNumber = String(inv.invoiceNumber || inv._id || '').toLowerCase();
      const woId = String(inv.workOrder?._id || inv.workOrder || '').toLowerCase();
      return customer.includes(q) || vehicle.includes(q) || invoiceNumber.includes(q) || woId.includes(q);
    });
  }, [invoices, searchQuery, showTerminal]);

  const sortedInvoices = useMemo(() => {
    const sorted = [...filteredInvoices];
    sorted.sort((a, b) => {
      for (const { key, direction } of sortConfig) {
        let comparison = 0;
        const multiplier = direction === 'asc' ? 1 : -1;
        switch (key) {
          case 'invoiceNumber':
            comparison = String(a.invoiceNumber || a._id).localeCompare(String(b.invoiceNumber || b._id), undefined, { numeric: true });
            break;
          case 'customer':
            comparison = (a.customer?.name || '').localeCompare(b.customer?.name || '');
            break;
          case 'vehicle': {
            const va = `${a.vehicle?.year || ''} ${a.vehicle?.make || ''} ${a.vehicle?.model || ''}`;
            const vb = `${b.vehicle?.year || ''} ${b.vehicle?.make || ''} ${b.vehicle?.model || ''}`;
            comparison = va.localeCompare(vb);
            break;
          }
          case 'date':
            comparison = new Date(a.invoiceDate) - new Date(b.invoiceDate);
            break;
          case 'total':
            comparison = (a.total || 0) - (b.total || 0);
            break;
          case 'status':
            comparison = getStatusMeta(a.status).priority - getStatusMeta(b.status).priority;
            break;
          default:
            break;
        }
        if (comparison !== 0) return comparison * multiplier;
      }
      return 0;
    });
    return sorted;
  }, [filteredInvoices, sortConfig]);

  // 3-state cycle per column: asc → desc → off. Max 3 active sort keys.
  const handleSort = (key) => {
    setSortConfig(prev => {
      const existing = prev.find(s => s.key === key);
      if (existing) {
        if (existing.direction === 'asc') {
          return prev.map(s => s.key === key ? { ...s, direction: 'desc' } : s);
        }
        return prev.filter(s => s.key !== key);
      }
      const newConfig = [...prev, { key, direction: 'asc' }];
      return newConfig.length > 3 ? newConfig.slice(1) : newConfig;
    });
  };

  const getSortIndicator = (key) => {
    const config = sortConfig.find(s => s.key === key);
    if (!config) return '';
    const arrow = config.direction === 'asc' ? ' ▲' : ' ▼';
    const priority = sortConfig.length > 1 ? ` ${sortConfig.indexOf(config) + 1}` : '';
    return arrow + priority;
  };

  // Document data assembly for print/PDF — identical shape to the prior implementation.
  const getDocumentData = useCallback(async (invoice) => {
    let customerFacingNotes = [];
    if (invoice.workOrder?._id) {
      try {
        const notesResponse = await workOrderNotesService.getCustomerFacingNotes(invoice.workOrder._id);
        customerFacingNotes = notesResponse.data?.notes || [];
      } catch (err) {
        console.error('Error fetching customer-facing notes:', err);
      }
    }

    const items = invoice.items || [];
    let parts, labor, servicePackages;
    if (items.length > 0) {
      parts = items.filter(item => item.type === 'Part').map(item => ({
        name: item.description,
        partNumber: item.partNumber || '',
        quantity: item.quantity,
        price: item.unitPrice
      }));
      labor = items.filter(item => item.type === 'Labor').map(item => ({
        description: item.description,
        hours: item.quantity,
        rate: item.unitPrice,
        billingType: item.billingType || 'hourly'
      }));
      servicePackages = items.filter(item => item.type === 'Service').map(item => ({
        name: item.description,
        price: item.unitPrice,
        committed: true,
        includedItems: item.includedItems || []
      }));
    } else {
      parts = invoice.parts || [];
      labor = invoice.labor || [];
      servicePackages = [];
    }

    return {
      documentNumber: invoice.invoiceNumber,
      documentDate: invoice.invoiceDate,
      status: invoice.status,
      customer: invoice.customer,
      vehicle: invoice.vehicle,
      vehicleMileage: invoice.workOrder?.vehicleMileage,
      parts,
      labor,
      servicePackages,
      discount: invoice.discount || null,
      customerFacingNotes,
      taxRate: invoice.taxRate || 0,
      terms: invoice.terms,
      technicianName: getCustomerFacingName(invoice.workOrder?.assignedTechnician),
      serviceAdvisorName: showServiceAdvisorOnInvoice ? getCustomerFacingName(invoice.workOrder?.createdBy) : undefined
    };
  }, [showServiceAdvisorOnInvoice]);

  const handlePrintInvoice = async (invoiceId, e) => {
    if (e) e.stopPropagation();
    try {
      const response = await invoiceService.getInvoice(invoiceId);
      const invoice = response.data.invoice;
      const docData = await getDocumentData(invoice);
      const html = generateDocumentHtml('invoice', docData);
      printHtml(html);
    } catch (err) {
      console.error('Error printing invoice:', err);
      setError('Failed to print invoice.');
    }
  };

  const handleDownloadPDF = async (invoiceId, e) => {
    if (e) e.stopPropagation();
    setGeneratingPDFId(invoiceId);
    try {
      const response = await invoiceService.getInvoice(invoiceId);
      const invoice = response.data.invoice;
      const docData = await getDocumentData(invoice);
      const html = generateDocumentHtml('invoice', docData);
      const filename = generatePdfFilename(
        invoice.customer?.name,
        invoice.vehicle?.make,
        invoice.vehicle?.model
      );
      await generatePdfFromHtml(html, filename);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF.');
    } finally {
      setGeneratingPDFId(null);
    }
  };

  const handleStatusChange = async (invoiceId, newStatus) => {
    setStatusMenuOpen(null);
    const prev = invoices;
    setInvoices(prevInvoices =>
      prevInvoices.map(inv => inv._id === invoiceId ? { ...inv, status: newStatus } : inv)
    );
    try {
      await invoiceService.updateInvoiceStatus(invoiceId, { status: newStatus });
    } catch (err) {
      console.error('Error updating invoice status:', err);
      setError(err.message || 'Failed to update status.');
      setInvoices(prev);
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    const invoice = invoices.find(inv => inv._id === invoiceId);
    if (invoice?.status === 'Paid') {
      setError('Cannot delete a paid invoice.');
      setDeleteConfirm(null);
      return;
    }
    try {
      await invoiceService.deleteInvoice(invoiceId);
      setInvoices(prevInvoices => prevInvoices.filter(inv => inv._id !== invoiceId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting invoice:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to delete invoice.';
      setError(errorMessage);
      setDeleteConfirm(null);
    }
  };

  const renderStatusBadge = (invoice, e) => {
    const meta = getStatusMeta(invoice.status);
    const isOpen = statusMenuOpen === invoice._id;
    return (
      <div className="relative inline-block" data-invoice-status-menu>
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            if (isOpen) { setStatusMenuOpen(null); return; }
            const rect = ev.currentTarget.getBoundingClientRect();
            setStatusMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
            setStatusMenuOpen(invoice._id);
          }}
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition ${meta.className}`}
          title="Change status"
        >
          {meta.icon && <i className={`fas ${meta.icon} mr-1`}></i>}
          {meta.label}
          <i className="fas fa-caret-down ml-1.5 text-[10px] opacity-70"></i>
        </button>
        {isOpen && (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[160px]"
            style={{ top: statusMenuPos.top, right: statusMenuPos.right }}
            onClick={(ev) => ev.stopPropagation()}
          >
            {STATUS_OPTIONS.map(opt => {
              const optMeta = getStatusMeta(opt);
              const active = invoice.status === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleStatusChange(invoice._id, opt)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${active ? 'bg-gray-50' : ''}`}
                >
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${optMeta.className}`}>
                    {optMeta.icon && <i className={`fas ${optMeta.icon} mr-1`}></i>}
                    {optMeta.label}
                  </span>
                  {active && <i className="fas fa-check text-gray-400 text-xs ml-2"></i>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading invoices...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Invoices</h1>
        <Button onClick={() => navigate('/invoices/generate')} variant="primary">
          <i className="fas fa-plus mr-2"></i>New Invoice
        </Button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">&times;</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1">
          <Input
            placeholder="Search invoices by customer, vehicle, invoice #, or work order..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setShowTerminal(!showTerminal)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
              showTerminal
                ? 'bg-gray-200 border-gray-400 text-gray-800'
                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <i className="fas fa-check-double mr-1"></i>
            {showTerminal ? 'Showing Paid/Cancelled' : 'Show Paid/Cancelled'}
          </button>
        </div>
      </div>

      <Card>
        {sortedInvoices.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery
              ? 'No invoices match your search.'
              : (invoices.length === 0
                  ? 'No invoices yet. Create your first invoice!'
                  : 'No open invoices. Toggle "Show Paid/Cancelled" to see closed invoices.')}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('invoiceNumber')}
                    >
                      Invoice #{getSortIndicator('invoiceNumber')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('customer')}
                    >
                      Customer{getSortIndicator('customer')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('vehicle')}
                    >
                      Vehicle{getSortIndicator('vehicle')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Work Order
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('date')}
                    >
                      Date{getSortIndicator('date')}
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('total')}
                    >
                      Total{getSortIndicator('total')}
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('status')}
                    >
                      Status{getSortIndicator('status')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedInvoices.map((invoice) => {
                    const terminal = TERMINAL_STATUSES.has(invoice.status);
                    return (
                      <tr
                        key={invoice._id}
                        className={`cursor-pointer ${terminal ? 'bg-gray-50 opacity-70 hover:opacity-90' : 'hover:bg-gray-50'}`}
                        onClick={() => navigate(`/invoices/${invoice._id}`)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {invoice.invoiceNumber || invoice._id}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {invoice.customer?.name || 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {invoice.vehicle
                            ? `${invoice.vehicle.year} ${invoice.vehicle.make} ${invoice.vehicle.model}`
                            : 'No Vehicle'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {invoice.workOrder ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); navigate(`/work-orders/${invoice.workOrder._id || invoice.workOrder}`); }}
                              className="text-primary-600 hover:text-primary-800"
                            >
                              WO #{String(invoice.workOrder._id || invoice.workOrder).slice(-6)}
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(invoice.invoiceDate)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                          {formatCurrency(invoice.total)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                          {renderStatusBadge(invoice)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                          <div className="flex justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
                            <Button to={`/invoices/${invoice._id}`} variant="outline" size="sm">View</Button>
                            <Button onClick={(e) => handlePrintInvoice(invoice._id, e)} variant="outline" size="sm">
                              <i className="fas fa-print"></i>
                            </Button>
                            <Button
                              onClick={(e) => handleDownloadPDF(invoice._id, e)}
                              variant="outline"
                              size="sm"
                              disabled={generatingPDFId === invoice._id}
                            >
                              {generatingPDFId === invoice._id ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-pdf"></i>}
                            </Button>
                            <Button
                              variant="light"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(invoice._id); }}
                              title="Delete invoice"
                            >
                              <i className="fas fa-trash text-red-600"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <MobileContainer>
              {sortedInvoices.map((invoice) => {
                const terminal = TERMINAL_STATUSES.has(invoice.status);
                return (
                  <MobileCard
                    key={invoice._id}
                    onClick={() => navigate(`/invoices/${invoice._id}`)}
                    className={terminal ? 'opacity-70' : ''}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <MobileSection label="Customer">
                          <div className="font-medium">{invoice.customer?.name || 'N/A'}</div>
                          {invoice.vehicle ? (
                            <div className="text-xs text-gray-500 mt-1">
                              {invoice.vehicle.year} {invoice.vehicle.make} {invoice.vehicle.model}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500 mt-1">No Vehicle</div>
                          )}
                        </MobileSection>
                      </div>
                      <div className="text-right ml-4" onClick={(e) => e.stopPropagation()}>
                        <div className="text-xs text-gray-500 mb-1">{formatDate(invoice.invoiceDate)}</div>
                        {renderStatusBadge(invoice)}
                      </div>
                    </div>

                    <MobileSection label="Invoice">
                      <div className="text-sm">
                        <span className="font-medium">#{invoice.invoiceNumber || invoice._id}</span>
                        {invoice.workOrder && (
                          <span className="text-gray-500 ml-2">
                            · WO #{String(invoice.workOrder._id || invoice.workOrder).slice(-6)}
                          </span>
                        )}
                      </div>
                    </MobileSection>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div className="text-sm font-medium text-gray-900">{formatCurrency(invoice.total)}</div>
                      <div className="flex flex-wrap gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button onClick={(e) => handlePrintInvoice(invoice._id, e)} variant="outline" size="sm">
                          <i className="fas fa-print"></i>
                        </Button>
                        <Button
                          onClick={(e) => handleDownloadPDF(invoice._id, e)}
                          variant="outline"
                          size="sm"
                          disabled={generatingPDFId === invoice._id}
                        >
                          {generatingPDFId === invoice._id ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-pdf"></i>}
                        </Button>
                        <Button
                          variant="light"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(invoice._id); }}
                        >
                          <i className="fas fa-trash text-red-600"></i>
                        </Button>
                      </div>
                    </div>
                  </MobileCard>
                );
              })}
            </MobileContainer>
          </>
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Invoice?</h3>
            <p className="text-gray-600 mb-4">This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <Button variant="light" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleDeleteInvoice(deleteConfirm)}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceList;
