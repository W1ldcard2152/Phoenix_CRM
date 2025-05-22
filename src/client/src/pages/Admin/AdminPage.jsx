import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import invoiceService from '../../services/invoiceService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SelectInput from '../../components/common/SelectInput'; // Added SelectInput

const AdminPage = () => {
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
    { value: 'Cancelled', label: 'Cancelled' },
    { value: 'Refunded', label: 'Refunded' },
  ];

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        const response = await invoiceService.getAllInvoices(); // Renamed to response for clarity
        if (response && response.data && Array.isArray(response.data.invoices)) {
          setInvoices(response.data.invoices);
        } else if (response && Array.isArray(response.invoices)) { // Fallback for slightly different structures
          setInvoices(response.invoices);
        }
        else {
          // Handle cases where the structure is not as expected or data is missing
          console.warn("Received unexpected data structure for invoices:", response);
          setInvoices([]); // Default to empty array if data is not in expected format
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
    // Navigate to the InvoiceDetail page, which has the print functionality
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
      // Optionally, re-fetch or show a success message
    } catch (err) {
      console.error("Error updating invoice status:", err);
      setError(err.message || 'Failed to update status.');
      // Revert optimistic update if necessary or re-fetch
      // For simplicity, we'll rely on a potential re-fetch or user refresh for now
      // Or, you could store the original state and revert on error.
      const originalInvoices = await invoiceService.getAllInvoices();
      if (originalInvoices && originalInvoices.data && Array.isArray(originalInvoices.data.invoices)) {
        setInvoices(originalInvoices.data.invoices);
      }
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (window.confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      try {
        await invoiceService.deleteInvoice(invoiceId);
        setInvoices(prevInvoices => prevInvoices.filter(inv => inv._id !== invoiceId));
        // Optionally, show a success message
      } catch (err) {
        console.error("Error deleting invoice:", err);
        setError(err.message || 'Failed to delete invoice.');
        // Optionally, show an error message to the user
      }
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Administration</h1>

      <Card>
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Saved Invoices</h2>
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
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <Link to={`/invoices/${invoice._id}`} className="text-indigo-600 hover:text-indigo-900">
                        View
                      </Link>
                      <Button
                        onClick={() => handlePrintInvoice(invoice._id)}
                        variant="outline"
                        size="sm"
                      >
                        Print
                      </Button>
                      <Button
                        onClick={() => handleDeleteInvoice(invoice._id)}
                        variant="danger"
                        size="sm"
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-8 bg-white shadow rounded-lg p-4">
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Other Administrative Tasks</h2>
        <p className="text-gray-600">
          This section will include features like managing tax implementations, user management, and other site-wide administrative functions.
        </p>
        {/* Placeholder for future content */}
      </div>
    </div>
  );
};

export default AdminPage;
