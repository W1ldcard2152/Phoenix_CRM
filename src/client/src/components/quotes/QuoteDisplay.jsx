import React, { useState, useEffect } from 'react';
import { formatCurrency, parseLocalDate } from '../../utils/formatters';
import workOrderNotesService from '../../services/workOrderNotesService';

const QuoteDisplay = React.forwardRef(({ quoteData, businessSettings, partsCost, laborCost, subtotal, taxRate = 0, taxAmount, total }, ref) => {
  const [customerFacingNotes, setCustomerFacingNotes] = useState([]);

  useEffect(() => {
    const fetchCustomerNotes = async () => {
      if (quoteData?._id) {
        try {
          const response = await workOrderNotesService.getCustomerFacingNotes(quoteData._id);
          setCustomerFacingNotes(response.notes || []);
        } catch (error) {
          // Silently handle errors - quotes may not have notes and that's fine
          setCustomerFacingNotes([]);
        }
      }
    };
    fetchCustomerNotes();
  }, [quoteData?._id]);

  if (!quoteData || !businessSettings) {
    return <div>Loading quote data...</div>;
  }

  const { customer, vehicle, currentMileage, parts = [], labor = [] } = quoteData;
  const custAddr = customer?.address;

  // Calculate totals from data if not provided as props
  const calculatedPartsCost = partsCost !== undefined ? partsCost
    : parts.reduce((sum, part) => sum + ((parseFloat(part.price) || 0) * (parseFloat(part.quantity) || 0)), 0);
  const calculatedLaborCost = laborCost !== undefined ? laborCost
    : labor.reduce((sum, l) => {
        const qty = parseFloat(l.quantity) || parseFloat(l.hours) || 0;
        return sum + (qty * (parseFloat(l.rate) || 0));
      }, 0);
  const calculatedSubtotal = subtotal !== undefined ? subtotal : calculatedPartsCost + calculatedLaborCost;
  const calculatedTaxAmount = taxAmount !== undefined ? taxAmount : calculatedSubtotal * (parseFloat(taxRate) / 100);
  const calculatedTotal = total !== undefined ? total : calculatedSubtotal + calculatedTaxAmount;

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
          <h2 className="text-3xl font-bold text-gray-800">QUOTE</h2>
          <p className="text-md"><span className="font-semibold">Quote #: </span>{quoteData._id?.slice(-8)?.toUpperCase()}</p>
          <p><span className="font-semibold">Quote Date: </span>{parseLocalDate(quoteData.date).toLocaleDateString()}</p>
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
          {currentMileage && <p><strong>Mileage: </strong>{currentMileage.toLocaleString()}</p>}
        </div>
      </div>

      {/* Services */}
      {quoteData.services && quoteData.services.length > 0 && (
        <div className="mb-4">
          <h3 className="font-semibold text-md mb-1 text-gray-700">Services Quoted:</h3>
          <div className="border border-gray-300 p-3 rounded-md bg-gray-50">
            <ul className="list-disc list-inside">
              {quoteData.services.map((service, index) => (
                <li key={index} className="text-sm">{service.description}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency((parseFloat(part.price) || 0) * (parseFloat(part.quantity) || 0))}</td>
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
                <th className="border border-gray-300 p-2 text-right font-semibold">Qty</th>
                <th className="border border-gray-300 p-2 text-right font-semibold">Rate</th>
                <th className="border border-gray-300 p-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {labor.map((laborItem, index) => {
                const qty = parseFloat(laborItem.quantity) || parseFloat(laborItem.hours) || 0;
                const isHourly = laborItem.billingType !== 'fixed';
                return (
                  <tr key={laborItem._id || `labor-${index}`}>
                    <td className="border border-gray-300 p-2">{laborItem.description}</td>
                    <td className="border border-gray-300 p-2 text-right">{qty}{isHourly ? ' hrs' : ''}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(laborItem.rate)}{isHourly ? '/hr' : ''}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(qty * (parseFloat(laborItem.rate) || 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-full sm:w-1/2 md:w-1/3 text-sm">
          <div className="flex justify-between py-1">
            <span>Subtotal:</span>
            <span>{formatCurrency(calculatedSubtotal)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Tax ({taxRate}%):</span>
            <span>{formatCurrency(calculatedTaxAmount)}</span>
          </div>
          <div className="flex justify-between py-1 text-lg font-bold border-t-2 border-b-2 border-gray-700 my-1">
            <span>TOTAL:</span>
            <span>{formatCurrency(calculatedTotal)}</span>
          </div>
        </div>
      </div>

      {/* Customer-Facing Notes */}
      {customerFacingNotes.length > 0 && (
        <div className="mb-6 text-sm">
          <h3 className="font-semibold text-md mb-2 text-gray-700">Notes:</h3>
          <div className="border border-gray-300 rounded-md bg-gray-50">
            <div className="divide-y divide-gray-200">
              {customerFacingNotes.map((note) => (
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

      {/* Quote Validity Notice */}
      <div className="mb-6 text-sm">
        <div className="border border-gray-300 p-3 rounded-md bg-yellow-50">
          <p className="text-gray-700 italic">
            This is a quote and is subject to change. Prices are valid for 30 days from the quote date.
            Additional charges may apply if vehicle condition differs from initial assessment.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 mt-8 border-t border-gray-300 pt-4">
        <p>Thank you for your business!</p>
        <p>{businessSettings.businessName} | {businessSettings.businessPhone} | {businessSettings.businessWebsite}</p>
      </div>
    </div>
  );
});

export default QuoteDisplay;
