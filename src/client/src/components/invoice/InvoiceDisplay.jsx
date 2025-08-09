import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/formatters'; // Import centralized formatter
import workOrderNotesService from '../../services/workOrderNotesService';

const InvoiceDisplay = React.forwardRef(({ invoiceData, businessSettings }, ref) => {
  const [customerFacingNotes, setCustomerFacingNotes] = useState([]);
  
  // Fetch customer-facing notes when workOrder changes
  useEffect(() => {
    const fetchCustomerNotes = async () => {
      if (invoiceData?.workOrder?._id) {
        try {
          const response = await workOrderNotesService.getCustomerFacingNotes(invoiceData.workOrder._id);
          setCustomerFacingNotes(response.data.notes || []);
        } catch (error) {
          console.error('Error fetching customer-facing notes:', error);
          setCustomerFacingNotes([]);
        }
      }
    };

    fetchCustomerNotes();
  }, [invoiceData?.workOrder?._id]);

  if (!invoiceData || !businessSettings) {
    // Or some placeholder/loading state if preferred
    return <div>Loading invoice data...</div>;
  }

  // Destructure for easier access, providing defaults
  const {
    invoiceNumber,
    invoiceDate,
    customerNotes,
    terms,
    taxRate = 0,
    parts: invoiceDataParts = [],      // Original parts from invoiceData
    labor: invoiceDataLabor = [],      // Original labor from invoiceData
    subtotal: initialSubtotal,     // Original subtotal from invoiceData
    taxAmount: initialTaxAmount,   // Original taxAmount from invoiceData
    total: initialTotal,           // Original total from invoiceData
    // Nested data
    customer,
    vehicle,
    workOrder, // Still needed for mileage, but not for WO# in header
  } = invoiceData;

  const custAddr = customer?.address;

  // Process parts and labor to segregate them correctly
  const processedParts = [];
  // Start with items correctly in the labor array, or an empty array if undefined
  const processedLabor = [...(invoiceDataLabor || [])]; 

  (invoiceDataParts || []).forEach(item => {
    const itemName = item.name || item.description || "";
    // Ensure partNumber is treated as a string before trimming, default to empty string if not.
    const itemPartNumber = (typeof item.partNumber === 'string' || typeof item.partNumber === 'number')
                           ? String(item.partNumber).trim()
                           : "";

    // Heuristic: item is labor if partNumber is empty AND name/description contains "labor"
    const isLikelyLabor = !itemPartNumber && itemName.toLowerCase().includes("labor");

    if (isLikelyLabor) {
      processedLabor.push({
        ...item, // Spread to keep other fields like _id, and original total
        description: itemName,
        hours: item.quantity, // Map quantity from "part" structure to hours for labor structure
        rate: item.price,     // Map price from "part" structure to rate for labor structure
      });
    } else {
      processedParts.push(item);
    }
  });

  // Use the processed arrays for rendering and calculations
  const parts = processedParts;
  const labor = processedLabor;

  // Calculate totals based on processed parts and labor,
  // or use initial totals from invoiceData if provided.
  const calculatedPartsTotal = parts.reduce((sum, part) => sum + (parseFloat(part.total) || 0), 0);
  const calculatedLaborTotal = labor.reduce((sum, laborItem) => sum + (parseFloat(laborItem.total) || 0), 0);
  const calculatedSubtotal = calculatedPartsTotal + calculatedLaborTotal;

  const finalSubtotal = initialSubtotal !== undefined ? initialSubtotal : calculatedSubtotal;
  const finalTaxAmount = initialTaxAmount !== undefined ? initialTaxAmount : finalSubtotal * (parseFloat(taxRate) / 100);
  const finalTotal = initialTotal !== undefined ? initialTotal : finalSubtotal + finalTaxAmount;

  return (
    <div ref={ref} className="p-4 sm:p-6 lg:p-8 bg-white text-gray-900 text-sm max-w-4xl mx-auto print-friendly-font">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col">
          {businessSettings.businessLogo && (
            <img 
              src={businessSettings.businessLogo} 
              alt={businessSettings.businessName} 
              className="h-16 mb-2" 
            />
          )}
          <p className="text-sm leading-tight">{businessSettings.businessAddressLine1}</p>
          <p className="text-sm leading-tight">{businessSettings.businessAddressLine2}</p>
          <p className="text-sm leading-tight">{businessSettings.businessPhone}</p>
          {businessSettings.businessEmail && <p className="text-sm leading-tight">{businessSettings.businessEmail}</p>}
          {businessSettings.businessWebsite && <p className="text-sm leading-tight">{businessSettings.businessWebsite}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-bold text-gray-800">INVOICE</h2>
          <p className="text-md"><span className="font-semibold">Invoice #: </span>{invoiceNumber}</p>
          <p><span className="font-semibold">Date: </span>{new Date(invoiceDate).toLocaleDateString()}</p>
          {/* Work Order # removed as per request */}
        </div>
      </div>

      {/* Customer and Vehicle Info */}
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div className="border border-gray-300 p-3 rounded-md">
          <h3 className="font-semibold text-md mb-2 text-gray-700">Customer Information:</h3>
          <p className="font-bold">{customer?.name || 'N/A'}</p>
          {custAddr && custAddr.street && <p>{custAddr.street}</p>}
          {custAddr && custAddr.city && custAddr.state && custAddr.zip && <p>{custAddr.city}, {custAddr.state} {custAddr.zip}</p>}
          <p>{customer?.phone || 'N/A'}</p>
          {customer?.email && <p>{customer.email}</p>}
        </div>
        <div className="border border-gray-300 p-3 rounded-md">
          <h3 className="font-semibold text-md mb-2 text-gray-700">Vehicle Information:</h3>
          <p><strong>Vehicle: </strong>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'N/A'}</p>
          <p><strong>VIN: </strong>{vehicle?.vin || 'N/A'}</p>
          <p><strong>License: </strong>{vehicle?.licensePlate || 'N/A'}</p>
          {workOrder?.vehicleMileage && <p><strong>Mileage: </strong>{workOrder.vehicleMileage}</p>}
        </div>
      </div>

      {/* Parts */}
      {parts && parts.length > 0 && (
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
              {parts.map((part, index) => (
                <tr key={part._id || `part-${index}`}>
                  <td className="border border-gray-300 p-2">{part.name || part.description}</td>
                  <td className="border border-gray-300 p-2">{part.partNumber}</td>
                  <td className="border border-gray-300 p-2 text-right">{part.quantity}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(part.price)}</td>
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

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-full sm:w-1/2 md:w-1/3 text-sm">
          <div className="flex justify-between py-1">
            <span>Subtotal:</span>
            <span>{formatCurrency(finalSubtotal)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Tax ({taxRate}%):</span>
            <span>{formatCurrency(finalTaxAmount)}</span>
          </div>
          <div className="flex justify-between py-1 text-lg font-bold border-t-2 border-b-2 border-gray-700 my-1">
            <span>TOTAL:</span>
            <span>{formatCurrency(finalTotal)}</span>
          </div>
        </div>
      </div>

      {/* Work Order Notes */}
      {customerFacingNotes.length > 0 && (
        <div className="mb-6 text-sm">
          <h3 className="font-semibold text-md mb-2 text-gray-700">Work Order Notes:</h3>
          <div className="border border-gray-300 rounded-md bg-gray-50">
            <div className="divide-y divide-gray-200">
              {customerFacingNotes.map((note, index) => (
                <div key={note._id} className="p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs text-gray-500">
                      {new Date(note.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-gray-700">{note.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {customerNotes && (
        <div className="mb-6 text-sm">
          <h3 className="font-semibold text-md mb-1 text-gray-700">Notes:</h3>
          <div className="border border-gray-300 p-3 rounded-md bg-gray-50">
            <p className="whitespace-pre-wrap">{customerNotes}</p>
          </div>
        </div>
      )}

      {/* Terms */}
      {terms && (
        <div className="mb-6 text-sm">
          <h3 className="font-semibold text-md mb-1 text-gray-700">Terms & Conditions:</h3>
          <div className="border border-gray-300 p-3 rounded-md">
            <p className="whitespace-pre-wrap">{terms}</p>
          </div>
        </div>
      )}
      
      {/* Payment Status (Optional, can be added if invoiceData includes status) */}
      {invoiceData.status && (
        <div className="mb-8">
            <h4 className="text-md font-semibold text-gray-700 mb-1">Payment Status:</h4>
            <p className={`text-sm font-medium ${invoiceData.status === 'Paid' ? 'text-green-600' : invoiceData.status === 'Issued' || invoiceData.status === 'Sent' ? 'text-orange-500' : 'text-gray-600'}`}>
              {invoiceData.status === 'Issued' ? 'Payment Due' : invoiceData.status}
            </p>
        </div>
      )}
      
      {/* Footer Message */}
      <div className="text-center text-xs text-gray-600 mt-8 border-t border-gray-300 pt-4">
        <p>Thank you for your business!</p>
        <p>{businessSettings.businessName} | {businessSettings.businessPhone} | {businessSettings.businessWebsite}</p>
      </div>
    </div>
  );
});

export default InvoiceDisplay;
