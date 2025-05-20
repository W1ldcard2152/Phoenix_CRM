import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import invoiceService from '../../services/invoiceService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import InvoiceDisplay from '../../components/invoice/InvoiceDisplay'; // Import the new component
import { formatCurrency } from '../../utils/formatters'; // Ensure this is used

// formatCurrency is now imported, so local definition is removed.

const InvoiceDetail = () => {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  // Business settings (can be centralized later if needed)
  const settings = {
    businessName: 'Phoenix Automotive Group, Inc.',
    businessAddressLine1: '201 Ford St',
    businessAddressLine2: 'Newark NY 14513',
    businessPhone: '315-830-0008',
    businessEmail: 'phxautosalvage@gmail.com',
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
  
  // renderInvoiceContent is removed, InvoiceDisplay will be used instead.

  if (loading) {
    return <div className="container mx-auto flex justify-center items-center h-screen"><p className="text-xl text-gray-600">Loading Invoice Details...</p></div>;
  }

  if (error) {
    return <div className="container mx-auto p-4"><Card><div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert"><p className="font-bold">Error</p><p>{error}</p></div></Card></div>;
  }

  if (!invoice) {
    return <div className="container mx-auto p-4"><Card><p className="text-center p-4">Invoice not found.</p></Card></div>;
  }

  // Prepare displayableInvoiceData to handle potential differences in invoice structure
  let displayableInvoiceData = { ...invoice };

  // If parts and labor are not directly on the invoice, or are empty,
  // check for an 'items' array and adapt it.
  // This mirrors the logic previously in renderInvoiceContent.
  const hasDirectParts = invoice.parts && invoice.parts.length > 0;
  const hasDirectLabor = invoice.labor && invoice.labor.length > 0;

  if (!hasDirectParts && !hasDirectLabor && invoice.items && invoice.items.length > 0) {
    const newParts = [];
    const newLabor = [];
    invoice.items.forEach(item => {
      // Heuristic to differentiate: labor items usually have 'hours' and 'rate'
      // Part items usually have 'quantity' and 'price'/'unitPrice'
      if (item.hasOwnProperty('hours') && item.hasOwnProperty('rate')) {
        newLabor.push({
          _id: item._id || `labor-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          description: item.description || item.name,
          hours: parseFloat(item.hours) || 0,
          rate: parseFloat(item.rate) || 0,
          total: item.total || ((parseFloat(item.hours) || 0) * (parseFloat(item.rate) || 0)),
        });
      } else { // Assume it's a part
        newParts.push({
          _id: item._id || `part-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: item.name || item.description,
          partNumber: item.partNumber || '',
          quantity: parseFloat(item.quantity) || 0,
          price: parseFloat(item.price || item.unitPrice) || 0,
          total: item.total || ((parseFloat(item.quantity) || 0) * (parseFloat(item.price || item.unitPrice) || 0)),
        });
      }
    });
    displayableInvoiceData.parts = newParts;
    displayableInvoiceData.labor = newLabor;
  } else {
    // Ensure parts and labor are at least empty arrays if not present
    displayableInvoiceData.parts = invoice.parts || [];
    displayableInvoiceData.labor = invoice.labor || [];
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
        {/* Use the new InvoiceDisplay component with preprocessed data */}
        {invoice && (
          <InvoiceDisplay 
            ref={printableRef} 
            invoiceData={displayableInvoiceData} 
            businessSettings={settings} 
          />
        )}
      </Card>
    </div>
  );
};

export default InvoiceDetail;
