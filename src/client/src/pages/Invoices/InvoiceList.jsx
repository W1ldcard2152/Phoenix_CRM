import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import invoiceService from '../../services/invoiceService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SelectInput from '../../components/common/SelectInput';

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

  const handlePrintInvoice = (invoiceId) => {
    navigate(`/invoices/${invoiceId}`);
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
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