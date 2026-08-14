import API from './api';

/**
 * Cycle counts API client.
 *
 * Split from supplyService because counts are a workflow rather than CRUD on an
 * item, and the two have different permissions: entering counts is open to
 * anyone, while creating and posting are admin-only. Keeping them in separate
 * files keeps that boundary visible at the call site.
 */
const wrap = async (label, fn) => {
  try {
    const response = await fn();
    return response.data;
  } catch (error) {
    console.error(`${label}:`, error);
    throw error;
  }
};

const SupplyCountService = {
  /** How many items a scope covers, without committing to counting them. */
  preview: (scope) => wrap('Error previewing count scope',
    () => API.post('/supplies/counts/preview', { scope })),

  list: () => wrap('Error fetching counts', () => API.get('/supplies/counts')),

  /**
   * An open blind sheet comes back without expected quantities — the server
   * omits them, and there is no parameter that asks for them early.
   */
  get: (id) => wrap(`Error fetching count ${id}`,
    () => API.get(`/supplies/counts/${id}`)),

  /** Refused while the sheet is still open; finish counting first. */
  variances: (id) => wrap(`Error fetching variances for count ${id}`,
    () => API.get(`/supplies/counts/${id}/variances`)),

  create: ({ name, scope, blind = true, notes }) => wrap('Error creating count',
    () => API.post('/supplies/counts', { name, scope, blind, notes })),

  /**
   * Record what was counted.
   *
   * `entry` is either `{ countedPackages, countedLoose }` — three jugs and two
   * loose quarts — or `{ countedQuantity }` in stock units for items that come
   * in no packaging. The server resolves it to a stock-unit total using the
   * packaging ratio frozen on the line, so the conversion happens once.
   *
   * Pass `{ countedQuantity: null }` (or all-null) to clear back to uncounted,
   * which is not the same as counting zero.
   */
  setLine: (id, lineId, entry = {}) => wrap('Error saving count line',
    () => API.patch(`/supplies/counts/${id}/lines/${lineId}`, entry)),

  addLine: (id, supplyId) => wrap('Error adding count line',
    () => API.post(`/supplies/counts/${id}/lines`, { supply: supplyId })),

  removeLine: (id, lineId) => wrap('Error removing count line',
    () => API.delete(`/supplies/counts/${id}/lines/${lineId}`)),

  addFound: (id, { description, location, quantity }) => wrap('Error recording found item',
    () => API.post(`/supplies/counts/${id}/found`, { description, location, quantity })),

  review: (id) => wrap('Error moving count to review',
    () => API.post(`/supplies/counts/${id}/review`)),

  reopen: (id) => wrap('Error reopening count',
    () => API.post(`/supplies/counts/${id}/reopen`)),

  post: (id) => wrap('Error posting count',
    () => API.post(`/supplies/counts/${id}/post`)),

  cancel: (id) => wrap('Error cancelling count',
    () => API.post(`/supplies/counts/${id}/cancel`)),

  remove: (id) => wrap('Error deleting count',
    () => API.delete(`/supplies/counts/${id}`)),

  // ── Saved scopes ──
  listScopes: () => wrap('Error fetching saved scopes',
    () => API.get('/supplies/counts/scopes')),

  createScope: (name, scope) => wrap('Error saving scope',
    () => API.post('/supplies/counts/scopes', { name, scope })),

  updateScope: (id, data) => wrap('Error updating saved scope',
    () => API.patch(`/supplies/counts/scopes/${id}`, data)),

  deleteScope: (id) => wrap('Error deleting saved scope',
    () => API.delete(`/supplies/counts/scopes/${id}`)),

  runScope: (id) => wrap('Error running saved scope',
    () => API.post(`/supplies/counts/scopes/${id}/run`))
};

export default SupplyCountService;
