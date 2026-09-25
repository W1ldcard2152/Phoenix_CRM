/**
 * GET /api/vehicles/vinless-matches — the merge candidates Scan Vehicle offers
 * when a scanned VIN isn't on file.
 *
 * The rule this pins: a vehicle already carrying a VIN is a settled identity and
 * is never a candidate, so a customer who owns two of the same year/make/model
 * with VINs on both never sees a merge prompt. Only the VIN-less row — the one
 * added before anyone had the VIN — is offered.
 */
jest.mock('dotenv', () => ({ config: () => ({ parsed: {} }), parse: () => ({}) }));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Customer = require('../../models/Customer');
const Vehicle = require('../../models/Vehicle');
const vehicleController = require('../../controllers/vehicleController');

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
});

const run = (handler, query = {}) =>
  new Promise((resolve) => {
    const req = { query, body: {}, params: {} };
    const res = {
      status: jest.fn(() => res),
      json: jest.fn((payload) => {
        resolve({ res, payload });
        return res;
      })
    };
    handler(req, res, (error) => resolve({ res, error }));
  });

const matches = async (query) => {
  const { payload, error } = await run(vehicleController.findVinlessMatches, query);
  if (error) throw error;
  return payload.data.vehicles;
};

const Q3 = { year: 2023, make: 'Audi', model: 'Q3' };

let customer;
beforeEach(async () => {
  customer = await Customer.create({ name: 'Dana Reyes', phone: '555-000-1111' });
});

describe('findVinlessMatches', () => {
  it('offers a VIN-less vehicle of the same year/make/model', async () => {
    const vehicle = await Vehicle.create({ customer: customer._id, ...Q3 });

    const found = await matches(Q3);

    expect(found).toHaveLength(1);
    expect(String(found[0]._id)).toBe(String(vehicle._id));
    expect(found[0].customer.name).toBe('Dana Reyes');
  });

  it('carries what tells identical candidates apart', async () => {
    // Several placeholder Q3s look the same; the owner, their phone, the plate,
    // the mileage and when it was added are all the prompt has to choose by.
    await Vehicle.create({
      customer: customer._id,
      ...Q3,
      licensePlate: 'ABC1234',
      licensePlateState: 'NY',
      currentMileage: 12000
    });

    const [found] = await matches(Q3);

    expect(found.customer.name).toBe('Dana Reyes');
    expect(found.customer.phone).toBe('555-000-1111');
    expect(found.licensePlate).toBe('ABC1234');
    expect(found.licensePlateState).toBe('NY');
    expect(found.currentMileage).toBe(12000);
    expect(found.createdAt).toBeInstanceOf(Date);
  });

  it('offers every matching customer, not just one', async () => {
    // Three technicians' placeholder Q3s: the prompt must show all three.
    const sue = await Customer.create({ name: 'Sue Martin', phone: '555-000-3333' });
    const steve = await Customer.create({ name: 'Steve Bell', phone: '555-000-4444' });
    await Vehicle.create({ customer: customer._id, ...Q3 });
    await Vehicle.create({ customer: sue._id, ...Q3 });
    await Vehicle.create({ customer: steve._id, ...Q3 });

    const found = await matches(Q3);

    expect(found).toHaveLength(3);
    expect(found.map(v => v.customer.name).sort())
      .toEqual(['Dana Reyes', 'Steve Bell', 'Sue Martin']);
  });

  it('never offers a vehicle that already has a VIN', async () => {
    await Vehicle.create({ customer: customer._id, ...Q3, vin: 'WA1BSAFY5P2012345' });

    expect(await matches(Q3)).toHaveLength(0);
  });

  it('leaves two identical vehicles alone when both carry a VIN', async () => {
    // The case the user must never see merged: a genuine two-of-the-same garage.
    await Vehicle.create({ customer: customer._id, ...Q3, vin: 'WA1BSAFY5P2012345' });
    await Vehicle.create({ customer: customer._id, ...Q3, vin: 'WA1BSAFY5P2099999' });

    expect(await matches(Q3)).toHaveLength(0);
  });

  it('offers only the VIN-less one when a customer has both', async () => {
    await Vehicle.create({ customer: customer._id, ...Q3, vin: 'WA1BSAFY5P2012345' });
    const blank = await Vehicle.create({ customer: customer._id, ...Q3 });

    const found = await matches(Q3);

    expect(found).toHaveLength(1);
    expect(String(found[0]._id)).toBe(String(blank._id));
  });

  it("treats 'N/A' and empty string as no VIN", async () => {
    await Vehicle.create({ customer: customer._id, ...Q3, vin: 'N/A' });
    await Vehicle.create({ customer: customer._id, ...Q3, vin: '' });

    expect(await matches(Q3)).toHaveLength(2);
  });

  it('matches make and model case-insensitively', async () => {
    // NHTSA returns "AUDI"; a person types "Audi".
    await Vehicle.create({ customer: customer._id, ...Q3 });

    expect(await matches({ year: 2023, make: 'AUDI', model: 'q3' })).toHaveLength(1);
  });

  it('does not match a different year, make or model', async () => {
    await Vehicle.create({ customer: customer._id, ...Q3 });

    expect(await matches({ year: 2022, make: 'Audi', model: 'Q3' })).toHaveLength(0);
    expect(await matches({ year: 2023, make: 'BMW', model: 'Q3' })).toHaveLength(0);
    expect(await matches({ year: 2023, make: 'Audi', model: 'Q5' })).toHaveLength(0);
  });

  it('does not match a model that merely starts the same', async () => {
    // Anchored regex: "Q3" must not pull in "Q3 Sportback".
    await Vehicle.create({ customer: customer._id, year: 2023, make: 'Audi', model: 'Q3 Sportback' });

    expect(await matches(Q3)).toHaveLength(0);
  });

  it('returns nothing when year, make or model is missing', async () => {
    await Vehicle.create({ customer: customer._id, ...Q3 });

    expect(await matches({ make: 'Audi', model: 'Q3' })).toHaveLength(0);
    expect(await matches({ year: 2023, model: 'Q3' })).toHaveLength(0);
    expect(await matches({ year: 2023, make: 'Audi' })).toHaveLength(0);
    expect(await matches({})).toHaveLength(0);
  });

  it('treats regex characters in the make as literal text', async () => {
    await Vehicle.create({ customer: customer._id, ...Q3 });

    expect(await matches({ year: 2023, make: 'A.di', model: 'Q3' })).toHaveLength(0);
    expect(await matches({ year: 2023, make: '.*', model: '.*' })).toHaveLength(0);
  });

  it('finds a candidate in another customer\'s garage', async () => {
    // The scan resolves the vehicle before it knows the owner, so the search
    // can't be scoped to one customer.
    const other = await Customer.create({ name: 'Sam Okafor', phone: '555-000-2222' });
    await Vehicle.create({ customer: other._id, ...Q3 });

    const found = await matches(Q3);

    expect(found).toHaveLength(1);
    expect(found[0].customer.name).toBe('Sam Okafor');
  });
});
