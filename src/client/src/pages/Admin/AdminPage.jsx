import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom'; // Added useNavigate
import invoiceService from '../../services/invoiceService'; 
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';

const AdminPage = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate(); // Added useNavigate hook

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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.status || 'N/A'}</td>
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
