const WorkOrder = require('../models/WorkOrder');
const WorkOrderNote = require('../models/WorkOrderNote');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/**
 * Allows access if user has one of the allowedRoles, OR if user is a technician
 * assigned to the work order referenced by req.params.id.
 *
 * Usage: restrictToOwnWorkOrder('admin', 'management', 'service-writer')
 */
const restrictToOwnWorkOrder = (...allowedRoles) => {
  return catchAsync(async (req, res, next) => {
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    if (req.user.role === 'technician' && req.user.technician) {
      const workOrder = await WorkOrder.findById(req.params.id).select('assignedTechnician');
      if (workOrder &&
          workOrder.assignedTechnician &&
          workOrder.assignedTechnician.toString() === req.user.technician.toString()) {
        return next();
      }
    }

    return next(new AppError('You do not have permission to perform this action', 403));
  });
};

/**
 * Allows access if user has one of the allowedRoles, OR if user created the note
 * referenced by req.params.noteId.
 *
 * Usage: restrictToOwnNote('admin', 'management')
 */
const restrictToOwnNote = (...allowedRoles) => {
  return catchAsync(async (req, res, next) => {
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    const note = await WorkOrderNote.findById(req.params.noteId);
    if (note && note.createdBy && note.createdBy.toString() === req.user.id.toString()) {
      return next();
    }

    return next(new AppError('You do not have permission to perform this action', 403));
  });
};

module.exports = { restrictToOwnWorkOrder, restrictToOwnNote };
