import API from './api';

/**
 * Technician vehicle scan + the office's check-in queue.
 * Lookups return vehicles WITHOUT their owner — see vehicleCheckInController.
 */
const vehicleCheckInService = {
  /** { vin } or { plate, state } → { exists, vehicle? } */
  lookup: async (params) => {
    const response = await API.get('/vehicles/scan-lookup', { params });
    return response.data.data;
  },

  /** Apply scanned fields + mileage to a vehicle on file. */
  scanUpdate: async (vehicleId, body) => {
    const response = await API.post(`/vehicles/${vehicleId}/scan-update`, body);
    return response.data.data;
  },

  /** Send a vehicle that isn't on file to the office. */
  create: async (body) => {
    const response = await API.post('/vehicles/check-ins', body);
    return response.data.data.checkIn;
  },

  // ── Office ──
  list: async (status = 'open') => {
    const response = await API.get('/vehicles/check-ins', { params: { status } });
    return response.data.data.checkIns;
  },

  get: async (id) => {
    const response = await API.get(`/vehicles/check-ins/${id}`);
    return response.data.data.checkIn;
  },

  /** { status: 'resolved', vehicle } or { status: 'dismissed' } */
  resolve: async (id, body) => {
    const response = await API.patch(`/vehicles/check-ins/${id}`, body);
    return response.data.data.checkIn;
  }
};

export default vehicleCheckInService;
