/**
 * Password links: forgot-password, the admin-issued link, and reset.
 *
 * User and emailService are mocked so these run without a DB or SendGrid.
 */

jest.mock('../../models/User', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../../services/emailService', () => ({
  emailEnabled: false,
  sendEmail: jest.fn(),
}));

const crypto = require('crypto');
const User = require('../../models/User');
const emailService = require('../../services/emailService');
const authController = require('../../controllers/authController');
const adminController = require('../../controllers/adminController');

const run = (handler, { body = {}, params = {} } = {}) =>
  new Promise((resolve) => {
    const req = { body, params, protocol: 'https', get: () => 'shop.example.com' };
    const next = jest.fn((err) => resolve({ res, error: err }));
    const res = {
      status: jest.fn(() => res),
      cookie: jest.fn(() => res),
      json: jest.fn((payload) => {
        resolve({ res, payload, error: undefined });
        return res;
      }),
    };
    handler(req, res, next);
  });

// A user document stand-in with the real token method's behaviour.
const fakeUser = (overrides = {}) => ({
  _id: 'u1',
  email: 'owner@shop.com',
  status: 'active',
  save: jest.fn().mockResolvedValue(undefined),
  createPasswordResetToken(ttlMinutes = 10) {
    const token = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
    this.passwordResetExpires = new Date(Date.now() + ttlMinutes * 60 * 1000);
    return token;
  },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  emailService.emailEnabled = false;
  process.env.CLIENT_URL = 'https://shop-crm.onrender.com';
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRES_IN = '1d';
  process.env.JWT_COOKIE_EXPIRES_IN = '1';
});

describe('getPasswordResetMethod', () => {
  it('reports admin when the shop cannot send email', async () => {
    const { payload } = await run(authController.getPasswordResetMethod);
    expect(payload.data.method).toBe('admin');
  });

  it('reports email when it can', async () => {
    emailService.emailEnabled = true;
    const { payload } = await run(authController.getPasswordResetMethod);
    expect(payload.data.method).toBe('email');
  });
});

describe('forgotPassword', () => {
  it('503s without email, and never looks anyone up', async () => {
    const { error } = await run(authController.forgotPassword, { body: { email: 'owner@shop.com' } });
    expect(error.statusCode).toBe(503);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('emails a link to the client reset page, not the API', async () => {
    emailService.emailEnabled = true;
    const user = fakeUser();
    User.findOne.mockResolvedValue(user);

    const { payload } = await run(authController.forgotPassword, { body: { email: ' Owner@Shop.com ' } });

    expect(User.findOne).toHaveBeenCalledWith({ email: 'owner@shop.com' });
    expect(payload.status).toBe('success');
    const { text } = emailService.sendEmail.mock.calls[0][0];
    expect(text).toMatch(/https:\/\/shop-crm\.onrender\.com\/reset-password\/[0-9a-f]{64}/);
    expect(text).not.toMatch(/\/api\//);
  });

  it('gives the same answer for an unknown email, and sends nothing', async () => {
    emailService.emailEnabled = true;
    User.findOne.mockResolvedValue(null);
    const { payload } = await run(authController.forgotPassword, { body: { email: 'nobody@shop.com' } });
    expect(payload.status).toBe('success');
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('sends nothing to a disabled user', async () => {
    emailService.emailEnabled = true;
    User.findOne.mockResolvedValue(fakeUser({ status: 'disabled' }));
    await run(authController.forgotPassword, { body: { email: 'owner@shop.com' } });
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});

describe('createPasswordLink (admin)', () => {
  it('issues a 24-hour link to the reset page', async () => {
    const user = fakeUser();
    User.findById.mockResolvedValue(user);

    const { payload } = await run(adminController.createPasswordLink, { params: { id: 'u1' } });

    expect(payload.data.url).toMatch(/^https:\/\/shop-crm\.onrender\.com\/reset-password\/[0-9a-f]{64}$/);
    const hours = (payload.data.expiresAt - Date.now()) / 36e5;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    expect(user.save).toHaveBeenCalledWith({ validateBeforeSave: false });
  });

  it('refuses a disabled user', async () => {
    User.findById.mockResolvedValue(fakeUser({ status: 'disabled' }));
    const { error } = await run(adminController.createPasswordLink, { params: { id: 'u1' } });
    expect(error.statusCode).toBe(400);
  });

  it('404s an unknown user', async () => {
    User.findById.mockResolvedValue(null);
    const { error } = await run(adminController.createPasswordLink, { params: { id: 'nope' } });
    expect(error.statusCode).toBe(404);
  });
});

describe('resetPassword', () => {
  const body = { password: 'NewPassword1', passwordConfirm: 'NewPassword1' };

  it('rejects an unknown or expired token', async () => {
    User.findOne.mockResolvedValue(null);
    const { error } = await run(authController.resetPassword, { params: { token: 'abc' }, body });
    expect(error.statusCode).toBe(400);
  });

  it('looks the token up by hash, sets the password, clears the token, signs in', async () => {
    const user = fakeUser({ passwordResetToken: 'h', passwordResetExpires: new Date(Date.now() + 1e5) });
    User.findOne.mockResolvedValue(user);

    const { res, error } = await run(authController.resetPassword, { params: { token: 'abc' }, body });

    expect(error).toBeUndefined();
    const query = User.findOne.mock.calls[0][0];
    expect(query.passwordResetToken).toBe(crypto.createHash('sha256').update('abc').digest('hex'));
    expect(user.passwordResetToken).toBeUndefined();
    expect(user.save).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith('jwt', expect.any(String), expect.any(Object));
  });

  it('activates an invited (pending) user', async () => {
    const user = fakeUser({ status: 'pending' });
    User.findOne.mockResolvedValue(user);
    await run(authController.resetPassword, { params: { token: 'abc' }, body });
    expect(user.status).toBe('active');
  });

  it('refuses a disabled user even with a valid link', async () => {
    const user = fakeUser({ status: 'disabled' });
    User.findOne.mockResolvedValue(user);
    const { error } = await run(authController.resetPassword, { params: { token: 'abc' }, body });
    expect(error.statusCode).toBe(403);
    expect(user.save).not.toHaveBeenCalled();
  });

  it('asks for both password fields', async () => {
    User.findOne.mockResolvedValue(fakeUser());
    const { error } = await run(authController.resetPassword, { params: { token: 'abc' }, body: { password: 'x' } });
    expect(error.statusCode).toBe(400);
  });
});
