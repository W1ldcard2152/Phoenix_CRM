import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import invoiceService from '../../services/invoiceService';
import workOrderNotesService from '../../services/workOrderNotesService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import InvoiceDisplay from '../../components/invoice/InvoiceDisplay';
import businessConfig from '../../config/businessConfig';
import { generatePdfFilename, generatePdfFromHtml, printHtml, generateDocumentHtml } from '../../utils/pdfUtils';

const InvoiceDetail = () => {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [customerFacingNotes, setCustomerFacingNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const printableRef = useRef(); // Keep for InvoiceDisplay component

  // Business settings from centralized config (for InvoiceDisplay component)
  const settings = {
    businessName: businessConfig.name,
    businessAddressLine1: businessConfig.addressLine1,
    businessAddressLine2: businessConfig.addressLine2,
    businessPhone: businessConfig.phone,
    businessEmail: businessConfig.email,
    businessWebsite: businessConfig.website,
    businessLogo: businessConfig.logo
  };

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        const response = await invoiceService.getInvoice(id);
        if (response && response.data && response.data.invoice) {
          const invoiceData = response.data.invoice;
          setInvoice(invoiceData);

          // Fetch customer-facing notes if work order exists
          if (invoiceData.workOrder?._id) {
            try {
              const notesResponse = await workOrderNotesService.getCustomerFacingNotes(invoiceData.workOrder._id);
              setCustomerFacingNotes(notesResponse.notes || []);
            } catch (noteErr) {
              console.error('Error fetching customer-facing notes:', noteErr);
              setCustomerFacingNotes([]);
            }
          }
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

  // Get document data for printing/PDF
  const getDocumentData = () => {
    // Process items array (modern structure) or fallback to legacy parts/labor arrays
    const items = invoice?.items || [];
    let parts, labor;

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
        rate: item.unitPrice
      }));
    } else {
      parts = invoice?.parts || [];
      labor = invoice?.labor || [];
    }

    return {
      documentNumber: invoice?.invoiceNumber,
      documentDate: invoice?.invoiceDate,
      status: invoice?.status,
      customer: invoice?.customer,
      vehicle: invoice?.vehicle,
      vehicleMileage: invoice?.workOrder?.vehicleMileage,
      parts,
      labor,
      customerFacingNotes,
      taxRate: invoice?.taxRate || 0,
      terms: invoice?.paymentTerms
    };
  };

  // Print handler
  const handlePrint = () => {
    if (!invoice) return;
    const html = generateDocumentHtml('invoice', getDocumentData());
    printHtml(html);
  };

  // Download PDF handler
  const handleDownloadPDF = async () => {
    if (!invoice) return;
    setGeneratingPDF(true);
    try {
      const html = generateDocumentHtml('invoice', getDocumentData());
      const filename = generatePdfFilename(
        invoice.customer?.name,
        invoice.vehicle?.make,
        invoice.vehicle?.model
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
            <i className="fas fa-print mr-2"></i>Print
          </Button>
          <Button onClick={handleDownloadPDF} disabled={generatingPDF} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
            {generatingPDF ? (
              <><i className="fas fa-spinner fa-spin mr-2"></i>Generating...</>
            ) : (
              <><i className="fas fa-download mr-2"></i>Download</>
            )}
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
