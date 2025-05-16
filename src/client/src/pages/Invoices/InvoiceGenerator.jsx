import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import WorkOrderService from '../../services/workOrderService';
import CustomerService from '../../services/customerService';
import VehicleService from '../../services/vehicleService';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';

// Import the utility formatters
const formatCurrency = (amount, currencyCode = 'USD', locale = 'en-US') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);
};

const InvoiceGenerator = () => {
  const { id } = useParams(); // For loading a specific work order to convert to invoice
  const [searchParams] = useSearchParams();
  const workOrderIdParam = searchParams.get('workOrder');
  const printTemplateRef = useRef(null);

  // Main states
  const [workOrders, setWorkOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  // Form data
  const [invoiceData, setInvoiceData] = useState({
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    invoiceDueDate: '',
    paymentTerms: 'Due on Receipt',
    customerNotes: '',
    terms: 'All services and repairs are guaranteed for 90 days or 3,000 miles, whichever comes first. Payment is due upon receipt unless other arrangements are made.',
    taxRate: 8.0,
    parts: [],
    labor: []
  });

  // Page states
  const [loading, setLoading] = useState(true); // Set to true initially for the first load
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('invoice'); // 'invoice' or 'preview'

  // Business settings
  const settings = {
    businessName: 'Phoenix Automotive Group, Inc.',
    businessAddressLine1: '201 Ford St',
    businessAddressLine2: 'Newark NY 14513',
    businessPhone: '315.830.0008',
    businessEmail: 'phxautosalvage@@gmail.com',
    businessWebsite: 'www.phxautogroup.com',
    businessLogo: '/phxLogo.svg' // This path needs to be updated
  };

  // Enhanced loadWorkOrder function
  const loadWorkOrder = async (workOrderId) => {
    if (!workOrderId) {
      console.warn("No work order ID provided to loadWorkOrder");
      // Optionally reset states if a WO was previously selected and now cleared
      // setSelectedWorkOrder(null);
      // setSelectedCustomer(null);
      // setSelectedVehicle(null);
      // setInvoiceData(prev => ({ ...prev, parts: [], labor: [] }));
      return;
    }

    console.log(`Loading work order with ID: ${workOrderId}`);
    setLoading(true); // Indicate loading specific work order
    setError(null);

    try {
      const response = await WorkOrderService.getWorkOrder(workOrderId);

      if (!response || !response.data || !response.data.workOrder) {
        console.error("Invalid response format when fetching work order:", response);
        setError(`Received invalid data format from server for work order ${workOrderId}.`);
        setLoading(false);
        return;
      }

      const workOrder = response.data.workOrder;
      console.log("Work order loaded:", workOrder);
      setSelectedWorkOrder(workOrder);

      // Reset related fields before loading new ones
      setSelectedCustomer(null);
      setVehicles([]);
      setSelectedVehicle(null);

      // Load customer data if available
      if (workOrder.customer) {
        const customerId = typeof workOrder.customer === 'object'
          ? workOrder.customer._id
          : workOrder.customer;

        console.log(`Loading customer with ID: ${customerId}`);
        try {
            const customerRes = await CustomerService.getCustomer(customerId);
            if (customerRes && customerRes.data && customerRes.data.customer) {
                setSelectedCustomer(customerRes.data.customer);

                // Load vehicles for this customer
                const vehiclesRes = await CustomerService.getCustomerVehicles(customerId);
                if (vehiclesRes && vehiclesRes.data && vehiclesRes.data.vehicles) {
                    setVehicles(vehiclesRes.data.vehicles);

                    // Load vehicle if available from work order
                    if (workOrder.vehicle) {
                        const vehicleId = typeof workOrder.vehicle === 'object'
                            ? workOrder.vehicle._id
                            : workOrder.vehicle;
                        
                        console.log(`Attempting to select vehicle with ID: ${vehicleId}`);
                        
                        const vehicleFromList = vehiclesRes.data.vehicles.find(v =>
                            v._id === vehicleId || v._id.toString() === vehicleId
                        );

                        if (vehicleFromList) {
                            setSelectedVehicle(vehicleFromList);
                            console.log("Vehicle selected from customer's list:", vehicleFromList);
                        } else {
                            console.warn(`Vehicle ${vehicleId} not found in customer's list. Fetching directly.`);
                            try {
                                const vehicleRes = await VehicleService.getVehicle(vehicleId);
                                if (vehicleRes && vehicleRes.data && vehicleRes.data.vehicle) {
                                    setSelectedVehicle(vehicleRes.data.vehicle);
                                     // Add to vehicles list if not already present for consistency? Or rely on selection.
                                    console.log("Vehicle fetched directly:", vehicleRes.data.vehicle);
                                } else {
                                     console.error(`Direct fetch for vehicle ${vehicleId} returned no data.`);
                                }
                            } catch (vehicleErr) {
                                console.error(`Error loading vehicle ${vehicleId} directly:`, vehicleErr);
                                // setError(`Failed to load vehicle ${vehicleId}: ${vehicleErr.message}`); // Avoid overriding main error
                            }
                        }
                    } else {
                        console.log("No vehicle ID specified in the work order.");
                    }
                } else {
                     console.log("No vehicles found for this customer or error fetching them.");
                }
            } else {
                 console.error(`Customer ${customerId} not found or error fetching.`);
            }
        } catch (custErr) {
            console.error(`Error loading customer ${customerId}:`, custErr);
            setError(`Failed to load customer details for ${customerId}: ${custErr.message}`);
        }
      } else {
        console.log("No customer ID associated with the work order.");
      }

      // Copy parts and labor data with guaranteed IDs for form management
      setInvoiceData(prev => ({
        ...prev,
        parts: workOrder.parts
          ? workOrder.parts.map((p, index) => ({
              ...p,
              _id: p._id || `part-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
              // Ensure quantity and price are numbers, and total is calculated
              quantity: parseFloat(p.quantity) || 0,
              price: parseFloat(p.price) || 0,
              total: (parseFloat(p.quantity) || 0) * (parseFloat(p.price) || 0),
            }))
          : [],
        labor: workOrder.labor
          ? workOrder.labor.map((l, index) => ({
              ...l,
              _id: l._id || `labor-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
              // Ensure hours and rate are numbers, and total is calculated
              hours: parseFloat(l.hours) || 0,
              rate: parseFloat(l.rate) || 0,
              total: (parseFloat(l.hours) || 0) * (parseFloat(l.rate) || 0),
            }))
          : [],
        // Potentially pre-fill other invoice fields if they come from the work order
        // customerNotes: workOrder.notesToCustomer || prev.customerNotes, 
      }));
      console.log("Invoice data updated with parts and labor from work order.");

    } catch (err) {
      console.error(`Error loading work order ${workOrderId}:`, err);
      setError(`Failed to load work order details: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true); // Start initial loading
        setError(null);

        // Fetch work orders for dropdown
        const workOrdersRes = await WorkOrderService.getAllWorkOrders();
        const activeWorkOrders = workOrdersRes.data.workOrders.filter(
          (wo) => !['Cancelled', 'Completed - Paid', 'Invoice - Paid'].includes(wo.status)
        );
        setWorkOrders(activeWorkOrders);

        // Fetch customers for dropdown
        const customersRes = await CustomerService.getAllCustomers();
        setCustomers(customersRes.data.customers);

        // Generate invoice number
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        // This is a placeholder for unique invoice numbers.
        // In a real app, this should be generated by the backend or a more robust sequential system.
        const invoiceCount = (await (window.InvoiceService && typeof window.InvoiceService.getInvoicesCount === 'function' ? window.InvoiceService.getInvoicesCount() : Promise.resolve(Math.floor(Math.random() * 10000)))) + 1;
        
        setInvoiceData(prev => ({
          ...prev,
          invoiceNumber: `INV-${dateStr}-${invoiceCount.toString().padStart(4, '0')}`,
          invoiceDate: today.toISOString().split('T')[0]
        }));

        // Set due date
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // Default due date: 30 days from now
        setInvoiceData(prev => ({
          ...prev,
          invoiceDueDate: dueDate.toISOString().split('T')[0]
        }));

        // Determine which work order ID to load from URL params
        const woToLoad = id || workOrderIdParam;
        console.log("Work Order to load from URL params:", woToLoad);

        if (woToLoad) {
          // Load the work order data - this call will set its own loading state for this specific operation
          await loadWorkOrder(woToLoad);
        }
        
        // Initial data loading is complete
        setLoading(false); 

      } catch (err) {
        console.error('Error loading initial data:', err);
        setError(`Failed to load initial data: ${err.message}. Ensure backend services are running or mocks are correctly configured.`);
        setLoading(false); // Ensure loading is false on error
      }
    };

    fetchInitialData();
  }, [id, workOrderIdParam]); // Dependencies for initial load and URL changes

  const handleWorkOrderChange = async (e) => {
    const newWorkOrderId = e.target.value;
    if (!newWorkOrderId) {
      setSelectedWorkOrder(null);
      setSelectedCustomer(null);
      setSelectedVehicle(null);
      setVehicles([]);
      setInvoiceData(prev => ({
        ...prev,
        parts: [],
        labor: []
        // Optionally reset other invoice data or keep for manual entry
      }));
      return;
    }
    // The loadWorkOrder function will handle setting loading state for this specific operation
    await loadWorkOrder(newWorkOrderId);
  };

  const handleCustomerChange = async (e) => {
    const customerId = e.target.value;
    setSelectedVehicle(null); // Reset vehicle when customer changes
    setVehicles([]);

    if (!customerId) {
      setSelectedCustomer(null);
      return;
    }
    try {
      setLoading(true);
      const customerRes = await CustomerService.getCustomer(customerId);
      setSelectedCustomer(customerRes.data.customer);

      const vehiclesRes = await CustomerService.getCustomerVehicles(customerId);
      setVehicles(vehiclesRes.data.vehicles);
      setLoading(false);
    } catch (err) {
      console.error('Error loading customer details:', err);
      setError('Failed to load customer vehicles.');
      setLoading(false);
    }
  };

  const handleVehicleChange = async (e) => {
    const vehicleId = e.target.value;
    if (!vehicleId) {
      setSelectedVehicle(null);
      return;
    }
    try {
      setLoading(true);
      // Find from existing list first
      const vehicleFromList = vehicles.find(v => v._id === vehicleId);
      if (vehicleFromList) {
          setSelectedVehicle(vehicleFromList);
      } else {
          // Fallback to fetch if not in the list (should ideally be)
          const vehicleRes = await VehicleService.getVehicle(vehicleId);
          setSelectedVehicle(vehicleRes.data.vehicle);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading vehicle details:', err);
      setError('Failed to load vehicle details.');
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInvoiceData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addPartRow = () => {
    setInvoiceData(prev => ({
      ...prev,
      parts: [
        ...prev.parts,
        {
          _id: `part-new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Temporary UI key
          name: '',
          partNumber: '',
          quantity: 1,
          price: 0,
          total: 0
        }
      ]
    }));
  };

  const updatePart = (index, field, value) => {
    setInvoiceData(prev => {
      const updatedParts = prev.parts.map((part, i) => {
        if (i === index) {
          const newPart = { ...part, [field]: value };
          if (field === 'quantity' || field === 'price') {
            const quantity = parseFloat(newPart.quantity) || 0;
            const price = parseFloat(newPart.price) || 0;
            newPart.total = quantity * price;
          }
          return newPart;
        }
        return part;
      });
      return { ...prev, parts: updatedParts };
    });
  };

  const removePart = (index) => {
    setInvoiceData(prev => ({
      ...prev,
      parts: prev.parts.filter((_, i) => i !== index)
    }));
  };

  const addLaborRow = () => {
    setInvoiceData(prev => ({
      ...prev,
      labor: [
        ...prev.labor,
        {
          _id: `labor-new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Temporary UI key
          description: '',
          hours: 1,
          rate: settings.defaultLaborRate || 100, // Assuming a default rate
          total: (settings.defaultLaborRate || 100) * 1
        }
      ]
    }));
  };

  const updateLabor = (index, field, value) => {
    setInvoiceData(prev => {
      const updatedLabor = prev.labor.map((item, i) => {
        if (i === index) {
          const newLabor = { ...item, [field]: value };
          if (field === 'hours' || field === 'rate') {
            const hours = parseFloat(newLabor.hours) || 0;
            const rate = parseFloat(newLabor.rate) || 0;
            newLabor.total = hours * rate;
          }
          return newLabor;
        }
        return item;
      });
      return { ...prev, labor: updatedLabor };
    });
  };

  const removeLabor = (index) => {
    setInvoiceData(prev => ({
      ...prev,
      labor: prev.labor.filter((_, i) => i !== index)
    }));
  };

  const calculateTotals = () => {
    const partsTotal = invoiceData.parts.reduce((sum, part) => sum + (parseFloat(part.total) || 0), 0);
    const laborTotal = invoiceData.labor.reduce((sum, laborItem) => sum + (parseFloat(laborItem.total) || 0), 0);
    const subtotal = partsTotal + laborTotal;
    const taxAmount = subtotal * (parseFloat(invoiceData.taxRate) / 100);
    const total = subtotal + taxAmount;
    return { partsTotal, laborTotal, subtotal, taxAmount, total };
  };

  const handleTaxRateChange = (e) => {
    const value = parseFloat(e.target.value);
    setInvoiceData(prev => ({
      ...prev,
      taxRate: isNaN(value) ? 0 : value // Ensure taxRate is a number
    }));
  };

  const generatePDF = async () => {
    if (!printTemplateRef.current) {
      setError("Preview template is not available. Cannot generate PDF.");
      return;
    }
    setActiveTab('preview'); // Switch to preview tab to ensure it's rendered

    setTimeout(async () => {
      try {
        const canvas = await html2canvas(printTemplateRef.current, {
          scale: 2,
          useCORS: true,
          logging: true
        });
        const imgData = canvas.toDataURL('image/png');

        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfPageHeight = pdf.internal.pageSize.getHeight();
        const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfPageHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
          heightLeft -= pdfPageHeight;
        }
        pdf.save(`Invoice-${invoiceData.invoiceNumber || 'draft'}.pdf`);

      } catch (err) {
        console.error('Error generating PDF:', err);
        setError(`Failed to generate PDF: ${err.message}. Check console for details.`);
      }
    }, 100);
  };

  const printInvoice = () => {
    setActiveTab('preview');
    setTimeout(() => {
      if (printTemplateRef.current) {
        const printContents = printTemplateRef.current.innerHTML;
        const popupWin = window.open('', '_blank', 'top=0,left=0,height=auto,width=auto');
        popupWin.document.open();
        popupWin.document.write(`
          <html>
            <head>
              <title>Invoice ${invoiceData.invoiceNumber || 'Draft'}</title>
              <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
              <style>
                body { margin: 0; padding: 20px; font-family: sans-serif; }
                @media print {
                  .no-print { display: none; }
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
              </style>
            </head>
            <body onload="window.print();window.close()">${printContents}</body>
          </html>
        `);
        popupWin.document.close();
      } else {
        setError("Preview template not ready for printing.");
      }
    }, 100);
  };

  const saveInvoice = async () => {
    const finalInvoice = {
      ...invoiceData,
      customerId: selectedCustomer?._id,
      vehicleId: selectedVehicle?._id,
      workOrderId: selectedWorkOrder?._id,
      status: 'Issued', // Or some initial status
      ...calculateTotals()
    };

    try {
      if (window.InvoiceService && typeof window.InvoiceService.createInvoice === 'function') {
        // await window.InvoiceService.createInvoice(finalInvoice); // Actual save
        alert('Invoice saved successfully (simulated)!');
      } else {
        console.log("Simulated Save:", finalInvoice);
        alert('Invoice data logged to console (InvoiceService not found).');
      }
      if (selectedWorkOrder && window.WorkOrderService && typeof window.WorkOrderService.updateWorkOrderStatus === 'function') {
        // await WorkOrderService.updateWorkOrderStatus(selectedWorkOrder._id, 'Invoiced');
      }
    } catch (err) {
      console.error("Error saving invoice:", err);
      setError(`Failed to save invoice: ${err.message}`);
    }
  };

 const renderPrintTemplate = () => {
  const totals = calculateTotals();
  const custAddr = selectedCustomer?.address;
  
  return (
    <div ref={printTemplateRef} className="p-4 sm:p-6 lg:p-8 bg-white text-gray-900 text-sm max-w-4xl mx-auto print-friendly-font">
      {/* Header - IMPROVED STYLING HERE */}
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
          <p className="text-md"><span className="font-semibold">Invoice #:</span> {invoiceData.invoiceNumber}</p>
          <p><span className="font-semibold">Date:</span> {new Date(invoiceData.invoiceDate).toLocaleDateString()}</p>
          <p><span className="font-semibold">Due Date:</span> {new Date(invoiceData.invoiceDueDate).toLocaleDateString()}</p>
          <p><span className="font-semibold">Payment Terms:</span> {invoiceData.paymentTerms}</p>
          {selectedWorkOrder && <p><span className="font-semibold">Work Order #:</span> {selectedWorkOrder._id.substring(0,8)}...</p>}
        </div>
      </div>

      {/* Customer and Vehicle Info */}
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div className="border border-gray-300 p-3 rounded-md">
          <h3 className="font-semibold text-md mb-2 text-gray-700">Bill To:</h3>
          <p className="font-bold">{selectedCustomer?.name || 'N/A'}</p>
          {custAddr && <p>{custAddr.street}</p>}
          {custAddr && <p>{custAddr.city}, {custAddr.state} {custAddr.zip}</p>}
          <p>{selectedCustomer?.phone || 'N/A'}</p>
          <p>{selectedCustomer?.email || 'N/A'}</p>
        </div>
        <div className="border border-gray-300 p-3 rounded-md">
          <h3 className="font-semibold text-md mb-2 text-gray-700">Vehicle Information:</h3>
          <p><strong>Vehicle:</strong> {selectedVehicle ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` : 'N/A'}</p>
          <p><strong>VIN:</strong> {selectedVehicle?.vin || 'N/A'}</p>
          <p><strong>License:</strong> {selectedVehicle?.licensePlate || 'N/A'}</p>
          {selectedWorkOrder?.vehicleMileage && <p><strong>Mileage:</strong> {selectedWorkOrder.vehicleMileage}</p>}
        </div>
      </div>

      {/* Parts */}
      {invoiceData.parts && invoiceData.parts.length > 0 && (
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
              {invoiceData.parts.map((part, index) => (
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
      {invoiceData.labor && invoiceData.labor.length > 0 && (
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
              {invoiceData.labor.map((laborItem, index) => (
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
            <span>{formatCurrency(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Tax ({invoiceData.taxRate}%):</span>
            <span>{formatCurrency(totals.taxAmount)}</span>
          </div>
          <div className="flex justify-between py-1 text-lg font-bold border-t-2 border-b-2 border-gray-700 my-1">
            <span>TOTAL:</span>
            <span>{formatCurrency(totals.total)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {invoiceData.customerNotes && (
        <div className="mb-6 text-sm">
          <h3 className="font-semibold text-md mb-1 text-gray-700">Notes:</h3>
          <div className="border border-gray-300 p-3 rounded-md bg-gray-50">
            <p className="whitespace-pre-wrap">{invoiceData.customerNotes}</p>
          </div>
        </div>
      )}

      {/* Terms */}
      {invoiceData.terms && (
        <div className="mb-6 text-sm">
          <h3 className="font-semibold text-md mb-1 text-gray-700">Terms & Conditions:</h3>
          <div className="border border-gray-300 p-3 rounded-md">
            <p className="whitespace-pre-wrap">{invoiceData.terms}</p>
          </div>
        </div>
      )}
      
      {/* Footer Message */}
      <div className="text-center text-xs text-gray-600 mt-8 border-t border-gray-300 pt-4">
        <p>Thank you for your business!</p>
        <p>{settings.businessName} | {settings.businessPhone} | {settings.businessWebsite}</p>
      </div>
    </div>
  );
};
  
  // Show loading indicator only during the initial full page load, 
  // or if explicitly set during an operation that blocks UI.
  // Individual operations like loadWorkOrder set their own loading states for more granular feedback.
  if (loading && !id && !workOrderIdParam && !selectedWorkOrder) { 
    return (
      <div className="container mx-auto flex justify-center items-center h-screen">
        <p className="text-xl text-gray-600">Loading Invoice Generator...</p>
      </div>
    );
  }

  const totals = calculateTotals();

  return (
    <div className="container mx-auto p-4 print-hide">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Invoice Generator</h1>
        <div className="flex space-x-2">
          <button onClick={saveInvoice} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Save Invoice</button>
          <button onClick={generatePDF} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Download PDF</button>
          <button onClick={printInvoice} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Print Invoice</button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}
      
      {/* Optional: Show loading indicator for specific operations if not covered by the main one */}
      {loading && (id || workOrderIdParam || selectedWorkOrder) && 
        <div className="mb-4 text-center text-blue-600">Loading details...</div>
      }


      <div className="mb-4 border-b border-gray-300">
        <nav className="flex space-x-4">
          <button
            className={`py-2 px-4 font-medium ${activeTab === 'invoice' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            onClick={() => setActiveTab('invoice')}
          >
            Edit Invoice
          </button>
          <button
            className={`py-2 px-4 font-medium ${activeTab === 'preview' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
        </nav>
      </div>

      {activeTab === 'invoice' ? (
        <Card>
          <div className="space-y-6">
            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="text-xl font-semibold mb-3 text-gray-700">Source Document</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="md:col-span-2">
                  <SelectInput
                    label="Load from Work Order (Optional)"
                    name="workOrder"
                    value={selectedWorkOrder?._id || ''}
                    onChange={handleWorkOrderChange}
                    options={[
                      { value: '', label: 'Select a work order...' },
                      ...workOrders.map(wo => ({
                        value: wo._id,
                        label: `${wo._id.substring(0, 8)}... - ${typeof wo.customer === 'object' ? wo.customer.name : (customers.find(c => c._id === wo.customer)?.name || 'Unknown Cust.')} - ${wo.serviceRequested?.substring(0, 25) || 'N/A'}...`
                      }))
                    ]}
                    className="mt-1 block w-full"
                  />
                </div>
                <div className="text-sm text-gray-600">
                  {/* More specific loading state for work order selection might be needed if `loading` is too broad */}
                  {selectedWorkOrder ? (
                    <p>Status: <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${selectedWorkOrder.status && selectedWorkOrder.status.includes('Completed') ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{selectedWorkOrder.status || 'N/A'}</span></p>
                  ) : (
                    <p>Select a work order to auto-populate details.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="text-xl font-semibold mb-3 text-gray-700">Invoice Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <Input
                  label="Invoice Number"
                  name="invoiceNumber"
                  value={invoiceData.invoiceNumber}
                  onChange={handleInputChange}
                  required
                />
                <Input
                  label="Invoice Date"
                  name="invoiceDate"
                  type="date"
                  value={invoiceData.invoiceDate}
                  onChange={handleInputChange}
                  required
                />
                <Input
                  label="Due Date"
                  name="invoiceDueDate"
                  type="date"
                  value={invoiceData.invoiceDueDate}
                  onChange={handleInputChange}
                  required
                />
                <SelectInput
                  label="Payment Terms"
                  name="paymentTerms"
                  value={invoiceData.paymentTerms}
                  onChange={handleInputChange}
                  options={[
                    { value: 'Due on Receipt', label: 'Due on Receipt' },
                    { value: 'Net 15', label: 'Net 15 Days' },
                    { value: 'Net 30', label: 'Net 30 Days' },
                    { value: 'Net 60', label: 'Net 60 Days' }
                  ]}
                  className="mt-1 block w-full"
                />
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="text-xl font-semibold mb-3 text-gray-700">Customer & Vehicle</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectInput
                  label="Customer"
                  name="customer"
                  value={selectedCustomer?._id || ''}
                  onChange={handleCustomerChange}
                  options={[
                    { value: '', label: selectedCustomer ? 'Change Customer...' : 'Select a customer...' },
                    ...customers.map(customer => ({
                      value: customer._id,
                      label: `${customer.name} (${customer.phone || 'No Phone'})`
                    }))
                  ]}
                  disabled={!!selectedWorkOrder}
                  className="mt-1 block w-full"
                />
                <SelectInput
                  label="Vehicle"
                  name="vehicle"
                  value={selectedVehicle?._id || ''}
                  onChange={handleVehicleChange}
                  options={[
                    { value: '', label: selectedVehicle ? 'Change Vehicle...' : 'Select a vehicle...' },
                    ...vehicles.map(vehicle => ({
                      value: vehicle._id,
                      label: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.licensePlate ? `(${vehicle.licensePlate})` : ''}`
                    }))
                  ]}
                  disabled={!selectedCustomer || !!selectedWorkOrder}
                  className="mt-1 block w-full"
                />
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold text-gray-700">Parts</h3>
                <button
                  type="button"
                  onClick={addPartRow}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                  Add Part
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider w-2/5">Description</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Part Number</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoiceData.parts.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-3 py-4 text-center text-gray-500">
                          No parts added. Click "Add Part" to include parts in the invoice.
                        </td>
                      </tr>
                    ) : (
                      invoiceData.parts.map((part, index) => (
                        <tr key={part._id || `part-form-${index}`}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Input
                              type="text"
                              value={part.name || part.description || ''}
                              onChange={(e) => updatePart(index, 'name', e.target.value)}
                              placeholder="Part description"
                              className="mt-1 block w-full"
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Input
                              type="text"
                              value={part.partNumber || ''}
                              onChange={(e) => updatePart(index, 'partNumber', e.target.value)}
                              placeholder="Part #"
                              className="mt-1 block w-full"
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Input
                              type="number"
                              min="0"
                              step="any" // Allow decimals for quantity if needed
                              value={part.quantity}
                              onChange={(e) => updatePart(index, 'quantity', e.target.value)} // Value will be string, parsed in updatePart
                              className="mt-1 block w-20 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={part.price}
                              onChange={(e) => updatePart(index, 'price', e.target.value)} // Value will be string, parsed in updatePart
                              className="mt-1 block w-24 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right">
                            {formatCurrency(part.total || 0)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center">
                            <button
                              type="button"
                              className="text-red-600 hover:text-red-800 text-xs"
                              onClick={() => removePart(index)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold text-gray-700">Labor</h3>
                <button
                  type="button"
                  onClick={addLaborRow}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                  Add Labor
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider w-3/5">Description</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Rate ($/hr)</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoiceData.labor.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-3 py-4 text-center text-gray-500">
                          No labor items added. Click "Add Labor" to include labor charges.
                        </td>
                      </tr>
                    ) : (
                      invoiceData.labor.map((item, index) => (
                        <tr key={item._id || `labor-form-${index}`}>
                          <td className="px-3 py-2">
                            <Input
                              type="text"
                              value={item.description || ''}
                              onChange={(e) => updateLabor(index, 'description', e.target.value)}
                              placeholder="Labor description"
                              className="mt-1 block w-full"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={item.hours}
                              onChange={(e) => updateLabor(index, 'hours', e.target.value)} // Parsed in updateLabor
                              className="mt-1 block w-20 text-right"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.rate}
                              onChange={(e) => updateLabor(index, 'rate', e.target.value)} // Parsed in updateLabor
                              className="mt-1 block w-24 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(item.total || 0)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              className="text-red-600 hover:text-red-800 text-xs"
                              onClick={() => removeLabor(index)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="text-xl font-semibold mb-3 text-gray-700">Summary</h3>
              <div className="flex justify-end">
                <div className="w-full md:w-1/2 lg:w-1/3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Subtotal (Parts):</span>
                    <span className="text-gray-800">{formatCurrency(totals.partsTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Subtotal (Labor):</span>
                    <span className="text-gray-800">{formatCurrency(totals.laborTotal)}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Total Before Tax:</span>
                    <span className="text-gray-800">{formatCurrency(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-600">Tax Rate (%):</span>
                    <Input
                      type="number"
                      name="taxRate"
                      value={invoiceData.taxRate}
                      onChange={handleTaxRateChange}
                      min="0"
                      step="0.01"
                      className="w-20 text-right p-1 border-gray-300 rounded"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Tax Amount:</span>
                    <span className="text-gray-800">{formatCurrency(totals.taxAmount)}</span>
                  </div>
                  <hr className="my-1 border-t-2 border-gray-300" />
                  <div className="flex justify-between text-lg font-bold">
                    <span className="text-gray-800">Invoice Total:</span>
                    <span className="text-gray-800">{formatCurrency(totals.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="text-xl font-semibold mb-3 text-gray-700">Notes & Terms</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextArea
                  label="Notes for Customer"
                  name="customerNotes"
                  value={invoiceData.customerNotes}
                  onChange={handleInputChange}
                  rows="4"
                  placeholder="Any specific notes for the customer related to this invoice..."
                />
                <TextArea
                  label="Terms & Conditions"
                  name="terms"
                  value={invoiceData.terms}
                  onChange={handleInputChange}
                  rows="4"
                  placeholder="Payment terms, warranty information, etc."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button type="button" onClick={saveInvoice} className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50">
                Save Invoice
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Invoice Preview</h2>
          {renderPrintTemplate()}
        </Card>
      )}
    </div>
  );
};

export default InvoiceGenerator;