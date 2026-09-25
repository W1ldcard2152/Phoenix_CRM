const WorkOrderNote = require('../models/WorkOrderNote');
const WorkOrder = require('../models/WorkOrder');

// Resolve a job's name from the work order's services[], so the denormalized
// serviceName on a note always matches the job it was filed under. Returns
// undefined when the id doesn't resolve — the caller then stores no name
// rather than a stale or invented one.
const resolveServiceName = (workOrder, serviceId) => {
  if (!serviceId) return undefined;
  const svc = (workOrder.services || []).find(
    (s) => s && s._id && s._id.toString() === serviceId.toString()
  );
  return svc ? svc.description : undefined;
};

// Get all notes for a specific work order
const getWorkOrderNotes = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    const { customerFacing, noteType, serviceId } = req.query;

    // Build query
    const query = { workOrder: workOrderId };

    // serviceId=<id> → that job's notes; serviceId=none → work-order-level only.
    // Omitted → every note on the work order (what the detail page fetches).
    if (serviceId === 'none') {
      query.serviceId = null;
    } else if (serviceId) {
      query.serviceId = serviceId;
    }

    // Support noteType filtering (preferred)
    if (noteType) {
      query.noteType = noteType;
    }
    // Backward compatibility: support customerFacing filtering
    else if (customerFacing === 'true') {
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
    const { content, isCustomerFacing = false, noteType, serviceId = null } = req.body;

    // Verify work order exists
    const workOrder = await WorkOrder.findById(workOrderId);
    if (!workOrder) {
      return res.status(404).json({
        success: false,
        message: 'Work order not found'
      });
    }

    // A job note must name a job that actually exists on this work order —
    // otherwise it would render in no container at all.
    const serviceName = resolveServiceName(workOrder, serviceId);
    if (serviceId && !serviceName) {
      return res.status(400).json({
        success: false,
        message: 'That job is not on this work order'
      });
    }

    // For now, we'll use a default user ID since auth isn't fully implemented
    // TODO: Replace with actual authenticated user ID when auth is implemented
    const createdBy = req.user?.id || '507f1f77bcf86cd799439011'; // Placeholder ObjectId

    const noteData = {
      workOrder: workOrderId,
      content: content.trim(),
      isCustomerFacing,
      createdBy,
      serviceId: serviceId || null,
      serviceName
    };

    // If noteType is provided, use it (preferred)
    if (noteType) {
      noteData.noteType = noteType;
    }

    const note = new WorkOrderNote(noteData);

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
    const { content, isCustomerFacing, noteType, serviceId } = req.body;

    const note = await WorkOrderNote.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Reassigning a note to another job (or back to work-order level with null).
    if (serviceId !== undefined) {
      if (serviceId === null || serviceId === '') {
        note.serviceId = null;
        note.serviceName = undefined;
      } else {
        const workOrder = await WorkOrder.findById(note.workOrder);
        const serviceName = resolveServiceName(workOrder, serviceId);
        if (!serviceName) {
          return res.status(400).json({
            success: false,
            message: 'That job is not on this work order'
          });
        }
        note.serviceId = serviceId;
        note.serviceName = serviceName;
      }
    }

    // Update fields
    if (content !== undefined) {
      note.content = content.trim();
    }
    if (isCustomerFacing !== undefined) {
      note.isCustomerFacing = isCustomerFacing;
    }
    if (noteType !== undefined) {
      note.noteType = noteType;
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