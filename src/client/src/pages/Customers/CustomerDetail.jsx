import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import CustomerService from '../../services/customerService';
import { useAuth } from '../../contexts/AuthContext';
import { permissions } from '../../utils/permissions';
import FollowUpModal from '../../components/followups/FollowUpModal';
import RelatedRecordsTabs from '../../components/common/RelatedRecordsTabs';

const CustomerDetail = () => {
  const { currentUser } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);

  useEffect(() => {
    const fetchCustomerData = async () => {
      try {
        setLoading(true);
        const customerResponse = await CustomerService.getCustomer(id);
        setCustomer(customerResponse.data.customer);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching customer data:', err);
        setError('Failed to load customer data. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchCustomerData();
  }, [id]);

  const handleDeleteCustomer = async () => {
    try {
      await CustomerService.deleteCustomer(id);
      navigate('/customers');
    } catch (err) {
      console.error('Error deleting customer:', err);
      const errorMessage = err.response?.data?.message || 'Failed to delete customer. Please try again later.';
      setError(errorMessage);
      setDeleteModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading customer data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="container mx-auto">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          Customer not found.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">{customer.name}</h1>
        <div className="flex space-x-2">
          <Button
            to={`/customers/${id}/edit`}
            variant="primary"
          >
            Edit Customer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFollowUpModalOpen(true)}
          >
            <i className="fas fa-thumbtack mr-1"></i>Follow-Up
          </Button>
          {permissions.customers.canDelete(currentUser) && (
            <Button
              variant="danger"
              onClick={() => setDeleteModalOpen(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      <FollowUpModal
        isOpen={followUpModalOpen}
        onClose={() => setFollowUpModalOpen(false)}
        entityType="customer"
        entityId={id}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card title="Contact Information">
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Phone</p>
              <p className="font-medium">{customer.phone}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">{customer.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Address</p>
              <p className="font-medium">
                {customer.address?.street && (
                  <>
                    {customer.address.street}<br />
                    {customer.address.city}, {customer.address.state} {customer.address.zip}
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Communication Preference</p>
              <p className="font-medium">{customer.communicationPreference}</p>
            </div>
          </div>
        </Card>

        <Card title="Customer Notes">
          <p className="text-gray-700">
            {customer.notes || 'No notes available for this customer.'}
          </p>
        </Card>
      </div>

      <div className="mb-6">
        <RelatedRecordsTabs customerId={id} />
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this customer? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="light"
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteCustomer}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDetail;