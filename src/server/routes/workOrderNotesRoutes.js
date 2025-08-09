const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams allows access to parent route params
const {
  getWorkOrderNotes,
  createWorkOrderNote,
  updateWorkOrderNote,
  deleteWorkOrderNote,
  getCustomerFacingNotes
} = require('../controllers/workOrderNotesController');

// Routes for work order notes
// These will be mounted under /api/workorders/:workOrderId/notes

// GET /api/workorders/:workOrderId/notes - Get all notes for a work order (with optional customerFacing filter)
router.get('/', getWorkOrderNotes);

// POST /api/workorders/:workOrderId/notes - Create a new note for a work order
router.post('/', createWorkOrderNote);

// GET /api/workorders/:workOrderId/notes/customer-facing - Get only customer-facing notes (for invoices)
router.get('/customer-facing', getCustomerFacingNotes);

// PUT /api/workorders/:workOrderId/notes/:noteId - Update a specific note
router.put('/:noteId', updateWorkOrderNote);

// DELETE /api/workorders/:workOrderId/notes/:noteId - Delete a specific note
router.delete('/:noteId', deleteWorkOrderNote);

module.exports = router;