import React, { useState, useEffect, useCallback } from 'react';
import technicianService from '../../services/technicianService';
import Button from '../../components/common/Button'; // Assuming you have a common Button component
import TechnicianFormModal from './TechnicianFormModal'; // To be created later

const TechniciansPage = () => {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState(null);

  const fetchTechnicians = useCallback(async (showInactive = false) => {
    setLoading(true);
    setError(null);
    try {
      // Pass true to getAllTechnicians to fetch both active and inactive, or adjust as needed
      const response = await technicianService.getAllTechnicians(showInactive ? undefined : true); 
      setTechnicians(response.data.data.technicians);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch technicians.');
      console.error("Error fetching technicians:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTechnicians(false); // Initially load only active technicians
  }, [fetchTechnicians]);

  const handleAddTechnician = () => {
    setSelectedTechnician(null); // Clear selected for new entry
    setShowModal(true);
  };

  const handleEditTechnician = (technician) => {
    setSelectedTechnician(technician);
    setShowModal(true);
  };

  const handleDeactivateTechnician = async (id) => {
    if (window.confirm('Are you sure you want to deactivate this technician?')) {
      try {
        setLoading(true);
        await technicianService.deactivateTechnician(id);
        fetchTechnicians(); // Refresh list
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to deactivate technician.');
        console.error("Error deactivating technician:", err);
      } finally {
        setLoading(false);
      }
    }
  };
  
  const handleReactivateTechnician = async (id) => {
    if (window.confirm('Are you sure you want to reactivate this technician?')) {
      try {
        setLoading(true);
        await technicianService.reactivateTechnician(id);
        fetchTechnicians(); // Refresh list to show updated status
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to reactivate technician.');
        console.error("Error reactivating technician:", err);
      } finally {
        setLoading(false);
      }
    }
  };
  
  const handleModalSave = () => {
    setShowModal(false);
    setSelectedTechnician(null); // Clear selected technician after save
    fetchTechnicians(); // Refresh list
  };

  if (loading && technicians.length === 0) { // Show loading only if no data yet
    return <div className="p-6 text-center">Loading technicians...</div>;
  }

  // Display error prominently if it occurs
  if (error && technicians.length === 0) {
    return <div className="p-6 text-red-600 bg-red-100 rounded-md text-center">Error: {error}</div>;
  }


  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">Technicians Management</h1>
        <Button 
          onClick={handleAddTechnician} 
          className="bg-primary-600 hover:bg-primary-700 text-white"
          disabled={loading}
        >
          <i className="fas fa-plus mr-2"></i>Add Technician
        </Button>
      </div>
      
      {error && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">Error: {error}</p>}


      {showModal && (
        <TechnicianFormModal
          technician={selectedTechnician}
          onClose={() => {
            setShowModal(false);
            setSelectedTechnician(null); // Clear selection on close
          }}
          onSave={handleModalSave}
        />
      )}

      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        {loading && technicians.length > 0 && <div className="p-4 text-center text-gray-500">Updating list...</div>}
        {!loading && technicians.length === 0 && !error && (
          <p className="p-6 text-center text-gray-600">No technicians found. Click "Add Technician" to get started.</p>
        )}
        {technicians.length > 0 && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Name</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Phone</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell sm:px-6">Email</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell sm:px-6">Specialization</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">Status</th>
                <th scope="col" className="relative px-4 py-3 sm:px-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {technicians.map((tech) => (
                <tr key={tech._id} className={`${!tech.isActive ? 'bg-gray-50 opacity-70' : ''}`}>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sm:px-6">{tech.name}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 sm:px-6">{tech.phone || '-'}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell sm:px-6">{tech.email || '-'}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell sm:px-6">{tech.specialization || '-'}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm sm:px-6">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      tech.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {tech.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2 sm:px-6">
                    <Button 
                      onClick={() => handleEditTechnician(tech)} 
                      variant="icon" 
                      className="text-primary-600 hover:text-primary-800"
                      title="Edit"
                      disabled={loading}
                    >
                      <i className="fas fa-pencil-alt"></i>
                    </Button>
                    {tech.isActive ? (
                      <Button 
                        onClick={() => handleDeactivateTechnician(tech._id)} 
                        variant="icon" 
                        className="text-red-600 hover:text-red-800"
                        title="Deactivate"
                        disabled={loading}
                      >
                        <i className="fas fa-user-slash"></i> 
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => handleReactivateTechnician(tech._id)} 
                        variant="icon" 
                        className="text-green-600 hover:text-green-800"
                        title="Reactivate"
                        disabled={loading}
                      >
                        <i className="fas fa-user-check"></i>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TechniciansPage;
