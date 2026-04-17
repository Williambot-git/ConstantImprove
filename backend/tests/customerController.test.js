/**
 * customerController unit tests
 *
 * Tests 14 route handlers exported from customerController.
 * Key behavioral notes for writing tests:
 * - login uses { accountNumber, password } — NOT email/password
 * - register uses { email } only — generates numeric credentials server-side
 * - claimCredentials uses { claimToken } — NOT user.id from auth
 * - useRecoveryKit uses { accountNumber, kit, newPassword }
 * - rotateRecoveryKit, changePassword, getProfile, getSubscription, cancelSubscription,
 *   changePlan, deleteAccount, getMessages, createSupportTicket all require user.id (from auth middleware)
 * - Password hashing: argon2 (primary), bcrypt (legacy fallback)
 * - login has lockout logic (increment failed_attempts on bad credentials)
 *
 * This controller is for the customer/numeric-account auth system (post-payment claim flow).
 * The regular email/password auth lives in authController.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock database first
const mockDbQuery = jest.fn();
jest.mock('../src/config/database', () => ({ query: mockDbQuery }));

// Mock argon2 — primary password hash in this controller
jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn()
}));

// Mock bcrypt — used for new password writes AND legacy hash verification
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

// Mock uuid for recovery kit generation
jest.mock('uuid', () => ({ v4: jest.fn() }));

// Mock fs (used for logging in some helpers)
jest.mock('fs', () => ({}));

// Mock jwt — used for token generation in login/register
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token')
}));

// Mock password validation — used by useRecoveryKit, changePassword
jest.mock('../src/middleware/passwordValidation', () => ({
  validatePasswordComplexity: jest.fn((pw) => {
    if (!pw || pw.length < 8) return { valid: false, errors: ['Too short'] };
    return { valid: true, errors: [] };
  })
}));

// ─── Modules under test ───────────────────────────────────────────────────────

const argon2 = require('argon2');
const bcrypt = require('bcrypt');
const customerController = require('../src/controllers/customerController');

// ─── Shared helpers ───────────────────────────────────────────────────────────

const mockRes = () => ({
  json: jest.fn().mockReturnThis(),
  status: jest.fn().mockReturnThis(),
  cookie: jest.fn().mockReturnThis(),
  clearCookie: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis()
});

  // Default: return empty results — mockResolvedValueOnce overrides per-test
beforeEach(() => {
  jest.clearAllMocks();
  mockDbQuery.mockReset();
  mockDbQuery.mockImplementation(() => Promise.resolve({ rows: [] })); // default fallback
  argon2.hash.mockReset();
  argon2.hash.mockImplementation(() => Promise.resolve('hashed-value')); // default for register
  argon2.verify.mockReset();
  argon2.verify.mockImplementation(() => Promise.resolve(true)); // default for login
  bcrypt.hash.mockReset();
  bcrypt.hash.mockImplementation(() => Promise.resolve('hashed-value'));
  bcrypt.compare.mockReset();
  bcrypt.compare.mockImplementation(() => Promise.resolve(true));
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: login(accountNumber, password)
// Controller line 36 — uses argon2 primary, bcrypt legacy fallback
// Has lockout logic (increments failed_attempts on bad password)
// ══════════════════════════════════════════════════════════════════════════════

describe('login', () => {
  it('should return 400 if accountNumber is missing', async () => {
    const req = { body: { password: 'pass' } };
    const res = mockRes();
    await customerController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Account number and password are required' });
  });

  it('should return 400 if password is missing', async () => {
    const req = { body: { accountNumber: 'ACC001' } };
    const res = mockRes();
    await customerController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 401 for non-existent account (also increments failed_attempts)', async () => {
    // First query: SELECT returns empty → attempts increment → returns 401
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // SELECT user
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE failed_attempts
    const req = { body: { accountNumber: 'NOTEXIST', password: 'pass' } };
    const res = mockRes();
    await customerController.login(req, res);
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  it('should return 423 if account is locked', async () => {
    const futureLockout = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 1, account_number: 'ACC001', numeric_password_hash: 'hash', lockout_until: futureLockout, failed_attempts: 5 }]
    });
    const req = { body: { accountNumber: 'ACC001', password: 'pass' } };
    const res = mockRes();
    await customerController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(423);
  });

  it('should return 401 for wrong password (increments failed_attempts)', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 1, account_number: 'ACC001', numeric_password_hash: '$argon2hash', lockout_until: null, failed_attempts: 0 }]
    });
    argon2.verify.mockResolvedValueOnce(false); // wrong password
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE failed_attempts
    const req = { body: { accountNumber: 'ACC001', password: 'wrong' } };
    const res = mockRes();
    await customerController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return JWT cookies and success on correct argon2 password', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 1, account_number: 'ACC001', numeric_password_hash: '$argon2hash', lockout_until: null, failed_attempts: 0 }]
    });
    argon2.verify.mockResolvedValueOnce(true);
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE reset failed_attempts
    const req = { body: { accountNumber: 'ACC001', password: 'correct' } };
    const res = mockRes();
    await customerController.login(req, res);
    expect(res.cookie).toHaveBeenCalledWith('accessToken', expect.any(String), expect.any(Object));
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.any(Object));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('should fall back to bcrypt for legacy hash if argon2 fails', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 1, account_number: 'ACC001', numeric_password_hash: null, password_hash: '$2b$10$legacy', lockout_until: null, failed_attempts: 0 }]
    });
    argon2.verify.mockRejectedValueOnce(new Error('invalid hash')); // fails
    bcrypt.compare.mockResolvedValueOnce(true); // legacy bcrypt works
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // reset failed_attempts
    const req = { body: { accountNumber: 'ACC001', password: 'correct' } };
    const res = mockRes();
    await customerController.login(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: register(email)
// Controller line 140 — email is OPTIONAL, generates numeric credentials
// Creates recovery kit, returns accountNumber + numericPassword + recoveryKit
// ══════════════════════════════════════════════════════════════════════════════

describe('register', () => {
  it('should return 400 if email already in use', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // email check
    const req = { body: { email: 'existing@example.com' } };
    const res = mockRes();
    await customerController.register(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email already in use' });
  });

  it('should create numeric account and return credentials on success (no email)', async () => {
    // No email → only INSERT query (no email check)
    // mockImplementation returns { rows: [] } by default; override with real result shape
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1, account_number: '33798042' }] }); // INSERT user
    argon2.hash.mockImplementation(() => Promise.resolve('hashed-value')); // register uses argon2
    const req = { body: {} }; // no email — creates anonymous numeric account
    const res = mockRes();
    await customerController.register(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        accountNumber: expect.any(String),
        numericPassword: expect.any(String),
        recoveryKit: expect.any(String)
      })
    }));
  });

  it('should allow registration with optional email', async () => {
    // Email provided → email check (empty), then INSERT
    mockDbQuery.mockResolvedValueOnce({ rows: [] });         // email check: no existing user
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 2, account_number: '11223344' }] }); // INSERT user
    argon2.hash.mockImplementation(() => Promise.resolve('hashed-value'));
    const req = { body: { email: 'new@example.com' } };
    const res = mockRes();
    await customerController.register(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: claimCredentials(claimToken)
// Controller line 217 — uses claimToken, NOT user.id from auth middleware
// Finds credential_claims record, marks it claimed, creates recovery kit
// ══════════════════════════════════════════════════════════════════════════════

describe('claimCredentials', () => {
  it('should return 400 if claimToken is missing', async () => {
    const req = { body: {} };
    const res = mockRes();
    await customerController.claimCredentials(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Claim token required' });
  });

  it('should return 404 for invalid or expired claim token', async () => {
    argon2.hash.mockResolvedValueOnce('token-hash');
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no matching claim record
    const req = { body: { claimToken: 'invalid-token' } };
    const res = mockRes();
    await customerController.claimCredentials(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired claim token' });
  });

  it('should return credentials on valid claim token', async () => {
    argon2.hash.mockResolvedValueOnce('token-hash');
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 10,
        customer_id: 1,
        account_number: 'ACC001',
        numeric_password_hash: 'raw-numeric-hash'
      }]
    }); // claim record found
    mockDbQuery.mockResolvedValueOnce({ rows: [] });  // UPDATE claim → claimed_at
    mockDbQuery.mockResolvedValueOnce({ rows: [] });  // DELETE existing recovery kits
    mockDbQuery.mockResolvedValueOnce({ rows: [] });  // INSERT new recovery kit
    argon2.hash.mockResolvedValueOnce('returned-numeric-hash');  // returned to user
    argon2.hash.mockResolvedValueOnce('new-kit-hash');           // kit hash for DB
    const req = { body: { claimToken: 'valid-claim-token' } };
    const res = mockRes();
    await customerController.claimCredentials(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        accountNumber: 'ACC001',
        recoveryKit: expect.any(String)
      })
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: useRecoveryKit(accountNumber, kit, newPassword)
// Controller line 278 — all three fields required
// Validates recovery kit, updates password, creates new kit
// ══════════════════════════════════════════════════════════════════════════════

describe('useRecoveryKit', () => {
  it('should return 400 if any field is missing', async () => {
    const req = { body: { accountNumber: 'ACC001' } };
    const res = mockRes();
    await customerController.useRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Account number, recovery kit, and new password are required' });
  });

  it('should return 404 if account not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no user found
    const req = { body: { accountNumber: 'NOTEXIST', kit: 'kit', newPassword: 'NewPass123!' } };
    const res = mockRes();
    await customerController.useRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should return 404 if no active recovery kit', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1, account_number: 'ACC001' }] }); // user found
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no active kit
    const req = { body: { accountNumber: 'ACC001', kit: 'kit', newPassword: 'NewPass123!' } };
    const res = mockRes();
    await customerController.useRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should return 401 if recovery kit is invalid', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1, account_number: 'ACC001' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 99, kit_hash: 'hash' }] }); // kit found
    // verifyRecoveryKit calls argon2.verify internally
    argon2.verify.mockResolvedValueOnce(false); // invalid kit
    const req = { body: { accountNumber: 'ACC001', kit: 'wrong-kit', newPassword: 'NewPass123!' } };
    const res = mockRes();
    await customerController.useRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should update password and return new recovery kit on success', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1, account_number: 'ACC001' }] });                   // user lookup
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 99, kit_hash: 'hash' }] });                          // kit lookup
    argon2.verify.mockResolvedValueOnce(true);                                                              // kit valid
    mockDbQuery.mockResolvedValueOnce({ rows: [] });                                                        // BEGIN
    mockDbQuery.mockResolvedValueOnce({ rows: [] });                                                        // UPDATE password
    mockDbQuery.mockResolvedValueOnce({ rows: [] });                                                        // DELETE old kits
    mockDbQuery.mockResolvedValueOnce({ rows: [] });                                                        // INSERT new kit
    mockDbQuery.mockResolvedValueOnce({ rows: [] });                                                        // COMMIT
    bcrypt.hash.mockResolvedValueOnce('bcrypt-hash');                                                        // bcrypt for new pw
    argon2.hash.mockResolvedValueOnce('argon2-new-kit');                                                      // new kit hash
    const req = { body: { accountNumber: 'ACC001', kit: 'valid-kit', newPassword: 'NewPass123!' } };
    const res = mockRes();
    await customerController.useRecoveryKit(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        recoveryKit: expect.any(String),
        message: expect.stringContaining('Recovery successful')
      })
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: rotateRecoveryKit(password)
// Controller line 374 — requires user.id from auth middleware
// Verifies password (bcrypt or argon2), replaces recovery kit
// ══════════════════════════════════════════════════════════════════════════════

describe('rotateRecoveryKit', () => {
  it('should return 400 if password not provided', async () => {
    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();
    await customerController.rotateRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 404 if user not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // user lookup
    const req = { user: { id: 999 }, body: { password: 'correct' } };
    const res = mockRes();
    await customerController.rotateRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should return 401 if password is wrong', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: '$2b$10$hash', numeric_password_hash: null }] });
    bcrypt.compare.mockResolvedValueOnce(false);
    argon2.verify.mockRejectedValueOnce(new Error('no numeric hash'));
    const req = { user: { id: 1 }, body: { password: 'wrong' } };
    const res = mockRes();
    await customerController.rotateRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should rotate kit and return new kit on valid password (bcrypt)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: '$2b$10$hash', numeric_password_hash: null }] });
    bcrypt.compare.mockResolvedValueOnce(true);
    mockDbQuery.mockResolvedValueOnce({ rows: [] });  // DELETE old kits
    mockDbQuery.mockResolvedValueOnce({ rows: [] });  // INSERT new kit
    argon2.hash.mockResolvedValueOnce('new-kit-hash');
    const req = { user: { id: 1 }, body: { password: 'correct' } };
    const res = mockRes();
    await customerController.rotateRecoveryKit(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ recoveryKit: expect.any(String) })
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: logout
// Controller line 438 — no auth needed, clears 3 cookies
// ══════════════════════════════════════════════════════════════════════════════

describe('logout', () => {
  it('should clear all auth cookies and return success', async () => {
    const req = {};
    const res = mockRes();
    await customerController.logout(req, res);
    expect(res.clearCookie).toHaveBeenCalledWith('accessToken');
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    expect(res.clearCookie).toHaveBeenCalledWith('csrfToken');
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Logged out successfully' });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: changePassword(currentPassword, newPassword)
// Controller line 446 — requires user.id from auth middleware
// ══════════════════════════════════════════════════════════════════════════════

describe('changePassword', () => {
  it('should return 400 if currentPassword missing', async () => {
    const req = { user: { id: 1 }, body: { newPassword: 'NewPass123!' } };
    const res = mockRes();
    await customerController.changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 if newPassword missing', async () => {
    const req = { user: { id: 1 }, body: { currentPassword: 'old' } };
    const res = mockRes();
    await customerController.changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 404 if user not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const req = { user: { id: 999 }, body: { currentPassword: 'old', newPassword: 'NewPass123!' } };
    const res = mockRes();
    await customerController.changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should return 401 if current password wrong', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: '$2b$10$hash', numeric_password_hash: null }] });
    bcrypt.compare.mockResolvedValueOnce(false);
    argon2.verify.mockRejectedValueOnce(new Error('no numeric hash'));
    const req = { user: { id: 1 }, body: { currentPassword: 'wrong', newPassword: 'NewPass123!' } };
    const res = mockRes();
    await customerController.changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should update both bcrypt and argon2 hashes and return success', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: '$2b$10$hash', numeric_password_hash: null }] });
    bcrypt.compare.mockResolvedValueOnce(true);
    mockDbQuery.mockResolvedValueOnce({ rows: [] });  // UPDATE
    bcrypt.hash.mockResolvedValueOnce('new-bcrypt-hash');
    argon2.hash.mockResolvedValueOnce('new-argon2-hash');
    const req = { user: { id: 1 }, body: { currentPassword: 'correct', newPassword: 'NewPass123!' } };
    const res = mockRes();
    await customerController.changePassword(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Password changed successfully' });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: getProfile
// Controller line 503 — JOINs users + vpn_accounts, requires user.id
// ══════════════════════════════════════════════════════════════════════════════

describe('getProfile', () => {
  it('should return combined user + VPN account data', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        account_number: 'ACC001',
        created_at: new Date(),
        updated_at: new Date(),
        last_login: new Date(),
        is_active: true,
        vpn_username: 'vpnuser',
        vpn_password: 'vpnpass',
        vpn_status: 'active',
        vpn_expiry_date: new Date()
      }]
    });
    const req = { user: { id: 1 } };
    const res = mockRes();
    await customerController.getProfile(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ account_number: 'ACC001', vpn_username: 'vpnuser' })
    }));
  });

  it('should return 404 if user not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const req = { user: { id: 999 } };
    const res = mockRes();
    await customerController.getProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: getSubscription
// Controller line 536 — JOINs subscriptions + plans, returns plan_key
// ══════════════════════════════════════════════════════════════════════════════

describe('getSubscription', () => {
  it('should return subscription with plan_key mapped', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        status: 'active',
        plan_id: 1,
        interval: 'month',
        plan_name: 'Monthly',
        amount_cents: 999,
        currency: 'USD'
      }]
    });
    const req = { user: { id: 1 } };
    const res = mockRes();
    await customerController.getSubscription(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        status: 'active',
        plan_key: 'monthly',
        planKey: 'monthly'
      })
    }));
  });

  it('should return 404 if no subscription found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const req = { user: { id: 1 } };
    const res = mockRes();
    await customerController.getSubscription(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'No subscription found' });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: cancelSubscription
// Controller line 575 — requires active subscription, calls cancelArbSubscription
// ══════════════════════════════════════════════════════════════════════════════

describe('cancelSubscription', () => {
  it('should return 404 if no active subscription', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no active subscription
    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();
    await customerController.cancelSubscription(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should cancel subscription and return success (without ARB)', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 1, metadata: {} }]  // no arb_subscription_id
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE subscription
    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();
    await customerController.cancelSubscription(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Subscription cancelled successfully'
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: changePlan(newPlanKey)
// Controller line 620 — requires active subscription + valid plan
// ══════════════════════════════════════════════════════════════════════════════

describe('changePlan', () => {
  it('should return 400 if newPlanKey missing', async () => {
    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();
    await customerController.changePlan(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for invalid plan name', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no plan matches
    const req = { user: { id: 1 }, body: { newPlanKey: 'invalidPlan' } };
    const res = mockRes();
    await customerController.changePlan(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 404 if no active subscription to change', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] }); // plan found
    mockDbQuery.mockResolvedValueOnce({ rows: [] });           // no active subscription
    const req = { user: { id: 1 }, body: { newPlanKey: 'monthly' } };
    const res = mockRes();
    await customerController.changePlan(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should update plan and return success', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] });  // plan found
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // subscription updated
    const req = { user: { id: 1 }, body: { newPlanKey: 'monthly' } };
    const res = mockRes();
    await customerController.changePlan(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Plan changed successfully'
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: deleteAccount
// Controller line 662 — soft deletes user (sets is_active=false, deleted_at)
// ══════════════════════════════════════════════════════════════════════════════

describe('deleteAccount', () => {
  it('should soft-delete account and return success', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE
    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();
    await customerController.deleteAccount(req, res);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'UPDATE users SET is_active = false, deleted_at = NOW() WHERE id = $1',
      [1]
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: expect.stringContaining('30 days')
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: getMessages
// Controller line 681 — queries internal_messages table
// ══════════════════════════════════════════════════════════════════════════════

describe('getMessages', () => {
  it('should return messages array', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, subject: 'Welcome', message: 'Hello', is_read: false, created_at: new Date() }
      ]
    });
    const req = { user: { id: 1 } };
    const res = mockRes();
    await customerController.getMessages(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ subject: 'Welcome' })
      ])
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST: createSupportTicket(subject, description)
// Controller line 702 — both fields required
// ══════════════════════════════════════════════════════════════════════════════

describe('createSupportTicket', () => {
  it('should return 400 if subject missing', async () => {
    const req = { user: { id: 1 }, body: { description: 'Help needed' } };
    const res = mockRes();
    await customerController.createSupportTicket(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Subject and description required' });
  });

  it('should return 400 if description missing', async () => {
    const req = { user: { id: 1 }, body: { subject: 'Help' } };
    const res = mockRes();
    await customerController.createSupportTicket(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should create ticket and return ticket data on success', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 42, subject: 'Help', status: 'open', created_at: new Date() }]
    });
    const req = { user: { id: 1 }, body: { subject: 'Help', description: 'Need assistance' } };
    const res = mockRes();
    await customerController.createSupportTicket(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ id: 42, status: 'open' }),
      message: 'Support ticket created successfully'
    }));
  });
});
