const mongoose = require('mongoose');
const AppError = require('../../utils/appError');

// ---- Manual mocks for all models to avoid Mongoose schema compilation ----
const mockModel = (name) => {
  const model = jest.fn();
  model.find = jest.fn();
  model.findById = jest.fn();
  model.findByIdAndUpdate = jest.fn();
  model.findByIdAndDelete = jest.fn();
  model.create = jest.fn();
  model.modelName = name;
  // Helper to reset all mock implementations
  model._resetMocks = () => {
    model.find.mockReset();
    model.findById.mockReset();
    model.findByIdAndUpdate.mockReset();
    model.findByIdAndDelete.mockReset();
    model.create.mockReset();
  };
  return model;
};

jest.mock('../../models/FollowUp', () => mockModel('FollowUp'));
jest.mock('../../models/WorkOrder', () => mockModel('WorkOrder'));
jest.mock('../../models/Vehicle', () => mockModel('Vehicle'));
jest.mock('../../models/Appointment', () => mockModel('Appointment'));
jest.mock('../../models/Invoice', () => mockModel('Invoice'));

const FollowUp = require('../../models/FollowUp');
const WorkOrder = require('../../models/WorkOrder');
const Vehicle = require('../../models/Vehicle');
const Appointment = require('../../models/Appointment');
const Invoice = require('../../models/Invoice');

const controller = require('../../controllers/followUpController');

// ---- Helpers ----
// catchAsync doesn't return the promise, so we need to flush microtasks
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

const objectId = () => new mongoose.Types.ObjectId();

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = () => jest.fn();

const makeUser = (overrides = {}) => ({
  _id: objectId(),
  name: 'Test User',
  role: 'service-writer',
  ...overrides,
});

// Build a chainable populate mock that works with Mongoose's query pattern.
// Mongoose queries are thenables — await query calls query.then().
// populateFollowUp chains .populate() calls, and the result is awaited.
const mockPopulateChain = (resolvedValue) => {
  const promise = Promise.resolve(resolvedValue);
  const chain = {
    populate: jest.fn(),
    sort: jest.fn(),
    lean: jest.fn().mockResolvedValue(resolvedValue),
    // Plain thenable — must NOT be a jest.fn() or await may not resolve correctly
    then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
    catch: (onRejected) => promise.catch(onRejected),
  };
  chain.populate.mockReturnValue(chain);
  chain.sort.mockReturnValue(chain);
  return chain;
};

// =========================================================================
//  createFollowUp
// =========================================================================
describe('createFollowUp', () => {
  afterEach(() => {
    [FollowUp, WorkOrder, Vehicle, Appointment, Invoice].forEach(m => m._resetMocks());
  });

  it('rejects when entityType is missing', async () => {
    const req = { body: { entityId: objectId().toString(), note: 'Test note' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/entity type/i);
  });

  it('rejects when entityId is missing', async () => {
    const req = { body: { entityType: 'customer', note: 'Test note' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
  });

  it('rejects when note is missing', async () => {
    const req = { body: { entityType: 'customer', entityId: objectId().toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/note/i);
  });

  it('rejects when note is only whitespace', async () => {
    const req = { body: { entityType: 'customer', entityId: objectId().toString(), note: '   ' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
  });

  it('creates follow-up for customer (no hierarchy lookup needed)', async () => {
    const user = makeUser();
    const customerId = objectId();
    const createdDoc = { _id: objectId(), customer: customerId, entityType: 'customer' };

    FollowUp.create.mockResolvedValue(createdDoc);
    // populateFollowUp chains .populate() then result is awaited
    FollowUp.findById.mockReturnValue(mockPopulateChain(createdDoc));

    const req = { body: { entityType: 'customer', entityId: customerId.toString(), note: 'Call back' }, user };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    expect(FollowUp.create).toHaveBeenCalledTimes(1);
    const createArg = FollowUp.create.mock.calls[0][0];
    expect(createArg.customer.toString()).toBe(customerId.toString());
    expect(createArg.entityType).toBe('customer');
    expect(createArg.notes[0].text).toBe('Call back');
    expect(createArg.createdBy).toBe(user._id);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('resolves hierarchy for vehicle entity (looks up customer)', async () => {
    const user = makeUser();
    const customerId = objectId();
    const vehicleId = objectId();

    Vehicle.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ customer: customerId }),
    });

    const createdDoc = { _id: objectId(), customer: customerId, vehicle: vehicleId };
    FollowUp.create.mockResolvedValue(createdDoc);
    FollowUp.findById.mockReturnValue(mockPopulateChain(createdDoc));

    const req = { body: { entityType: 'vehicle', entityId: vehicleId.toString(), note: 'Check tires' }, user };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    expect(Vehicle.findById).toHaveBeenCalledWith(vehicleId.toString());
    const createArg = FollowUp.create.mock.calls[0][0];
    expect(createArg.vehicle.toString()).toBe(vehicleId.toString());
    expect(createArg.customer.toString()).toBe(customerId.toString());
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('resolves hierarchy for workOrder entity (gets customer + vehicle)', async () => {
    const user = makeUser();
    const customerId = objectId();
    const vehicleId = objectId();
    const workOrderId = objectId();

    WorkOrder.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ customer: customerId, vehicle: vehicleId }),
    });

    const createdDoc = { _id: objectId() };
    FollowUp.create.mockResolvedValue(createdDoc);
    FollowUp.findById.mockReturnValue(mockPopulateChain(createdDoc));

    const req = { body: { entityType: 'workOrder', entityId: workOrderId.toString(), note: 'Needs approval' }, user };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    expect(WorkOrder.findById).toHaveBeenCalledWith(workOrderId.toString());
    const createArg = FollowUp.create.mock.calls[0][0];
    expect(createArg.workOrder.toString()).toBe(workOrderId.toString());
    expect(createArg.customer.toString()).toBe(customerId.toString());
    expect(createArg.vehicle.toString()).toBe(vehicleId.toString());
  });

  it('resolves hierarchy for quote entity (uses WorkOrder lookup)', async () => {
    const user = makeUser();
    const customerId = objectId();
    const vehicleId = objectId();
    const quoteId = objectId();

    WorkOrder.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ customer: customerId, vehicle: vehicleId }),
    });

    const createdDoc = { _id: objectId() };
    FollowUp.create.mockResolvedValue(createdDoc);
    FollowUp.findById.mockReturnValue(mockPopulateChain(createdDoc));

    const req = { body: { entityType: 'quote', entityId: quoteId.toString(), note: 'Waiting on decision' }, user };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    // quote uses WorkOrder.findById since quotes are work orders
    expect(WorkOrder.findById).toHaveBeenCalledWith(quoteId.toString());
    const createArg = FollowUp.create.mock.calls[0][0];
    expect(createArg.entityType).toBe('quote');
    expect(createArg.workOrder.toString()).toBe(quoteId.toString());
  });

  it('resolves hierarchy for invoice entity', async () => {
    const user = makeUser();
    const customerId = objectId();
    const vehicleId = objectId();
    const workOrderId = objectId();
    const invoiceId = objectId();

    Invoice.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        workOrder: workOrderId, customer: customerId, vehicle: vehicleId,
      }),
    });

    const createdDoc = { _id: objectId() };
    FollowUp.create.mockResolvedValue(createdDoc);
    FollowUp.findById.mockReturnValue(mockPopulateChain(createdDoc));

    const req = { body: { entityType: 'invoice', entityId: invoiceId.toString(), note: 'Payment pending' }, user };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    expect(Invoice.findById).toHaveBeenCalledWith(invoiceId.toString());
    const createArg = FollowUp.create.mock.calls[0][0];
    expect(createArg.invoice.toString()).toBe(invoiceId.toString());
    expect(createArg.workOrder.toString()).toBe(workOrderId.toString());
    expect(createArg.customer.toString()).toBe(customerId.toString());
  });

  it('resolves hierarchy for appointment entity', async () => {
    const user = makeUser();
    const customerId = objectId();
    const vehicleId = objectId();
    const workOrderId = objectId();
    const appointmentId = objectId();

    Appointment.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        workOrder: workOrderId, customer: customerId, vehicle: vehicleId,
      }),
    });

    const createdDoc = { _id: objectId() };
    FollowUp.create.mockResolvedValue(createdDoc);
    FollowUp.findById.mockReturnValue(mockPopulateChain(createdDoc));

    const req = { body: { entityType: 'appointment', entityId: appointmentId.toString(), note: 'No show' }, user };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    expect(Appointment.findById).toHaveBeenCalledWith(appointmentId.toString());
    const createArg = FollowUp.create.mock.calls[0][0];
    expect(createArg.appointment.toString()).toBe(appointmentId.toString());
  });

  it('returns 404 when vehicle not found during hierarchy resolution', async () => {
    Vehicle.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const req = { body: { entityType: 'vehicle', entityId: objectId().toString(), note: 'Test' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });

  it('returns 404 when work order not found during hierarchy resolution', async () => {
    WorkOrder.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const req = { body: { entityType: 'workOrder', entityId: objectId().toString(), note: 'Test' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
  });

  it('returns 404 when invoice not found during hierarchy resolution', async () => {
    Invoice.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const req = { body: { entityType: 'invoice', entityId: objectId().toString(), note: 'Test' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('returns 404 when appointment not found during hierarchy resolution', async () => {
    Appointment.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const req = { body: { entityType: 'appointment', entityId: objectId().toString(), note: 'Test' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('sets priority and dueDate when provided', async () => {
    const user = makeUser();
    const customerId = objectId();
    const dueDate = new Date('2026-04-01');

    const createdDoc = { _id: objectId() };
    FollowUp.create.mockResolvedValue(createdDoc);
    FollowUp.findById.mockReturnValue(mockPopulateChain(createdDoc));

    const req = {
      body: { entityType: 'customer', entityId: customerId.toString(), note: 'Urgent', priority: 'urgent', dueDate },
      user,
    };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    const createArg = FollowUp.create.mock.calls[0][0];
    expect(createArg.priority).toBe('urgent');
    expect(createArg.dueDate).toBe(dueDate);
  });

  it('defaults priority to normal when not provided', async () => {
    const user = makeUser();
    const customerId = objectId();

    const createdDoc = { _id: objectId() };
    FollowUp.create.mockResolvedValue(createdDoc);
    FollowUp.findById.mockReturnValue(mockPopulateChain(createdDoc));

    const req = { body: { entityType: 'customer', entityId: customerId.toString(), note: 'Test' }, user };
    const res = mockRes();
    const next = mockNext();
    controller.createFollowUp(req, res, next);
    await flushPromises();

    const createArg = FollowUp.create.mock.calls[0][0];
    expect(createArg.priority).toBe('normal');
  });
});

// =========================================================================
//  closeFollowUp
// =========================================================================
describe('closeFollowUp', () => {
  afterEach(() => {
    [FollowUp, WorkOrder, Vehicle, Appointment, Invoice].forEach(m => m._resetMocks());
  });

  it('rejects when resolutionNote is missing', async () => {
    const req = { params: { id: objectId().toString() }, body: {}, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.closeFollowUp(req, res, next);
    await flushPromises();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/resolution note/i);
  });

  it('rejects when resolutionNote is only whitespace', async () => {
    const req = { params: { id: objectId().toString() }, body: { resolutionNote: '   ' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.closeFollowUp(req, res, next);
    await flushPromises();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
  });

  it('returns 404 when follow-up not found', async () => {
    FollowUp.findById.mockResolvedValue(null);

    const req = { params: { id: objectId().toString() }, body: { resolutionNote: 'Done' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.closeFollowUp(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('rejects closing an already-closed follow-up', async () => {
    const mockFollowUp = { _id: objectId(), status: 'closed', save: jest.fn() };
    FollowUp.findById.mockResolvedValue(mockFollowUp);

    const req = { params: { id: mockFollowUp._id.toString() }, body: { resolutionNote: 'Done' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.closeFollowUp(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/already closed/i);
    expect(mockFollowUp.save).not.toHaveBeenCalled();
  });

  it('closes an open follow-up with resolution note', async () => {
    const user = makeUser();
    const fuId = objectId();
    const mockFollowUp = { _id: fuId, status: 'open', save: jest.fn().mockResolvedValue(true) };

    // First findById returns the document, second returns populated chain
    FollowUp.findById
      .mockResolvedValueOnce(mockFollowUp)
      .mockReturnValueOnce(mockPopulateChain({ ...mockFollowUp, status: 'closed' }));

    const req = { params: { id: fuId.toString() }, body: { resolutionNote: 'Spoke with customer' }, user };
    const res = mockRes();
    const next = mockNext();
    controller.closeFollowUp(req, res, next);
    await flushPromises();

    expect(mockFollowUp.status).toBe('closed');
    expect(mockFollowUp.resolutionNote).toBe('Spoke with customer');
    expect(mockFollowUp.closedBy).toBe(user._id);
    expect(mockFollowUp.closedAt).toBeInstanceOf(Date);
    expect(mockFollowUp.save).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});

// =========================================================================
//  reopenFollowUp
// =========================================================================
describe('reopenFollowUp', () => {
  afterEach(() => {
    [FollowUp, WorkOrder, Vehicle, Appointment, Invoice].forEach(m => m._resetMocks());
  });

  it('returns 404 when follow-up not found', async () => {
    FollowUp.findById.mockResolvedValue(null);

    const req = { params: { id: objectId().toString() }, body: {}, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.reopenFollowUp(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('rejects reopening an already-open follow-up', async () => {
    const mockFollowUp = { _id: objectId(), status: 'open', save: jest.fn() };
    FollowUp.findById.mockResolvedValue(mockFollowUp);

    const req = { params: { id: mockFollowUp._id.toString() }, body: {}, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.reopenFollowUp(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/already open/i);
  });

  it('reopens a closed follow-up and clears resolution fields', async () => {
    const fuId = objectId();
    const mockFollowUp = {
      _id: fuId, status: 'closed',
      resolutionNote: 'Was resolved', closedAt: new Date(), closedBy: objectId(),
      save: jest.fn().mockResolvedValue(true),
    };
    FollowUp.findById
      .mockResolvedValueOnce(mockFollowUp)
      .mockReturnValueOnce(mockPopulateChain({ ...mockFollowUp, status: 'open' }));

    const req = { params: { id: fuId.toString() }, body: {}, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.reopenFollowUp(req, res, next);
    await flushPromises();

    expect(mockFollowUp.status).toBe('open');
    expect(mockFollowUp.resolutionNote).toBeUndefined();
    expect(mockFollowUp.closedAt).toBeUndefined();
    expect(mockFollowUp.closedBy).toBeUndefined();
    expect(mockFollowUp.save).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});

// =========================================================================
//  addNote
// =========================================================================
describe('addNote', () => {
  afterEach(() => {
    [FollowUp, WorkOrder, Vehicle, Appointment, Invoice].forEach(m => m._resetMocks());
  });

  it('rejects when text is missing', async () => {
    const req = { params: { id: objectId().toString() }, body: {}, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.addNote(req, res, next);
    await flushPromises();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/note text/i);
  });

  it('rejects when text is only whitespace', async () => {
    const req = { params: { id: objectId().toString() }, body: { text: '  \n  ' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.addNote(req, res, next);
    await flushPromises();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
  });

  it('returns 404 when follow-up not found', async () => {
    FollowUp.findById.mockResolvedValue(null);

    const req = { params: { id: objectId().toString() }, body: { text: 'A note' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.addNote(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('adds a note with default timestamp (now)', async () => {
    const user = makeUser();
    const fuId = objectId();
    const notes = [{ text: 'Initial', _id: objectId() }];
    notes.push = Array.prototype.push; // ensure push works on plain array
    const mockFollowUp = { _id: fuId, notes, save: jest.fn().mockResolvedValue(true) };

    FollowUp.findById
      .mockResolvedValueOnce(mockFollowUp)
      .mockReturnValueOnce(mockPopulateChain(mockFollowUp));

    const req = { params: { id: fuId.toString() }, body: { text: 'Follow up call' }, user };
    const res = mockRes();
    const next = mockNext();

    const before = new Date();
    controller.addNote(req, res, next);
    await flushPromises();
    const after = new Date();

    expect(notes).toHaveLength(2);
    expect(notes[1].text).toBe('Follow up call');
    expect(notes[1].createdByName).toBe(user.name);
    expect(notes[1].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(notes[1].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(mockFollowUp.save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('adds a note with custom retroactive timestamp', async () => {
    const user = makeUser();
    const fuId = objectId();
    const customTimestamp = '2026-03-20T14:30:00';
    const notes = [{ text: 'Initial', _id: objectId() }];
    notes.push = Array.prototype.push;
    const mockFollowUp = { _id: fuId, notes, save: jest.fn().mockResolvedValue(true) };

    FollowUp.findById
      .mockResolvedValueOnce(mockFollowUp)
      .mockReturnValueOnce(mockPopulateChain(mockFollowUp));

    const req = { params: { id: fuId.toString() }, body: { text: 'Retroactive', timestamp: customTimestamp }, user };
    const res = mockRes();
    const next = mockNext();
    controller.addNote(req, res, next);
    await flushPromises();

    expect(notes[1].timestamp).toEqual(new Date(customTimestamp));
  });
});

// =========================================================================
//  updateNote
// =========================================================================
describe('updateNote', () => {
  afterEach(() => {
    [FollowUp, WorkOrder, Vehicle, Appointment, Invoice].forEach(m => m._resetMocks());
  });

  it('returns 404 when follow-up not found', async () => {
    FollowUp.findById.mockResolvedValue(null);

    const req = { params: { id: objectId().toString(), noteId: objectId().toString() }, body: { text: 'Updated' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.updateNote(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('returns 404 when note not found in array', async () => {
    const mockFollowUp = {
      _id: objectId(),
      notes: { id: jest.fn().mockReturnValue(null) },
      save: jest.fn(),
    };
    FollowUp.findById.mockResolvedValue(mockFollowUp);

    const req = { params: { id: mockFollowUp._id.toString(), noteId: objectId().toString() }, body: { text: 'X' }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.updateNote(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('updates note text and timestamp', async () => {
    const noteId = objectId();
    const mockNote = { _id: noteId, text: 'Original', timestamp: new Date('2026-03-20') };
    const mockFollowUp = {
      _id: objectId(),
      notes: { id: jest.fn().mockReturnValue(mockNote) },
      save: jest.fn().mockResolvedValue(true),
    };
    FollowUp.findById
      .mockResolvedValueOnce(mockFollowUp)
      .mockReturnValueOnce(mockPopulateChain(mockFollowUp));

    const newTimestamp = '2026-03-21T10:00:00';
    const req = {
      params: { id: mockFollowUp._id.toString(), noteId: noteId.toString() },
      body: { text: 'Updated text', timestamp: newTimestamp },
      user: makeUser(),
    };
    const res = mockRes();
    const next = mockNext();
    controller.updateNote(req, res, next);
    await flushPromises();

    expect(mockNote.text).toBe('Updated text');
    expect(mockNote.timestamp).toEqual(new Date(newTimestamp));
    expect(mockFollowUp.save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('updates only timestamp when text is not provided', async () => {
    const noteId = objectId();
    const mockNote = { _id: noteId, text: 'Keep me', timestamp: new Date('2026-03-20') };
    const mockFollowUp = {
      _id: objectId(),
      notes: { id: jest.fn().mockReturnValue(mockNote) },
      save: jest.fn().mockResolvedValue(true),
    };
    FollowUp.findById
      .mockResolvedValueOnce(mockFollowUp)
      .mockReturnValueOnce(mockPopulateChain(mockFollowUp));

    const req = {
      params: { id: mockFollowUp._id.toString(), noteId: noteId.toString() },
      body: { timestamp: '2026-03-22T12:00:00' },
      user: makeUser(),
    };
    const res = mockRes();
    const next = mockNext();
    controller.updateNote(req, res, next);
    await flushPromises();

    expect(mockNote.text).toBe('Keep me'); // unchanged
    expect(mockNote.timestamp).toEqual(new Date('2026-03-22T12:00:00'));
  });
});

// =========================================================================
//  deleteNote
// =========================================================================
describe('deleteNote', () => {
  afterEach(() => {
    [FollowUp, WorkOrder, Vehicle, Appointment, Invoice].forEach(m => m._resetMocks());
  });

  it('returns 404 when follow-up not found', async () => {
    FollowUp.findById.mockResolvedValue(null);

    const req = { params: { id: objectId().toString(), noteId: objectId().toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.deleteNote(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('rejects deleting the last remaining note', async () => {
    const noteId = objectId();
    const mockFollowUp = {
      _id: objectId(),
      notes: { length: 1, id: jest.fn().mockReturnValue({ _id: noteId }) },
      save: jest.fn(),
    };
    FollowUp.findById.mockResolvedValue(mockFollowUp);

    const req = { params: { id: mockFollowUp._id.toString(), noteId: noteId.toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.deleteNote(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/last note/i);
    expect(mockFollowUp.save).not.toHaveBeenCalled();
  });

  it('returns 404 when noteId does not exist in array', async () => {
    const mockFollowUp = {
      _id: objectId(),
      notes: { length: 2, id: jest.fn().mockReturnValue(null) },
      save: jest.fn(),
    };
    FollowUp.findById.mockResolvedValue(mockFollowUp);

    const req = { params: { id: mockFollowUp._id.toString(), noteId: objectId().toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.deleteNote(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
    expect(err.message).toMatch(/note not found/i);
  });

  it('deletes a note when multiple notes exist', async () => {
    const noteId = objectId();
    const deleteOneFn = jest.fn();
    const mockNote = { _id: noteId, deleteOne: deleteOneFn };
    const mockFollowUp = {
      _id: objectId(),
      notes: { length: 3, id: jest.fn().mockReturnValue(mockNote) },
      save: jest.fn().mockResolvedValue(true),
    };
    FollowUp.findById
      .mockResolvedValueOnce(mockFollowUp)
      .mockReturnValueOnce(mockPopulateChain(mockFollowUp));

    const req = { params: { id: mockFollowUp._id.toString(), noteId: noteId.toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.deleteNote(req, res, next);
    await flushPromises();

    expect(deleteOneFn).toHaveBeenCalled();
    expect(mockFollowUp.save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

// =========================================================================
//  deleteFollowUp
// =========================================================================
describe('deleteFollowUp', () => {
  afterEach(() => {
    [FollowUp, WorkOrder, Vehicle, Appointment, Invoice].forEach(m => m._resetMocks());
  });

  it('returns 404 when follow-up not found', async () => {
    FollowUp.findByIdAndDelete.mockResolvedValue(null);

    const req = { params: { id: objectId().toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.deleteFollowUp(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('deletes and returns 204', async () => {
    const fuId = objectId();
    FollowUp.findByIdAndDelete.mockResolvedValue({ _id: fuId });

    const req = { params: { id: fuId.toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.deleteFollowUp(req, res, next);
    await flushPromises();

    expect(FollowUp.findByIdAndDelete).toHaveBeenCalledWith(fuId.toString());
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.json).toHaveBeenCalledWith(null);
  });
});

// =========================================================================
//  getDashboardFollowUps — sorting & overdue logic
// =========================================================================
describe('getDashboardFollowUps', () => {
  afterEach(() => {
    [FollowUp, WorkOrder, Vehicle, Appointment, Invoice].forEach(m => m._resetMocks());
  });

  const setupDashboardMock = (items) => {
    const chain = {
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(items),
    };
    FollowUp.find.mockReturnValue(chain);
  };

  it('returns max 5 items and total count', async () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      _id: objectId(), status: 'open', priority: 'normal',
      dueDate: null, notes: [{ text: `Note ${i}` }],
      createdAt: new Date(`2026-03-${String(15 + i).padStart(2, '0')}`),
    }));
    setupDashboardMock(items);

    const req = { user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getDashboardFollowUps(req, res, next);
    await flushPromises();

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.data.followUps).toHaveLength(5);
    expect(responseData.data.totalCount).toBe(8);
  });

  it('sorts due-today items before others', async () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    const tomorrow = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);

    const items = [
      { _id: objectId(), status: 'open', priority: 'normal', dueDate: tomorrow, createdAt: new Date('2026-03-20'), notes: [] },
      { _id: objectId(), status: 'open', priority: 'normal', dueDate: today, createdAt: new Date('2026-03-21'), notes: [] },
    ];
    setupDashboardMock(items);

    const req = { user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getDashboardFollowUps(req, res, next);
    await flushPromises();

    const result = res.json.mock.calls[0][0].data.followUps;
    expect(result[0].dueDate).toEqual(today);
  });

  it('sorts by priority (urgent before normal) when due-today is equal', async () => {
    const items = [
      { _id: objectId(), status: 'open', priority: 'normal', dueDate: null, createdAt: new Date('2026-03-20'), notes: [] },
      { _id: objectId(), status: 'open', priority: 'urgent', dueDate: null, createdAt: new Date('2026-03-19'), notes: [] },
    ];
    setupDashboardMock(items);

    const req = { user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getDashboardFollowUps(req, res, next);
    await flushPromises();

    const result = res.json.mock.calls[0][0].data.followUps;
    expect(result[0].priority).toBe('urgent');
    expect(result[1].priority).toBe('normal');
  });

  it('sorts high > normal > low priority', async () => {
    const items = [
      { _id: objectId(), status: 'open', priority: 'low', dueDate: null, createdAt: new Date('2026-03-20'), notes: [] },
      { _id: objectId(), status: 'open', priority: 'high', dueDate: null, createdAt: new Date('2026-03-20'), notes: [] },
      { _id: objectId(), status: 'open', priority: 'normal', dueDate: null, createdAt: new Date('2026-03-20'), notes: [] },
    ];
    setupDashboardMock(items);

    const req = { user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getDashboardFollowUps(req, res, next);
    await flushPromises();

    const result = res.json.mock.calls[0][0].data.followUps;
    expect(result[0].priority).toBe('high');
    expect(result[1].priority).toBe('normal');
    expect(result[2].priority).toBe('low');
  });

  it('marks overdue items with isOverdue flag', async () => {
    const pastDate = new Date('2026-01-01');
    const items = [
      { _id: objectId(), status: 'open', priority: 'normal', dueDate: pastDate, createdAt: new Date(), notes: [] },
    ];
    setupDashboardMock(items);

    const req = { user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getDashboardFollowUps(req, res, next);
    await flushPromises();

    const result = res.json.mock.calls[0][0].data.followUps;
    expect(result[0].isOverdue).toBe(true);
  });

  it('does not mark future-due items as overdue', async () => {
    const futureDate = new Date('2099-12-31');
    const items = [
      { _id: objectId(), status: 'open', priority: 'normal', dueDate: futureDate, createdAt: new Date(), notes: [] },
    ];
    setupDashboardMock(items);

    const req = { user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getDashboardFollowUps(req, res, next);
    await flushPromises();

    const result = res.json.mock.calls[0][0].data.followUps;
    expect(result[0].isOverdue).toBe(false);
  });

  it('sorts items with dueDate before items without', async () => {
    const items = [
      { _id: objectId(), status: 'open', priority: 'normal', dueDate: null, createdAt: new Date('2026-03-20'), notes: [] },
      { _id: objectId(), status: 'open', priority: 'normal', dueDate: new Date('2026-04-01'), createdAt: new Date('2026-03-19'), notes: [] },
    ];
    setupDashboardMock(items);

    const req = { user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getDashboardFollowUps(req, res, next);
    await flushPromises();

    const result = res.json.mock.calls[0][0].data.followUps;
    expect(result[0].dueDate).toBeTruthy();
    expect(result[1].dueDate).toBeNull();
  });

  it('falls back to createdAt desc when everything else is equal', async () => {
    const items = [
      { _id: objectId(), status: 'open', priority: 'normal', dueDate: null, createdAt: new Date('2026-03-18'), notes: [] },
      { _id: objectId(), status: 'open', priority: 'normal', dueDate: null, createdAt: new Date('2026-03-20'), notes: [] },
    ];
    setupDashboardMock(items);

    const req = { user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getDashboardFollowUps(req, res, next);
    await flushPromises();

    const result = res.json.mock.calls[0][0].data.followUps;
    // More recent createdAt should come first
    expect(new Date(result[0].createdAt).getTime()).toBeGreaterThan(new Date(result[1].createdAt).getTime());
  });

  it('returns empty array when no open follow-ups', async () => {
    setupDashboardMock([]);

    const req = { user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getDashboardFollowUps(req, res, next);
    await flushPromises();

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.data.followUps).toHaveLength(0);
    expect(responseData.data.totalCount).toBe(0);
  });
});

// =========================================================================
//  getEntityFollowUps
// =========================================================================
describe('getEntityFollowUps', () => {
  afterEach(() => {
    [FollowUp, WorkOrder, Vehicle, Appointment, Invoice].forEach(m => m._resetMocks());
  });

  it('returns 400 for invalid entityType', async () => {
    const req = { params: { entityType: 'invalidType', entityId: objectId().toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getEntityFollowUps(req, res, next);
    await flushPromises();

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
  });

  it('queries by workOrder field for quote entityType with entityType filter', async () => {
    const quoteId = objectId();
    const chain = mockPopulateChain([]);
    chain.sort = jest.fn().mockReturnValue(chain);
    FollowUp.find.mockReturnValue(chain);

    const req = { params: { entityType: 'quote', entityId: quoteId.toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getEntityFollowUps(req, res, next);
    await flushPromises();

    expect(FollowUp.find).toHaveBeenCalledWith(
      expect.objectContaining({ workOrder: quoteId.toString(), entityType: 'quote' })
    );
  });

  it('queries by customer field for customer entityType (no entityType filter)', async () => {
    const customerId = objectId();
    const chain = mockPopulateChain([]);
    chain.sort = jest.fn().mockReturnValue(chain);
    FollowUp.find.mockReturnValue(chain);

    const req = { params: { entityType: 'customer', entityId: customerId.toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getEntityFollowUps(req, res, next);
    await flushPromises();

    expect(FollowUp.find).toHaveBeenCalledWith({ customer: customerId.toString() });
  });

  it('queries by vehicle field for vehicle entityType', async () => {
    const vehicleId = objectId();
    const chain = mockPopulateChain([]);
    chain.sort = jest.fn().mockReturnValue(chain);
    FollowUp.find.mockReturnValue(chain);

    const req = { params: { entityType: 'vehicle', entityId: vehicleId.toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getEntityFollowUps(req, res, next);
    await flushPromises();

    expect(FollowUp.find).toHaveBeenCalledWith({ vehicle: vehicleId.toString() });
  });

  it('queries by workOrder field for workOrder entityType (no entityType filter)', async () => {
    const woId = objectId();
    const chain = mockPopulateChain([]);
    chain.sort = jest.fn().mockReturnValue(chain);
    FollowUp.find.mockReturnValue(chain);

    const req = { params: { entityType: 'workOrder', entityId: woId.toString() }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getEntityFollowUps(req, res, next);
    await flushPromises();

    expect(FollowUp.find).toHaveBeenCalledWith({ workOrder: woId.toString() });
  });
});

// =========================================================================
//  getFollowUps (list with filters)
// =========================================================================
describe('getFollowUps', () => {
  afterEach(() => {
    [FollowUp, WorkOrder, Vehicle, Appointment, Invoice].forEach(m => m._resetMocks());
  });

  it('passes all query params as filters', async () => {
    const customerId = objectId().toString();
    const chain = mockPopulateChain([]);
    chain.sort = jest.fn().mockReturnValue(chain);
    FollowUp.find.mockReturnValue(chain);

    const req = {
      query: { status: 'open', entityType: 'workOrder', customer: customerId },
      user: makeUser(),
    };
    const res = mockRes();
    const next = mockNext();
    controller.getFollowUps(req, res, next);
    await flushPromises();

    expect(FollowUp.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open', entityType: 'workOrder', customer: customerId })
    );
  });

  it('passes empty filter when no query params', async () => {
    const chain = mockPopulateChain([]);
    chain.sort = jest.fn().mockReturnValue(chain);
    FollowUp.find.mockReturnValue(chain);

    const req = { query: {}, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.getFollowUps(req, res, next);
    await flushPromises();

    expect(FollowUp.find).toHaveBeenCalledWith({});
  });
});

// =========================================================================
//  FollowUp Model — isOverdue virtual (real model, not mocked)
// =========================================================================
describe('FollowUp Model — isOverdue virtual', () => {
  // Use the real model for virtual testing
  const RealFollowUp = jest.requireActual('../../models/FollowUp');

  it('isOverdue is true when open and dueDate is in the past', () => {
    const doc = new RealFollowUp({
      entityType: 'customer', status: 'open', dueDate: new Date('2020-01-01'),
      notes: [{ text: 'test', timestamp: new Date() }], createdBy: objectId(),
    });
    expect(doc.isOverdue).toBe(true);
  });

  it('isOverdue is false when open and dueDate is in the future', () => {
    const doc = new RealFollowUp({
      entityType: 'customer', status: 'open', dueDate: new Date('2099-12-31'),
      notes: [{ text: 'test', timestamp: new Date() }], createdBy: objectId(),
    });
    expect(doc.isOverdue).toBe(false);
  });

  it('isOverdue is false when closed even with past dueDate', () => {
    const doc = new RealFollowUp({
      entityType: 'customer', status: 'closed', dueDate: new Date('2020-01-01'),
      notes: [{ text: 'test', timestamp: new Date() }], createdBy: objectId(),
    });
    expect(doc.isOverdue).toBe(false);
  });

  it('isOverdue is false when no dueDate set', () => {
    const doc = new RealFollowUp({
      entityType: 'customer', status: 'open',
      notes: [{ text: 'test', timestamp: new Date() }], createdBy: objectId(),
    });
    expect(doc.isOverdue).toBe(false);
  });
});
