import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import invoiceService from '../../services/invoiceService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
// import './InvoiceStyle.css'; // Styles will be primarily Tailwind based on InvoiceGenerator

// Import the utility formatters
const formatCurrency = (amount, currencyCode = 'USD', locale = 'en-US') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);
};

const InvoiceDetail = () => {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  // Business settings from InvoiceGenerator
  const settings = {
    businessName: 'Phoenix Automotive Group, Inc.',
    businessAddressLine1: '201 Ford St',
    businessAddressLine2: 'Newark NY 14513',
    businessPhone: '315.830.0008',
    businessEmail: 'phxautosalvage@@gmail.com',
    businessWebsite: 'www.phxautogroup.com',
    businessLogo: '/phxLogo.svg' // This path needs to be updated if used differently
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const printableRef = useRef();

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        const response = await invoiceService.getInvoice(id);
        if (response && response.data && response.data.invoice) {
          setInvoice(response.data.invoice);
        } else {
          console.warn("Received unexpected data structure for single invoice:", response);
          setInvoice(null);
        }
        setError(null);
      } catch (err) {
        console.error(`Error fetching invoice ${id}:`, err);
        setError(err.message || `Failed to fetch invoice ${id}.`);
        setInvoice(null);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [id]);

  const handlePrint = () => {
    if (printableRef.current) {
      const printContents = printableRef.current.innerHTML;
      const popupWin = window.open('', '_blank', 'top=0,left=0,height=auto,width=auto');
      popupWin.document.open();
      popupWin.document.write(`
        <html>
          <head>
            <title>Invoice ${invoice?.invoiceNumber || invoice?._id || 'Detail'}</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
            <style>
              body { margin: 0; padding: 20px; font-family: sans-serif; }
              @media print {
                .no-print { display: none !important; }
                body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
              .print-friendly-font { font-family: Arial, sans-serif; /* Example font */ }
            </style>
          </head>
          <body onload="window.print();window.close()">${printContents}</body>
        </html>
      `);
      popupWin.document.close();
    } else {
      setError("Preview template not ready for printing.");
    }
  };
  
  const renderInvoiceContent = () => {
    if (!invoice) return null;

    // Use totals from invoice object if available, otherwise calculate
    // InvoiceGenerator calculates partsTotal, laborTotal, subtotal, taxAmount, total
    // We need to adapt based on what `invoice` object contains.
    // Assuming `invoice` has `parts`, `labor`, `taxRate`, `subtotal`, `taxAmount`, `total`
    // If not, we'll have to adjust or use the old calculation method.

    const parts = invoice.parts || [];
    const labor = invoice.labor || [];
    
    // If parts and labor are not separate, try to use invoice.items as parts
    // This is a fallback if the structure isn't like InvoiceGenerator
    let effectiveParts = parts;
    if (parts.length === 0 && labor.length === 0 && invoice.items && invoice.items.length > 0) {
        effectiveParts = invoice.items.map(item => ({
            name: item.name,
            partNumber: item.partNumber || '', // Assuming item might not have partNumber
            quantity: item.quantity,
            price: item.unitPrice, // Assuming item has unitPrice
            total: (item.quantity || 0) * (item.unitPrice || 0)
        }));
    }


    const partsTotal = invoice.partsTotal !== undefined ? invoice.partsTotal : effectiveParts.reduce((sum, part) => sum + (parseFloat(part.total) || 0), 0);
    const laborTotal = invoice.laborTotal !== undefined ? invoice.laborTotal : labor.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    
    const calculatedSubtotal = partsTotal + laborTotal;
    const subtotalToUse = invoice.subtotal !== undefined ? invoice.subtotal : calculatedSubtotal;

    const taxRateToUse = invoice.taxRate !== undefined ? invoice.taxRate : 0; // Default to 0 if not present
    const calculatedTaxAmount = subtotalToUse * (parseFloat(taxRateToUse) / 100);
    const taxAmountToUse = invoice.taxAmount !== undefined ? invoice.taxAmount : calculatedTaxAmount;
    
    const totalToUse = invoice.total !== undefined ? invoice.total : (subtotalToUse + taxAmountToUse);

    const custAddr = invoice.customer?.address;

    return (
      <div ref={printableRef} className="p-4 sm:p-6 lg:p-8 bg-white text-gray-900 text-sm max-w-4xl mx-auto print-friendly-font">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex flex-col">
            {settings.businessLogo && (
              <img 
                src={settings.businessLogo} 
                alt={settings.businessName} 
                className="h-16 mb-2" 
              />
            )}
            <p className="text-sm leading-tight">{settings.businessAddressLine1}</p>
            <p className="text-sm leading-tight">{settings.businessAddressLine2}</p>
            <p className="text-sm leading-tight">Phone: {settings.businessPhone}</p>
            {settings.businessEmail && <p className="text-sm leading-tight">Email: {settings.businessEmail}</p>}
            {settings.businessWebsite && <p className="text-sm leading-tight">Web: {settings.businessWebsite}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-gray-800">INVOICE</h2>
            <p className="text-md"><span className="font-semibold">Invoice #:</span> {invoice.invoiceNumber || invoice._id}</p>
            <p><span className="font-semibold">Date:</span> {new Date(invoice.invoiceDate).toLocaleDateString()}</p>
            {invoice.invoiceDueDate && <p><span className="font-semibold">Due Date:</span> {new Date(invoice.invoiceDueDate).toLocaleDateString()}</p>}
            {invoice.paymentTerms && <p><span className="font-semibold">Payment Terms:</span> {invoice.paymentTerms}</p>}
            {invoice.workOrder?._id && <p><span className="font-semibold">Work Order #:</span> {typeof invoice.workOrder._id === 'string' ? invoice.workOrder._id.substring(0,8) : invoice.workOrder._id}... </p>}
          </div>
        </div>

        {/* Customer and Vehicle Info */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div className="border border-gray-300 p-3 rounded-md">
            <h3 className="font-semibold text-md mb-2 text-gray-700">Bill To:</h3>
            <p className="font-bold">{invoice.customer?.name || 'N/A'}</p>
            {custAddr && <p>{custAddr.street}</p>}
            {custAddr && <p>{custAddr.city}, {custAddr.state} {custAddr.zip}</p>}
            <p>{invoice.customer?.phone || 'N/A'}</p>
            <p>{invoice.customer?.email || 'N/A'}</p>
          </div>
          <div className="border border-gray-300 p-3 rounded-md">
            <h3 className="font-semibold text-md mb-2 text-gray-700">Vehicle Information:</h3>
            {invoice.vehicle ? (
              <>
                <p><strong>Vehicle:</strong> {`${invoice.vehicle.year} ${invoice.vehicle.make} ${invoice.vehicle.model}`}</p>
                <p><strong>VIN:</strong> {invoice.vehicle.vin || 'N/A'}</p>
                <p><strong>License:</strong> {invoice.vehicle.licensePlate || 'N/A'}</p>
              </>
            ) : (
              <p>N/A</p>
            )}
            {invoice.workOrder?.vehicleMileage && <p><strong>Mileage:</strong> {invoice.workOrder.vehicleMileage}</p>}
          </div>
        </div>

        {/* Parts */}
        {effectiveParts && effectiveParts.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold text-md mb-1 text-gray-700">Parts:</h3>
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 p-2 text-left font-semibold">Description</th>
                  <th className="border border-gray-300 p-2 text-left font-semibold">Part #</th>
                  <th className="border border-gray-300 p-2 text-right font-semibold">Qty</th>
                  <th className="border border-gray-300 p-2 text-right font-semibold">Unit Price</th>
                  <th className="border border-gray-300 p-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {effectiveParts.map((part, index) => (
                  <tr key={part._id || `part-${index}`}>
                    <td className="border border-gray-300 p-2">{part.name || part.description}</td>
                    <td className="border border-gray-300 p-2">{part.partNumber}</td>
                    <td className="border border-gray-300 p-2 text-right">{part.quantity}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(part.price || part.unitPrice)}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(part.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Labor */}
        {labor && labor.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-md mb-1 text-gray-700">Labor:</h3>
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 p-2 text-left font-semibold">Description</th>
                  <th className="border border-gray-300 p-2 text-right font-semibold">Hours</th>
                  <th className="border border-gray-300 p-2 text-right font-semibold">Rate</th>
                  <th className="border border-gray-300 p-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {labor.map((laborItem, index) => (
                  <tr key={laborItem._id || `labor-${index}`}>
                    <td className="border border-gray-300 p-2">{laborItem.description}</td>
                    <td className="border border-gray-300 p-2 text-right">{laborItem.hours}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(laborItem.rate)}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(laborItem.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* If no parts and no labor, and invoice.items was used as fallback for parts, don't show empty Labor section */}
        {parts.length === 0 && labor.length === 0 && invoice.items && invoice.items.length > 0 && (
            <div className="mb-6">
                {/* This space intentionally left blank if items were shown as parts and no separate labor exists */}
            </div>
        )}


        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-full sm:w-1/2 md:w-1/3 text-sm">
            <div className="flex justify-between py-1">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotalToUse)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Tax ({taxRateToUse}%):</span>
              <span>{formatCurrency(taxAmountToUse)}</span>
            </div>
            <div className="flex justify-between py-1 text-lg font-bold border-t-2 border-b-2 border-gray-700 my-1">
              <span>TOTAL:</span>
              <span>{formatCurrency(totalToUse)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.customerNotes && (
          <div className="mb-6 text-sm">
            <h3 className="font-semibold text-md mb-1 text-gray-700">Notes:</h3>
            <div className="border border-gray-300 p-3 rounded-md bg-gray-50">
              <p className="whitespace-pre-wrap">{invoice.customerNotes}</p>
            </div>
          </div>
        )}

        {/* Terms */}
        {invoice.terms && (
          <div className="mb-6 text-sm">
            <h3 className="font-semibold text-md mb-1 text-gray-700">Terms & Conditions:</h3>
            <div className="border border-gray-300 p-3 rounded-md">
              <p className="whitespace-pre-wrap">{invoice.terms}</p>
            </div>
          </div>
        )}
        
        {/* Payment Status */}
        <div className="mb-8">
            <h4 className="text-md font-semibold text-gray-700 mb-1">Payment Status:</h4>
            <p className={`text-sm font-medium ${invoice.status === 'Paid' ? 'text-green-600' : invoice.status === 'Issued' || invoice.status === 'Sent' ? 'text-orange-500' : 'text-gray-600'}`}>
              {invoice.status || 'Pending'}
            </p>
        </div>
        
        {/* Footer Message */}
        <div className="text-center text-xs text-gray-600 mt-8 border-t border-gray-300 pt-4">
          <p>Thank you for your business!</p>
          <p>{settings.businessName} | {settings.businessPhone} | {settings.businessWebsite}</p>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="container mx-auto flex justify-center items-center h-screen"><p className="text-xl text-gray-600">Loading Invoice Details...</p></div>;
  }

  if (error) {
    return <div className="container mx-auto p-4"><Card><div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert"><p className="font-bold">Error</p><p>{error}</p></div></Card></div>;
  }

  if (!invoice) {
    return <div className="container mx-auto p-4"><Card><p className="text-center p-4">Invoice not found.</p></Card></div>;
  }

  return (
    <div className="container mx-auto p-4 print-hide">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Invoice Detail</h1>
        <div className="flex space-x-2">
          <Button onClick={handlePrint} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            <i className="fas fa-print mr-2"></i>Print Invoice
          </Button>
          <Link to="/admin" className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">
            Back to Admin
          </Link>
        </div>
      </div>
      <Card>
        {renderInvoiceContent()}
      </Card>
    </div>
  );
};

export default InvoiceDetail;
