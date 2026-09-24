/**
 * The backup file format and restore engine, against a real (in-memory)
 * MongoDB — the behaviour that decides whether a shop gets its data back.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { mongo } = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { writeBackup, inspectBackup, restoreBackup } = require('../../utils/backupFormat');

const { MongoClient, ObjectId } = mongo;

jest.setTimeout(60000);

let server;
let client;
let db;
let dir;

const backupTo = async (name, database = db) => {
  const file = path.join(dir, name);
  const result = await writeBackup(database, fs.createWriteStream(file), { reason: 'test' });
  return { file, ...result };
};

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  client = new MongoClient(server.getUri());
  await client.connect();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvbackup-test-'));
});

afterAll(async () => {
  await client.close();
  await server.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  db = client.db(`shop${Date.now()}`);
});

describe('writeBackup / inspectBackup', () => {
  it('backs up every collection except the backup log, and verifies on read', async () => {
    await db.collection('customers').insertMany([{ n: 1 }, { n: 2 }]);
    await db.collection('workorders').insertOne({ n: 3 });
    await db.collection('backuplogs').insertOne({ kind: 'manual' });

    const { file, counts, total } = await backupTo('a.cvbackup');
    expect(counts).toEqual({ customers: 2, workorders: 1 });
    expect(total).toBe(3);

    const inspected = await inspectBackup(file);
    expect(inspected.total).toBe(3);
    expect(inspected.header.database).toBe(db.databaseName);
    expect(inspected.header.reason).toBe('test');
  });

  it('rejects a file cut short', async () => {
    await db.collection('customers').insertMany(Array.from({ length: 200 }, (_, i) => ({ i, pad: 'x'.repeat(200) })));
    const { file } = await backupTo('full.cvbackup');
    const cut = path.join(dir, 'cut.cvbackup');
    const bytes = fs.readFileSync(file);
    fs.writeFileSync(cut, bytes.subarray(0, Math.floor(bytes.length * 0.6)));
    await expect(inspectBackup(cut)).rejects.toThrow(/damaged or incomplete/);
  });

  it('rejects a file whose records do not match its count', async () => {
    const lines = [
      '{"type":"header","format":"cv-repair-backup","version":1,"database":"x"}',
      '{"type":"doc","c":"customers","d":{"n":1}}',
      '{"type":"footer","counts":{"customers":2},"total":2}'
    ].join('\n');
    const file = path.join(dir, 'short.cvbackup');
    fs.writeFileSync(file, zlib.gzipSync(lines));
    await expect(inspectBackup(file)).rejects.toThrow(/does not add up/);
  });

  it('rejects something that is not a backup', async () => {
    const file = path.join(dir, 'junk.cvbackup');
    fs.writeFileSync(file, zlib.gzipSync('{"hello":1}\n'));
    await expect(inspectBackup(file)).rejects.toThrow(/not a CV Repair backup/);
  });
});

describe('restoreBackup', () => {
  it('puts the data back with ObjectIds, Dates and references intact', async () => {
    const customerId = new ObjectId();
    const created = new Date('2026-01-02T03:04:05Z');
    await db.collection('customers').insertOne({ _id: customerId, name: 'Ann', createdAt: created });
    await db.collection('workorders').insertOne({ customer: customerId });
    const { file } = await backupTo('b.cvbackup');

    await db.collection('customers').updateOne({ _id: customerId }, { $set: { name: 'WRONG' } });
    await db.collection('customers').insertOne({ name: 'added after' });

    await restoreBackup(db, file);

    const customers = await db.collection('customers').find().toArray();
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe('Ann');
    expect(customers[0]._id).toBeInstanceOf(ObjectId);
    expect(customers[0].createdAt).toBeInstanceOf(Date);
    expect(customers[0].createdAt.getTime()).toBe(created.getTime());
    expect(await db.collection('workorders').findOne({ customer: customerId })).not.toBeNull();
  });

  it('keeps indexes, including unique ones', async () => {
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('customers').createIndex({ name: 1 }, { name: 'name_1' });
    await db.collection('users').insertOne({ email: 'a@x.com' });
    await db.collection('customers').insertOne({ name: 'Ann' });
    const { file } = await backupTo('c.cvbackup');

    await restoreBackup(db, file);

    const customerIndexes = (await db.collection('customers').indexes()).map((i) => i.name);
    expect(customerIndexes).toContain('name_1');
    const emailIndex = (await db.collection('users').indexes()).find((i) => i.name === 'email_1');
    expect(emailIndex.unique).toBe(true);
  });

  it('empties collections that did not exist when the backup was taken', async () => {
    await db.collection('customers').insertOne({ name: 'Ann' });
    const { file } = await backupTo('d.cvbackup');
    await db.collection('newfeature').insertOne({ x: 1 });

    await restoreBackup(db, file);
    expect(await db.collection('newfeature').countDocuments()).toBe(0);
  });

  it('never touches the backup log', async () => {
    await db.collection('backuplogs').insertOne({ kind: 'manual', note: 'before' });
    await db.collection('customers').insertOne({ name: 'Ann' });
    const { file } = await backupTo('e.cvbackup');
    await db.collection('backuplogs').insertOne({ kind: 'pre-restore', note: 'after' });

    await restoreBackup(db, file);
    expect(await db.collection('backuplogs').countDocuments()).toBe(2);
  });

  it('keeps the admin running the restore, even if they are newer than the backup', async () => {
    await db.collection('users').insertOne({ email: 'old@x.com', role: 'admin' });
    const { file } = await backupTo('f.cvbackup');
    const lateAdmin = new ObjectId();
    await db.collection('users').insertOne({ _id: lateAdmin, email: 'late@x.com', role: 'admin' });

    await restoreBackup(db, file, { preserveUserId: lateAdmin });
    expect(await db.collection('users').findOne({ _id: lateAdmin })).not.toBeNull();
    expect(await db.collection('users').countDocuments()).toBe(2);
  });

  it('refuses another database\'s backup unless told otherwise', async () => {
    const other = client.db(`other${Date.now()}`);
    await other.collection('customers').insertOne({ name: 'Somebody else' });
    const { file } = await backupTo('other.cvbackup', other);
    await db.collection('customers').insertOne({ name: 'Ours' });

    await expect(restoreBackup(db, file)).rejects.toThrow(/different database/);
    expect((await db.collection('customers').findOne()).name).toBe('Ours');

    await restoreBackup(db, file, { allowOtherDatabase: true });
    expect((await db.collection('customers').findOne()).name).toBe('Somebody else');
  });

  it('checks records against live validators before swapping anything in', async () => {
    // Backed up before a validator existed, so it holds a record the rule now forbids.
    await db.collection('customers').insertOne({ name: 'Ann' });
    await db.collection('shopsupplies').insertMany([{ primaryTag: 'a', tags: ['a'] }, { primaryTag: 'b', tags: [] }]);
    const { file } = await backupTo('v.cvbackup');

    await db.collection('shopsupplies').deleteMany({ primaryTag: 'b' });
    await db.command({
      collMod: 'shopsupplies',
      validator: { $expr: { $in: ['$primaryTag', { $ifNull: ['$tags', []] }] } },
      validationLevel: 'moderate'
    });
    await db.collection('customers').updateOne({}, { $set: { name: 'Live' } });

    await expect(restoreBackup(db, file)).rejects.toThrow(/1 record\(s\) in "shopsupplies"/);
    // Nothing was swapped — not even the collections that would have passed.
    expect((await db.collection('customers').findOne()).name).toBe('Live');
    expect(await db.collection('shopsupplies').countDocuments()).toBe(1);
  });

  it('leaves the live data and no scratch collections behind when the file is bad', async () => {
    await db.collection('customers').insertMany(Array.from({ length: 200 }, (_, i) => ({ i, pad: 'x'.repeat(200) })));
    const { file } = await backupTo('g.cvbackup');
    const cut = path.join(dir, 'g-cut.cvbackup');
    const bytes = fs.readFileSync(file);
    fs.writeFileSync(cut, bytes.subarray(0, Math.floor(bytes.length * 0.6)));
    await db.collection('customers').insertOne({ i: 'live' });

    await expect(restoreBackup(db, cut)).rejects.toThrow();
    expect(await db.collection('customers').countDocuments()).toBe(201);
    const scratch = await db.listCollections({ name: { $regex: '^__restore_' } }).toArray();
    expect(scratch).toHaveLength(0);
  });
});
