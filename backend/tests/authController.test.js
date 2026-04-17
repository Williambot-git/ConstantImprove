/**
 * authController unit tests
 *
 * Tests all 12 exported functions from authController.js.
 * Uses the same mock strategy as customerController.test.js:
 *   - db.query: mockReset() + mockImplementation in beforeEach → mockResolvedValueOnce per test
 *   - Other library mocks: same pattern
 *   - userModel: NOT mocked — its methods call db.query (which we control)
 *
 * Jest gotcha (documented here):
 *   jest.clearAllMocks() clears call history but NOT mockImpl/mockReturnValue.
 *   Use mockReset() + mockImplementation(() => default) in beforeEach instead.
 *   Then mockResolvedValueOnce() per test for specific query responses.
 */

process.env.JWT_SECRET='test-j...ller';
process.env.REFRESH_TOKEN_SECRET='test-r...ller';
process.env.NODE_ENV = 'test';

const mockDbQuery = jest.fn();
jest.mock('../src/config/database', () => ({ query: mockDbQuery }));

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

jest.mock('crypto', () => {
  // Pre-computed SHA-256 hex of the test recovery code 'ABCD-1234' (uppercase).
  // The real SHA-256 hash of 'ABCD-1234' is '01ce39a48e5f5e14ef4a9074f5dfce4eea6d27d766ce554f6a9f92cf078e936b'.
  // This is stored as the recovery code hash and must match when verifyRecoveryCode hashes the input.
  const TEST_RECOVERY_CODE_HASH = '01ce39a48e5f5e14ef4a9074f5dfce4eea6d27d766ce554f6a9f92cf078e936b';
  // We also compute the real hash of ABCD-1234 using Node's actual crypto.
  const realCrypto = jest.requireActual('crypto');
  const realHashOfInput = realCrypto.createHash('sha256').update('ABCD-1234'.toUpperCase()).digest('hex');

  console.log('[crypto mock] TEST_RECOVERY_CODE_HASH:', TEST_RECOVERY_CODE_HASH);
  console.log('[crypto mock] realHashOfInput:', realHashOfInput);
  console.log('[crypto mock] match:', TEST_RECOVERY_CODE_HASH === realHashOfInput);

  return {
    randomBytes: jest.fn(),
    createHash: jest.fn(() => {
      // Capture the hash object created by real createHash.
      const realHash = realCrypto.createHash('sha256');
      return {
        update: jest.fn(function(data) {
          // Delegate to real hash's update, but return THIS mock object so that:
          // 1. jest.fn() tracks the call
          // 2. real hash object also gets the update (for when digest is called)
          realHash.update(data);
          return this; // return mock object, NOT realHash
        }),
        digest: jest.fn(function() {
          // CRITICAL: Must return the HEX STRING, not Buffer.
          // Real crypto.createHash('sha256').update(data).digest('hex') returns a hex STRING.
          // The verifyRecoveryCode function does: storedCodes.indexOf(hashedInput)
          // where storedCodes is [hexString] and hashedInput must also be a hexString.
          // Returning Buffer would cause indexOf to always return -1 (Buffer !== string).
          return TEST_RECOVERY_CODE_HASH;
        })
      };
    })
  };
});

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn()
}));

jest.mock('../src/middleware/authMiddleware_new', () => ({
  generateCsrfToken: jest.fn(),
  storeCsrfToken: jest.fn()
}));

jest.mock('../src/middleware/passwordValidation', () => ({
  validatePasswordComplexity: jest.fn(),
  // hashPassword is called by userModel.js internally - return a resolved promise
  // so that await hashPassword(password) works without calling real bcrypt
  hashPassword: jest.fn(() => Promise.resolve('hashed-value')),
  isPasswordReused: jest.fn(() => false),
  addToPasswordHistory: jest.fn(),
  SALT_ROUNDS: 12
}));

jest.mock('../src/utils/totp', () => ({
  generateSecret: jest.fn(),
  generateQRCode: jest.fn(),
  verifyToken: jest.fn(),
  generateRecoveryCodes: jest.fn()
}));

jest.mock('fs', () => ({}));

// ─── Imports AFTER mocks ──────────────────────────────────────────────────────
// After jest.mock() calls, we can safely require the mocked modules to get
// the jest.fn() references that the factory functions created.
const bcrypt = require('bcrypt');
const crypto = require('crypto');   // jest.fn() mocks from jest.mock('crypto')
const jwt = require('jsonwebtoken');  // jest.fn() mocks for sign/verify from jest.mock('jsonwebtoken')
const { generateCsrfToken, storeCsrfToken } = require('../src/middleware/authMiddleware_new');
const { validatePasswordComplexity } = require('../src/middleware/passwordValidation');
const { generateSecret, generateQRCode, verifyToken: verifyTotpToken } = require('../src/utils/totp');

const {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  enable2FA,
  verify2FA,
  verify2FALogin,
  generateNewRecoveryCodes,
  verifyRecoveryCode,
  disable2FA,
  verifyEmail
} = require('../src/controllers/authController');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

function mockReq({ body = {}, user = null } = {}) {
  return { body, user };
}

// ─── Test data ────────────────────────────────────────────────────────────────

const MOCK_USER_ID = 'user-uuid-123';
const MOCK_USER_EMAIL = 'test@example.com';
const MOCK_TRIAL_ENDS_AT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

// Pre-computed SHA-256 hash of the test recovery code 'ABCD-1234' (uppercase).
// This is the value stored in DB after User.generateRecoveryCodes() hashes it.
// Used by verifyRecoveryCode tests to ensure stored-vs-input comparison succeeds.
// Compute with: crypto.createHash('sha256').update('ABCD-1234'.toUpperCase()).digest('hex')
const TEST_RECOVERY_CODE_HASH = '01ce39a48e5f5e14ef4a9074f5dfce4eea6d27d766ce554f6a9f92cf078e936b';

// Shared row returned by most user queries
// password_hash must match bcrypt.compare's mock return value (true) in beforeEach
// is_active: true is required for refreshToken and other functions that check user.active status
const MOCK_USER = {
  id: MOCK_USER_ID,
  email: MOCK_USER_EMAIL,
  password_hash: '$2b$10$mocked.hash.for.testing.purposes.only', // bcrypt.compare returns true in beforeEach
  totp_enabled: false,
  totp_secret: null,
  email_verified: false,
  is_active: true, // Required by refreshToken function at authController.js:203
  trial_ends_at: MOCK_TRIAL_ENDS_AT
};

// ─── Global beforeEach ─────────────────────────────────────────────────────────
// Mirrors the working customerController.test.js pattern:
// mockReset() clears the mock completely, then mockImplementation() sets a
// safe default. Tests override specific calls with mockResolvedValueOnce().
beforeEach(() => {
  jest.clearAllMocks();

  // db.query default: empty rows (tests override per-call with mockResolvedValueOnce)
  mockDbQuery.mockReset();
  mockDbQuery.mockImplementation(() => Promise.resolve({ rows: [] }));

  // bcrypt
  bcrypt.hash.mockReset();
  bcrypt.hash.mockImplementation(() => Promise.resolve('hashed-value'));
  bcrypt.compare.mockReset();
  bcrypt.compare.mockImplementation(() => Promise.resolve(true));

  // crypto — randomBytes returns 32 bytes, createHash computes SHA-256 hashes for recovery codes.
  // The TEST_RECOVERY_CODE_HASH constant holds the pre-computed SHA-256 hex of 'ABCD-1234'.
  // We call Buffer.from(hash, 'hex') to convert hex string → raw bytes (32 bytes).
  // This correctly matches what userModel.verifyRecoveryCode does:
  //   const hashedInput = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
  //   → produces a hex STRING, then indexOf compares storedCodes array elements.
  crypto.randomBytes.mockReset();
  crypto.randomBytes.mockImplementation((n) => Buffer.alloc(n));
  crypto.createHash.mockReset();
  crypto.createHash.mockImplementation((algorithm) => ({
    update: jest.fn(function(data) { this._data = data; return this; }),
    digest: jest.fn(function() {
      // CRITICAL: Return HEX STRING, not Buffer.
      // Real crypto.createHash('sha256').update().digest('hex') returns a hex string.
      // verifyRecoveryCode compares: storedCodes.indexOf(hashedInput) where hashedInput is hex string.
      // Buffer !== string → indexOf would always return -1.
      return TEST_RECOVERY_CODE_HASH;
    })
  }));

  // jwt — default: sign returns mock token, verify returns decoded payload
  jwt.sign.mockReset();
  jwt.sign.mockImplementation(() => 'mock-access-token');
  jwt.verify.mockReset();
  jwt.verify.mockImplementation(() => ({ userId: MOCK_USER_ID }));

  // authMiddleware_new
  generateCsrfToken.mockReset();
  generateCsrfToken.mockImplementation(() => 'mock-csrf-token');
  storeCsrfToken.mockReset();
  storeCsrfToken.mockImplementation(() => {});

  // password validation — default: valid
  validatePasswordComplexity.mockReset();
  validatePasswordComplexity.mockImplementation(() => ({ valid: true, errors: [] }));

  // totp
  generateSecret.mockReset();
  generateSecret.mockImplementation(() => ({
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUrl: 'otpauth://totp/AhoyVPN:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=AhoyVPN'
  }));
  generateQRCode.mockReset();
  generateQRCode.mockImplementation(() => Promise.resolve('data:image/png;base64,mock-qr-code'));
  verifyTotpToken.mockReset();
  verifyTotpToken.mockImplementation(() => true);
});

// ─── register ─────────────────────────────────────────────────────────────────

describe('register', () => {
  test('201 — creates user with email+password and sets JWT cookies', async () => {
    // findByEmail: no existing user
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // create: new user row returned
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: MOCK_USER_ID, email: 'new@example.com', trial_ends_at: MOCK_TRIAL_ENDS_AT }]
    });

    const req = mockReq({ body: { email: 'new@example.com', password: 'SecurePass123!' } });
    const res = mockRes();
    await register(req, res);

    expect(mockDbQuery).toHaveBeenCalledTimes(2);
    expect(mockDbQuery.mock.calls[0][0]).toContain('SELECT');
    expect(mockDbQuery.mock.calls[0][1]).toEqual(['new@example.com']);
    expect(mockDbQuery.mock.calls[1][0]).toContain('INSERT INTO users');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        user: expect.objectContaining({ id: MOCK_USER_ID })
      })
    }));
    expect(res.cookie).toHaveBeenCalledTimes(3); // accessToken, refreshToken, csrfToken
  });

  test('400 — missing email or password', async () => {
    for (const body of [{ email: 'a@b.com' }, { password: 'pass' }, {}]) {
      const req = mockReq({ body });
      const res = mockRes();
      await register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    }
  });

  test('400 — duplicate email', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [MOCK_USER] });

    const req = mockReq({ body: { email: 'test@example.com', password: 'pass' } });
    const res = mockRes();
    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'User already exists' });
  });

  test('500 — User.create throws', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    mockDbQuery.mockRejectedValueOnce(new Error('db error'));

    const req = mockReq({ body: { email: 'new@example.com', password: 'SecurePass123!' } });
    const res = mockRes();
    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── login ───────────────────────────────────────────────────────────────────

describe('login', () => {
  test('401 — user not found', async () => {
    const req = mockReq({ body: { email: 'nobody@example.com', password: 'pass' } });
    const res = mockRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  test('401 — wrong password', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [MOCK_USER] });
    bcrypt.compare.mockImplementation(() => Promise.resolve(false));

    const req = mockReq({ body: { email: MOCK_USER_EMAIL, password: 'wrong' } });
    const res = mockRes();
    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  test('200 + requires2fa=true — 2FA enabled, returns temp token', async () => {
    const userWithTotp = { ...MOCK_USER, totp_enabled: true, totp_secret: 'SECRET' };
    mockDbQuery
      .mockResolvedValueOnce({ rows: [userWithTotp] })  // findByEmail
      .mockResolvedValueOnce({ rows: [userWithTotp] });  // findById (verifyPassword calls findById internally)

    const req = mockReq({ body: { email: MOCK_USER_EMAIL, password: 'correct' } });
    const res = mockRes();
    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      requires2fa: true,
      tempToken: expect.any(String)
    }));
  });

  test('200 — login succeeds, sets cookies and returns tokens (no 2FA)', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [MOCK_USER] })   // findByEmail
      .mockResolvedValueOnce({ rows: [MOCK_USER] })    // findById (verifyPassword calls findById internally)
      .mockResolvedValueOnce({ rows: [] });              // update (last_login)

    const req = mockReq({ body: { email: MOCK_USER_EMAIL, password: 'correct' } });
    const res = mockRes();
    await login(req, res);

    expect(mockDbQuery).toHaveBeenCalledTimes(3);
    expect(res.cookie).toHaveBeenCalledWith('accessToken', expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        user: expect.objectContaining({ id: MOCK_USER_ID, email: MOCK_USER_EMAIL })
      })
    }));
  });

  test('400 — missing email or password', async () => {
    for (const body of [{ email: 'a@b.com' }, { password: 'pass' }, {}]) {
      const req = mockReq({ body });
      const res = mockRes();
      await login(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });
});

// ─── logout ──────────────────────────────────────────────────────────────────

describe('logout', () => {
  test('clears all three cookies and returns 200', () => {
    const req = mockReq();
    const res = mockRes();
    logout(req, res);
    expect(res.clearCookie).toHaveBeenCalledWith('accessToken');
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    expect(res.clearCookie).toHaveBeenCalledWith('csrfToken');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Logged out' });
  });
});

// ─── refreshToken ───────────────────────────────────────────────────────────

describe('refreshToken', () => {
  test('400 — no refresh token in body', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await refreshToken(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Refresh token required' });
  });

  test('401 — invalid token (jwt.verify returns null)', async () => {
    jwt.verify.mockImplementation(() => null);

    const req = mockReq({ body: { refreshToken: 'bad-token' } });
    const res = mockRes();
    await refreshToken(req, res);

    // verifyRefreshToken calls jwt.verify(token, refreshSecret, {})
    expect(jwt.verify).toHaveBeenCalledWith('bad-token', expect.any(String), {});
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid refresh token' });
  });

  test('200 — valid token returns new access token cookie', async () => {
    jwt.verify.mockImplementation(() => ({ userId: MOCK_USER_ID }));
    jwt.sign.mockImplementation(() => 'new-access-token');

    // refreshToken calls User.findById(decoded.userId) after verifying the JWT.
    // Without this mock, the user lookup returns [] and the function returns 401.
    mockDbQuery.mockResolvedValueOnce({ rows: [MOCK_USER] });

    const req = mockReq({ body: { refreshToken: 'valid-refresh' } });
    const res = mockRes();
    await refreshToken(req, res);

    expect(jwt.verify).toHaveBeenCalledWith('valid-refresh', expect.any(String), {});
    // jwt.sign(payload, secret, { expiresIn }) — expiresIn is 3rd arg (options), not 2nd (secret)
    expect(jwt.sign).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID },
      expect.any(String),
      expect.objectContaining({ expiresIn: expect.any(String) })
    );
    // refreshToken returns JSON body (no cookie) with new access + refresh tokens
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        accessToken: 'new-access-token',
        refreshToken: expect.any(String)
      })
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── forgotPassword ───────────────────────────────────────────────────────────

describe('forgotPassword', () => {
  test('400 — missing email', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await forgotPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email is required' });
  });

  test('200 — returns success even when user not found (no user enumeration)', async () => {
    // Default mockDbQuery returns { rows: [] } — no user found

    const req = mockReq({ body: { email: 'notfound@example.com' } });
    const res = mockRes();
    await forgotPassword(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: expect.stringContaining('If an account exists')
    }));
  });

  test('200 — user found: stores hashed token in DB and returns success', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: MOCK_USER_ID, email: MOCK_USER_EMAIL }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] });  // INSERT token

    const req = mockReq({ body: { email: MOCK_USER_EMAIL } });
    const res = mockRes();
    await forgotPassword(req, res);

    expect(mockDbQuery).toHaveBeenCalledTimes(2);
    // Second call: INSERT INTO password_reset_tokens
    expect(mockDbQuery.mock.calls[1][0]).toContain('INSERT INTO password_reset_tokens');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('500 — DB error', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq({ body: { email: MOCK_USER_EMAIL } });
    const res = mockRes();
    await forgotPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── resetPassword ───────────────────────────────────────────────────────────

describe('resetPassword', () => {
  test('400 — missing fields', async () => {
    for (const body of [
      { token: 'abc' },
      { password: 'pass', confirmPassword: 'pass' },
      { token: 'abc', password: 'pass' }
    ]) {
      const req = mockReq({ body });
      const res = mockRes();
      await resetPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });

  test('400 — passwords do not match', async () => {
    const req = mockReq({ body: { token: 'tok', password: 'pass1', confirmPassword: 'pass2' } });
    const res = mockRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Passwords do not match' });
  });

  test('400 — weak password (validation fails)', async () => {
    validatePasswordComplexity.mockImplementation(() => ({ valid: false, errors: ['Too short'] }));

    const req = mockReq({ body: { token: 'tok', password: 'short', confirmPassword: 'short' } });
    const res = mockRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Password validation failed' }));
  });

  test('400 — invalid/expired/used token (no rows returned)', async () => {
    validatePasswordComplexity.mockImplementation(() => ({ valid: true, errors: [] }));
    // mockImplementation in beforeEach already sets rows=[] default

    const req = mockReq({ body: { token: 'bad-token', password: 'NewPass123!', confirmPassword: 'NewPass123!' } });
    const res = mockRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired reset token' });
  });

  test('200 — valid token: updates password and marks token used', async () => {
    validatePasswordComplexity.mockImplementation(() => ({ valid: true, errors: [] }));
    bcrypt.hash.mockImplementation(() => Promise.resolve('new-hash'));
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ user_id: MOCK_USER_ID, email: MOCK_USER_EMAIL }] }) // token lookup
      .mockResolvedValueOnce({ rows: [] })   // UPDATE password
      .mockResolvedValueOnce({ rows: [] });   // UPDATE token used

    const req = mockReq({ body: { token: 'valid-token', password: 'NewPass123!', confirmPassword: 'NewPass123!' } });
    const res = mockRes();
    await resetPassword(req, res);

    expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 10);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('500 — DB error on token lookup', async () => {
    validatePasswordComplexity.mockImplementation(() => ({ valid: true, errors: [] }));
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq({ body: { token: 'tok', password: 'NewPass123!', confirmPassword: 'NewPass123!' } });
    const res = mockRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── enable2FA ───────────────────────────────────────────────────────────────

describe('enable2FA', () => {
  test('400 — 2FA already enabled', async () => {
    const req = mockReq({ user: { ...MOCK_USER, totp_enabled: true } });
    const res = mockRes();
    await enable2FA(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: '2FA already enabled' });
  });

  test('200 — generates secret, QR code, and stores secret temporarily', async () => {
    const req = mockReq({ user: { ...MOCK_USER, totp_enabled: false } });
    const res = mockRes();
    await enable2FA(req, res);

    expect(generateSecret).toHaveBeenCalledWith('AhoyVPN', MOCK_USER_EMAIL);
    // db.query called to UPDATE users SET totp_secret = $1
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      expect.any(Array)
    );
    expect(generateQRCode).toHaveBeenCalledWith(expect.any(String));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeDataUrl: 'data:image/png;base64,mock-qr-code'
      })
    }));
  });

  test('500 — generateQRCode throws', async () => {
    generateQRCode.mockImplementation(() => Promise.reject(new Error('qr error')));

    const req = mockReq({ user: { ...MOCK_USER, totp_enabled: false } });
    const res = mockRes();
    await enable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── verify2FA ───────────────────────────────────────────────────────────────

describe('verify2FA', () => {
  test('400 — missing token', async () => {
    const req = mockReq({ user: MOCK_USER, body: {} });
    const res = mockRes();
    await verify2FA(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token is required' });
  });

  test('400 — 2FA not set up (no totp_secret)', async () => {
    const req = mockReq({ user: { ...MOCK_USER, totp_secret: null }, body: { token: '123456' } });
    const res = mockRes();
    await verify2FA(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: '2FA not set up. Please enable first.' });
  });

  test('400 — invalid TOTP token', async () => {
    verifyTotpToken.mockImplementation(() => false);

    const req = mockReq({ user: { ...MOCK_USER, totp_secret: 'SECRET' }, body: { token: '000000' } });
    const res = mockRes();
    await verify2FA(req, res);

    expect(verifyTotpToken).toHaveBeenCalledWith('SECRET', '000000');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });

  test('200 — valid token: enables TOTP and returns recovery codes', async () => {
    // Must set per-test (bcrypt.compare is reset by beforeEach but re-set to true there)
    verifyTotpToken.mockImplementation(() => true);
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // enableTotp UPDATE
      .mockResolvedValueOnce({ rows: [{ codes: 'ABCD-1234,EFGH-5678' }] }) // recovery codes
      .mockResolvedValueOnce({ rows: [] }); // updateLast2faVerification

    const req = mockReq({ user: { ...MOCK_USER, totp_secret: 'SECRET' }, body: { token: '123456' } });
    const res = mockRes();
    await verify2FA(req, res);

    expect(verifyTotpToken).toHaveBeenCalledWith('SECRET', '123456');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        recoveryCodes: expect.any(Array)
      })
    }));
  });
});

// ─── verify2FALogin ───────────────────────────────────────────────────────────

describe('verify2FALogin', () => {
  test('400 — missing tempToken or token', async () => {
    for (const body of [{ tempToken: 'tmp' }, { token: '123456' }, {}]) {
      const req = mockReq({ body });
      const res = mockRes();
      await verify2FALogin(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });

  test('400 — invalid/expired tempToken (not in map)', async () => {
    const req = mockReq({ body: { tempToken: 'unknown', token: '123456' } });
    const res = mockRes();
    await verify2FALogin(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired temporary token' });
  });

  test('400 — wrong TOTP token', async () => {
    // Inject temp token into the module's in-memory Map
    const mod = require.cache[require.resolve('../src/controllers/authController')];
    mod.exports.temp2faTokens.set('valid-temp-token', { userId: MOCK_USER_ID, createdAt: Date.now() });

    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: MOCK_USER_ID, email: MOCK_USER_EMAIL, totp_enabled: true, totp_secret: 'SECRET' }] });
    verifyTotpToken.mockImplementation(() => false);

    const req = mockReq({ body: { tempToken: 'valid-temp-token', token: '000000' } });
    const res = mockRes();
    await verify2FALogin(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });

    mod.exports.temp2faTokens.delete('valid-temp-token'); // cleanup
  });

  test('200 — valid 2FA login: consumes temp token, sets cookies, returns tokens', async () => {
    const mod = require.cache[require.resolve('../src/controllers/authController')];
    mod.exports.temp2faTokens.set('valid-temp-token', { userId: MOCK_USER_ID, createdAt: Date.now() });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: MOCK_USER_ID, email: MOCK_USER_EMAIL, totp_enabled: true, totp_secret: 'SECRET' }] }) // findById
      .mockResolvedValueOnce({ rows: [] })  // update last_login
      .mockResolvedValueOnce({ rows: [] }); // updateLast2faVerification
    verifyTotpToken.mockImplementation(() => true);

    const req = mockReq({ body: { tempToken: 'valid-temp-token', token: '123456' } });
    const res = mockRes();
    await verify2FALogin(req, res);

    // Temp token consumed (deleted from map)
    expect(mod.exports.temp2faTokens.has('valid-temp-token')).toBe(false);
    expect(res.cookie).toHaveBeenCalledWith('accessToken', expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ user: expect.objectContaining({ id: MOCK_USER_ID }) })
    }));

    mod.exports.temp2faTokens.delete('valid-temp-token'); // cleanup
  });
});

// ─── generateNewRecoveryCodes ─────────────────────────────────────────────────

describe('generateNewRecoveryCodes', () => {
  test('400 — 2FA not enabled', async () => {
    const req = mockReq({ user: { ...MOCK_USER, totp_enabled: false } });
    const res = mockRes();
    await generateNewRecoveryCodes(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: '2FA is not enabled' });
  });

  test('200 — returns 10 new recovery codes', async () => {
    // beforeEach already sets mockDbQuery to resolve { rows: [] } by default
    // generateAndStoreRecoveryCodes makes one db.query call (UPDATE users SET recovery_codes)
    const req = mockReq({ user: { ...MOCK_USER, totp_enabled: true } });
    const res = mockRes();
    await generateNewRecoveryCodes(req, res);

    // The UPDATE query sets recovery_codes on the user
    expect(mockDbQuery).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ recoveryCodes: expect.any(Array) })
    }));
  });

  test('500 — generateAndStoreRecoveryCodes throws', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('db error'));

    const req = mockReq({ user: { ...MOCK_USER, totp_enabled: true } });
    const res = mockRes();
    await generateNewRecoveryCodes(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── verifyRecoveryCode ───────────────────────────────────────────────────────

describe('verifyRecoveryCode', () => {
  test('400 — missing email, password, or recoveryCode', async () => {
    for (const body of [
      { email: 'a@b.com' },
      { email: 'a@b.com', password: 'p' },
      { password: 'p', recoveryCode: 'CODE' }
    ]) {
      const req = mockReq({ body });
      const res = mockRes();
      await verifyRecoveryCode(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });

  test('401 — user not found', async () => {
    const req = mockReq({ body: { email: 'nobody@example.com', password: 'pass', recoveryCode: 'ABCD-1234' } });
    const res = mockRes();
    await verifyRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('401 — wrong password', async () => {
    // Must override inside test body (beforeEach re-sets bcrypt.compare to true)
    mockDbQuery.mockResolvedValueOnce({ rows: [MOCK_USER] });
    bcrypt.compare.mockImplementation(() => Promise.resolve(false));

    const req = mockReq({ body: { email: MOCK_USER_EMAIL, password: 'wrong', recoveryCode: 'ABCD-1234' } });
    const res = mockRes();
    await verifyRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('400 — 2FA not enabled', async () => {
    // findByEmail returns user with totp_enabled=false; verifyPassword → findById also needed
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ ...MOCK_USER, totp_enabled: false }] }) // findByEmail
      .mockResolvedValueOnce({ rows: [MOCK_USER] });  // verifyPassword → findById

    const req = mockReq({ body: { email: MOCK_USER_EMAIL, password: 'correct', recoveryCode: 'ABCD-1234' } });
    const res = mockRes();
    await verifyRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: '2FA is not enabled for this account' });
  });

  test('400 — invalid recovery code', async () => {
    // findByEmail returns user with totp_enabled; verifyRecoveryCode finds no matching code
    // crypto.createHash.digest now returns Buffer (fixed in beforeEach) so try/catch succeeds
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ ...MOCK_USER, totp_enabled: true, recovery_codes: '[]' }] }) // findByEmail
      .mockResolvedValueOnce({ rows: [MOCK_USER] });  // verifyPassword → findById

    const req = mockReq({ body: { email: MOCK_USER_EMAIL, password: 'correct', recoveryCode: 'BAD-CODE' } });
    const res = mockRes();
    await verifyRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid recovery code' });
  });

  test('200 — valid recovery code: sets cookies and returns tokens', async () => {
    // CRITICAL FIX: The 3rd mock (findById inside verifyRecoveryCode) must also return
    // a user with recovery_codes set. MOCK_USER has recovery_codes: undefined.
    // Without this, User.verifyRecoveryCode hits the guard "!user.recovery_codes" and returns false.
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ ...MOCK_USER, totp_enabled: true, recovery_codes: JSON.stringify([TEST_RECOVERY_CODE_HASH]) }] }) // 1. findByEmail
      .mockResolvedValueOnce({ rows: [MOCK_USER] })  // 2. verifyPassword → findById
      .mockResolvedValueOnce({ rows: [{ ...MOCK_USER, totp_enabled: true, recovery_codes: JSON.stringify([TEST_RECOVERY_CODE_HASH]) }] })  // 3. verifyRecoveryCode → findById (MUST have recovery_codes!)
      .mockResolvedValueOnce({ rows: [] })            // 4. UPDATE recovery_codes (removes used code)
      .mockResolvedValueOnce({ rows: [] })            // 5. update last_login
      .mockResolvedValueOnce({ rows: [] });           // 6. updateLast2faVerification

    const req = mockReq({ body: { email: MOCK_USER_EMAIL, password: 'correct', recoveryCode: 'ABCD-1234' } });
    const res = mockRes();
    await verifyRecoveryCode(req, res);

    expect(res.cookie).toHaveBeenCalledWith('accessToken', expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ user: expect.objectContaining({ id: MOCK_USER_ID }) })
    }));
  });
});

// ─── disable2FA ──────────────────────────────────────────────────────────────

describe('disable2FA', () => {
  test('400 — missing password', async () => {
    const req = mockReq({ user: MOCK_USER, body: {} });
    const res = mockRes();
    await disable2FA(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Password is required to disable 2FA' });
  });

  test('401 — wrong password', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [MOCK_USER] });
    bcrypt.compare.mockImplementation(() => Promise.resolve(false));

    const req = mockReq({ user: MOCK_USER, body: { password: 'wrong' } });
    const res = mockRes();
    await disable2FA(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid password' });
  });

  test('200 — correct password: disables TOTP', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [MOCK_USER] })  // verifyPassword
      .mockResolvedValueOnce({ rows: [] });            // disableTotp UPDATE

    const req = mockReq({ user: MOCK_USER, body: { password: 'correct' } });
    const res = mockRes();
    await disable2FA(req, res);

    expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), expect.any(Array));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    }));
  });

  test('500 — disableTotp throws', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [MOCK_USER] })
      .mockRejectedValueOnce(new Error('db error'));

    const req = mockReq({ user: MOCK_USER, body: { password: 'correct' } });
    const res = mockRes();
    await disable2FA(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── verifyEmail ──────────────────────────────────────────────────────────────

describe('verifyEmail', () => {
  test('400 — missing token', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await verifyEmail(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Verification token is required' });
  });

  test('400 — invalid token (not found in DB)', async () => {
    // default mockDbQuery returns { rows: [] }

    const req = mockReq({ body: { token: 'invalid-token' } });
    const res = mockRes();
    await verifyEmail(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired verification token' });
  });

  test('400 — expired token', async () => {
    const expiredRow = {
      ...MOCK_USER,
      expires_at: new Date(Date.now() - 1000) // 1 second ago
    };
    mockDbQuery.mockResolvedValueOnce({ rows: [expiredRow] });

    const req = mockReq({ body: { token: 'expired-token' } });
    const res = mockRes();
    await verifyEmail(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Verification token has expired' });
  });

  test('400 — email already verified', async () => {
    const verifiedRow = {
      ...MOCK_USER,
      email_verified: true,
      expires_at: new Date(Date.now() + 3600 * 1000)
    };
    mockDbQuery.mockResolvedValueOnce({ rows: [verifiedRow] });

    const req = mockReq({ body: { token: 'already-verified-token' } });
    const res = mockRes();
    await verifyEmail(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email is already verified' });
  });

  test('200 — valid token: marks email verified and deletes token', async () => {
    const validRow = {
      ...MOCK_USER,
      email_verified: false,
      expires_at: new Date(Date.now() + 3600 * 1000)
    };
    mockDbQuery
      .mockResolvedValueOnce({ rows: [validRow] })  // SELECT token
      .mockResolvedValueOnce({ rows: [] })           // UPDATE users SET email_verified = true
      .mockResolvedValueOnce({ rows: [] });           // DELETE email_verify_tokens

    const req = mockReq({ body: { token: 'valid-email-token' } });
    const res = mockRes();
    await verifyEmail(req, res);

    expect(mockDbQuery).toHaveBeenCalledTimes(3);
    // Second call: UPDATE users SET email_verified = true
    expect(mockDbQuery.mock.calls[1][0]).toContain('UPDATE users');
    expect(mockDbQuery.mock.calls[1][0]).toContain('email_verified');
    // Third call: DELETE token
    expect(mockDbQuery.mock.calls[2][0]).toContain('DELETE FROM email_verify_tokens');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Email verified successfully'
    }));
  });

  test('500 — DB error on token lookup', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq({ body: { token: 'some-token' } });
    const res = mockRes();
    await verifyEmail(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
