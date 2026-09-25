/**
 * The server side of Scan Vehicle: owner changes, mileage readings with a
 * source, and a new vehicle + minimal customer. Runs against an in-memory MongoDB.
 */
jest.mock('dotenv', () => ({ config: () => ({ parsed: {} }), parse: () => ({}) }));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Customer = require('../../models/Customer');
const Vehicle = require('../../models/Vehicle');
const vehicleController = require('../../controllers/vehicleController');
const customerController = require('../../controllers/customerController');
const checkInController = require('../../controllers/vehicleCheckInController');
const Technician = require('../../models/Technician');
const User = require('../../models/User');
const VehicleCheckIn = require('../../models/VehicleCheckIn');
const convertDates = require('../../middleware/convertDates');

jest.setTimeout(60000);

let server;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri('shop'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});

beforeEach(async () => {
  await Customer.deleteMany({});
  await Vehicle.deleteMany({});
  await VehicleCheckIn.deleteMany({});
  await Technician.deleteMany({});
  await User.deleteMany({});
});

// Bodies go through convertDates first, as they do in app.js.
const run = (handler, { body = {}, params = {}, query = {}, user = null } = {}) =>
  new Promise((resolve) => {
    const req = { body, params, query, user };
    convertDates(req, {}, () => {});
    const res = {
      status: jest.fn(() => res),
      json: jest.fn((payload) => {
        resolve({ res, payload });
        return res;
      })
    };
    handler(req, res, (error) => resolve({ res, error }));
  });

const setup = async () => {
  const seller = await Customer.create({ name: 'Old Owner', phone: '555-111-1111' });
  const buyer = await Customer.create({ name: 'New Owner', phone: '555-222-2222' });
  const vehicle = await Vehicle.create({ customer: seller._id, year: 2007, make: 'GMC', model: 'Envoy' });
  seller.vehicles.push(vehicle._id);
  await seller.save();
  return { seller, buyer, vehicle };
};

describe('updateVehicle ownership', () => {
  it('moves the vehicle between customers', async () => {
    const { seller, buyer, vehicle } = await setup();

    const { payload } = await run(vehicleController.updateVehicle, {
      params: { id: String(vehicle._id) },
      body: { customer: String(buyer._id), licensePlate: 'ABC1234' }
    });

    expect(String(payload.data.vehicle.customer._id)).toBe(String(buyer._id));
    expect((await Customer.findById(seller._id)).vehicles).toHaveLength(0);
    expect((await Customer.findById(buyer._id)).vehicles.map(String)).toEqual([String(vehicle._id)]);
  });

  it('leaves the arrays alone when the owner is unchanged', async () => {
    const { seller, vehicle } = await setup();

    await run(vehicleController.updateVehicle, {
      params: { id: String(vehicle._id) },
      body: { customer: String(seller._id), licensePlate: 'ABC1234' }
    });

    expect((await Customer.findById(seller._id)).vehicles.map(String)).toEqual([String(vehicle._id)]);
  });

  it('refuses an owner that does not exist, without changing anything', async () => {
    const { seller, vehicle } = await setup();

    const { error } = await run(vehicleController.updateVehicle, {
      params: { id: String(vehicle._id) },
      body: { customer: String(new mongoose.Types.ObjectId()) }
    });

    expect(error.statusCode).toBe(404);
    expect(String((await Vehicle.findById(vehicle._id)).customer)).toBe(String(seller._id));
  });
});

describe('mileage readings from a scan', () => {
  it('records where a reading came from', async () => {
    const { vehicle } = await setup();

    const { payload } = await run(vehicleController.addMileageRecord, {
      params: { id: String(vehicle._id) },
      body: { date: '2026-09-25', mileage: 131250, source: 'Odometer photo', notes: 'Odometer photo' }
    });

    const record = payload.data.vehicle.mileageHistory[0];
    expect(record.source).toBe('Odometer photo');
    expect(payload.data.vehicle.currentMileage).toBe(131250);
  });

  it('adds a historical inspection reading without lowering current mileage', async () => {
    const { vehicle } = await setup();
    await run(vehicleController.addMileageRecord, { params: { id: String(vehicle._id) }, body: { date: '2026-09-25', mileage: 131250 } });

    const { payload } = await run(vehicleController.addMileageRecord, {
      params: { id: String(vehicle._id) },
      body: { date: '2026-03-31', mileage: 125767, source: 'Inspection sticker' }
    });

    expect(payload.data.vehicle.mileageHistory).toHaveLength(2);
    expect(payload.data.vehicle.currentMileage).toBe(131250);
  });
});

describe('new vehicle for a new customer', () => {
  it('creates a customer from name + phone, then the scanned vehicle', async () => {
    const { payload: made } = await run(customerController.createCustomer, {
      body: { name: 'Jane Smith', phone: '555-333-4444', communicationPreference: 'Phone' }
    });
    const customer = made.data.customer;

    const { payload } = await run(vehicleController.createVehicle, {
      body: {
        customer: String(customer._id),
        vin: '1GKDT13S672104751',
        year: 2007,
        make: 'GMC',
        model: 'Envoy',
        licensePlate: 'MDF3054',
        licensePlateState: 'NY',
        registrationExpiration: '2028-03-03',
        inspectionExpiration: '2027-03-31',
        currentMileage: 131250,
        mileageHistory: [
          { date: '2026-03-31', mileage: 125767, source: 'Inspection sticker', notes: 'Estimated mileage at date of last inspection (NY sticker exp 03/2027)' },
          { date: '2026-09-25', mileage: 131250, source: 'Odometer photo', notes: 'Odometer photo' }
        ]
      }
    });

    const v = payload.data.vehicle;
    expect(v.mileageHistory.map(r => r.source)).toEqual(['Inspection sticker', 'Odometer photo']);
    expect(v.currentMileage).toBe(131250);
    expect(v.registrationExpiration).toBeInstanceOf(Date);
    expect((await Customer.findById(customer._id)).vehicles.map(String)).toEqual([String(v._id)]);
  });
});

describe('technician scan', () => {
  const techUser = { _id: new mongoose.Types.ObjectId(), name: 'Mike Tech', role: 'technician' };

  it('looks a vehicle up by VIN without its owner', async () => {
    const { vehicle } = await setup();
    await Vehicle.updateOne({ _id: vehicle._id }, { vin: '1GKDT13S672104751' });

    const { payload } = await run(checkInController.scanLookup, { query: { vin: '1GKDT13S672104751' }, user: techUser });

    expect(payload.data.exists).toBe(true);
    expect(payload.data.vehicle.make).toBe('GMC');
    expect(payload.data.vehicle.customer).toBeUndefined();
  });

  it('matches a plate stored with a dash, but only when it is the only match', async () => {
    const { vehicle, seller } = await setup();
    await Vehicle.updateOne({ _id: vehicle._id }, { licensePlate: 'MDF-3054', licensePlateState: 'NY' });

    const found = await run(checkInController.scanLookup, { query: { plate: 'MDF3054', state: 'NY' }, user: techUser });
    expect(found.payload.data.exists).toBe(true);

    await Vehicle.create({ customer: seller._id, year: 2010, make: 'BMW', model: '328i', licensePlate: 'MDF3054' });
    const ambiguous = await run(checkInController.scanLookup, { query: { plate: 'MDF3054' }, user: techUser });
    expect(ambiguous.payload.data.exists).toBe(false);
  });

  it('updates scanned facts, fills blanks, and never overwrites identity or owner', async () => {
    const { vehicle, seller, buyer } = await setup();

    const { payload } = await run(checkInController.scanUpdate, {
      params: { id: String(vehicle._id) },
      user: techUser,
      body: {
        vin: '1GKDT13S672104751',        // blank on file → filled
        make: 'Chevrolet',               // on file → kept
        customer: String(buyer._id),     // not a scan field → ignored
        licensePlate: 'MDF3054',
        licensePlateState: 'NY',
        inspectionExpiration: '2027-03-31',
        mileageRecords: [{ date: '2026-03-31', mileage: 125767, source: 'Inspection sticker', notes: 'Estimated…' }],
        reading: { mileage: 131250, fromPhoto: true }
      }
    });

    expect(payload.data.updated).toEqual(expect.arrayContaining(['vin', 'licensePlate', 'licensePlateState', 'inspectionExpiration']));
    const saved = await Vehicle.findById(vehicle._id);
    expect(saved.vin).toBe('1GKDT13S672104751');
    expect(saved.make).toBe('GMC');
    expect(String(saved.customer)).toBe(String(seller._id));
    expect(saved.inspectionExpiration).toBeInstanceOf(Date);
    expect(saved.mileageHistory.map(r => r.source)).toEqual(['Inspection sticker', 'Odometer photo']);
    expect(saved.mileageHistory[1].notes).toBe('Checked in by Mike Tech');
    expect(saved.currentMileage).toBe(131250);
  });

  it('sends an unknown vehicle to the technician’s service writer', async () => {
    const writer = await User.create({ name: 'Sam Writer', email: 'sam@shop.com', role: 'service-writer', status: 'pending' });
    const tech = await Technician.create({ name: 'Mike Tech', serviceWriter: writer._id });

    const { res, payload } = await run(checkInController.createCheckIn, {
      user: { ...techUser, technician: tech._id },
      body: {
        vin: '1GKDT13S672104751',
        mileage: 131250,
        fromPhoto: true,
        note: 'Customer said: blue Envoy, dropped keys',
        scan: {
          vin: { value: '1GKDT13S672104751', status: 'verified', candidates: [], readings: [] },
          fields: { year: 2007, make: 'GMC', model: 'Envoy', licensePlate: 'MDF3054', customer: 'x', $where: 'bad' },
          mileageRecords: [{ date: '2026-03-31', mileage: 125767, source: 'Inspection sticker' }],
          warnings: [], found: { registration: true }
        }
      }
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(payload.data.checkIn.assignedToName).toBe('Sam Writer');
    const stored = await VehicleCheckIn.findById(payload.data.checkIn._id);
    expect(stored.vehicleSummary).toBe('2007 GMC Envoy');
    expect(String(stored.assignedTo)).toBe(String(writer._id));
    expect(Object.keys(stored.scan.fields)).toEqual(['year', 'make', 'model', 'licensePlate']);
  });

  it('refuses a check-in for a VIN that is already on file', async () => {
    const { vehicle } = await setup();
    await Vehicle.updateOne({ _id: vehicle._id }, { vin: '1GKDT13S672104751' });

    const { res, payload } = await run(checkInController.createCheckIn, {
      user: techUser,
      body: { vin: '1GKDT13S672104751', scan: {} }
    });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(String(payload.data.vehicle._id)).toBe(String(vehicle._id));
  });

  it('resolves a check-in only once, and only with a real vehicle', async () => {
    const { vehicle } = await setup();
    const office = { _id: new mongoose.Types.ObjectId(), name: 'Sam Writer' };
    const checkIn = await VehicleCheckIn.create({ scan: {}, submittedBy: techUser._id });

    const missing = await run(checkInController.resolveCheckIn, { params: { id: String(checkIn._id) }, user: office, body: { status: 'resolved' } });
    expect(missing.error.statusCode).toBe(400);

    const ok = await run(checkInController.resolveCheckIn, { params: { id: String(checkIn._id) }, user: office, body: { status: 'resolved', vehicle: String(vehicle._id) } });
    expect(ok.payload.data.checkIn.status).toBe('resolved');

    const again = await run(checkInController.resolveCheckIn, { params: { id: String(checkIn._id) }, user: office, body: { status: 'dismissed' } });
    expect(again.error.statusCode).toBe(409);
  });
});
