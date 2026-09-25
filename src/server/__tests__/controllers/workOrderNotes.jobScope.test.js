/**
 * Job-scoped work order notes.
 *
 * A note can be filed against a single job (WorkOrder.services[] entry) instead of
 * the whole work order. These cover the two places that has teeth on the server:
 * writing a note with a serviceId, and what happens to those notes when the job
 * they point at is removed from the work order.
 */
const mongoose = require('mongoose');

// ---- Manual mocks for all models to avoid Mongoose schema compilation ----
const mockModel = (name) => {
  const model = jest.fn();
  model.find = jest.fn();
  model.findById = jest.fn();
  model.findOne = jest.fn();
  model.findOneAndUpdate = jest.fn();
  model.findByIdAndUpdate = jest.fn();
  model.findByIdAndDelete = jest.fn();
  model.deleteMany = jest.fn();
  model.updateMany = jest.fn();
  model.create = jest.fn();
  model.modelName = name;
  return model;
};

jest.mock('../../models/WorkOrder', () => mockModel('WorkOrder'));
jest.mock('../../models/WorkOrderNote', () => mockModel('WorkOrderNote'));
jest.mock('../../models/Vehicle', () => mockModel('Vehicle'));
jest.mock('../../models/Customer', () => mockModel('Customer'));
jest.mock('../../models/Appointment', () => mockModel('Appointment'));
jest.mock('../../models/InventoryItem', () => mockModel('InventoryItem'));
jest.mock('../../models/ShopSupply', () => mockModel('ShopSupply'));
jest.mock('../../models/SupplyMovement', () => mockModel('SupplyMovement'));
jest.mock('../../models/SupplyVocab', () => mockModel('SupplyVocab'));
jest.mock('../../models/ServicePackage', () => mockModel('ServicePackage'));
jest.mock('../../services/supplyService', () => ({ getSupply: jest.fn() }));
jest.mock('../../services/supplyTagService', () => ({}));
jest.mock('../../models/Settings', () => {
  const m = mockModel('Settings');
  m.getSettings = jest.fn();
  return m;
});
jest.mock('../../services/twilioService', () => ({}));
jest.mock('../../services/emailService', () => ({}));
jest.mock('../../services/cacheService', () => ({
  invalidateAllWorkOrders: jest.fn(),
  invalidateServiceWritersCorner: jest.fn(),
  invalidateAllAppointments: jest.fn(),
  getWorkOrderById: jest.fn(),
  setWorkOrderById: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
}));
jest.mock('../../utils/populationHelpers', () => ({
  applyPopulation: jest.fn((query) => query),
}));
jest.mock('../../utils/calculationHelpers', () => ({
  calculateWorkOrderTotal: jest.fn(() => 100),
  getWorkOrderCostBreakdown: jest.fn(() => ({})),
}));

const WorkOrder = require('../../models/WorkOrder');
const WorkOrderNote = require('../../models/WorkOrderNote');
const workOrderController = require('../../controllers/workOrderController');
const notesController = require('../../controllers/workOrderNotesController');

const objectId = () => new mongoose.Types.ObjectId();
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createWorkOrderNote — job scope', () => {
  // Capture what the controller hands the model constructor.
  const captureSavedNote = () => {
    const captured = {};
    WorkOrderNote.mockImplementation(function (data) {
      Object.assign(captured, data);
      this.save = jest.fn().mockResolvedValue(this);
      this.populate = jest.fn().mockResolvedValue(this);
    });
    return captured;
  };

  it('stores serviceId and denormalizes the job name from the work order', async () => {
    const serviceId = objectId();
    const workOrderId = objectId();
    WorkOrder.findById.mockResolvedValue({
      _id: workOrderId,
      services: [{ _id: serviceId, description: 'Front Brake Job' }],
    });
    const captured = captureSavedNote();

    const req = {
      params: { workOrderId: workOrderId.toString() },
      body: { content: '  Rotors at minimum spec.  ', serviceId: serviceId.toString() },
      user: { id: objectId().toString() },
    };
    const res = mockRes();

    await notesController.createWorkOrderNote(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(captured.serviceId).toBe(serviceId.toString());
    expect(captured.serviceName).toBe('Front Brake Job');
    expect(captured.content).toBe('Rotors at minimum spec.');
  });

  it('files a note with no serviceId at work-order level', async () => {
    const workOrderId = objectId();
    WorkOrder.findById.mockResolvedValue({
      _id: workOrderId,
      services: [{ _id: objectId(), description: 'Front Brake Job' }],
    });
    const captured = captureSavedNote();

    const req = {
      params: { workOrderId: workOrderId.toString() },
      body: { content: 'Vehicle held overnight.' },
      user: { id: objectId().toString() },
    };
    const res = mockRes();

    await notesController.createWorkOrderNote(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(captured.serviceId).toBeNull();
    expect(captured.serviceName).toBeUndefined();
  });

  it('rejects a serviceId that is not a job on this work order', async () => {
    const workOrderId = objectId();
    WorkOrder.findById.mockResolvedValue({
      _id: workOrderId,
      services: [{ _id: objectId(), description: 'Front Brake Job' }],
    });
    WorkOrderNote.mockImplementation(function () {
      this.save = jest.fn();
      this.populate = jest.fn();
    });

    const req = {
      params: { workOrderId: workOrderId.toString() },
      body: { content: 'Orphan note', serviceId: objectId().toString() },
      user: { id: objectId().toString() },
    };
    const res = mockRes();

    await notesController.createWorkOrderNote(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(WorkOrderNote).not.toHaveBeenCalled();
  });
});

describe('getWorkOrderNotes — serviceId filter', () => {
  const mockFindChain = () => {
    const chain = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([]),
    };
    WorkOrderNote.find.mockReturnValue(chain);
    return chain;
  };

  it('filters to one job when given a serviceId', async () => {
    mockFindChain();
    const serviceId = objectId().toString();
    const workOrderId = objectId().toString();

    await notesController.getWorkOrderNotes(
      { params: { workOrderId }, query: { serviceId } },
      mockRes()
    );

    expect(WorkOrderNote.find).toHaveBeenCalledWith({ workOrder: workOrderId, serviceId });
  });

  it('filters to work-order-level notes for serviceId=none', async () => {
    mockFindChain();
    const workOrderId = objectId().toString();

    await notesController.getWorkOrderNotes(
      { params: { workOrderId }, query: { serviceId: 'none' } },
      mockRes()
    );

    expect(WorkOrderNote.find).toHaveBeenCalledWith({ workOrder: workOrderId, serviceId: null });
  });

  it('returns every note when no serviceId is given', async () => {
    mockFindChain();
    const workOrderId = objectId().toString();

    await notesController.getWorkOrderNotes(
      { params: { workOrderId }, query: {} },
      mockRes()
    );

    expect(WorkOrderNote.find).toHaveBeenCalledWith({ workOrder: workOrderId });
  });
});

describe('updateWorkOrder — notes on a removed job', () => {
  const keptService = () => ({ _id: objectId(), description: 'Oil Change' });
  const removedService = () => ({ _id: objectId(), description: 'Front Brake Job' });

  // Drive updateWorkOrder with a services[] array that drops `removed`.
  const runUpdate = async ({ kept, removed, orphanedNoteActions }) => {
    const workOrderId = objectId().toString();
    WorkOrder.findById.mockResolvedValue({ _id: workOrderId, services: [kept, removed] });
    WorkOrder.findByIdAndUpdate.mockResolvedValue({ _id: workOrderId, services: [kept] });
    WorkOrderNote.deleteMany.mockResolvedValue({ deletedCount: 1 });
    WorkOrderNote.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const req = {
      params: { id: workOrderId },
      body: {
        services: [{ _id: kept._id, description: kept.description }],
        ...(orphanedNoteActions ? { orphanedNoteActions } : {}),
      },
    };
    const res = mockRes();
    await workOrderController.updateWorkOrder(req, res, jest.fn());
    await flushPromises();
    return { workOrderId, res };
  };

  it('keeps the notes at work-order level by default', async () => {
    const kept = keptService();
    const removed = removedService();

    const { workOrderId } = await runUpdate({ kept, removed });

    expect(WorkOrderNote.updateMany).toHaveBeenCalledWith(
      { workOrder: workOrderId, serviceId: { $in: [removed._id] } },
      { $set: { serviceId: null } }
    );
    expect(WorkOrderNote.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes the notes when the user chose delete for that job', async () => {
    const kept = keptService();
    const removed = removedService();

    const { workOrderId } = await runUpdate({
      kept,
      removed,
      orphanedNoteActions: { [removed._id.toString()]: 'delete' },
    });

    expect(WorkOrderNote.deleteMany).toHaveBeenCalledWith({
      workOrder: workOrderId,
      serviceId: { $in: [removed._id] },
    });
    expect(WorkOrderNote.updateMany).not.toHaveBeenCalled();
  });

  it('leaves notes alone when no job was removed', async () => {
    const kept = keptService();
    const workOrderId = objectId().toString();
    WorkOrder.findById.mockResolvedValue({ _id: workOrderId, services: [kept] });
    WorkOrder.findByIdAndUpdate.mockResolvedValue({ _id: workOrderId, services: [kept] });

    const req = {
      params: { id: workOrderId },
      body: { services: [{ _id: kept._id, description: kept.description }] },
    };
    await workOrderController.updateWorkOrder(req, mockRes(), jest.fn());
    await flushPromises();

    expect(WorkOrderNote.updateMany).not.toHaveBeenCalled();
    expect(WorkOrderNote.deleteMany).not.toHaveBeenCalled();
  });

  it('never persists orphanedNoteActions onto the work order', async () => {
    const kept = keptService();
    const removed = removedService();

    await runUpdate({
      kept,
      removed,
      orphanedNoteActions: { [removed._id.toString()]: 'delete' },
    });

    const [, updatePayload] = WorkOrder.findByIdAndUpdate.mock.calls[0];
    expect(updatePayload).not.toHaveProperty('orphanedNoteActions');
  });
});
