/**
 * Unit tests for the user-management privilege-escalation protections:
 *   - create/update whitelist request fields (no mass assignment)
 *   - role/status validated against the allowed set
 *   - the last remaining admin can't be demoted/disabled
 *
 * The User model is mocked so these run without a DB. With the model mocked,
 * the controllers fall back to literal enum values (see VALID_ROLES).
 */

jest.mock('../../models/User', () => ({
  // schema intentionally absent -> controllers use their literal enum fallback
  create: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
}));

const User = require('../../models/User');
const userController = require('../../controllers/userController');

// Run a catchAsync-wrapped handler. catchAsync does not return its promise
// (Express doesn't await middleware), so we resolve when the handler actually
// finishes — i.e. when it calls res.json() or next().
const run = (handler, body, params = {}) =>
  new Promise((resolve) => {
    const req = { body, params };
    const next = jest.fn((err) => resolve({ res, next, error: err }));
    const res = {
      status: jest.fn(() => res),
      json: jest.fn(() => {
        resolve({ res, next, error: undefined });
        return res;
      }),
    };
    handler(req, res, next);
  });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createUser', () => {
  it('whitelists fields — drops injected active/_id/arbitrary keys', async () => {
    User.create.mockResolvedValue({ _id: '1', name: 'A' });

    await run(userController.createUser, {
      name: 'A',
      email: 'a@b.com',
      password: 'password1',
      passwordConfirm: 'password1',
      role: 'technician',
      active: false,          // not allowed on create
      _id: 'attacker-set-id', // must be dropped
      evil: 'x',              // must be dropped
    });

    expect(User.create).toHaveBeenCalledTimes(1);
    const payload = User.create.mock.calls[0][0];
    expect(payload).toMatchObject({ name: 'A', email: 'a@b.com', role: 'technician' });
    expect(payload).not.toHaveProperty('active');
    expect(payload).not.toHaveProperty('_id');
    expect(payload).not.toHaveProperty('evil');
  });

  it('rejects an invalid role with 400 and does not create', async () => {
    const { next, error } = await run(userController.createUser, {
      name: 'A',
      email: 'a@b.com',
      role: 'superadmin',
    });

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });
});

describe('updateUser', () => {
  const targetNonAdmin = { _id: 't1', role: 'service-writer' };

  it('whitelists fields — drops injected keys, keeps role/status', async () => {
    User.findById.mockReturnValue({ setOptions: jest.fn().mockResolvedValue(targetNonAdmin) });
    User.countDocuments.mockResolvedValue(2);
    User.findByIdAndUpdate.mockResolvedValue({ _id: 't1', role: 'management' });

    await run(
      userController.updateUser,
      { role: 'management', status: 'active', passwordResetToken: 'x', evil: 'y' },
      { id: 't1' }
    );

    expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    const payload = User.findByIdAndUpdate.mock.calls[0][1];
    expect(payload).toMatchObject({ role: 'management', status: 'active' });
    expect(payload).not.toHaveProperty('passwordResetToken');
    expect(payload).not.toHaveProperty('evil');
  });

  it('rejects an invalid role with 400', async () => {
    const { error } = await run(userController.updateUser, { role: 'root' }, { id: 't1' });
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('blocks demoting the last remaining admin', async () => {
    User.findById.mockReturnValue({
      setOptions: jest.fn().mockResolvedValue({ _id: 'a1', role: 'admin' }),
    });
    User.countDocuments.mockResolvedValue(1); // only one admin left

    const { error } = await run(userController.updateUser, { role: 'management' }, { id: 'a1' });

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when other admins remain', async () => {
    User.findById.mockReturnValue({
      setOptions: jest.fn().mockResolvedValue({ _id: 'a1', role: 'admin' }),
    });
    User.countDocuments.mockResolvedValue(2);
    User.findByIdAndUpdate.mockResolvedValue({ _id: 'a1', role: 'management' });

    const { next } = await run(userController.updateUser, { role: 'management' }, { id: 'a1' });

    expect(next).not.toHaveBeenCalled();
    expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });
});
