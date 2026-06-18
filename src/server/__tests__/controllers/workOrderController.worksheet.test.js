const mongoose = require('mongoose');
const AppError = require('../../utils/appError');

// ---- Manual mocks for all models to avoid Mongoose schema compilation ----
// (mirrors workOrderController.partFlow.test.js)
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

// Attach a Mongoose-like .id() lookup to a plain array so the controller's
// workOrder.parts.id(partId) / part.offers.id(offerId) calls resolve.
const withId = (arr) => {
  arr.id = (id) => arr.find(x => x._id && x._id.toString() === id.toString()) || null;
  return arr;
};

const makeOffer = (overrides = {}) => ({
  _id: objectId(),
  seller: 'RockAuto',
  marketplaceSeller: 'rockauto-store',
  manufacturer: 'Bosch',
  partNumber: 'BR-123',
  price: 100,
  coreCharge: 7,
  url: 'https://rockauto.com/part/BR-123',
  eta: '2 days',
  inStock: true,
  condition: 'new',
  source: 'manual',
  ...overrides,
});

const makePart = (overrides = {}) => {
  const { offers = [], ...rest } = overrides;
  return {
    _id: objectId(),
    name: 'Front brake rotor',
    quantity: 2,
    price: 0,
    cost: 0,
    notes: '',
    sourcingStatus: 'pending',
    offers: withId(offers),
    ...rest,
  };
};

const makeWorkOrder = (overrides = {}) => {
  const { parts = [], ...rest } = overrides;
  return {
    _id: objectId(),
    status: 'Inspection/Diag Complete',
    parts: withId(parts),
    labor: [],
    servicePackages: [],
    totalEstimate: 0,
    save: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
    markModified: jest.fn(),
    ...rest,
  };
};

const resetAll = () => {
  [WorkOrder, Settings].forEach(m => m._resetMocks && m._resetMocks());
  Settings.getSettings.mockReset();
};

// =========================================================================
//  selectOffer — the ported, non-mirrored code (markup + enrich-in-place)
// =========================================================================
// Enrichment is applied via load-modify-save on the Mongoose subdoc, so the
// mutated `part` object is the assertion target.
describe('selectOffer', () => {
  afterEach(resetAll);

  const runSelect = async ({ wo, part, offer, user = makeUser(), selectionReason = 'Cheapest in-stock new rotor' }) => {
    WorkOrder.findById.mockResolvedValue(wo);
    const req = {
      params: { id: wo._id.toString(), partId: part._id.toString() },
      body: { offerId: offer._id.toString(), selectionReason }, // offerId travels in the body
      user,
    };
    const next = mockNext();
    controller.selectOffer(req, mockRes(), next);
    await flushPromises();
    return { next };
  };

  it("records the choice (sourcingStatus 'selected', offer id, reason, selectedBy/Name)", async () => {
    const offer = makeOffer({ price: 100 });
    const part = makePart({ offers: [offer] });
    const wo = makeWorkOrder({ parts: [part] });
    const user = makeUser({ name: 'Dana Writer' });

    await runSelect({ wo, part, offer, user, selectionReason: 'Best ETA' });

    expect(part.sourcingStatus).toBe('selected');
    expect(part.selectedOfferId).toBe(offer._id);
    expect(part.selectionReason).toBe('Best ETA');
    expect(part.selectedBy).toBe(user._id);
    expect(part.selectedByName).toBe('Dana Writer');
  });

  it('does NOT enrich the placeholder — name/cost/price/vendor stay put (deferred to approval)', async () => {
    const offer = makeOffer({ description: 'Cam actuator OEM', seller: 'RockAuto', manufacturer: 'Bosch', partNumber: '10921AA23B', price: 100 });
    const part = makePart({ name: 'Passenger Cam Actuator', cost: 0, price: 0, vendor: '', brand: '', partNumber: '', offers: [offer] });
    const wo = makeWorkOrder({ parts: [part] });

    await runSelect({ wo, part, offer });

    expect(part.name).toBe('Passenger Cam Actuator'); // unchanged
    expect(part.cost).toBe(0);
    expect(part.price).toBe(0);
    expect(part.vendor).toBe('');
    expect(part.brand).toBe('');
    expect(part.partNumber).toBe('');
  });

  it('re-selection repoints to the new offer, clears prior approval, and does NOT change WO status', async () => {
    const offerA = makeOffer({ seller: 'RockAuto', price: 100 });
    const offerB = makeOffer({ seller: 'eBay.com', price: 50 });
    const part = makePart({
      offers: [offerA, offerB],
      sourcingStatus: 'approved',
      selectedOfferId: offerA._id,
      approvedByName: 'Mona Manager',
    });
    const wo = makeWorkOrder({ parts: [part], status: 'Parts Selected - Pending Approval' });

    await runSelect({ wo, part, offer: offerB });

    expect(part.selectedOfferId).toBe(offerB._id);
    expect(part.sourcingStatus).toBe('selected');     // back to awaiting approval
    expect(part.approvedByName).toBeUndefined();       // prior approval cleared
    expect(wo.status).toBe('Parts Selected - Pending Approval'); // status untouched by selection
  });

  it('returns 404 when the offer id is not on the part', async () => {
    const part = makePart({ offers: [makeOffer()] });
    const wo = makeWorkOrder({ parts: [part] });
    WorkOrder.findById.mockResolvedValue(wo);
    const req = {
      params: { id: wo._id.toString(), partId: part._id.toString() },
      body: { offerId: objectId().toString(), selectionReason: 'x' },
      user: makeUser(),
    };
    const next = mockNext();
    controller.selectOffer(req, mockRes(), next);
    await flushPromises();
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });
});

// =========================================================================
//  approvePart — manager commit (enrichment + markup now live here)
// =========================================================================
describe('approvePart', () => {
  beforeEach(() => {
    Settings.getSettings.mockResolvedValue({ partMarkupPercentage: 30 });
  });
  afterEach(resetAll);

  const runApprove = async ({ wo, part, body, user = makeUser({ role: 'management' }) }) => {
    WorkOrder.findById.mockResolvedValue(wo);
    const req = { params: { id: wo._id.toString(), partId: part._id.toString() }, body, user };
    const next = mockNext();
    controller.approvePart(req, mockRes(), next);
    await flushPromises();
    return { next };
  };

  it('commits the submitted fields onto the part and DERIVES price=cost×1.30 (unit)', async () => {
    const part = makePart({ name: 'placeholder', quantity: 2, sourcingStatus: 'selected', offers: [makeOffer()] });
    const wo = makeWorkOrder({ parts: [part] });
    const user = makeUser({ name: 'Mona Manager', role: 'management' });

    const { next } = await runApprove({
      wo, part, user,
      body: { name: 'Cam actuator', vendor: 'RockAuto', supplier: 's', brand: 'Bosch', partNumber: '10921AA23B', cost: 100, coreCharge: 5, url: 'u' },
    });

    expect(next).not.toHaveBeenCalled();
    expect(part.name).toBe('Cam actuator');
    expect(part.vendor).toBe('RockAuto');
    expect(part.brand).toBe('Bosch');
    expect(part.partNumber).toBe('10921AA23B');
    expect(part.cost).toBe(100);
    expect(part.price).toBe(130);   // markup, NOT × quantity
    expect(part.quantity).toBe(2);
    expect(part.coreCharge).toBe(5);
    expect(part.sourcingStatus).toBe('approved');
    expect(part.approvedBy).toBe(user._id);
    expect(part.approvedByName).toBe('Mona Manager');
  });

  it('honors an explicit manager price override instead of deriving from markup', async () => {
    const part = makePart({ sourcingStatus: 'selected', offers: [makeOffer()] });
    const wo = makeWorkOrder({ parts: [part] });

    await runApprove({ wo, part, body: { name: 'x', cost: 100, price: 199.99 } });

    expect(part.cost).toBe(100);
    expect(part.price).toBe(199.99);
  });

  it('rejects approving a part that is not selected (400)', async () => {
    const part = makePart({ sourcingStatus: 'pending', offers: [makeOffer()] });
    const wo = makeWorkOrder({ parts: [part] });

    const { next } = await runApprove({ wo, part, body: { name: 'x', cost: 1 } });

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(part.sourcingStatus).toBe('pending'); // unchanged
  });

  it('never blanks the required name when none is submitted', async () => {
    const part = makePart({ name: 'Keep me', sourcingStatus: 'selected', offers: [makeOffer()] });
    const wo = makeWorkOrder({ parts: [part] });

    await runApprove({ wo, part, body: { cost: 10 } });

    expect(part.name).toBe('Keep me');
    expect(part.sourcingStatus).toBe('approved');
  });
});

// =========================================================================
//  open / close / reconcile — the status rules most likely to be "corrected"
// =========================================================================
describe('worksheet status transitions', () => {
  beforeEach(() => {
    Settings.getSettings.mockResolvedValue({ partMarkupPercentage: 30 });
  });
  afterEach(resetAll);

  const callStatus = async (fn, wo) => {
    WorkOrder.findById.mockResolvedValue(wo);
    const req = { params: { id: wo._id.toString() }, body: {}, user: makeUser() };
    const next = mockNext();
    fn(req, mockRes(), next);
    await flushPromises();
    expect(next).not.toHaveBeenCalled();
  };

  describe('openWorksheet', () => {
    it("from exactly 'Inspection/Diag Complete' → 'Parts Sourcing - In Progress'", async () => {
      const wo = makeWorkOrder({ status: 'Inspection/Diag Complete', parts: [makePart({ sourcingStatus: 'pending' })] });
      await callStatus(controller.openWorksheet, wo);
      expect(wo.status).toBe('Parts Sourcing - In Progress');
      expect(wo.save).toHaveBeenCalled();
    });

    it("from any OTHER status (e.g. 'Repair In Progress') → NO-OP (guards the launcher from dragging status back)", async () => {
      const wo = makeWorkOrder({ status: 'Repair In Progress', parts: [makePart({ sourcingStatus: 'pending' })] });
      await callStatus(controller.openWorksheet, wo);
      expect(wo.status).toBe('Repair In Progress');
      expect(wo.save).not.toHaveBeenCalled();
    });

    it("reconcile-on-load: every part 'selected' but still 'In Progress' → 'Parts Selected - Pending Approval'", async () => {
      const wo = makeWorkOrder({
        status: 'Parts Sourcing - In Progress',
        parts: [makePart({ sourcingStatus: 'selected' }), makePart({ sourcingStatus: 'selected' })],
      });
      await callStatus(controller.openWorksheet, wo);
      expect(wo.status).toBe('Parts Selected - Pending Approval');
      expect(wo.save).toHaveBeenCalled();
    });
  });

  describe('closeWorksheet', () => {
    it("every part 'selected' → 'Parts Selected - Pending Approval'", async () => {
      const wo = makeWorkOrder({
        status: 'Parts Sourcing - In Progress',
        parts: [makePart({ sourcingStatus: 'selected' }), makePart({ sourcingStatus: 'selected' })],
      });
      await callStatus(controller.closeWorksheet, wo);
      expect(wo.status).toBe('Parts Selected - Pending Approval');
      expect(wo.save).toHaveBeenCalled();
    });

    it('ZERO parts → skip-to-approval is INTENDED, not blocked', async () => {
      const wo = makeWorkOrder({ status: 'Parts Sourcing - In Progress', parts: [] });
      await callStatus(controller.closeWorksheet, wo);
      expect(wo.status).toBe('Parts Selected - Pending Approval');
      expect(wo.save).toHaveBeenCalled();
    });

    it("ANY part still 'pending' → status unchanged (stays 'In Progress')", async () => {
      const wo = makeWorkOrder({
        status: 'Parts Sourcing - In Progress',
        parts: [makePart({ sourcingStatus: 'selected' }), makePart({ sourcingStatus: 'pending' })],
      });
      await callStatus(controller.closeWorksheet, wo);
      expect(wo.status).toBe('Parts Sourcing - In Progress');
      expect(wo.save).not.toHaveBeenCalled();
    });

    it("a mix of 'selected' and 'approved' (none pending) → 'Parts Selected - Pending Approval'", async () => {
      const wo = makeWorkOrder({
        status: 'Parts Sourcing - In Progress',
        parts: [makePart({ sourcingStatus: 'approved' }), makePart({ sourcingStatus: 'selected' })],
      });
      await callStatus(controller.closeWorksheet, wo);
      expect(wo.status).toBe('Parts Selected - Pending Approval');
      expect(wo.save).toHaveBeenCalled();
    });
  });
});
