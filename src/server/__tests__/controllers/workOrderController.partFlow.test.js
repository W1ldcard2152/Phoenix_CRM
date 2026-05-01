const mongoose = require('mongoose');
const AppError = require('../../utils/appError');

// ---- Manual mocks for all models to avoid Mongoose schema compilation ----
const mockModel = (name) => {
  const model = jest.fn();
  model.find = jest.fn();
  model.findById = jest.fn();
  model.findOne = jest.fn();
  model.findOneAndUpdate = jest.fn();
  model.findByIdAndUpdate = jest.fn();
  model.findByIdAndDelete = jest.fn();
  model.create = jest.fn();
  model.modelName = name;
  model._resetMocks = () => {
    model.find.mockReset();
    model.findById.mockReset();
    model.findOne.mockReset();
    model.findOneAndUpdate.mockReset();
    model.findByIdAndUpdate.mockReset();
    model.findByIdAndDelete.mockReset();
    model.create.mockReset();
  };
  return model;
};

jest.mock('../../models/WorkOrder', () => mockModel('WorkOrder'));
jest.mock('../../models/Vehicle', () => mockModel('Vehicle'));
jest.mock('../../models/Customer', () => mockModel('Customer'));
jest.mock('../../models/Appointment', () => mockModel('Appointment'));
jest.mock('../../models/WorkOrderNote', () => mockModel('WorkOrderNote'));
jest.mock('../../models/InventoryItem', () => mockModel('InventoryItem'));
jest.mock('../../models/ServicePackage', () => mockModel('ServicePackage'));
jest.mock('../../models/Settings', () => {
  const m = mockModel('Settings');
  m.getSettings = jest.fn();
  return m;
});

// Mock external services and helpers that the controller pulls in
jest.mock('../../services/twilioService', () => ({}));
jest.mock('../../services/emailService', () => ({}));
jest.mock('../../services/cacheService', () => ({
  invalidateAllWorkOrders: jest.fn(),
  invalidateServiceWritersCorner: jest.fn(),
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
const InventoryItem = require('../../models/InventoryItem');
const Settings = require('../../models/Settings');

const controller = require('../../controllers/workOrderController');

// ---- Helpers ----
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

// Build a mock work order document with a working parts array, save(), markModified()
const makeWorkOrder = (overrides = {}) => {
  const wo = {
    _id: objectId(),
    parts: [],
    labor: [],
    servicePackages: [],
    totalEstimate: 0,
    save: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
    markModified: jest.fn(),
    ...overrides,
  };
  return wo;
};

const makeInventoryItem = (overrides = {}) => ({
  _id: objectId(),
  name: 'Mobil 1 5W-30',
  partNumber: 'M1-5W30-5Q',
  vendor: 'Walmart',
  warranty: '',
  url: '',
  category: 'Oil',
  unit: 'quart',
  unitsPerPurchase: 5,
  purchaseUnit: 'jug',
  cost: 25,        // per jug
  price: 6.5,      // per quart
  quantityOnHand: 10,
  reorderPoint: 2,
  isActive: true,
  ...overrides,
});

const makePart = (overrides = {}) => ({
  _id: objectId(),
  name: 'Mobil 1 5W-30',
  partNumber: 'M1-5W30-5Q',
  quantity: 1,
  price: 6.5,
  cost: 5,
  vendor: 'Walmart',
  category: 'Oil',
  inventoryItemId: objectId(),
  committed: false,
  ordered: true,
  received: true,
  ...overrides,
});

// Default Settings mock to return a sensible markup
beforeEach(() => {
  Settings.getSettings.mockResolvedValue({ partMarkupPercentage: 30 });
});

const resetAll = () => {
  [WorkOrder, InventoryItem, Settings].forEach(m => m._resetMocks && m._resetMocks());
  Settings.getSettings.mockReset();
};

// =========================================================================
//  addPartFromInventory — draft creation
// =========================================================================
describe('addPartFromInventory', () => {
  afterEach(() => {
    resetAll();
    Settings.getSettings.mockResolvedValue({ partMarkupPercentage: 30 });
  });

  it('pushes a part with committed: false (draft regression guard)', async () => {
    const wo = makeWorkOrder();
    const item = makeInventoryItem();
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 1 }, user: makeUser() };
    const res = mockRes();
    const next = mockNext();
    controller.addPartFromInventory(req, res, next);
    await flushPromises();

    expect(next).not.toHaveBeenCalled();
    expect(wo.parts).toHaveLength(1);
    expect(wo.parts[0].committed).toBe(false);
    expect(wo.parts[0].inventoryItemId).toBe(item._id);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does NOT decrement quantityOnHand when adding a draft', async () => {
    const wo = makeWorkOrder();
    const item = makeInventoryItem({ quantityOnHand: 10 });
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 3 }, user: makeUser() };
    controller.addPartFromInventory(req, mockRes(), mockNext());
    await flushPromises();

    expect(InventoryItem.findOneAndUpdate).not.toHaveBeenCalled();
    expect(InventoryItem.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(item.quantityOnHand).toBe(10);
  });

  it('allows draft creation even when quantityOnHand < requested quantity', async () => {
    const wo = makeWorkOrder();
    const item = makeInventoryItem({ quantityOnHand: 1 });
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 5 }, user: makeUser() };
    const next = mockNext();
    controller.addPartFromInventory(req, mockRes(), next);
    await flushPromises();

    expect(next).not.toHaveBeenCalled();
    expect(wo.parts).toHaveLength(1);
    expect(wo.parts[0].quantity).toBe(5);
  });

  it('computes per-unit cost as item.cost / unitsPerPurchase (5qt jug → 1qt = $5)', async () => {
    const wo = makeWorkOrder();
    const item = makeInventoryItem({ cost: 25, unitsPerPurchase: 5 });
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 1 }, user: makeUser() };
    controller.addPartFromInventory(req, mockRes(), mockNext());
    await flushPromises();

    expect(wo.parts[0].cost).toBe(5);
  });

  it('uses item.price directly when present (respects manual overrides)', async () => {
    const wo = makeWorkOrder();
    const item = makeInventoryItem({ cost: 25, unitsPerPurchase: 5, price: 9.99 });
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 1 }, user: makeUser() };
    controller.addPartFromInventory(req, mockRes(), mockNext());
    await flushPromises();

    expect(wo.parts[0].price).toBe(9.99);
  });

  it('falls back to unitCost * (1 + markup/100) when item.price is 0/missing', async () => {
    const wo = makeWorkOrder();
    const item = makeInventoryItem({ cost: 25, unitsPerPurchase: 5, price: 0 });
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 1 }, user: makeUser() };
    controller.addPartFromInventory(req, mockRes(), mockNext());
    await flushPromises();

    // (25 / 5) * 1.30 = 6.50
    expect(wo.parts[0].price).toBe(6.5);
  });

  it('returns 404 when inventory item not found', async () => {
    const wo = makeWorkOrder();
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(null);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: objectId().toString(), quantity: 1 }, user: makeUser() };
    const next = mockNext();
    controller.addPartFromInventory(req, mockRes(), next);
    await flushPromises();

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
  });

  it('returns 404 when inventory item is inactive', async () => {
    const wo = makeWorkOrder();
    const item = makeInventoryItem({ isActive: false });
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 1 }, user: makeUser() };
    const next = mockNext();
    controller.addPartFromInventory(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });

  it('returns 400 when inventoryItemId is missing', async () => {
    const req = { params: { id: objectId().toString() }, body: { quantity: 1 }, user: makeUser() };
    const next = mockNext();
    controller.addPartFromInventory(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it('returns 400 when quantity < 1', async () => {
    const req = { params: { id: objectId().toString() }, body: { inventoryItemId: objectId().toString(), quantity: 0 }, user: makeUser() };
    const next = mockNext();
    controller.addPartFromInventory(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it('allows two drafts of the same item to coexist', async () => {
    const wo = makeWorkOrder();
    const item = makeInventoryItem();
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 1 }, user: makeUser() };
    controller.addPartFromInventory(req, mockRes(), mockNext());
    await flushPromises();
    controller.addPartFromInventory(req, mockRes(), mockNext());
    await flushPromises();

    expect(wo.parts).toHaveLength(2);
    expect(wo.parts[0].committed).toBe(false);
    expect(wo.parts[1].committed).toBe(false);
  });

  // Pricing edge cases
  it('handles unitsPerPurchase = 1 (no division)', async () => {
    const wo = makeWorkOrder();
    const item = makeInventoryItem({ cost: 10, unitsPerPurchase: 1, price: 0 });
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 1 }, user: makeUser() };
    controller.addPartFromInventory(req, mockRes(), mockNext());
    await flushPromises();

    expect(wo.parts[0].cost).toBe(10);
    expect(wo.parts[0].price).toBe(13); // 10 * 1.30
  });

  it('handles cost = 0 without crashing', async () => {
    const wo = makeWorkOrder();
    const item = makeInventoryItem({ cost: 0, unitsPerPurchase: 5, price: 0 });
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 1 }, user: makeUser() };
    const next = mockNext();
    controller.addPartFromInventory(req, mockRes(), next);
    await flushPromises();

    expect(next).not.toHaveBeenCalled();
    expect(wo.parts[0].cost).toBe(0);
    expect(wo.parts[0].price).toBe(0);
  });

  it('uses settings markup percentage in fallback price calc', async () => {
    Settings.getSettings.mockResolvedValue({ partMarkupPercentage: 15 });
    const wo = makeWorkOrder();
    const item = makeInventoryItem({ cost: 25, unitsPerPurchase: 5, price: 0 });
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 1 }, user: makeUser() };
    controller.addPartFromInventory(req, mockRes(), mockNext());
    await flushPromises();

    // (25 / 5) * 1.15 = 5.75
    expect(wo.parts[0].price).toBe(5.75);
  });

  it('falls back to 30% markup when settings markup is 0/missing (existing falsy-value behavior)', async () => {
    // Documents the controller's `markup = settings.partMarkupPercentage || 30` fallback —
    // a value of 0 is treated as missing. Don't change this behavior without checking
    // every caller that relies on the 30% default.
    Settings.getSettings.mockResolvedValue({ partMarkupPercentage: 0 });
    const wo = makeWorkOrder();
    const item = makeInventoryItem({ cost: 25, unitsPerPurchase: 5, price: 0 });
    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(item);

    const req = { params: { id: wo._id.toString() }, body: { inventoryItemId: item._id.toString(), quantity: 1 }, user: makeUser() };
    controller.addPartFromInventory(req, mockRes(), mockNext());
    await flushPromises();

    // (25 / 5) * 1.30 = 6.50 (markup defaults to 30 when 0 is supplied)
    expect(wo.parts[0].price).toBe(6.5);
  });
});

// =========================================================================
//  commitPart
// =========================================================================
describe('commitPart', () => {
  afterEach(() => {
    resetAll();
    Settings.getSettings.mockResolvedValue({ partMarkupPercentage: 30 });
  });

  it('atomically deducts QOH and pushes an adjustment log entry', async () => {
    const inventoryItemId = objectId();
    const part = makePart({ inventoryItemId, committed: false, quantity: 2 });
    const wo = makeWorkOrder({ parts: [part] });
    const inv = makeInventoryItem({ _id: inventoryItemId, quantityOnHand: 10, reorderPoint: 1 });

    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(inv);
    InventoryItem.findOneAndUpdate.mockResolvedValue({ ...inv, quantityOnHand: 8 });

    const user = makeUser();
    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user };
    controller.commitPart(req, mockRes(), mockNext());
    await flushPromises();

    expect(InventoryItem.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update] = InventoryItem.findOneAndUpdate.mock.calls[0];
    expect(filter._id).toBe(inv._id);
    expect(filter.quantityOnHand).toEqual({ $gte: 2 });
    expect(update.$set.quantityOnHand).toBe(8);
    expect(update.$push.adjustmentLog).toMatchObject({
      adjustedBy: user._id,
      previousQty: 10,
      newQty: 8,
    });
    expect(update.$push.adjustmentLog.reason).toMatch(/Used on WO/);
  });

  it('flips committed from false to true', async () => {
    const part = makePart({ committed: false });
    const wo = makeWorkOrder({ parts: [part] });
    const inv = makeInventoryItem({ _id: part.inventoryItemId, quantityOnHand: 5 });

    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(inv);
    InventoryItem.findOneAndUpdate.mockResolvedValue({ ...inv, quantityOnHand: 4 });

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user: makeUser() };
    controller.commitPart(req, mockRes(), mockNext());
    await flushPromises();

    expect(wo.parts[0].committed).toBe(true);
    expect(wo.markModified).toHaveBeenCalledWith('parts');
  });

  it('rejects when part is already committed', async () => {
    const part = makePart({ committed: true });
    const wo = makeWorkOrder({ parts: [part] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user: makeUser() };
    const next = mockNext();
    controller.commitPart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/already committed/i);
    expect(InventoryItem.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects pre-migration parts (committed === undefined) as already committed', async () => {
    // Pre-migration parts had stock deducted at add-time; re-committing would double-deduct.
    // The check is `committed !== false` — only explicit drafts go through.
    const part = makePart({ committed: undefined });
    const wo = makeWorkOrder({ parts: [part] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user: makeUser() };
    const next = mockNext();
    controller.commitPart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/already committed/i);
    expect(InventoryItem.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects when part has no inventoryItemId (manual entry)', async () => {
    const part = makePart({ committed: false, inventoryItemId: undefined });
    const wo = makeWorkOrder({ parts: [part] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user: makeUser() };
    const next = mockNext();
    controller.commitPart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/not linked to an inventory item/i);
    expect(InventoryItem.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects when QOH < part.quantity (stock NOT deducted)', async () => {
    const part = makePart({ committed: false, quantity: 5 });
    const wo = makeWorkOrder({ parts: [part] });
    const inv = makeInventoryItem({ _id: part.inventoryItemId, quantityOnHand: 2 });

    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(inv);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user: makeUser() };
    const next = mockNext();
    controller.commitPart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/insufficient stock/i);
    expect(InventoryItem.findOneAndUpdate).not.toHaveBeenCalled();
    expect(wo.parts[0].committed).toBe(false);
  });

  it('rejects when underlying inventory item has been deactivated', async () => {
    const part = makePart({ committed: false });
    const wo = makeWorkOrder({ parts: [part] });
    const inv = makeInventoryItem({ _id: part.inventoryItemId, isActive: false });

    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(inv);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user: makeUser() };
    const next = mockNext();
    controller.commitPart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(InventoryItem.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 on out-of-range partIndex (negative)', async () => {
    const wo = makeWorkOrder({ parts: [makePart()] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: -1 }, user: makeUser() };
    const next = mockNext();
    controller.commitPart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it('returns 400 on out-of-range partIndex (>= length)', async () => {
    const wo = makeWorkOrder({ parts: [makePart()] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 5 }, user: makeUser() };
    const next = mockNext();
    controller.commitPart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it('returns 400 on missing partIndex', async () => {
    const wo = makeWorkOrder({ parts: [makePart()] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: {}, user: makeUser() };
    const next = mockNext();
    controller.commitPart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it('returns 409 when atomic update fails (concurrent commit race)', async () => {
    const part = makePart({ committed: false, quantity: 3 });
    const wo = makeWorkOrder({ parts: [part] });
    const inv = makeInventoryItem({ _id: part.inventoryItemId, quantityOnHand: 5 });

    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(inv);
    // Simulate the QOH-guard $gte rejection by returning null
    InventoryItem.findOneAndUpdate.mockResolvedValue(null);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user: makeUser() };
    const next = mockNext();
    controller.commitPart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(wo.parts[0].committed).toBe(false);
  });

  it('includes lowStockWarning when newQty <= reorderPoint', async () => {
    const part = makePart({ committed: false, quantity: 4 });
    const wo = makeWorkOrder({ parts: [part] });
    const inv = makeInventoryItem({ _id: part.inventoryItemId, quantityOnHand: 5, reorderPoint: 2, name: 'Mobil 1', unit: 'quart' });

    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(inv);
    InventoryItem.findOneAndUpdate.mockResolvedValue({ ...inv, quantityOnHand: 1 });

    const res = mockRes();
    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user: makeUser() };
    controller.commitPart(req, res, mockNext());
    await flushPromises();

    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.lowStockWarning).toEqual({
      itemName: 'Mobil 1',
      currentQoh: 1,
      unit: 'quart',
      reorderPoint: 2,
    });
  });

  it('omits lowStockWarning when newQty > reorderPoint', async () => {
    const part = makePart({ committed: false, quantity: 1 });
    const wo = makeWorkOrder({ parts: [part] });
    const inv = makeInventoryItem({ _id: part.inventoryItemId, quantityOnHand: 10, reorderPoint: 2 });

    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(inv);
    InventoryItem.findOneAndUpdate.mockResolvedValue({ ...inv, quantityOnHand: 9 });

    const res = mockRes();
    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user: makeUser() };
    controller.commitPart(req, res, mockNext());
    await flushPromises();

    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.lowStockWarning).toBeUndefined();
  });
});

// =========================================================================
//  removePart
// =========================================================================
describe('removePart', () => {
  afterEach(() => {
    resetAll();
    Settings.getSettings.mockResolvedValue({ partMarkupPercentage: 30 });
  });

  it('draft + returnToInventory=true → splices and does NOT touch inventory', async () => {
    // Critical: drafts were never deducted, so a "restock" would create phantom stock.
    const part = makePart({ committed: false, quantity: 3 });
    const wo = makeWorkOrder({ parts: [part] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0, returnToInventory: true }, user: makeUser() };
    controller.removePart(req, mockRes(), mockNext());
    await flushPromises();

    expect(wo.parts).toHaveLength(0);
    expect(InventoryItem.findById).not.toHaveBeenCalled();
    expect(InventoryItem.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('committed + returnToInventory=true → increments QOH and pushes adjustment log', async () => {
    const part = makePart({ committed: true, quantity: 2 });
    const wo = makeWorkOrder({ parts: [part] });
    const inv = makeInventoryItem({ _id: part.inventoryItemId, quantityOnHand: 5 });

    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(inv);
    InventoryItem.findByIdAndUpdate.mockResolvedValue({ ...inv, quantityOnHand: 7 });

    const user = makeUser();
    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0, returnToInventory: true }, user };
    controller.removePart(req, mockRes(), mockNext());
    await flushPromises();

    expect(wo.parts).toHaveLength(0);
    expect(InventoryItem.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = InventoryItem.findByIdAndUpdate.mock.calls[0];
    expect(update.$set.quantityOnHand).toBe(7);
    expect(update.$push.adjustmentLog).toMatchObject({
      adjustedBy: user._id,
      previousQty: 5,
      newQty: 7,
    });
    expect(update.$push.adjustmentLog.reason).toMatch(/Returned from removed part/);
  });

  it('committed + returnToInventory=false → splices, no inventory mutation', async () => {
    const part = makePart({ committed: true, quantity: 2 });
    const wo = makeWorkOrder({ parts: [part] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0, returnToInventory: false }, user: makeUser() };
    controller.removePart(req, mockRes(), mockNext());
    await flushPromises();

    expect(wo.parts).toHaveLength(0);
    expect(InventoryItem.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('pre-migration part (committed === undefined) + returnToInventory=true → restocks', async () => {
    // Pre-migration parts had stock deducted at add-time; the `committed !== false` predicate
    // ensures they get the restock option on remove.
    const part = makePart({ committed: undefined, quantity: 1 });
    const wo = makeWorkOrder({ parts: [part] });
    const inv = makeInventoryItem({ _id: part.inventoryItemId, quantityOnHand: 3 });

    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(inv);
    InventoryItem.findByIdAndUpdate.mockResolvedValue({ ...inv, quantityOnHand: 4 });

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0, returnToInventory: true }, user: makeUser() };
    controller.removePart(req, mockRes(), mockNext());
    await flushPromises();

    expect(InventoryItem.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = InventoryItem.findByIdAndUpdate.mock.calls[0];
    expect(update.$set.quantityOnHand).toBe(4);
  });

  it('manual part (no inventoryItemId) — splices, no inventory call regardless of flag', async () => {
    const part = makePart({ inventoryItemId: undefined, committed: true, quantity: 2 });
    const wo = makeWorkOrder({ parts: [part] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0, returnToInventory: true }, user: makeUser() };
    controller.removePart(req, mockRes(), mockNext());
    await flushPromises();

    expect(wo.parts).toHaveLength(0);
    expect(InventoryItem.findById).not.toHaveBeenCalled();
    expect(InventoryItem.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('inventory item has been deleted between commit and remove — splices without crashing', async () => {
    const part = makePart({ committed: true, quantity: 1 });
    const wo = makeWorkOrder({ parts: [part] });

    WorkOrder.findById.mockResolvedValue(wo);
    InventoryItem.findById.mockResolvedValue(null); // item gone
    // findByIdAndUpdate should NOT be called when findById returns null

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0, returnToInventory: true }, user: makeUser() };
    const next = mockNext();
    controller.removePart(req, mockRes(), next);
    await flushPromises();

    expect(next).not.toHaveBeenCalled();
    expect(wo.parts).toHaveLength(0);
    expect(InventoryItem.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 on out-of-range partIndex', async () => {
    const wo = makeWorkOrder({ parts: [makePart()] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 99, returnToInventory: false }, user: makeUser() };
    const next = mockNext();
    controller.removePart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it('returns 400 on missing partIndex', async () => {
    const wo = makeWorkOrder({ parts: [makePart()] });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { returnToInventory: false }, user: makeUser() };
    const next = mockNext();
    controller.removePart(req, mockRes(), next);
    await flushPromises();

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it('recalculates totalEstimate after removal', async () => {
    const { calculateWorkOrderTotal } = require('../../utils/calculationHelpers');
    calculateWorkOrderTotal.mockReturnValueOnce(42);

    const part = makePart({ committed: false });
    const wo = makeWorkOrder({ parts: [part], totalEstimate: 999 });
    WorkOrder.findById.mockResolvedValue(wo);

    const req = { params: { id: wo._id.toString() }, body: { partIndex: 0 }, user: makeUser() };
    controller.removePart(req, mockRes(), mockNext());
    await flushPromises();

    expect(wo.totalEstimate).toBe(42);
  });
});
