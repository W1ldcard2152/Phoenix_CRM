import React, { useState, useEffect } from 'react';
import feedbackService from '../../services/feedbackService';
import technicianService from '../../services/technicianService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import TextArea from '../../components/common/TextArea';
import SelectInput from '../../components/common/SelectInput';

const FeedbackAdminPage = () => {
  const [feedbackEntries, setFeedbackEntries] = useState([]);
  const [archivedFeedback, setArchivedFeedback] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState(null); // For edit/create
  const [formData, setFormData] = useState({
    user: '',
    feedbackText: '',
  });

  useEffect(() => {
    fetchFeedbackAndTechnicians();
  }, []);

  const fetchFeedbackAndTechnicians = async () => {
    try {
      setLoading(true);
      const [feedbackResponse, techniciansResponse] = await Promise.all([
        feedbackService.getAllFeedback(),
        technicianService.getAllTechnicians()
      ]);

      const allFeedback = feedbackResponse.data.feedback;
      setFeedbackEntries(allFeedback.filter(f => !f.archived));
      setArchivedFeedback(allFeedback.filter(f => f.archived).sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt)));
      setTechnicians(techniciansResponse.data.data.technicians.map(tech => ({
        value: tech._id,
        label: tech.name
      })));
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch data.');
      setLoading(false);
      console.error(err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateClick = () => {
    setCurrentFeedback(null);
    setFormData({ user: '', feedbackText: '' });
    setIsModalOpen(true);
  };

  const handleEditClick = (feedback) => {
    setCurrentFeedback(feedback);
    setFormData({
      user: feedback.user._id,
      feedbackText: feedback.feedbackText,
    });
    setIsModalOpen(true);
  };

  const handleDeleteClick = async (id) => {
    if (window.confirm('Are you sure you want to delete this feedback entry?')) {
      try {
        await feedbackService.deleteFeedback(id);
        fetchFeedbackAndTechnicians(); // Refresh list
      } catch (err) {
        setError('Failed to delete feedback.');
        console.error(err);
      }
    }
  };

  const handleArchiveClick = async (id) => {
    if (window.confirm('Are you sure you want to archive this feedback entry?')) {
      try {
        await feedbackService.archiveFeedback(id);
        fetchFeedbackAndTechnicians(); // Refresh list
      } catch (err) {
        setError('Failed to archive feedback.');
        console.error(err);
      }
    }
  };

  const handleRestoreClick = async (id) => {
    if (window.confirm('Are you sure you want to restore this feedback entry?')) {
      try {
        // TODO: Implement restore functionality in feedbackService and backend
        // await feedbackService.restoreFeedback(id);
        alert('Restore functionality not yet implemented.');
        fetchFeedbackAndTechnicians(); // Refresh list
      } catch (err) {
        setError('Failed to restore feedback.');
        console.error(err);
      }
    }
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    try {
      if (currentFeedback) {
        await feedbackService.updateFeedback(currentFeedback._id, formData);
      } else {
        await feedbackService.createFeedback(formData);
      }
      setIsModalOpen(false);
      fetchFeedbackAndTechnicians(); // Refresh list
    } catch (err) {
      setError('Failed to save feedback.');
      console.error(err);
    }
  };

  if (loading) return <div className="text-center py-4">Loading feedback...</div>;
  if (error) return <div className="text-center py-4 text-red-600">{error}</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Feedback Administration</h1>
      <Button onClick={handleCreateClick} className="mb-4">Add New Feedback</Button>

      <Card className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Active Feedback</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="py-2 px-4 border-b text-left">User</th>
                <th className="py-2 px-4 border-b text-left">Feedback</th>
                <th className="py-2 px-4 border-b text-left">Date</th>
                <th className="py-2 px-4 border-b text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {feedbackEntries.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-4 px-4 text-center text-gray-500">No active feedback entries.</td>
                </tr>
              ) : (
                feedbackEntries.map((entry) => (
                  <tr key={entry._id}>
                    <td className="py-2 px-4 border-b">{entry.user ? entry.user.name : 'N/A'}</td>
                    <td className="py-2 px-4 border-b">{entry.feedbackText}</td>
                    <td className="py-2 px-4 border-b">{new Date(entry.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 px-4 border-b">
                      <Button onClick={() => handleEditClick(entry)} className="mr-2">Edit</Button>
                      <Button onClick={() => handleArchiveClick(entry._id)} className="bg-yellow-500 hover:bg-yellow-700 mr-2">Archive</Button>
                      <Button onClick={() => handleDeleteClick(entry._id)} className="bg-red-500 hover:bg-red-700">Delete</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-semibold mb-4 cursor-pointer" onClick={() => setShowArchived(!showArchived)}>
          Archived Feedback ({archivedFeedback.length}) {showArchived ? '▲' : '▼'}
        </h2>
        {showArchived && (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b text-left">User</th>
                  <th className="py-2 px-4 border-b text-left">Feedback</th>
                  <th className="py-2 px-4 border-b text-left">Archived Date</th>
                  <th className="py-2 px-4 border-b text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedFeedback.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-4 px-4 text-center text-gray-500">No archived feedback entries.</td>
                  </tr>
                ) : (
                  archivedFeedback.map((entry) => (
                    <tr key={entry._id}>
                      <td className="py-2 px-4 border-b">{entry.user ? entry.user.name : 'N/A'}</td>
                      <td className="py-2 px-4 border-b">{entry.feedbackText}</td>
                      <td className="py-2 px-4 border-b">{new Date(entry.archivedAt).toLocaleDateString()}</td>
                      <td className="py-2 px-4 border-b">
                        <Button onClick={() => handleRestoreClick(entry._id)} className="bg-blue-500 hover:bg-blue-700 mr-2">Restore</Button>
                        <Button onClick={() => handleDeleteClick(entry._id)} className="bg-red-500 hover:bg-red-700">Delete</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
          <Card className="w-full max-w-lg p-6">
            <h2 className="text-xl font-bold mb-4">{currentFeedback ? 'Edit Feedback' : 'Add Feedback'}</h2>
            <form onSubmit={handleModalSubmit}>
              <div className="mb-4">
                <SelectInput
                  label="User"
                  name="user"
                  options={technicians}
                  value={formData.user}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="mb-4">
                <TextArea
                  label="Feedback Text"
                  name="feedbackText"
                  value={formData.feedbackText}
                  onChange={handleInputChange}
                  rows="4"
                  required
                />
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-500 hover:bg-gray-700 mr-2">Cancel</Button>
                <Button type="submit">{currentFeedback ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default FeedbackAdminPage;
