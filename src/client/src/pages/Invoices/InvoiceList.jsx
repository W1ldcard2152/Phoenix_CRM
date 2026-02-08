import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import invoiceService from '../../services/invoiceService';
import workOrderNotesService from '../../services/workOrderNotesService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SelectInput from '../../components/common/SelectInput';
import { parseLocalDate, formatCurrency } from '../../utils/formatters';

const InvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const invoiceStatuses = [
    { value: 'Draft', label: 'Draft' },
    { value: 'Issued', label: 'Payment Due' },
    { value: 'Paid', label: 'Paid' },
    { value: 'Partial', label: 'Partial' },
    { value: 'Overdue', label: 'Overdue' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        const response = await invoiceService.getAllInvoices();
        if (response && response.data && Array.isArray(response.data.invoices)) {
          setInvoices(response.data.invoices);
        } else if (response && Array.isArray(response.invoices)) {
          setInvoices(response.invoices);
        } else {
          console.warn("Received unexpected data structure for invoices:", response);
          setInvoices([]);
        }
        setError(null);
      } catch (err) {
        console.error("Error fetching invoices:", err);
        setError(err.message || 'Failed to fetch invoices.');
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  const handlePrintInvoice = async (invoiceId) => {
    try {
      // Fetch the invoice data
      const response = await invoiceService.getInvoice(invoiceId);
      const invoice = response.data.invoice;

      // Fetch customer-facing notes if work order exists
      let customerFacingNotes = [];
      if (invoice.workOrder?._id) {
        try {
          const notesResponse = await workOrderNotesService.getCustomerFacingNotes(invoice.workOrder._id);
          customerFacingNotes = notesResponse.data.notes || [];
        } catch (error) {
          console.error('Error fetching customer-facing notes:', error);
        }
      }

      // Business settings
      const settings = {
        businessName: 'Phoenix Automotive Group, Inc.',
        businessAddressLine1: '201 Ford St',
        businessAddressLine2: 'Newark NY 14513',
        businessPhone: '315-830-0008',
        businessEmail: 'phxautosalvage@gmail.com',
        businessWebsite: 'www.phxautogroup.com',
        businessLogo: '/phxLogo.svg'
      };

      // Generate invoice HTML
      const invoiceHTML = generateInvoiceHTML(invoice, settings, customerFacingNotes);

      // Open print window
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      printWindow.document.open();
      printWindow.document.write(`
        <html>
          <head>
            <title>Invoice ${invoice.invoiceNumber || invoice._id}</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
            <style>
              body { margin: 0; padding: 20px; font-family: sans-serif; }
              @media print {
                .no-print { display: none !important; }
                body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
              .print-friendly-font { font-family: Arial, sans-serif; }
            </style>
          </head>
          <body onload="window.print();window.close()">
            ${invoiceHTML}
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error('Error printing invoice:', err);
      setError('Failed to print invoice.');
    }
  };

  const generateInvoiceHTML = (invoice, settings, customerFacingNotes = []) => {
    // Process items array (modern structure) or fallback to legacy parts/labor arrays
    const items = invoice.items || [];
    let parts, labor;

    if (items.length > 0) {
      // Modern structure
      parts = items.filter(item => item.type === 'Part').map(item => ({
        _id: item._id,
        name: item.description,
        partNumber: item.partNumber || '',
        quantity: item.quantity,
        price: item.unitPrice,
        total: item.total
      }));

      labor = items.filter(item => item.type === 'Labor').map(item => ({
        _id: item._id,
        description: item.description,
        hours: item.quantity,
        rate: item.unitPrice,
        total: item.total
      }));
    } else {
      // Legacy structure
      parts = invoice.parts || [];
      labor = invoice.labor || [];
    }

    const subtotal = invoice.subtotal || 0;
    const taxAmount = invoice.taxAmount || 0;
    const taxRate = invoice.taxRate || 0;
    const total = invoice.total || 0;
    const custAddr = invoice.customer?.address;

    return `
      <div class="p-4 sm:p-6 lg:p-8 bg-white text-gray-900 text-sm max-w-4xl mx-auto print-friendly-font">
        <!-- Header -->
        <div class="flex justify-between items-start mb-6">
          <div class="flex flex-col">
            ${settings.businessLogo ? `<img src="${settings.businessLogo}" alt="${settings.businessName}" class="h-16 mb-2" />` : ''}
            <p class="text-sm leading-tight">${settings.businessAddressLine1}</p>
            <p class="text-sm leading-tight">${settings.businessAddressLine2}</p>
            <p class="text-sm leading-tight">${settings.businessPhone}</p>
            ${settings.businessEmail ? `<p class="text-sm leading-tight">${settings.businessEmail}</p>` : ''}
            ${settings.businessWebsite ? `<p class="text-sm leading-tight">${settings.businessWebsite}</p>` : ''}
          </div>
          <div class="text-right">
            <h2 class="text-3xl font-bold text-gray-800">INVOICE</h2>
            <p class="text-md"><span class="font-semibold">Invoice #: </span>${invoice.invoiceNumber}</p>
            <p><span class="font-semibold">Date: </span>${parseLocalDate(invoice.invoiceDate).toLocaleDateString()}</p>
          </div>
        </div>

        <!-- Customer and Vehicle Info -->
        <div class="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div class="border border-gray-300 p-3 rounded-md">
            <h3 class="font-semibold text-md mb-2 text-gray-700">Customer Information:</h3>
            <p class="font-bold">${invoice.customer?.name || 'N/A'}</p>
            ${custAddr?.street ? `<p>${custAddr.street}</p>` : ''}
            ${custAddr?.city ? `<p>${custAddr.city}, ${custAddr.state || ''} ${custAddr.zip || ''}</p>` : ''}
            <p>${invoice.customer?.phone || 'N/A'}</p>
            ${invoice.customer?.email ? `<p>${invoice.customer.email}</p>` : ''}
          </div>
          <div class="border border-gray-300 p-3 rounded-md">
            <h3 class="font-semibold text-md mb-2 text-gray-700">Vehicle Information:</h3>
            <p><strong>Vehicle: </strong>${invoice.vehicle ? `${invoice.vehicle.year} ${invoice.vehicle.make} ${invoice.vehicle.model}` : 'N/A'}</p>
            <p><strong>VIN: </strong>${invoice.vehicle?.vin || 'N/A'}</p>
            <p><strong>License: </strong>${invoice.vehicle?.licensePlate || 'N/A'}</p>
            ${invoice.workOrder?.vehicleMileage ? `<p><strong>Mileage: </strong>${invoice.workOrder.vehicleMileage}</p>` : ''}
          </div>
        </div>

        <!-- Parts -->
        ${parts.length > 0 ? `
        <div class="mb-4">
          <h3 class="font-semibold text-md mb-1 text-gray-700">Parts:</h3>
          <table class="w-full border-collapse border border-gray-300 text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="border border-gray-300 p-2 text-left font-semibold">Description</th>
                <th class="border border-gray-300 p-2 text-left font-semibold">Part #</th>
                <th class="border border-gray-300 p-2 text-right font-semibold">Qty</th>
                <th class="border border-gray-300 p-2 text-right font-semibold">Unit Price</th>
                <th class="border border-gray-300 p-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              ${parts.map(part => `
                <tr>
                  <td class="border border-gray-300 p-2">${part.name || part.description || ''}</td>
                  <td class="border border-gray-300 p-2">${part.partNumber || ''}</td>
                  <td class="border border-gray-300 p-2 text-right">${part.quantity || 0}</td>
                  <td class="border border-gray-300 p-2 text-right">${formatCurrency(part.price || 0)}</td>
                  <td class="border border-gray-300 p-2 text-right">${formatCurrency(part.total || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <!-- Labor -->
        ${labor.length > 0 ? `
        <div class="mb-6">
          <h3 class="font-semibold text-md mb-1 text-gray-700">Labor:</h3>
          <table class="w-full border-collapse border border-gray-300 text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="border border-gray-300 p-2 text-left font-semibold">Description</th>
                <th class="border border-gray-300 p-2 text-right font-semibold">Hours</th>
                <th class="border border-gray-300 p-2 text-right font-semibold">Rate</th>
                <th class="border border-gray-300 p-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              ${labor.map(laborItem => `
                <tr>
                  <td class="border border-gray-300 p-2">${laborItem.description || ''}</td>
                  <td class="border border-gray-300 p-2 text-right">${laborItem.hours || 0}</td>
                  <td class="border border-gray-300 p-2 text-right">${formatCurrency(laborItem.rate || 0)}</td>
                  <td class="border border-gray-300 p-2 text-right">${formatCurrency(laborItem.total || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <!-- Totals -->
        <div class="flex justify-end mb-6">
          <div class="w-full sm:w-1/2 md:w-1/3 text-sm">
            <div class="flex justify-between py-1">
              <span>Subtotal:</span>
              <span>${formatCurrency(subtotal)}</span>
            </div>
            <div class="flex justify-between py-1">
              <span>Tax (${taxRate}%):</span>
              <span>${formatCurrency(taxAmount)}</span>
            </div>
            <div class="flex justify-between py-1 text-lg font-bold border-t-2 border-b-2 border-gray-700 my-1">
              <span>TOTAL:</span>
              <span>${formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <!-- Work Order Notes -->
        ${customerFacingNotes.length > 0 ? `
        <div class="mb-6 text-sm">
          <h3 class="font-semibold text-md mb-2 text-gray-700">Work Order Notes:</h3>
          <div class="border border-gray-300 rounded-md bg-gray-50">
            <div class="divide-y divide-gray-200">
              ${customerFacingNotes.map(note => `
                <div class="p-3">
                  <div class="flex justify-between items-start mb-1">
                    <span class="text-xs text-gray-500">
                      ${new Date(note.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <p class="whitespace-pre-wrap text-gray-700">${note.content}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Notes -->
        ${invoice.customerNotes ? `
        <div class="mb-6 text-sm">
          <h3 class="font-semibold text-md mb-1 text-gray-700">Notes:</h3>
          <div class="border border-gray-300 p-3 rounded-md bg-gray-50">
            <p class="whitespace-pre-wrap">${invoice.customerNotes}</p>
          </div>
        </div>
        ` : ''}

        <!-- Terms -->
        ${invoice.terms ? `
        <div class="mb-6 text-sm">
          <h3 class="font-semibold text-md mb-1 text-gray-700">Terms & Conditions:</h3>
          <div class="border border-gray-300 p-3 rounded-md">
            <p class="whitespace-pre-wrap">${invoice.terms}</p>
          </div>
        </div>
        ` : ''}

        <!-- Footer Message -->
        <div class="text-center text-xs text-gray-600 mt-8 border-t border-gray-300 pt-4">
          <p>Thank you for your business!</p>
          <p>${settings.businessName} | ${settings.businessPhone} | ${settings.businessWebsite}</p>
        </div>
      </div>
    `;
  };

  const handleStatusChange = async (invoiceId, newStatus) => {
    try {
      // Optimistically update UI
      setInvoices(prevInvoices =>
        prevInvoices.map(inv =>
          inv._id === invoiceId ? { ...inv, status: newStatus } : inv
        )
      );
      await invoiceService.updateInvoiceStatus(invoiceId, { status: newStatus });
    } catch (err) {
      console.error("Error updating invoice status:", err);
      setError(err.message || 'Failed to update status.');
      // Revert on error
      const originalInvoices = await invoiceService.getAllInvoices();
      if (originalInvoices && originalInvoices.data && Array.isArray(originalInvoices.data.invoices)) {
        setInvoices(originalInvoices.data.invoices);
      }
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    const invoice = invoices.find(inv => inv._id === invoiceId);
    
    // Check if invoice is paid
    if (invoice?.status === 'Paid') {
      alert('Cannot delete a paid invoice.');
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      try {
        await invoiceService.deleteInvoice(invoiceId);
        setInvoices(prevInvoices => prevInvoices.filter(inv => inv._id !== invoiceId));
      } catch (err) {
        console.error("Error deleting invoice:", err);
        // Handle specific error messages
        const errorMessage = err.response?.data?.message || err.message || 'Failed to delete invoice.';
        setError(errorMessage);
        alert(errorMessage);
      }
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Invoices</h1>
        <Button
          onClick={() => navigate('/invoices/generate')}
          variant="primary"
        >
          Create New Invoice
        </Button>
      </div>

      <Card>
        <h2 className="text-xl font-semibold text-gray-700 mb-4">All Invoices</h2>
        {loading && <p className="text-gray-600">Loading invoices...</p>}
        {error && <p className="text-red-500">Error: {error}</p>}
        {!loading && !error && invoices.length === 0 && (
          <p className="text-gray-600">No invoices found.</p>
        )}
        {!loading && !error && invoices.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice ID</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr key={invoice._id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <Link to={`/invoices/${invoice._id}`} className="text-indigo-600 hover:text-indigo-900">
                        {invoice.invoiceNumber || invoice._id}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.customer?.name || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{parseLocalDate(invoice.invoiceDate).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${invoice.total?.toFixed(2) || '0.00'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <SelectInput
                        value={invoice.status || ''}
                        onChange={(e) => handleStatusChange(invoice._id, e.target.value)}
                        options={invoiceStatuses}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <Button
                          to={`/invoices/${invoice._id}`}
                          variant="outline"
                          size="sm"
                        >
                          View
                        </Button>
                        <Button
                          onClick={() => handlePrintInvoice(invoice._id)}
                          variant="outline"
                          size="sm"
                        >
                          Print
                        </Button>
                        <Button
                          onClick={() => handleDeleteInvoice(invoice._id)}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </Button>
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
  );
};

export default InvoiceList;