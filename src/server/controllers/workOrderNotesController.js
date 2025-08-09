const WorkOrderNote = require('../models/WorkOrderNote');
const WorkOrder = require('../models/WorkOrder');

// Get all notes for a specific work order
const getWorkOrderNotes = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const { customerFacing } = req.query;

    // Build query
    const query = { workOrder: workOrderId };
    if (customerFacing === 'true') {
      query.isCustomerFacing = true;
    } else if (customerFacing === 'false') {
      query.isCustomerFacing = false;
    }

    const notes = await WorkOrderNote.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 }); // Most recent first

    res.status(200).json({
      success: true,
      data: {
        notes
      }
    });
  } catch (error) {
    console.error('Error fetching work order notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch work order notes',
      error: error.message
    });
  }
};

// Create a new note for a work order
const createWorkOrderNote = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const { content, isCustomerFacing = false } = req.body;

    // Verify work order exists
    const workOrder = await WorkOrder.findById(workOrderId);
    if (!workOrder) {
      return res.status(404).json({
        success: false,
        message: 'Work order not found'
      });
    }

    // For now, we'll use a default user ID since auth isn't fully implemented
    // TODO: Replace with actual authenticated user ID when auth is implemented
    const createdBy = req.user?.id || '507f1f77bcf86cd799439011'; // Placeholder ObjectId

    const note = new WorkOrderNote({
      workOrder: workOrderId,
      content: content.trim(),
      isCustomerFacing,
      createdBy
    });

    await note.save();

    // Populate the createdBy field before returning
    await note.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      data: {
        note
      }
    });
  } catch (error) {
    console.error('Error creating work order note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create work order note',
      error: error.message
    });
  }
};

// Update a work order note
const updateWorkOrderNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { content, isCustomerFacing } = req.body;

    const note = await WorkOrderNote.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Update fields
    if (content !== undefined) {
      note.content = content.trim();
    }
    if (isCustomerFacing !== undefined) {
      note.isCustomerFacing = isCustomerFacing;
    }

    await note.save();
    await note.populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      data: {
        note
      }
    });
  } catch (error) {
    console.error('Error updating work order note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update work order note',
      error: error.message
    });
  }
};

// Delete a work order note
const deleteWorkOrderNote = async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await WorkOrderNote.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    await WorkOrderNote.findByIdAndDelete(noteId);

    res.status(200).json({
      success: true,
      message: 'Note deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting work order note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete work order note',
      error: error.message
    });
  }
};

// Get customer-facing notes for invoice generation
const getCustomerFacingNotes = async (req, res) => {
  try {
    const { workOrderId } = req.params;

    const notes = await WorkOrderNote.find({
      workOrder: workOrderId,
      isCustomerFacing: true
    })
    .populate('createdBy', 'name')
    .sort({ createdAt: 1 }); // Chronological order for invoice

    res.status(200).json({
      success: true,
      data: {
        notes
      }
    });
  } catch (error) {
    console.error('Error fetching customer-facing notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer-facing notes',
      error: error.message
    });
  }
};

module.exports = {
  getWorkOrderNotes,
  createWorkOrderNote,
  updateWorkOrderNote,
  deleteWorkOrderNote,
  getCustomerFacingNotes
};