const mongoose = require('mongoose');

// ---- Mock models BEFORE requiring the middleware ----
jest.mock('../../models/WorkOrder');
jest.mock('../../models/WorkOrderNote');

const WorkOrder = require('../../models/WorkOrder');
const WorkOrderNote = require('../../models/WorkOrderNote');
const { restrictToOwnWorkOrder, restrictToOwnNote } = require('../../middleware/restrictToOwn');

// Helpers
const mockRes = () => ({});

const mockNext = () => {
  const fn = jest.fn();
  return fn;
};

const objectId = () => new mongoose.Types.ObjectId();

// =========================================================================
//  restrictToOwnWorkOrder
// =========================================================================
describe('restrictToOwnWorkOrder', () => {
  afterEach(() => jest.restoreAllMocks());

  // ---- Allowed roles pass through immediately ----
  it.each(['admin', 'management', 'service-writer'])(
    'allows %s role through without DB lookup',
    async (role) => {
      const middleware = restrictToOwnWorkOrder('admin', 'management', 'service-writer');
      const req = { user: { role }, params: { id: objectId().toString() } };
      const next = mockNext();

      await middleware(req, mockRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(); // called with no error
      expect(WorkOrder.findById).not.toHaveBeenCalled();
    }
  );

  // ---- Technician with matching assignment passes ----
  it('allows technician assigned to the work order', async () => {
    const techId = objectId();
    const woId = objectId();

    WorkOrder.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        assignedTechnician: techId,
      }),
    });

    const middleware = restrictToOwnWorkOrder('admin', 'management', 'service-writer');
    const req = {
      user: { role: 'technician', technician: techId },
      params: { id: woId.toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no error
  });

  // ---- Technician NOT assigned is rejected ----
  it('rejects technician NOT assigned to the work order', async () => {
    const techId = objectId();
    const otherTechId = objectId();
    const woId = objectId();

    WorkOrder.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        assignedTechnician: otherTechId,
      }),
    });

    const middleware = restrictToOwnWorkOrder('admin', 'management', 'service-writer');
    const req = {
      user: { role: 'technician', technician: techId },
      params: { id: woId.toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/permission/i);
  });

  // ---- Technician with no technician profile is rejected ----
  it('rejects technician user that has no technician profile linked', async () => {
    const middleware = restrictToOwnWorkOrder('admin', 'management', 'service-writer');
    const req = {
      user: { role: 'technician', technician: null },
      params: { id: objectId().toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
  });

  // ---- Work order not found ----
  it('rejects technician when work order does not exist', async () => {
    WorkOrder.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const middleware = restrictToOwnWorkOrder('admin', 'management', 'service-writer');
    const req = {
      user: { role: 'technician', technician: objectId() },
      params: { id: objectId().toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  // ---- Work order with no technician assigned ----
  it('rejects technician when work order has no assignedTechnician', async () => {
    WorkOrder.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        assignedTechnician: null,
      }),
    });

    const middleware = restrictToOwnWorkOrder('admin', 'management', 'service-writer');
    const req = {
      user: { role: 'technician', technician: objectId() },
      params: { id: objectId().toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  // ---- Unknown role is rejected ----
  it('rejects unknown role not in allowedRoles', async () => {
    const middleware = restrictToOwnWorkOrder('admin', 'management', 'service-writer');
    const req = {
      user: { role: 'unknown-role' },
      params: { id: objectId().toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });
});

// =========================================================================
//  restrictToOwnNote
// =========================================================================
describe('restrictToOwnNote', () => {
  afterEach(() => jest.restoreAllMocks());

  // ---- Allowed roles pass through ----
  it.each(['admin', 'management'])(
    'allows %s role through without DB lookup',
    async (role) => {
      const middleware = restrictToOwnNote('admin', 'management');
      const req = {
        user: { role, id: objectId() },
        params: { noteId: objectId().toString() },
      };
      const next = mockNext();

      await middleware(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith(); // no error
      expect(WorkOrderNote.findById).not.toHaveBeenCalled();
    }
  );

  // ---- Creator can edit own note ----
  it('allows user who created the note', async () => {
    const userId = objectId();
    const noteId = objectId();

    WorkOrderNote.findById.mockResolvedValue({
      createdBy: userId,
    });

    const middleware = restrictToOwnNote('admin', 'management');
    const req = {
      user: { role: 'service-writer', id: userId },
      params: { noteId: noteId.toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(); // no error
  });

  // ---- Non-creator is rejected ----
  it('rejects user who did NOT create the note', async () => {
    const userId = objectId();
    const otherUserId = objectId();
    const noteId = objectId();

    WorkOrderNote.findById.mockResolvedValue({
      createdBy: otherUserId,
    });

    const middleware = restrictToOwnNote('admin', 'management');
    const req = {
      user: { role: 'service-writer', id: userId },
      params: { noteId: noteId.toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  // ---- Note not found ----
  it('rejects when note does not exist', async () => {
    WorkOrderNote.findById.mockResolvedValue(null);

    const middleware = restrictToOwnNote('admin', 'management');
    const req = {
      user: { role: 'technician', id: objectId() },
      params: { noteId: objectId().toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  // ---- Note with no createdBy ----
  it('rejects when note has no createdBy field', async () => {
    WorkOrderNote.findById.mockResolvedValue({
      createdBy: null,
    });

    const middleware = restrictToOwnNote('admin', 'management');
    const req = {
      user: { role: 'technician', id: objectId() },
      params: { noteId: objectId().toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  // ---- Technician can edit own note ----
  it('allows technician who created the note', async () => {
    const userId = objectId();

    WorkOrderNote.findById.mockResolvedValue({
      createdBy: userId,
    });

    const middleware = restrictToOwnNote('admin', 'management');
    const req = {
      user: { role: 'technician', id: userId },
      params: { noteId: objectId().toString() },
    };
    const next = mockNext();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(); // no error
  });
});
