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
// The enrichment is applied via WorkOrder.findOneAndUpdate($set, arrayFilters),
// so the $set object is the assertion target (cf. how partFlow inspects updates).
describe('selectOffer', () => {
  beforeEach(() => {
    Settings.getSettings.mockResolvedValue({ partMarkupPercentage: 30 });
    WorkOrder.findOneAndUpdate.mockResolvedValue({});
  });
  afterEach(resetAll);

  const runSelect = async ({ wo, part, offer, user, selectionReason = 'Cheapest in-stock new rotor' }) => {
    WorkOrder.findById.mockResolvedValue(wo);
    const req = {
      params: { id: wo._id.toString(), partId: part._id.toString(), offerId: offer._id.toString() },
      body: { selectionReason },
      user,
    };
    const next = mockNext();
    controller.selectOffer(req, mockRes(), next);
    await flushPromises();
    expect(next).not.toHaveBeenCalled();
    const call = WorkOrder.findOneAndUpdate.mock.calls[0];
    return { set: call[1].$set, options: call[2], next };
  };

  it('maps offer.price→cost and DERIVES price=cost×1.30 as a UNIT value (qty untouched)', async () => {
    const offer = makeOffer({ price: 100 });
    const part = makePart({ quantity: 2, offers: [offer] });
    const wo = makeWorkOrder({ parts: [part] });

    const { set } = await runSelect({ wo, part, offer, user: makeUser() });

    expect(set['parts.$[p].cost']).toBe(100);
    expect(set['parts.$[p].price']).toBe(130);          // 100 × 1.30, NOT × quantity
    expect(set['parts.$[p].price']).not.toBe(260);      // the "someone made it extended" regression
    expect(set['parts.$[p].quantity']).toBeUndefined(); // quantity is never written by selection
    expect(part.quantity).toBe(2);                      // in-memory quantity untouched
  });

  it('lands every enrich field on the correct part field', async () => {
    const offer = makeOffer({
      seller: 'FCP Euro',
      marketplaceSeller: 'fcp-store',
      manufacturer: 'ATE',
      partNumber: 'ATE-999',
      coreCharge: 12,
      url: 'https://fcpeuro.com/p/ATE-999',
      price: 80,
    });
    const part = makePart({ offers: [offer] });
    const wo = makeWorkOrder({ parts: [part] });

    const { set } = await runSelect({ wo, part, offer, user: makeUser() });

    expect(set['parts.$[p].vendor']).toBe('FCP Euro');        // seller → vendor
    expect(set['parts.$[p].supplier']).toBe('fcp-store');     // marketplaceSeller → supplier
    expect(set['parts.$[p].brand']).toBe('ATE');              // manufacturer → brand
    expect(set['parts.$[p].partNumber']).toBe('ATE-999');     // partNumber → partNumber
    expect(set['parts.$[p].coreCharge']).toBe(12);            // coreCharge → coreCharge
    expect(set['parts.$[p].url']).toBe('https://fcpeuro.com/p/ATE-999'); // url → url
    expect(set['parts.$[p].cost']).toBe(80);                  // offer.price → cost
  });

  it('writes selectionReason to part.selectionReason and leaves part.notes UNTOUCHED', async () => {
    const offer = makeOffer();
    const part = makePart({ notes: 'Customer says pulsation under braking — check runout', offers: [offer] });
    const wo = makeWorkOrder({ parts: [part] });

    const { set } = await runSelect({ wo, part, offer, user: makeUser(), selectionReason: 'OEM-quality, fastest ETA' });

    expect(set['parts.$[p].selectionReason']).toBe('OEM-quality, fastest ETA');
    // The Phase 4 correction: selection must not overwrite or append to the human note.
    expect(Object.keys(set)).not.toContain('parts.$[p].notes');
    expect(part.notes).toBe('Customer says pulsation under braking — check runout');
  });

  it("sets sourcingStatus 'selected' and stamps selectedBy / selectedByName / selectedOfferId", async () => {
    const offer = makeOffer();
    const part = makePart({ offers: [offer] });
    const wo = makeWorkOrder({ parts: [part] });
    const user = makeUser({ name: 'Dana Writer' });

    const { set } = await runSelect({ wo, part, offer, user });

    expect(set['parts.$[p].sourcingStatus']).toBe('selected');
    expect(set['parts.$[p].selectedBy']).toBe(user._id);
    expect(set['parts.$[p].selectedByName']).toBe('Dana Writer');
    expect(set['parts.$[p].selectedOfferId']).toBe(offer._id);
  });

  it('keeps eta / inStock / condition / source on the offer (NOT written to the part)', async () => {
    const offer = makeOffer({ eta: '5 days', inStock: false, condition: 'reman', source: 'agent' });
    const part = makePart({ offers: [offer] });
    const wo = makeWorkOrder({ parts: [part] });

    const { set } = await runSelect({ wo, part, offer, user: makeUser() });

    const keys = Object.keys(set);
    expect(keys).not.toContain('parts.$[p].eta');
    expect(keys).not.toContain('parts.$[p].inStock');
    expect(keys).not.toContain('parts.$[p].condition');
    expect(keys).not.toContain('parts.$[p].source');
  });

  it('re-selection overwrites enriched fields with the new offer and does NOT change WO status', async () => {
    const offerA = makeOffer({ seller: 'RockAuto', price: 100 });
    const offerB = makeOffer({ seller: 'eBay.com', price: 50 });
    // Part already selected against offerA.
    const part = makePart({
      offers: [offerA, offerB],
      sourcingStatus: 'selected',
      selectedOfferId: offerA._id,
      cost: 100,
      price: 130,
      vendor: 'RockAuto',
    });
    const wo = makeWorkOrder({ parts: [part], status: 'Parts Sourcing - In Progress' });

    const { set } = await runSelect({ wo, part, offer: offerB, user: makeUser() });

    expect(set['parts.$[p].cost']).toBe(50);
    expect(set['parts.$[p].price']).toBe(65);            // 50 × 1.30
    expect(set['parts.$[p].vendor']).toBe('eBay.com');
    expect(set['parts.$[p].selectedOfferId']).toBe(offerB._id);
    expect(set['parts.$[p].sourcingStatus']).toBe('selected');

    // Selection never touches WO status (status is evaluated only on close/reconcile).
    expect(set.status).toBeUndefined();
    expect(wo.status).toBe('Parts Sourcing - In Progress');
    expect(wo.save).not.toHaveBeenCalled();
  });

  it('scopes the update to the target part via arrayFilters', async () => {
    const offer = makeOffer();
    const part = makePart({ offers: [offer] });
    const wo = makeWorkOrder({ parts: [part] });

    const { options } = await runSelect({ wo, part, offer, user: makeUser() });

    expect(options.arrayFilters).toEqual([{ 'p._id': part._id.toString() }]);
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
  });
});
