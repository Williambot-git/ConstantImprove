/**
 * affiliateAuthController unit tests
 *
 * Tests all 7 exported functions from affiliateAuthController.js:
 *   login, logout, validateRecoveryCode, resetPassword,
 *   generateRecoveryKit, getProfile, changePassword
 *
 * Dependencies mocked:
 *   - argon2 (verify, hash)        — password verification and hashing
 *   - jsonwebtoken (sign)          — JWT access/refresh token + reset token generation
 *   - crypto.randomBytes            — recovery code generation
 *   - db.query                      — all database operations
 *   - setCsrfTokenCookie            — from authMiddleware_new
 *
 * Mock strategy (same pattern as affiliateController.test.js):
 *   - mockReset() + mockImplementation(() => default) in beforeEach
 *   - mockResolvedValueOnce() per test for specific query responses
 *   - argon2.hash default: resolves to 'hashed-value' so async flows work
 *
 * Jest gotcha reminder:
 *   jest.clearAllMocks() clears call history but NOT mockImpl/mockReturnValue.
 *   Use mockReset() + mockImplementation() in beforeEach instead.
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
process.env.NODE_ENV = 'test';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const mockDbQuery = jest.fn();
jest.mock('../src/config/database', () => ({ query: mockDbQuery }));

// argon2: verify(passwordHash, password) → Promise<boolean>, hash(password) → Promise<string>
jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn()
}));

// jsonwebtoken: sign(payload, secret, options) → string
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn()
}));

// crypto.randomBytes for recovery code generation
jest.mock('crypto', () => ({
  randomBytes: jest.fn()
}));

// setCsrfTokenCookie from authMiddleware_new
jest.mock('../src/middleware/authMiddleware_new', () => ({
  setCsrfTokenCookie: jest.fn()
}));

// ─── Imports after mocks ───────────────────────────────────────────────────────

const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { setCsrfTokenCookie } = require('../src/middleware/authMiddleware_new');

const {
  login,
  logout,
  validateRecoveryCode,
  resetPassword,
  generateRecoveryKit,
  getProfile,
  changePassword
} = require('../src/controllers/affiliateAuthController');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  return {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

function mockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    affiliateId: 'affiliate-uuid-123',
    user: null,       // req.user is set by protectAffiliate middleware
    ...overrides
  };
}

// Shared active affiliate row
const MOCK_AFFILIATE = {
  id: 'affiliate-uuid-123',
  username: 'testaffiliate',
  password_hash: '$2b$10$mock.hash.for.testing', // argon2.verify returns true in beforeEach
  status: 'active',
  recovery_codes_hash: '[]'
};

// Shared suspended affiliate row
const MOCK_SUSPENDED_AFFILIATE = {
  ...MOCK_AFFILIATE,
  status: 'suspended'
};

// ─── Global beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // db.query default: empty rows
  mockDbQuery.mockReset();
  mockDbQuery.mockImplementation(() => Promise.resolve({ rows: [] }));

  // argon2
  argon2.verify.mockReset();
  argon2.verify.mockImplementation(() => Promise.resolve(true));
  argon2.hash.mockReset();
  argon2.hash.mockImplementation(() => Promise.resolve('hashed-value'));

  // jwt.sign default: returns a predictable token
  jwt.sign.mockReset();
  jwt.sign.mockImplementation(() => 'mock-signed-token');

  // crypto.randomBytes default: returns a predictable buffer
  crypto.randomBytes.mockReset();
  crypto.randomBytes.mockImplementation((n) => Buffer.alloc(n));

  // setCsrfTokenCookie default: no-op
  setCsrfTokenCookie.mockReset();
  setCsrfTokenCookie.mockImplementation(() => {});
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('login', () => {
  test('200 — successful login sets cookies and returns token', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [MOCK_AFFILIATE] });

    const req = mockReq({ body: { username: 'testaffiliate', password: 'correct-password' } });
    const res = mockRes();
    await login(req, res);

    // DB: SELECT affiliate by username
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expect(mockDbQuery.mock.calls[0][0]).toContain('FROM affiliates');
    expect(mockDbQuery.mock.calls[0][1]).toEqual(['testaffiliate']);

    // argon2.verify called with stored hash and submitted password
    expect(argon2.verify).toHaveBeenCalledWith(MOCK_AFFILIATE.password_hash, 'correct-password');

    // Cookies: accessToken (15m) + refreshToken (7d)
    expect(res.cookie).toHaveBeenCalledWith('accessToken', 'mock-signed-token', expect.objectContaining({
      httpOnly: true,
      maxAge: 15 * 60 * 1000
    }));
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'mock-signed-token', expect.objectContaining({
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }));

    // CSRF cookie set
    expect(setCsrfTokenCookie).toHaveBeenCalledWith(res, MOCK_AFFILIATE.id);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        username: MOCK_AFFILIATE.username,
        message: 'Affiliate login successful',
        token: 'mock-signed-token'
      }
    });
  });

  test('400 — missing username or password', async () => {
    for (const body of [{ username: 'user' }, { password: 'pass' }, {}]) {
      const req = mockReq({ body });
      const res = mockRes();
      await login(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Username and password are required' });
    }
  });

  test('401 — affiliate not found (username does not exist)', async () => {
    // Default mockDbQuery returns { rows: [] } → affiliate not found
    const req = mockReq({ body: { username: 'nobody', password: 'pass' } });
    const res = mockRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  test('403 — affiliate account is suspended', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [MOCK_SUSPENDED_AFFILIATE] });
    const req = mockReq({ body: { username: 'testaffiliate', password: 'correct-password' } });
    const res = mockRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Account suspended' });
  });

  test('401 — wrong password', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [MOCK_AFFILIATE] });
    argon2.verify.mockImplementation(() => Promise.resolve(false)); // wrong password
    const req = mockReq({ body: { username: 'testaffiliate', password: 'wrong-password' } });
    const res = mockRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  test('500 — database error during login', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB connection failed'));
    const req = mockReq({ body: { username: 'testaffiliate', password: 'correct-password' } });
    const res = mockRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

// ─── logout ────────────────────────────────────────────────────────────────────

describe('logout', () => {
  test('200 — clears all auth cookies', async () => {
    const req = mockReq();
    const res = mockRes();
    await logout(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith('accessToken');
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    expect(res.clearCookie).toHaveBeenCalledWith('csrfToken');
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Logged out successfully' });
  });
});

// ─── validateRecoveryCode ─────────────────────────────────────────────────────

describe('validateRecoveryCode', () => {
  // A pre-computed argon2 hash of 'TESTCODE123' for mock verification.
  // In real code, argon2.verify(storedHash, userInput.toUpperCase().trim()) is called.
  const MOCK_RECOVERY_HASH = 'mock-hashed-code';

  const mockAffiliateWithCodes = {
    ...MOCK_AFFILIATE,
    recovery_codes_hash: JSON.stringify([MOCK_RECOVERY_HASH])
  };

  test('200 — valid recovery code returns reset token and consumes the code', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [mockAffiliateWithCodes] });
    // argon2.verify returns true (code matches)
    argon2.verify.mockImplementation(() => Promise.resolve(true));
    // jwt.sign returns reset token
    jwt.sign.mockImplementation(() => 'mock-reset-token');

    const req = mockReq({ body: { username: 'testaffiliate', recoveryCode: 'testcode123' } });
    const res = mockRes();
    await validateRecoveryCode(req, res);

    // DB: SELECT affiliate by username and status
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM affiliates'),
      ['testaffiliate', 'active']
    );

    // argon2.verify called with stored hash and uppercased/trimmed input
    expect(argon2.verify).toHaveBeenCalledWith(MOCK_RECOVERY_HASH, 'TESTCODE123');

    // DB: UPDATE to remove the used recovery code
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
    const updateCall = mockDbQuery.mock.calls[1];
    expect(updateCall[0]).toContain('UPDATE affiliates');
    // Second arg is [newCodesArray, affiliateId]
    expect(updateCall[1][1]).toBe(mockAffiliateWithCodes.id);

    // Returns reset token
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { resetToken: 'mock-reset-token' },
      message: 'Recovery code valid. Set your new password.'
    });
  });

  test('400 — missing username or recovery code', async () => {
    for (const body of [{ username: 'user' }, { recoveryCode: 'code' }, {}]) {
      const req = mockReq({ body });
      const res = mockRes();
      await validateRecoveryCode(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Username and recovery code required' });
    }
  });

  test('404 — affiliate not found', async () => {
    // Default mockDbQuery returns { rows: [] }
    const req = mockReq({ body: { username: 'nobody', recoveryCode: 'TESTCODE123' } });
    const res = mockRes();
    await validateRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
  });

  test('400 — no recovery codes available', async () => {
    const affiliateNoCodes = { ...MOCK_AFFILIATE, recovery_codes_hash: '[]' };
    mockDbQuery.mockResolvedValueOnce({ rows: [affiliateNoCodes] });

    const req = mockReq({ body: { username: 'testaffiliate', recoveryCode: 'TESTCODE123' } });
    const res = mockRes();
    await validateRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No recovery codes available. Contact William.' });
  });

  test('401 — invalid recovery code', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [mockAffiliateWithCodes] });
    // argon2.verify returns false (code doesn't match)
    argon2.verify.mockImplementation(() => Promise.resolve(false));

    const req = mockReq({ body: { username: 'testaffiliate', recoveryCode: 'WRONGCODE' } });
    const res = mockRes();
    await validateRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid recovery code' });
  });

  test('500 — database error during validation', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({ body: { username: 'testaffiliate', recoveryCode: 'TESTCODE123' } });
    const res = mockRes();
    await validateRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

// ─── resetPassword ─────────────────────────────────────────────────────────────

describe('resetPassword', () => {
  test('200 — password reset successfully', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE query
    argon2.hash.mockImplementation(() => Promise.resolve('new-hashed-password'));

    const req = mockReq({
      body: { newPassword: 'newSecurePass123', confirmPassword: 'newSecurePass123' },
      user: { affiliateId: 'affiliate-uuid-123', purpose: 'reset' }
    });
    const res = mockRes();
    await resetPassword(req, res);

    // argon2.hash called with new password
    expect(argon2.hash).toHaveBeenCalledWith('newSecurePass123');

    // DB UPDATE with new hash
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE affiliates'),
      ['new-hashed-password', 'affiliate-uuid-123']
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Password reset successfully'
    });
  });

  test('400 — missing new password or confirmation', async () => {
    for (const body of [
      { newPassword: 'pass' },
      { confirmPassword: 'pass' },
      {}
    ]) {
      const req = mockReq({ body, user: { affiliateId: 'affiliate-uuid-123', purpose: 'reset' } });
      const res = mockRes();
      await resetPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'New password and confirmation required' });
    }
  });

  test('400 — passwords do not match', async () => {
    const req = mockReq({
      body: { newPassword: 'pass1', confirmPassword: 'pass2' },
      user: { affiliateId: 'affiliate-uuid-123', purpose: 'reset' }
    });
    const res = mockRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Passwords do not match' });
  });

  test('400 — password too short', async () => {
    const req = mockReq({
      body: { newPassword: 'short', confirmPassword: 'short' },
      user: { affiliateId: 'affiliate-uuid-123', purpose: 'reset' }
    });
    const res = mockRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Password must be at least 8 characters' });
  });

  test('401 — invalid or expired reset session (no req.user)', async () => {
    const req = mockReq({
      body: { newPassword: 'newSecurePass123', confirmPassword: 'newSecurePass123' },
      user: null
    });
    const res = mockRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired reset session' });
  });

  test('401 — invalid or expired reset session (wrong purpose)', async () => {
    const req = mockReq({
      body: { newPassword: 'newSecurePass123', confirmPassword: 'newSecurePass123' },
      user: { affiliateId: 'affiliate-uuid-123', purpose: 'login' } // wrong purpose
    });
    const res = mockRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired reset session' });
  });

  test('500 — database error during password reset', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({
      body: { newPassword: 'newSecurePass123', confirmPassword: 'newSecurePass123' },
      user: { affiliateId: 'affiliate-uuid-123', purpose: 'reset' }
    });
    const res = mockRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

// ─── generateRecoveryKit ──────────────────────────────────────────────────────

describe('generateRecoveryKit', () => {
  // crypto.randomBytes returns predictable hex strings
  const mockRandomBytes = (n) => Buffer.from('A'.repeat(n * 2), 'hex');

  test('200 — affiliate regenerates own kit (req.affiliateId path)', async () => {
    crypto.randomBytes.mockImplementation(mockRandomBytes);
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ password_hash: 'existing-hash' }] })  // SELECT password_hash
      .mockResolvedValueOnce({ rows: [] });                                       // UPDATE recovery_codes_hash

    const req = mockReq({
      body: { password: 'verified-password' },
      affiliateId: 'affiliate-uuid-123'
    });
    const res = mockRes();
    await generateRecoveryKit(req, res);

    // Password verified via argon2
    expect(argon2.verify).toHaveBeenCalledWith('existing-hash', 'verified-password');

    // 10 codes generated (randomBytes called in loop of 10)
    expect(crypto.randomBytes).toHaveBeenCalledTimes(10);

    // argon2.hash called 10 times to hash codes
    expect(argon2.hash).toHaveBeenCalledTimes(10);

    // DB UPDATE with hashed codes
    expect(mockDbQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE affiliates'),
      expect.any(Array)
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { recoveryCodes: expect.any(Array) },
      message: 'Recovery kit generated. Save these codes securely.'
    });
    // 10 plain-text codes returned to user
    expect(res.json.mock.calls[0][0].data.recoveryCodes).toHaveLength(10);
  });

  test('200 — admin generates kit for affiliate (admin path)', async () => {
    crypto.randomBytes.mockImplementation(mockRandomBytes);
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE

    // admin path: affiliateId must NOT be set; admin sets affiliateId in body instead
    const req = mockReq({
      body: { affiliateId: 'other-affiliate-uuid', password: 'admin-password' },
      user: { role: 'admin' },
      affiliateId: undefined // force admin path (req.affiliateId is the if-check, not body.affiliateId)
    });
    const res = mockRes();
    await generateRecoveryKit(req, res);

    // 10 codes generated
    expect(crypto.randomBytes).toHaveBeenCalledTimes(10);

    // DB UPDATE with hashed codes for the target affiliateId
    const updateCall = mockDbQuery.mock.calls[mockDbQuery.mock.calls.length - 1];
    expect(updateCall[1][1]).toBe('other-affiliate-uuid');

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { recoveryCodes: expect.any(Array) },
      message: 'Recovery kit generated for affiliate.'
    });
  });

  test('401 — affiliate password verification failed', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ password_hash: 'wrong-hash' }] });
    argon2.verify.mockImplementation(() => Promise.resolve(false)); // wrong password

    const req = mockReq({
      body: { password: 'wrong-password' },
      affiliateId: 'affiliate-uuid-123'
    });
    const res = mockRes();
    await generateRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid password' });
  });

  test('404 — affiliate not found when regenerating own kit', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // affiliate not found

    const req = mockReq({
      body: { password: 'some-password' },
      affiliateId: 'nonexistent-uuid'
    });
    const res = mockRes();
    await generateRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
  });

  test('400 — invalid request (no affiliateId, no admin role)', async () => {
    // Neither affiliate path nor admin path taken → falls through to 400
    // req.affiliateId is undefined and req.user has no role
    const req = mockReq({
      body: {},
      user: null,     // no affiliateId AND no admin role
      affiliateId: undefined
    });
    const res = mockRes();
    await generateRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid request' });
  });

  test('500 — database error during kit generation', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({
      body: { password: 'verified-password' },
      affiliateId: 'affiliate-uuid-123'
    });
    const res = mockRes();
    await generateRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

// ─── getProfile ────────────────────────────────────────────────────────────────

describe('getProfile', () => {
  test('200 — returns affiliate profile data', async () => {
    const profileRow = {
      id: 'affiliate-uuid-123',
      username: 'testaffiliate',
      status: 'active',
      created_at: new Date('2024-01-01')
    };
    mockDbQuery.mockResolvedValueOnce({ rows: [profileRow] });

    const req = mockReq({ affiliateId: 'affiliate-uuid-123' });
    const res = mockRes();
    await getProfile(req, res);

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      ['affiliate-uuid-123']
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: profileRow
    });
  });

  test('404 — affiliate not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ affiliateId: 'nonexistent-uuid' });
    const res = mockRes();
    await getProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
  });

  test('500 — database error during profile fetch', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({ affiliateId: 'affiliate-uuid-123' });
    const res = mockRes();
    await getProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

// ─── changePassword ────────────────────────────────────────────────────────────

describe('changePassword', () => {
  test('200 — password changed successfully', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ password_hash: 'current-hash' }] })  // SELECT
      .mockResolvedValueOnce({ rows: [] });                                    // UPDATE
    argon2.hash.mockImplementation(() => Promise.resolve('new-hashed-password'));

    const req = mockReq({
      body: {
        oldPassword: 'old-pass',
        newPassword: 'newSecurePass123',
        confirmPassword: 'newSecurePass123'
      },
      affiliateId: 'affiliate-uuid-123'
    });
    const res = mockRes();
    await changePassword(req, res);

    // argon2.verify called to check old password
    expect(argon2.verify).toHaveBeenCalledWith('current-hash', 'old-pass');

    // argon2.hash called with new password
    expect(argon2.hash).toHaveBeenCalledWith('newSecurePass123');

    // DB UPDATE
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE affiliates'),
      ['new-hashed-password', 'affiliate-uuid-123']
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Password changed successfully'
    });
  });

  test('400 — missing one or more password fields', async () => {
    for (const body of [
      { oldPassword: 'old', newPassword: 'new' },          // missing confirmPassword
      { oldPassword: 'old', confirmPassword: 'new' },       // missing newPassword
      { newPassword: 'new', confirmPassword: 'new' },       // missing oldPassword
      {}
    ]) {
      const req = mockReq({ body, affiliateId: 'affiliate-uuid-123' });
      const res = mockRes();
      await changePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'All password fields required' });
    }
  });

  test('400 — new passwords do not match', async () => {
    const req = mockReq({
      body: { oldPassword: 'old', newPassword: 'new1', confirmPassword: 'new2' },
      affiliateId: 'affiliate-uuid-123'
    });
    const res = mockRes();
    await changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'New passwords do not match' });
  });

  test('400 — new password too short', async () => {
    const req = mockReq({
      body: { oldPassword: 'old', newPassword: 'short', confirmPassword: 'short' },
      affiliateId: 'affiliate-uuid-123'
    });
    const res = mockRes();
    await changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Password must be at least 8 characters' });
  });

  test('401 — old password incorrect', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ password_hash: 'current-hash' }] });
    argon2.verify.mockImplementation(() => Promise.resolve(false)); // wrong old password

    const req = mockReq({
      body: { oldPassword: 'wrong-old', newPassword: 'newSecurePass123', confirmPassword: 'newSecurePass123' },
      affiliateId: 'affiliate-uuid-123'
    });
    const res = mockRes();
    await changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Current password is incorrect' });
  });

  test('404 — affiliate not found during change password', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // affiliate not found

    const req = mockReq({
      body: { oldPassword: 'old', newPassword: 'newSecurePass123', confirmPassword: 'newSecurePass123' },
      affiliateId: 'nonexistent-uuid'
    });
    const res = mockRes();
    await changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
  });

  test('500 — database error during password change', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({
      body: { oldPassword: 'old', newPassword: 'newSecurePass123', confirmPassword: 'newSecurePass123' },
      affiliateId: 'affiliate-uuid-123'
    });
    const res = mockRes();
    await changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
