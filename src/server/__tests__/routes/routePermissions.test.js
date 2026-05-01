/**
 * Integration tests for route-level access control.
 *
 * Uses Supertest against the real Express app with mocked auth.
 * We bypass JWT verification and directly inject mock users via a
 * test middleware, then verify that each route returns 200/201/etc.
 * for allowed roles and 403 for forbidden roles.
 *
 * NOTE: We mock Mongoose models so no real DB is needed.
 */

const request = require('supertest');
const mongoose = require('mongoose');

// ---- Mock all Mongoose models before requiring app ----
// This prevents real DB connections and lets us control query results

const mockObjectId = () => new mongoose.Types.ObjectId();

// Generic mock model factory
const createMockModel = (name) => {
  const Model = jest.fn();
  Model.find = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
    then: jest.fn(cb => cb([])),
  });
  Model.findById = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null),
  });
  Model.findOne = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null),
  });
  Model.create = jest.fn().mockResolvedValue({ _id: mockObjectId() });
  Model.findByIdAndUpdate = jest.fn().mockResolvedValue({ _id: mockObjectId() });
  Model.findByIdAndDelete = jest.fn().mockResolvedValue({ _id: mockObjectId() });
  Model.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
  Model.countDocuments = jest.fn().mockResolvedValue(0);
  Model.aggregate = jest.fn().mockResolvedValue([]);
  Model.prototype.save = jest.fn().mockResolvedValue({ _id: mockObjectId() });
  return Model;
};

// Mock all models
jest.mock('../../models/Customer', () => createMockModel('Customer'));
jest.mock('../../models/Vehicle', () => createMockModel('Vehicle'));
jest.mock('../../models/WorkOrder', () => createMockModel('WorkOrder'));
jest.mock('../../models/Appointment', () => createMockModel('Appointment'));
jest.mock('../../models/Invoice', () => createMockModel('Invoice'));
jest.mock('../../models/Media', () => createMockModel('Media'));
jest.mock('../../models/Feedback', () => createMockModel('Feedback'));
jest.mock('../../models/Technician', () => createMockModel('Technician'));
jest.mock('../../models/User', () => {
  const Model = createMockModel('User');
  Model.findById = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null),
  });
  return Model;
});
jest.mock('../../models/WorkOrderNote', () => createMockModel('WorkOrderNote'));
jest.mock('../../models/CustomerInteraction', () => createMockModel('CustomerInteraction'));

// Mock external services
jest.mock('../../services/emailService', () => ({
  sendWelcomeEmail: jest.fn(),
  sendPasswordReset: jest.fn(),
}));
jest.mock('../../services/s3Service', () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url'),
}));
jest.mock('../../services/aiService', () => ({
  parseReceipt: jest.fn(),
  testConnection: jest.fn(),
}));
jest.mock('../../services/twilioService', () => ({
  sendSMS: jest.fn(),
}));
jest.mock('../../config/passport', () => ({
  initialize: jest.fn().mockReturnValue((req, res, next) => next()),
}));

// Mock mongoose connection
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue(true),
    connection: { readyState: 1, on: jest.fn(), once: jest.fn() },
  };
});

// Mock the auth controller's protect middleware to inject our test user
const authController = require('../../controllers/authController');

// We'll replace protect with a middleware that uses a test user
let currentTestUser = null;

const originalProtect = authController.protect;
authController.protect = (req, res, next) => {
  if (currentTestUser) {
    req.user = currentTestUser;
    res.locals = { user: currentTestUser };
    return next();
  }
  // If no test user set, return 401
  return res.status(401).json({ message: 'Not authenticated' });
};

// Now require the app (after all mocks are in place)
const app = require('../../app');

// ---- Test users ----
const makeUser = (role, extras = {}) => ({
  _id: mockObjectId(),
  id: mockObjectId().toString(),
  role,
  name: `Test ${role}`,
  email: `${role}@test.com`,
  status: 'active',
  technician: null,
  changedPasswordAfter: () => false,
  ...extras,
});

const users = {
  admin: makeUser('admin'),
  management: makeUser('management'),
  serviceWriter: makeUser('service-writer'),
  technician: makeUser('technician'),
};

// Helper: set the current test user for the next request
const asRole = (role) => {
  currentTestUser = users[role] || makeUser(role);
};

const asNoAuth = () => {
  currentTestUser = null;
};

// =========================================================================
//  Route access tests
// =========================================================================
describe('Route access control', () => {
  afterEach(() => {
    currentTestUser = null;
    jest.clearAllMocks();
  });

  // ---- Helper to test a route returns 403 for a given role ----
  const expectForbidden = async (method, path, role) => {
    asRole(role);
    const res = await request(app)[method](path)
      .send({}) // send empty body for POST/PATCH
      .set('Accept', 'application/json');
    expect(res.status).toBe(403);
  };

  // ---- Helper to test a route does NOT return 403 for a given role ----
  // (it may return 404, 400, 500 etc. — that's fine, we just care it's not 403)
  const expectNotForbidden = async (method, path, role) => {
    asRole(role);
    const res = await request(app)[method](path)
      .send({})
      .set('Accept', 'application/json');
    expect(res.status).not.toBe(403);
  };

  // ==================================================================
  //  Customers — blanket office staff, DELETE admin+management
  // ==================================================================
  describe('Customer routes (/api/customers)', () => {
    it('allows admin to GET /api/customers', () => expectNotForbidden('get', '/api/customers', 'admin'));
    it('allows management to GET /api/customers', () => expectNotForbidden('get', '/api/customers', 'management'));
    it('allows service-writer to GET /api/customers', () => expectNotForbidden('get', '/api/customers', 'serviceWriter'));
    it('rejects technician from GET /api/customers', () => expectForbidden('get', '/api/customers', 'technician'));
  });

  // ==================================================================
  //  Vehicles — mileage open, rest office staff, DELETE admin+management
  // ==================================================================
  describe('Vehicle routes (/api/vehicles)', () => {
    const vehicleId = mockObjectId().toString();

    it('allows technician to POST mileage', () =>
      expectNotForbidden('post', `/api/vehicles/${vehicleId}/mileage`, 'technician'));

    it('rejects technician from GET /api/vehicles', () =>
      expectForbidden('get', '/api/vehicles', 'technician'));

    it('allows service-writer to GET /api/vehicles', () =>
      expectNotForbidden('get', '/api/vehicles', 'serviceWriter'));
  });

  // ==================================================================
  //  Work Orders — mixed per-route restrictions
  // ==================================================================
  describe('Work Order routes (/api/workorders)', () => {
    const woId = mockObjectId().toString();

    // Open to all authenticated
    it('allows technician to GET /api/workorders (list)', () =>
      expectNotForbidden('get', '/api/workorders', 'technician'));

    it('allows technician to GET /api/workorders/search', () =>
      expectNotForbidden('get', '/api/workorders/search?q=test', 'technician'));

    it('allows technician to GET /api/workorders/technician-portal', () =>
      expectNotForbidden('get', '/api/workorders/technician-portal', 'technician'));

    // Office staff only
    it('rejects technician from POST /api/workorders (create)', () =>
      expectForbidden('post', '/api/workorders', 'technician'));

    it('allows service-writer to POST /api/workorders (create)', () =>
      expectNotForbidden('post', '/api/workorders', 'serviceWriter'));

    it('rejects technician from GET /api/workorders/quotes', () =>
      expectForbidden('get', '/api/workorders/quotes', 'technician'));

    it('allows admin to GET /api/workorders/quotes', () =>
      expectNotForbidden('get', '/api/workorders/quotes', 'admin'));

    it('rejects technician from POST parts', () =>
      expectForbidden('post', `/api/workorders/${woId}/parts`, 'technician'));

    it('allows service-writer to POST parts', () =>
      expectNotForbidden('post', `/api/workorders/${woId}/parts`, 'serviceWriter'));

    it('rejects technician from GET /api/workorders/awaiting-scheduling', () =>
      expectForbidden('get', '/api/workorders/awaiting-scheduling', 'technician'));

    it('rejects technician from GET /api/workorders/service-writers-corner', () =>
      expectForbidden('get', '/api/workorders/service-writers-corner', 'technician'));

    // DELETE — admin+management only
    it('rejects service-writer from DELETE work order', () =>
      expectForbidden('delete', `/api/workorders/${woId}`, 'serviceWriter'));

    it('allows admin to DELETE work order', () =>
      expectNotForbidden('delete', `/api/workorders/${woId}`, 'admin'));

    it('allows management to DELETE work order', () =>
      expectNotForbidden('delete', `/api/workorders/${woId}`, 'management'));
  });

  // ==================================================================
  //  Appointments — blanket office staff
  // ==================================================================
  describe('Appointment routes (/api/appointments)', () => {
    it('rejects technician from GET /api/appointments', () =>
      expectForbidden('get', '/api/appointments', 'technician'));

    it('allows service-writer to GET /api/appointments', () =>
      expectNotForbidden('get', '/api/appointments', 'serviceWriter'));
  });

  // ==================================================================
  //  Invoices — blanket office staff, DELETE admin+management
  // ==================================================================
  describe('Invoice routes (/api/invoices)', () => {
    const invoiceId = mockObjectId().toString();

    it('rejects technician from GET /api/invoices', () =>
      expectForbidden('get', '/api/invoices', 'technician'));

    it('allows service-writer to GET /api/invoices', () =>
      expectNotForbidden('get', '/api/invoices', 'serviceWriter'));
  });

  // ==================================================================
  //  Feedback — POST open, everything else admin only
  // ==================================================================
  describe('Feedback routes (/api/feedback)', () => {
    it('allows technician to POST /api/feedback (create)', () =>
      expectNotForbidden('post', '/api/feedback', 'technician'));

    it('allows service-writer to POST /api/feedback (create)', () =>
      expectNotForbidden('post', '/api/feedback', 'serviceWriter'));

    it('rejects technician from GET /api/feedback (list)', () =>
      expectForbidden('get', '/api/feedback', 'technician'));

    it('rejects service-writer from GET /api/feedback (list)', () =>
      expectForbidden('get', '/api/feedback', 'serviceWriter'));

    it('rejects management from GET /api/feedback (list)', () =>
      expectForbidden('get', '/api/feedback', 'management'));

    it('allows admin to GET /api/feedback (list)', () =>
      expectNotForbidden('get', '/api/feedback', 'admin'));
  });

  // ==================================================================
  //  Technicians — view open, write admin+management, delete admin
  // ==================================================================
  describe('Technician routes (/api/technicians)', () => {
    const techId = mockObjectId().toString();

    it('allows technician to GET /api/technicians (list)', () =>
      expectNotForbidden('get', '/api/technicians', 'technician'));

    it('rejects technician from POST /api/technicians', () =>
      expectForbidden('post', '/api/technicians', 'technician'));

    it('rejects service-writer from POST /api/technicians', () =>
      expectForbidden('post', '/api/technicians', 'serviceWriter'));

    it('allows management to POST /api/technicians', () =>
      expectNotForbidden('post', '/api/technicians', 'management'));

    it('rejects management from DELETE /api/technicians/:id', () =>
      expectForbidden('delete', `/api/technicians/${techId}`, 'management'));

    it('allows admin to DELETE /api/technicians/:id', () =>
      expectNotForbidden('delete', `/api/technicians/${techId}`, 'admin'));
  });

  // ==================================================================
  //  Customer Interactions — blanket office staff
  // ==================================================================
  describe('Customer Interaction routes (/api/interactions)', () => {
    it('rejects technician from GET /api/interactions', () =>
      expectForbidden('get', '/api/interactions', 'technician'));

    it('allows service-writer to GET /api/interactions', () =>
      expectNotForbidden('get', '/api/interactions', 'serviceWriter'));
  });

  // ==================================================================
  //  Unauthenticated requests
  // ==================================================================
  describe('Unauthenticated requests', () => {
    it('returns 401 for unauthenticated request to protected route', async () => {
      asNoAuth();
      const res = await request(app).get('/api/customers');
      expect(res.status).toBe(401);
    });
  });
});
