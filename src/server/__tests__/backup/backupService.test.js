/**
 * Backups and restores through the real API: in-memory MongoDB, and S3 faked
 * behind a real S3Client (so presigned URLs are real) whose send() is stubbed.
 */

// app.js loads the repo's .env with override:true — that is a live shop's
// credentials. Never let it in here.
jest.mock('dotenv', () => ({ config: () => ({ parsed: {} }), parse: () => ({}) }));
// uuid 14 ships ESM only, which this CommonJS Jest setup can't load.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

Object.assign(process.env, {
  // The global error handler only responds in development or production.
  NODE_ENV: 'development',
  JWT_SECRET: 'test-secret',
  JWT_EXPIRES_IN: '1d',
  JWT_COOKIE_EXPIRES_IN: '1',
  CLIENT_URL: 'http://localhost',
  AWS_REGION: 'us-east-1',
  S3_BUCKET_NAME: 'tenant-bucket',
  AWS_ACCESS_KEY_ID: 'AKIAFAKE',
  AWS_SECRET_ACCESS_KEY: 'fake'
});

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(60000);

// ── Fake bucket: versioning on, Object Lock on ────────────────────────────────
const objects = new Map();
const puts = [];
let denyRetention = false;
const fakeSend = async (cmd) => {
  const name = cmd.constructor.name;
  const input = cmd.input;
  if (name === 'GetBucketVersioningCommand') return { Status: 'Enabled' };
  if (name === 'GetObjectLockConfigurationCommand') return { ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled' } };
  if (name === 'PutObjectCommand') {
    if (input.ObjectLockMode && denyRetention) {
      const err = new Error('Access Denied');
      err.name = 'AccessDenied';
      throw err;
    }
    puts.push(input);
    objects.set(input.Key, { body: Buffer.from(input.Body), deleted: false });
    return {};
  }
  if (name === 'GetObjectCommand') {
    const obj = objects.get(input.Key);
    if (!obj || obj.deleted) {
      const err = new Error('NoSuchKey');
      err.name = 'NoSuchKey';
      throw err;
    }
    return { Body: Readable.from(obj.body) };
  }
  if (name === 'DeleteObjectCommand') {
    const obj = objects.get(input.Key);
    if (obj) obj.deleted = true; // a delete marker — the locked version survives
    return {};
  }
  throw new Error(`Unexpected S3 command ${name}`);
};

let server;
let app;
let db;
let admin;
let tech;
let BackupLog;

const loginAgent = async (email, password) => {
  const agent = request.agent(app);
  await agent.post('/api/users/login').send({ email, password }).expect(200);
  return agent;
};

const waitForJob = async () => {
  for (let i = 0; i < 200; i++) {
    const res = await admin.get('/api/backups/job');
    const { job } = res.body.data;
    if (job && job.finishedAt) return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('job did not finish');
};

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri('shop'));
  db = mongoose.connection.db;

  const s3Service = require('../../services/s3Service');
  s3Service.client.send = fakeSend;
  app = require('../../app');
  BackupLog = require('../../models/BackupLog');
  const User = require('../../models/User');

  await User.create({ name: 'Owner', email: 'owner@shop.com', role: 'admin', password: 'OwnerPass1', passwordConfirm: 'OwnerPass1' });
  await User.create({ name: 'Tech', email: 'tech@shop.com', role: 'technician', password: 'TechPass11', passwordConfirm: 'TechPass11' });
  await db.collection('customers').insertOne({ firstName: 'Ann', lastName: 'Original', createdAt: new Date('2026-01-01') });

  admin = await loginAgent('owner@shop.com', 'OwnerPass1');
  tech = await loginAgent('tech@shop.com', 'TechPass11');
});

afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});

describe('backups API', () => {
  let manual;

  it('is admin-only', async () => {
    await tech.get('/api/backups').expect(403);
    await tech.post('/api/backups').expect(403);
  });

  it('reports the bucket status', async () => {
    const res = await admin.get('/api/backups').expect(200);
    expect(res.body.data.storage).toEqual({ configured: true, versioning: 'on', objectLock: 'on' });
  });

  it('backs up now, locked for 30 days', async () => {
    await admin.post('/api/backups').expect(202);
    const job = await waitForJob();
    expect(job.error).toBeNull();

    manual = await BackupLog.findOne({ kind: 'manual' }).lean();
    expect(manual.s3Key).toMatch(/^backups\/manual\/cvrepair-shop-.*\.cvbackup$/);
    expect(manual.counts.customers).toBe(1);
    const put = puts.find((p) => p.Key === manual.s3Key);
    expect(put.ObjectLockMode).toBe('GOVERNANCE');
    const lockDays = (new Date(put.ObjectLockRetainUntilDate) - Date.now()) / 864e5;
    expect(lockDays).toBeGreaterThan(29.9);
  });

  it('gives a short-lived download link', async () => {
    const res = await admin.get(`/api/backups/${manual._id}/download`).expect(200);
    expect(res.body.data.url).toMatch(/^https:\/\/tenant-bucket\.s3\.us-east-1\.amazonaws\.com\/backups\/manual\/.*X-Amz-Expires=300/);
  });

  it('will not restore without typed confirmation, or for a non-admin', async () => {
    await admin.post(`/api/backups/${manual._id}/restore`).send({}).expect(400);
    await tech.post(`/api/backups/${manual._id}/restore`).send({ confirm: 'RESTORE' }).expect(403);
  });

  it('restores: safety backup first, writes paused meanwhile, undo available', async () => {
    await db.collection('customers').updateOne({}, { $set: { lastName: 'CHANGED' } });
    await db.collection('customers').insertOne({ firstName: 'New', lastName: 'Later' });

    await admin.post(`/api/backups/${manual._id}/restore`).send({ confirm: 'RESTORE' }).expect(202);
    const during = await admin.post('/api/customers').send({ firstName: 'X', lastName: 'Y', phone: '1' });
    expect(during.status).toBe(503);
    await admin.get('/api/backups').expect(200);

    const job = await waitForJob();
    expect(job.error).toBeNull();

    const customers = await db.collection('customers').find().toArray();
    expect(customers.map((c) => c.lastName)).toEqual(['Original']);
    expect(customers[0].createdAt).toBeInstanceOf(Date);

    const safety = await BackupLog.findById(job.result.safetyBackupId).lean();
    expect(safety.kind).toBe('pre-restore');
    const restoreLog = await BackupLog.findOne({ kind: 'restore' }).lean();
    expect(restoreLog).toMatchObject({ status: 'success', userName: 'Owner' });
    expect(String(restoreLog.safetyBackup)).toBe(String(safety._id));

    // Undo
    await admin.post(`/api/backups/${safety._id}/restore`).send({ confirm: 'RESTORE' }).expect(202);
    expect((await waitForJob()).error).toBeNull();
    const undone = (await db.collection('customers').find().toArray()).map((c) => c.lastName).sort();
    expect(undone).toEqual(['CHANGED', 'Later']);
  });

  it('refuses another shop\'s file before spending a safety backup on it', async () => {
    const { writeBackup } = require('../../utils/backupFormat');
    const other = mongoose.connection.client.db('othershop');
    await other.collection('customers').insertOne({ firstName: 'Z' });
    const file = path.join(os.tmpdir(), `other-${Date.now()}.cvbackup`);
    await writeBackup(other, fs.createWriteStream(file));
    const safetiesBefore = await BackupLog.countDocuments({ kind: 'pre-restore' });

    await admin.post('/api/backups/restore-upload').field('confirm', 'RESTORE').attach('file', file).expect(202);
    const job = await waitForJob();
    expect(job.error).toMatch(/different database/);
    expect(await BackupLog.countDocuments({ kind: 'pre-restore' })).toBe(safetiesBefore);
    fs.rmSync(file, { force: true });
  });

  it('downloads a copy that restores by upload', async () => {
    const res = await admin.get('/api/backups/download')
      .buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); })
      .expect(200);
    expect(res.headers['content-disposition']).toMatch(/cvrepair-shop-/);
    const file = path.join(os.tmpdir(), `copy-${Date.now()}.cvbackup`);
    fs.writeFileSync(file, res.body);
    const before = await db.collection('customers').countDocuments();
    await db.collection('customers').deleteMany({});

    await admin.post('/api/backups/restore-upload').field('confirm', 'RESTORE').attach('file', file).expect(202);
    expect((await waitForJob()).error).toBeNull();
    expect(await db.collection('customers').countDocuments()).toBe(before);
    fs.rmSync(file, { force: true });
  });

  it('retires backups past retention with a delete marker', async () => {
    await BackupLog.updateOne({ _id: manual._id }, { $set: { startedAt: new Date(Date.now() - 40 * 864e5) } });
    await admin.post('/api/backups').expect(202);
    await waitForJob();

    expect((await BackupLog.findById(manual._id).lean()).pruned).toBe(true);
    expect(objects.get(manual.s3Key).deleted).toBe(true);
    const listed = (await admin.get('/api/backups')).body.data.backups;
    expect(listed.some((b) => String(b._id) === String(manual._id))).toBe(false);
  });

  it('still backs up, unlocked, when the IAM policy refuses the lock — and says so', async () => {
    denyRetention = true;
    await admin.post('/api/backups').expect(202);
    expect((await waitForJob()).error).toBeNull();
    const latest = await BackupLog.findOne({ kind: 'manual' }).sort({ startedAt: -1 }).lean();
    expect(latest.lockedUntil).toBeFalsy();
    expect((await admin.get('/api/backups')).body.data.storage.objectLock).toBe('no-permission');
    denyRetention = false;
  });
});
