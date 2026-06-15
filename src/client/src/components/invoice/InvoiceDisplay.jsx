import React, { useState, useEffect } from 'react';
import { formatCurrency, parseLocalDate, formatDate, formatDateTime } from '../../utils/formatters'; // Import centralized formatter
import workOrderNotesService from '../../services/workOrderNotesService';
import JobGroups from '../common/JobGroups';
import { normalizeInvoiceGroups, normalizeLiveGroups } from '../../utils/jobGrouping';

const InvoiceDisplay = React.forwardRef(({ invoiceData, businessSettings }, ref) => {
  const [customerFacingNotes, setCustomerFacingNotes] = useState([]);
  
  // Fetch customer-facing notes when workOrder changes
  useEffect(() => {
    const fetchCustomerNotes = async () => {
      if (invoiceData?.workOrder?._id) {
        try {
          const response = await workOrderNotesService.getCustomerFacingNotes(invoiceData.workOrder._id);
          setCustomerFacingNotes(response.data?.notes || []);
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
    items = [],                    // Modern invoice structure with items array
    parts: invoiceDataParts = [],      // Legacy parts from invoiceData (fallback)
    labor: invoiceDataLabor = [],      // Legacy labor from invoiceData (fallback)
    subtotal: initialSubtotal,     // Original subtotal from invoiceData
    discount,                      // { type, value, description, amount } | null
    discountAmount: initialDiscountAmount,
    taxAmount: initialTaxAmount,   // Original taxAmount from invoiceData
    total: initialTotal,           // Original total from invoiceData
    // Nested data
    customer,
    vehicle,
    workOrder, // Still needed for mileage, but not for WO# in header
  } = invoiceData;

  const custAddr = customer?.address;

  // Process items array (modern structure) or fallback to legacy parts/labor arrays
  let parts, labor, services;

  if (items && items.length > 0) {
    // Modern structure: separate items by type
    parts = items.filter(item => item.type === 'Part').map(item => ({
      _id: item._id,
      name: item.description,
      partNumber: item.partNumber || '',
      quantity: item.quantity,
      price: item.unitPrice,
      total: item.total,
      warranty: item.warranty || '',
      coreCharge: item.coreCharge || 0,
      coreChargeInvoiceable: item.coreChargeInvoiceable || false
    }));

    labor = items.filter(item => item.type === 'Labor').map(item => ({
      _id: item._id,
      description: item.description,
      hours: item.quantity,
      rate: item.unitPrice,
      total: item.total,
      billingType: item.billingType || 'hourly'
    }));

    services = items.filter(item => item.type === 'Service').map(item => ({
      _id: item._id,
      name: item.description,
      price: item.unitPrice,
      total: item.total,
      includedItems: item.includedItems || []
    }));
  } else {
    // Legacy structure: use existing parts and labor arrays
    parts = invoiceDataParts || [];
    labor = invoiceDataLabor || [];
    services = invoiceData.servicePackages || [];
  }

  // Calculate totals based on processed parts, labor, and services
  // or use initial totals from invoiceData if provided.
  const calculatedPartsTotal = parts.reduce((sum, part) => sum + (parseFloat(part.total) || 0), 0);
  const calculatedLaborTotal = labor.reduce((sum, laborItem) => sum + (parseFloat(laborItem.total) || 0), 0);
  const calculatedServicesTotal = services.reduce((sum, svc) => sum + (parseFloat(svc.total || svc.price) || 0), 0);
  const calculatedSubtotal = calculatedPartsTotal + calculatedLaborTotal + calculatedServicesTotal;

  // Group line items by job. Modern invoices carry a per-item jobName; legacy
  // invoices (no items[]) fall back to the General bucket via live grouping.
  const jobGroups = (items && items.length > 0)
    ? normalizeInvoiceGroups(items)
    : normalizeLiveGroups({ services: workOrder?.services || [], parts, labor, servicePackages: services });

  const finalSubtotal = initialSubtotal !== undefined ? initialSubtotal : calculatedSubtotal;
  const finalDiscountAmount = initialDiscountAmount !== undefined
    ? initialDiscountAmount
    : (discount && discount.amount ? Math.min(parseFloat(discount.amount) || 0, finalSubtotal) : 0);
  const discountedSubtotal = Math.max(0, finalSubtotal - finalDiscountAmount);
  const finalTaxAmount = initialTaxAmount !== undefined ? initialTaxAmount : discountedSubtotal * (parseFloat(taxRate) / 100);
  const finalTotal = initialTotal !== undefined ? initialTotal : discountedSubtotal + finalTaxAmount;

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
          <p><span className="font-semibold">Date: </span>{formatDate(invoiceDate)}</p>
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

      {/* Service Requested */}
      {workOrder?.serviceRequested && (
        <div className="mb-4 text-sm">
          <h3 className="font-semibold text-md mb-1 text-gray-700">Service Requested:</h3>
          <div className="border border-gray-300 p-3 rounded-md bg-gray-50">
            <p className="whitespace-pre-wrap">{workOrder.serviceRequested}</p>
          </div>
        </div>
      )}

      {/* Diagnostic Notes */}
      {workOrder?.diagnosticNotes && (
        <div className="mb-4 text-sm">
          <h3 className="font-semibold text-md mb-1 text-gray-700">Diagnostic Notes:</h3>
          <div className="border border-gray-300 p-3 rounded-md">
            <p className="whitespace-pre-wrap">{workOrder.diagnosticNotes}</p>
          </div>
        </div>
      )}

      {/* Line items grouped by job */}
      <JobGroups groups={jobGroups} />

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-full sm:w-1/2 md:w-1/3 text-sm">
          <div className="flex justify-between py-1">
            <span>Subtotal:</span>
            <span>{formatCurrency(finalSubtotal)}</span>
          </div>
          {discount && finalDiscountAmount > 0 && (
            <div className="flex justify-between py-1">
              <span>{discount.description || 'Discount'}:</span>
              <span className="text-green-700">−{formatCurrency(finalDiscountAmount)}</span>
            </div>
          )}
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
                      {formatDateTime(note.createdAt)}
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

      {/* Footer Message */}
      <div className="text-center text-xs text-gray-600 mt-8 border-t border-gray-300 pt-4">
        <p>Thank you for your business!</p>
        <p>{businessSettings.businessName} | {businessSettings.businessPhone} | {businessSettings.businessWebsite}</p>
      </div>
    </div>
  );
});

export default InvoiceDisplay;
