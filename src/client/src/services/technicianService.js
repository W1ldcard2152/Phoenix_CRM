import api from './api'; // Assuming your API setup is in 'api.js'

const TECHNICIANS_ENDPOINT = '/technicians';

// Fetch all technicians (can filter by isActive, e.g., ?isActive=true or ?isActive=false)
export const getAllTechnicians = (isActive = true) => {
  return api.get(`${TECHNICIANS_ENDPOINT}?isActive=${isActive}`);
};

// Fetch a single technician by ID
export const getTechnicianById = (id) => {
  return api.get(`${TECHNICIANS_ENDPOINT}/${id}`);
};

// Create a new technician
export const createTechnician = (technicianData) => {
  return api.post(TECHNICIANS_ENDPOINT, technicianData);
};

// Update an existing technician
export const updateTechnician = (id, technicianData) => {
  return api.patch(`${TECHNICIANS_ENDPOINT}/${id}`, technicianData); // Or put
};

// Deactivate a technician (soft delete)
export const deactivateTechnician = (id) => {
  return api.delete(`${TECHNICIANS_ENDPOINT}/${id}`);
};

// Reactivate a technician (assuming isActive is a field that can be updated)
export const reactivateTechnician = (id) => {
  return api.patch(`${TECHNICIANS_ENDPOINT}/${id}`, { isActive: true });
};

// If you implement permanent delete on the server:
// export const permanentlyDeleteTechnician = (id) => {
//   return api.delete(`${TECHNICIANS_ENDPOINT}/${id}/permanent`);
// };

const technicianService = {
  getAllTechnicians,
  getTechnicianById,
  createTechnician,
  updateTechnician,
  deactivateTechnician,
  reactivateTechnician,
  // permanentlyDeleteTechnician,
};

export default technicianService;
