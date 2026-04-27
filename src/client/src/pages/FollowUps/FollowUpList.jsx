import React, { useState, useEffect, useCallback } from 'react';
import followUpService from '../../services/followUpService';
import FollowUpDetailModal from '../../components/followups/FollowUpDetailModal';
import { formatDateTime, formatDate } from '../../utils/formatters';

const priorityConfig = {
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-800', weight: 4 },
  high: { label: 'High', className: 'bg-orange-100 text-orange-800', weight: 3 },
  normal: { label: 'Normal', className: 'bg-blue-100 text-blue-800', weight: 2 },
  low: { label: 'Low', className: 'bg-gray-100 text-gray-600', weight: 1 }
};

const entityTypeLabels = {
  customer: 'Customer',
  vehicle: 'Vehicle',
  workOrder: 'Work Order',
  quote: 'Quote',
  invoice: 'Invoice',
  appointment: 'Appointment'
};

const FollowUpList = () => {
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('open');
  const [selectedFollowUp, setSelectedFollowUp] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const fetchFollowUps = useCallback(async () => {
    try {
      setLoading(true);
      const result = await followUpService.getFollowUps({ status: activeTab });
      setFollowUps(result.data.followUps || []);
    } catch (err) {
      console.error('Error fetching follow-ups:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  const handleRowClick = (fu) => {
    setSelectedFollowUp(fu);
    setDetailModalOpen(true);
  };

  const handleUpdated = (updated) => {
    setFollowUps(prev => prev.map(fu => fu._id === updated._id ? updated : fu));
    setSelectedFollowUp(updated);
  };

  const handleDeleted = (id) => {
    setFollowUps(prev => prev.filter(fu => fu._id !== id));
    setDetailModalOpen(false);
    setSelectedFollowUp(null);
  };

  const handleDetailClose = () => {
    setDetailModalOpen(false);
    setSelectedFollowUp(null);
    // Refresh to pick up any status changes
    fetchFollowUps();
  };

  const buildContext = (fu) => {
    const parts = [];
    if (fu.customer?.name) parts.push(fu.customer.name);
    if (fu.vehicle) parts.push(`${fu.vehicle.year || ''} ${fu.vehicle.make || ''} ${fu.vehicle.model || ''}`.trim());
    return parts.join(' — ');
  };

  const getFirstNotePreview = (fu) => {
    if (!fu.notes || fu.notes.length === 0) return '';
    const text = fu.notes[0].text;
    return text.length > 80 ? text.substring(0, 80) + '...' : text;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          <i className="fas fa-thumbtack text-rose-500 mr-2"></i>Follow-Ups
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('open')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'open'
              ? 'border-rose-500 text-rose-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Open
        </button>
        <button
          onClick={() => setActiveTab('closed')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'closed'
              ? 'border-gray-500 text-gray-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Closed
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <i className="fas fa-spinner fa-spin mr-2"></i>Loading...
        </div>
      ) : followUps.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <i className="fas fa-thumbtack text-4xl mb-3 block"></i>
          <p>No {activeTab} follow-ups</p>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Context</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {followUps.map((fu) => {
                const isOverdue = fu.status === 'open' && fu.dueDate && new Date(fu.dueDate) < new Date();
                return (
                  <tr
                    key={fu._id}
                    onClick={() => handleRowClick(fu)}
                    className={`cursor-pointer hover:bg-gray-50 transition ${isOverdue ? 'bg-red-50' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm text-gray-800 max-w-xs truncate">
                      {buildContext(fu)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{entityTypeLabels[fu.entityType] || fu.entityType}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-sm truncate">
                      {getFirstNotePreview(fu)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityConfig[fu.priority]?.className}`}>
                        {priorityConfig[fu.priority]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {fu.dueDate ? (
                        <span className={`text-xs ${isOverdue ? 'text-red-700 font-semibold' : 'text-gray-600'}`}>
                          {formatDate(fu.dueDate)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{fu.notes?.length || 0}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(fu.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedFollowUp && (
        <FollowUpDetailModal
          isOpen={detailModalOpen}
          onClose={handleDetailClose}
          followUpId={selectedFollowUp._id}
          followUpData={selectedFollowUp}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
};

export default FollowUpList;
