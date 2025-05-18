import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import WorkOrderService from '../../services/workOrderService';
import CustomerService from '../../services/customerService';
import VehicleService from '../../services/vehicleService';
import InvoiceService from '../../services/invoiceService'; // Added InvoiceService import
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';
import InvoiceDisplay from '../../components/invoice/InvoiceDisplay'; // Import the new component
// formatCurrency is now imported from utils/formatters, so local definition is removed.
import { formatCurrency } from '../../utils/formatters';


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
      return;
    }

    console.log(`Loading work order with ID: ${workOrderId}`);
    setLoading(true); 
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
      setSelectedWorkOrder(workOrder);

      setSelectedCustomer(null);
      setVehicles([]);
      setSelectedVehicle(null);

      if (workOrder.customer) {
        const customerId = typeof workOrder.customer === 'object'
          ? workOrder.customer._id
          : workOrder.customer;
        try {
            const customerRes = await CustomerService.getCustomer(customerId);
            if (customerRes && customerRes.data && customerRes.data.customer) {
                setSelectedCustomer(customerRes.data.customer);
                const vehiclesRes = await CustomerService.getCustomerVehicles(customerId);
                if (vehiclesRes && vehiclesRes.data && vehiclesRes.data.vehicles) {
                    setVehicles(vehiclesRes.data.vehicles);
                    if (workOrder.vehicle) {
                        const vehicleId = typeof workOrder.vehicle === 'object'
                            ? workOrder.vehicle._id
                            : workOrder.vehicle;
                        const vehicleFromList = vehiclesRes.data.vehicles.find(v =>
                            v._id === vehicleId || v._id.toString() === vehicleId
                        );
                        if (vehicleFromList) {
                            setSelectedVehicle(vehicleFromList);
                        } else {
                            try {
                                const vehicleRes = await VehicleService.getVehicle(vehicleId);
                                if (vehicleRes && vehicleRes.data && vehicleRes.data.vehicle) {
                                    setSelectedVehicle(vehicleRes.data.vehicle);
                                }
                            } catch (vehicleErr) {
                                console.error(`Error loading vehicle ${vehicleId} directly:`, vehicleErr);
                            }
                        }
                    }
                }
            }
        } catch (custErr) {
            console.error(`Error loading customer ${customerId}:`, custErr);
            setError(`Failed to load customer details for ${customerId}: ${custErr.message}`);
        }
      }

      setInvoiceData(prev => ({
        ...prev,
        parts: workOrder.parts
          ? workOrder.parts.map((p, index) => ({
              ...p,
              _id: p._id || `part-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
              quantity: parseFloat(p.quantity) || 0,
              price: parseFloat(p.price) || 0,
              total: (parseFloat(p.quantity) || 0) * (parseFloat(p.price) || 0),
            }))
          : [],
        labor: workOrder.labor
          ? workOrder.labor.map((l, index) => ({
              ...l,
              _id: l._id || `labor-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
              hours: parseFloat(l.hours) || 0,
              rate: parseFloat(l.rate) || 0,
              total: (parseFloat(l.hours) || 0) * (parseFloat(l.rate) || 0),
            }))
          : [],
      }));
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
        setLoading(true);
        setError(null);

        const workOrdersRes = await WorkOrderService.getAllWorkOrders();
        const activeWorkOrders = workOrdersRes.data.workOrders.filter(
          (wo) => !['Cancelled', 'Completed - Paid', 'Invoice - Paid'].includes(wo.status)
        );
        setWorkOrders(activeWorkOrders);

        const customersRes = await CustomerService.getAllCustomers();
        setCustomers(customersRes.data.customers);

        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const invoiceCount = Math.floor(Math.random() * 10000) + 1;
        
        setInvoiceData(prev => ({
          ...prev,
          invoiceNumber: `INV-${dateStr}-${invoiceCount.toString().padStart(4, '0')}`,
          invoiceDate: today.toISOString().split('T')[0]
        }));

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        setInvoiceData(prev => ({
          ...prev,
          invoiceDueDate: dueDate.toISOString().split('T')[0]
        }));

        const woToLoad = id || workOrderIdParam;
        if (woToLoad) {
          await loadWorkOrder(woToLoad);
        }
        
        setLoading(false); 
      } catch (err) {
        console.error('Error loading initial data:', err);
        setError(`Failed to load initial data: ${err.message}.`);
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [id, workOrderIdParam]);

  const handleWorkOrderChange = async (e) => {
    const newWorkOrderId = e.target.value;
    if (!newWorkOrderId) {
      setSelectedWorkOrder(null);
      setSelectedCustomer(null);
      setSelectedVehicle(null);
      setVehicles([]);
      setInvoiceData(prev => ({ ...prev, parts: [], labor: [] }));
      return;
    }
    await loadWorkOrder(newWorkOrderId);
  };

  const handleCustomerChange = async (e) => {
    const customerId = e.target.value;
    setSelectedVehicle(null); 
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
      const vehicleFromList = vehicles.find(v => v._id === vehicleId);
      if (vehicleFromList) {
          setSelectedVehicle(vehicleFromList);
      } else {
          const vehicleRes = await VehicleService.getVehicle(vehicleId);
          setSelectedVehicle(vehicleRes.data.vehicle);
      }
      setLoading(false);
    } catch (err) {
      setError('Failed to load vehicle details.');
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInvoiceData(prev => ({ ...prev, [name]: value }));
  };

  const addPartRow = () => {
    setInvoiceData(prev => ({
      ...prev,
      parts: [
        ...prev.parts,
        { _id: `part-new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, name: '', partNumber: '', quantity: 1, price: 0, total: 0 }
      ]
    }));
  };

  const updatePart = (index, field, value) => {
    setInvoiceData(prev => {
      const updatedParts = prev.parts.map((part, i) => {
        if (i === index) {
          const newPart = { ...part, [field]: value };
          if (field === 'quantity' || field === 'price') {
            newPart.total = (parseFloat(newPart.quantity) || 0) * (parseFloat(newPart.price) || 0);
          }
          return newPart;
        }
        return part;
      });
      return { ...prev, parts: updatedParts };
    });
  };

  const removePart = (index) => {
    setInvoiceData(prev => ({ ...prev, parts: prev.parts.filter((_, i) => i !== index) }));
  };

  const addLaborRow = () => {
    setInvoiceData(prev => ({
      ...prev,
      labor: [
        ...prev.labor,
        { _id: `labor-new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, description: '', hours: 1, rate: settings.defaultLaborRate || 100, total: (settings.defaultLaborRate || 100) * 1 }
      ]
    }));
  };

  const updateLabor = (index, field, value) => {
    setInvoiceData(prev => {
      const updatedLabor = prev.labor.map((item, i) => {
        if (i === index) {
          const newLabor = { ...item, [field]: value };
          if (field === 'hours' || field === 'rate') {
            newLabor.total = (parseFloat(newLabor.hours) || 0) * (parseFloat(newLabor.rate) || 0);
          }
          return newLabor;
        }
        return item;
      });
      return { ...prev, labor: updatedLabor };
    });
  };

  const removeLabor = (index) => {
    setInvoiceData(prev => ({ ...prev, labor: prev.labor.filter((_, i) => i !== index) }));
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
    setInvoiceData(prev => ({ ...prev, taxRate: isNaN(value) ? 0 : value }));
  };

  const generatePDF = async () => {
    if (!printTemplateRef.current) {
      setError("Preview template is not available. Cannot generate PDF.");
      return;
    }
    setActiveTab('preview');
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(printTemplateRef.current, { scale: 2, useCORS: true, logging: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
        setError(`Failed to generate PDF: ${err.message}.`);
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
              <style> body { margin: 0; padding: 20px; font-family: sans-serif; } @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } } </style>
            </head>
            <body onload="window.print();window.close()">${printContents}</body>
          </html>`);
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
      status: 'Issued',
      ...calculateTotals()
    };
    try {
      if (InvoiceService && typeof InvoiceService.createInvoice === 'function') {
        await InvoiceService.createInvoice(finalInvoice); 
        alert('Invoice saved successfully!');
      } else {
        alert('Error: InvoiceService is not properly configured.');
      }
      if (selectedWorkOrder && WorkOrderService && typeof WorkOrderService.updateWorkOrderStatus === 'function') {
        await WorkOrderService.updateWorkOrderStatus(selectedWorkOrder._id, 'Invoiced');
      }
    } catch (err) {
      setError(`Failed to save invoice: ${err.response?.data?.message || err.message}.`);
    }
  };
  
  if (loading && !id && !workOrderIdParam && !selectedWorkOrder) { 
    return (
      <div className="container mx-auto flex justify-center items-center h-screen">
        <p className="text-xl text-gray-600">Loading Invoice Generator...</p>
      </div>
    );
  }

  const totals = calculateTotals();
  const currentFullInvoiceData = {
    ...invoiceData,
    ...totals,
    customer: selectedCustomer,
    vehicle: selectedVehicle,
    workOrder: selectedWorkOrder,
  };

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
            {/* Form sections remain unchanged */}
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
                <Input label="Invoice Number" name="invoiceNumber" value={invoiceData.invoiceNumber} onChange={handleInputChange} required />
                <Input label="Invoice Date" name="invoiceDate" type="date" value={invoiceData.invoiceDate} onChange={handleInputChange} required />
                <Input label="Due Date" name="invoiceDueDate" type="date" value={invoiceData.invoiceDueDate} onChange={handleInputChange} required />
                <SelectInput label="Payment Terms" name="paymentTerms" value={invoiceData.paymentTerms} onChange={handleInputChange} options={[{ value: 'Due on Receipt', label: 'Due on Receipt' }, { value: 'Net 15', label: 'Net 15 Days' }, { value: 'Net 30', label: 'Net 30 Days' }, { value: 'Net 60', label: 'Net 60 Days' }]} className="mt-1 block w-full" />
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="text-xl font-semibold mb-3 text-gray-700">Customer & Vehicle</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectInput label="Customer" name="customer" value={selectedCustomer?._id || ''} onChange={handleCustomerChange} options={[{ value: '', label: selectedCustomer ? 'Change Customer...' : 'Select a customer...' }, ...customers.map(c => ({ value: c._id, label: `${c.name} (${c.phone || 'No Phone'})` }))]} disabled={!!selectedWorkOrder} className="mt-1 block w-full" />
                <SelectInput label="Vehicle" name="vehicle" value={selectedVehicle?._id || ''} onChange={handleVehicleChange} options={[{ value: '', label: selectedVehicle ? 'Change Vehicle...' : 'Select a vehicle...' }, ...vehicles.map(v => ({ value: v._id, label: `${v.year} ${v.make} ${v.model} ${v.licensePlate ? `(${v.licensePlate})` : ''}` }))]} disabled={!selectedCustomer || !!selectedWorkOrder} className="mt-1 block w-full" />
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold text-gray-700">Parts</h3>
                <button type="button" onClick={addPartRow} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50">Add Part</button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider w-2/5">Description</th><th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Part Number</th><th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Qty</th><th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Unit Price</th><th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Total</th><th className="px-3 py-2 text-center font-medium text-gray-500 uppercase tracking-wider">Action</th></tr></thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoiceData.parts.length === 0 ? (<tr><td colSpan="6" className="px-3 py-4 text-center text-gray-500">No parts added.</td></tr>) : (invoiceData.parts.map((part, index) => (<tr key={part._id || `part-form-${index}`}><td className="px-3 py-2 whitespace-nowrap"><Input type="text" value={part.name || part.description || ''} onChange={(e) => updatePart(index, 'name', e.target.value)} placeholder="Part description" className="mt-1 block w-full" /></td><td className="px-3 py-2 whitespace-nowrap"><Input type="text" value={part.partNumber || ''} onChange={(e) => updatePart(index, 'partNumber', e.target.value)} placeholder="Part #" className="mt-1 block w-full" /></td><td className="px-3 py-2 whitespace-nowrap"><Input type="number" min="0" step="any" value={part.quantity} onChange={(e) => updatePart(index, 'quantity', e.target.value)} className="mt-1 block w-20 text-right" /></td><td className="px-3 py-2 whitespace-nowrap"><Input type="number" min="0" step="0.01" value={part.price} onChange={(e) => updatePart(index, 'price', e.target.value)} className="mt-1 block w-24 text-right" /></td><td className="px-3 py-2 whitespace-nowrap text-right">{formatCurrency(part.total || 0)}</td><td className="px-3 py-2 whitespace-nowrap text-center"><button type="button" className="text-red-600 hover:text-red-800 text-xs" onClick={() => removePart(index)}>Remove</button></td></tr>)))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold text-gray-700">Labor</h3>
                <button type="button" onClick={addLaborRow} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50">Add Labor</button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider w-3/5">Description</th><th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Hours</th><th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Rate ($/hr)</th><th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Total</th><th className="px-3 py-2 text-center font-medium text-gray-500 uppercase tracking-wider">Action</th></tr></thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoiceData.labor.length === 0 ? (<tr><td colSpan="5" className="px-3 py-4 text-center text-gray-500">No labor items added.</td></tr>) : (invoiceData.labor.map((item, index) => (<tr key={item._id || `labor-form-${index}`}><td className="px-3 py-2"><Input type="text" value={item.description || ''} onChange={(e) => updateLabor(index, 'description', e.target.value)} placeholder="Labor description" className="mt-1 block w-full" /></td><td className="px-3 py-2"><Input type="number" min="0" step="0.1" value={item.hours} onChange={(e) => updateLabor(index, 'hours', e.target.value)} className="mt-1 block w-20 text-right" /></td><td className="px-3 py-2"><Input type="number" min="0" step="0.01" value={item.rate} onChange={(e) => updateLabor(index, 'rate', e.target.value)} className="mt-1 block w-24 text-right" /></td><td className="px-3 py-2 text-right">{formatCurrency(item.total || 0)}</td><td className="px-3 py-2 text-center"><button type="button" className="text-red-600 hover:text-red-800 text-xs" onClick={() => removeLabor(index)}>Remove</button></td></tr>)))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="text-xl font-semibold mb-3 text-gray-700">Summary</h3>
              <div className="flex justify-end">
                <div className="w-full md:w-1/2 lg:w-1/3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="font-medium text-gray-600">Subtotal (Parts):</span><span className="text-gray-800">{formatCurrency(totals.partsTotal)}</span></div>
                  <div className="flex justify-between"><span className="font-medium text-gray-600">Subtotal (Labor):</span><span className="text-gray-800">{formatCurrency(totals.laborTotal)}</span></div>
                  <hr />
                  <div className="flex justify-between"><span className="font-medium text-gray-600">Total Before Tax:</span><span className="text-gray-800">{formatCurrency(totals.subtotal)}</span></div>
                  <div className="flex justify-between items-center"><span className="font-medium text-gray-600">Tax Rate (%):</span><Input type="number" name="taxRate" value={invoiceData.taxRate} onChange={handleTaxRateChange} min="0" step="0.01" className="w-20 text-right p-1 border-gray-300 rounded" /></div>
                  <div className="flex justify-between"><span className="font-medium text-gray-600">Tax Amount:</span><span className="text-gray-800">{formatCurrency(totals.taxAmount)}</span></div>
                  <hr className="my-1 border-t-2 border-gray-300" />
                  <div className="flex justify-between text-lg font-bold"><span className="text-gray-800">Invoice Total:</span><span className="text-gray-800">{formatCurrency(totals.total)}</span></div>
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="text-xl font-semibold mb-3 text-gray-700">Notes & Terms</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextArea label="Notes for Customer" name="customerNotes" value={invoiceData.customerNotes} onChange={handleInputChange} rows="4" placeholder="Any specific notes for the customer related to this invoice..." />
                <TextArea label="Terms & Conditions" name="terms" value={invoiceData.terms} onChange={handleInputChange} rows="4" placeholder="Payment terms, warranty information, etc." />
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
          {/* Use the new InvoiceDisplay component, passing the ref */}
          <InvoiceDisplay 
            ref={printTemplateRef} 
            invoiceData={currentFullInvoiceData} 
            businessSettings={settings} 
          />
        </Card>
      )}
    </div>
  );
};

export default InvoiceGenerator;
