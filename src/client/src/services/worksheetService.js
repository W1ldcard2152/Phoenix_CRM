// src/client/src/services/worksheetService.js
// Client for the Parts Purchase Worksheet. The backend controllers/routes that
// back these calls are implemented in Phase 4; this module defines the contract
// the Phase 3 page is built against. All routes are namespaced under a work
// order's /worksheet path. Mutations never resend the whole parts/offers array —
// offers are appended via $push and edited via positional update server-side.
import API from './api';

const base = (workOrderId) => `/workorders/${workOrderId}/worksheet`;

const WorksheetService = {
  // Opening the worksheet transitions the WO to 'Parts Sourcing - In Progress'
  // (only from 'Inspection/Diag Complete'); returns the (possibly reconciled) WO.
  openWorksheet: async (workOrderId) => {
    const res = await API.post(`${base(workOrderId)}/open`);
    return res.data;
  },

  // Runs the close evaluation: all parts 'selected' (or zero parts) → 'Parts
  // Selected - Pending Approval'; any 'pending' → stays 'In Progress'.
  closeWorksheet: async (workOrderId) => {
    const res = await API.post(`${base(workOrderId)}/close`);
    return res.data;
  },

  // Hard-gate primer write-back to the WO ROOT (same fields the creation form sets).
  setPrimer: async (workOrderId, { sourcingPriority, sourcingQuality }) => {
    const res = await API.patch(`${base(workOrderId)}/primer`, { sourcingPriority, sourcingQuality });
    return res.data;
  },

  // Worksheet-level scratchpad (WorkOrder.sourcingNotes).
  updateSourcingNotes: async (workOrderId, sourcingNotes) => {
    const res = await API.patch(`${base(workOrderId)}/notes`, { sourcingNotes });
    return res.data;
  },

  // Per-part scratchpad.
  updateScratchpad: async (workOrderId, partId, scratchpad) => {
    const res = await API.patch(`${base(workOrderId)}/parts/${partId}/scratchpad`, { scratchpad });
    return res.data;
  },

  // Update a placeholder part's requested quantity (writer may change it, e.g.
  // before a split). Positional update server-side — never resend the parts array.
  updatePartQuantity: async (workOrderId, partId, quantity) => {
    const res = await API.patch(`${base(workOrderId)}/parts/${partId}/quantity`, { quantity });
    return res.data;
  },

  // Rename a placeholder part (fix a mis-typed part name before sourcing/approval).
  updatePartName: async (workOrderId, partId, name) => {
    const res = await API.patch(`${base(workOrderId)}/parts/${partId}/name`, { name });
    return res.data;
  },

  // Add a new placeholder part to a job from the worksheet. { name, quantity, serviceId }.
  addPart: async (workOrderId, { name, quantity, serviceId }) => {
    const res = await API.post(`${base(workOrderId)}/parts`, { name, quantity, serviceId });
    return res.data;
  },

  // Append a new offer to a part (server-side $push).
  addOffer: async (workOrderId, partId, offer) => {
    const res = await API.post(`${base(workOrderId)}/parts/${partId}/offers`, offer);
    return res.data;
  },

  // Field-by-field edit of an existing offer (server-side positional update).
  updateOffer: async (workOrderId, partId, offerId, fields) => {
    const res = await API.patch(`${base(workOrderId)}/parts/${partId}/offers/${offerId}`, fields);
    return res.data;
  },

  // Remove an offer ($pull). Rejected offers are normally KEPT as the audit trail;
  // this is for removing a mistaken/duplicate capture.
  removeOffer: async (workOrderId, partId, offerId) => {
    const res = await API.delete(`${base(workOrderId)}/parts/${partId}/offers/${offerId}`);
    return res.data;
  },

  // Decode a pasted screenshot of an online listing into the offer's fields (server
  // runs it through the Gemini vision decoder, then merges the result onto the offer).
  decodeOffer: async (workOrderId, partId, offerId, file) => {
    const form = new FormData();
    form.append('screenshot', file, file.name || 'screenshot.png');
    const res = await API.post(
      `${base(workOrderId)}/parts/${partId}/offers/${offerId}/decode`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }
    );
    return res.data;
  },

  // Record a selection (which offer the writer picked). Does NOT enrich the part —
  // that happens at manager approval. Sets sourcingStatus 'selected'.
  selectOffer: async (workOrderId, partId, offerId, selectionReason) => {
    const res = await API.post(`${base(workOrderId)}/parts/${partId}/select`, { offerId, selectionReason });
    return res.data;
  },

  // Manager approval: commit the (possibly edited) selected-offer fields onto the
  // placeholder part. fields = { name, vendor, supplier, brand, partNumber, cost,
  // coreCharge, url, price? }. Admin/management only.
  approvePart: async (workOrderId, partId, fields) => {
    const res = await API.post(`${base(workOrderId)}/parts/${partId}/approve`, fields);
    return res.data;
  },

  // Reopen an approved part for changes — reverts it to the awaiting-approval state so
  // a new offer can be selected and sent back through approval. Service writer allowed.
  unapprovePart: async (workOrderId, partId) => {
    const res = await API.post(`${base(workOrderId)}/parts/${partId}/unapprove`);
    return res.data;
  },

  // Split one placeholder part into N independently-sourced lines.
  // splits: [{ name, quantity }, ...] — quantity redistributed across clones.
  splitPart: async (workOrderId, partId, splits) => {
    const res = await API.post(`${base(workOrderId)}/parts/${partId}/split`, { splits });
    return res.data;
  },

  // Record customer approval internally (admin/management only). No outbound comms.
  recordCustomerApproval: async (workOrderId, approvedByCustomer = true) => {
    const res = await API.post(`${base(workOrderId)}/customer-approval`, { approvedByCustomer });
    return res.data;
  }
};

export default WorksheetService;
