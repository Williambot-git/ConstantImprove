/**
 * affiliateController unit tests
 *
 * Tests all 14 exported functions from affiliateController.js.
 *
 * Dependencies mocked:
 *   - argon2 (verify, hash)       — password verification and hashing
 *   - jsonwebtoken (sign)         — JWT access/refresh token generation
 *   - db.query                    — all database operations
 *   - setCsrfTokenCookie          — from authMiddleware_new
 *   - crypto.randomBytes           — for regenerateRecoveryKit (global.crypto, not require)
 *
 * Mock strategy (same as authController.test.js):
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

const mockDbQuery = jest.fn();
jest.mock('../src/config/database', () => ({ query: mockDbQuery }));

// argon2: verify(passwordHash, password) → Promise<boolean>
jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn()
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn()
}));

// setCsrfTokenCookie from authMiddleware_new
jest.mock('../src/middleware/authMiddleware_new', () => ({
  setCsrfTokenCookie: jest.fn()
}));

// affiliateCommissionService — getMinimumPayoutCents called by getMetrics
jest.mock('../src/services/affiliateCommissionService', () => ({
  getMinimumPayoutCents: jest.fn()
}));

// crypto for regenerateRecoveryKit's crypto.randomBytes
// IMPORTANT: affiliateController.js uses the Node.js GLOBAL crypto object (no require statement).
// global.crypto is the Web Crypto API (randomBytes = undefined), NOT require('crypto').
// We must mock global.crypto.randomBytes directly in beforeEach.
const mockGlobalRandomBytes = jest.fn((n) => Buffer.alloc(n));

// ─── Imports after mocks ───────────────────────────────────────────────────────
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { setCsrfTokenCookie } = require('../src/middleware/authMiddleware_new');
const { getMinimumPayoutCents } = require('../src/services/affiliateCommissionService');

const {
  login,
  logout,
  createCode,
  getCodes,
  deleteCode,
  generateAffiliateLink,
  getMetrics,
  getEarnings,
  getReferralPerformance,
  getPayoutHistory,
  requestPayout,
  changePassword,
  getRecoveryKit,
  regenerateRecoveryKit
} = require('../src/controllers/affiliateController');

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
    ...overrides
  };
}

// Shared affiliate row returned by login queries
const MOCK_AFFILIATE = {
  id: 'affiliate-uuid-123',
  user_id: 'user-uuid-456',
  username: 'testaffiliate',
  password_hash: '$2b$10$mock.hash.for.testing', // argon2.verify returns true in beforeEach
  status: 'active'
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

  // setCsrfTokenCookie default: no-op
  setCsrfTokenCookie.mockReset();
  setCsrfTokenCookie.mockImplementation(() => {});

  // getMinimumPayoutCents default: $10 minimum (1000 cents)
  getMinimumPayoutCents.mockReset();
  getMinimumPayoutCents.mockImplementation(() => Promise.resolve(1000));

  // Mock global.crypto.randomBytes (used by affiliateController, not require('crypto'))
  mockGlobalRandomBytes.mockReset();
  mockGlobalRandomBytes.mockImplementation((n) => Buffer.alloc(n));
  if (typeof global.crypto !== 'undefined') {
    global.crypto.randomBytes = mockGlobalRandomBytes;
  } else {
    Object.defineProperty(global, 'crypto', {
      value: { randomBytes: mockGlobalRandomBytes },
      writable: true,
      configurable: true
    });
  }
});

// ─── login ───────────────────────────────────────────────────────────────────

describe('login', () => {
  test('200 — successful login sets cookies and returns affiliate code', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [MOCK_AFFILIATE] });

    const req = mockReq({ body: { username: 'testaffiliate', password: 'correct-password' } });
    const res = mockRes();
    await login(req, res);

    // DB: SELECT affiliate by username + status='active'
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expect(mockDbQuery.mock.calls[0][0]).toContain("FROM affiliates");
    expect(mockDbQuery.mock.calls[0][1]).toEqual(['testaffiliate']);

    // argon2.verify called with stored hash and submitted password
    expect(argon2.verify).toHaveBeenCalledWith(MOCK_AFFILIATE.password_hash, 'correct-password');

    // Cookies: accessToken (15m) + refreshToken (7d)
    expect(res.cookie).toHaveBeenCalledWith('accessToken', expect.any(String), expect.objectContaining({
      httpOnly: true,
      maxAge: 15 * 60 * 1000
    }));
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.objectContaining({
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }));

    // CSRF cookie set
    expect(setCsrfTokenCookie).toHaveBeenCalled();

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        affiliateCode: MOCK_AFFILIATE.username,
        message: 'Login successful'
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

  test('401 — wrong password', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [MOCK_AFFILIATE] });
    argon2.verify.mockImplementation(() => Promise.resolve(false)); // wrong password

    const req = mockReq({ body: { username: 'testaffiliate', password: 'wrong-password' } });
    const res = mockRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  test('500 — database error throws', async () => {
    mockDbQuery.mockRejectedValue(new Error('db connection failed'));

    const req = mockReq({ body: { username: 'user', password: 'pass' } });
    const res = mockRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
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
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Logged out successfully' });
  });
});

// ─── createCode ───────────────────────────────────────────────────────────────

describe('createCode', () => {
  const validBody = {
    code: 'SAVE20',
    description: '20% off',
    discountType: 'percent',
    discountValue: 20,
    maxUses: 100,
    expiresAt: '2027-01-01',
    planKeys: ['vpn-monthly']
  };

  test('201 — creates promo code and affiliate link successfully', async () => {
    // Check if code already exists → no
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT promo_code → returns new row
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'promo-uuid', code: 'SAVE20' }] });
    // INSERT affiliate_link → returns new link
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'link-uuid' }] });

    const req = mockReq({ body: validBody });
    const res = mockRes();
    await createCode(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Promo code created successfully'
    }));
  });

  test('400 — missing required fields', async () => {
    for (const body of [
      { description: 'x', discountType: 'percent', discountValue: 10 },
      { code: 'CODE', discountType: 'percent' },
      { code: 'CODE', discountValue: 10 }
    ]) {
      const req = mockReq({ body });
      const res = mockRes();
      await createCode(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });

  test('400 — invalid discountType', async () => {
    const req = mockReq({ body: { ...validBody, discountType: 'invalid' } });
    const res = mockRes();
    await createCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid discount type' });
  });

  test('400 — promo code already exists', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] }); // code found

    const req = mockReq({ body: validBody });
    const res = mockRes();
    await createCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Promo code already exists' });
  });

  test('201 — creates code with fixed discount and stores affiliate_link_discounts', async () => {
    // Check if code exists → no
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT promo_code
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'promo-uuid', code: 'FIXED10' }] });
    // INSERT affiliate_link
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'link-uuid' }] });
    // INSERT affiliate_link_discounts (discountCents > 0 for fixed type)
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ body: { ...validBody, code: 'FIXED10', discountType: 'fixed', discountValue: 500 } });
    const res = mockRes();
    await createCode(req, res);

    // Verify affiliate_link_discounts was inserted (4th DB call)
    expect(mockDbQuery).toHaveBeenCalledTimes(4);
    expect(mockDbQuery.mock.calls[3][0]).toContain('affiliate_link_discounts');
  });

  test('201 — affiliate link creation error is caught and does not fail request', async () => {
    // Check if code exists → no
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT promo_code succeeds
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'promo-uuid', code: 'PARTIAL' }] });
    // INSERT affiliate_link FAILS → caught by try/catch, logged, request still succeeds
    mockDbQuery.mockRejectedValueOnce(new Error('link creation failed'));

    const req = mockReq({ body: validBody });
    const res = mockRes();
    await createCode(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('500 — promo_code INSERT fails', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // not existing
    mockDbQuery.mockRejectedValueOnce(new Error('db error'));

    const req = mockReq({ body: validBody });
    const res = mockRes();
    await createCode(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── getCodes ─────────────────────────────────────────────────────────────────

describe('getCodes', () => {
  test('200 — returns promo codes with use counts', async () => {
    const rows = [
      { id: 'code-1', code: 'SAVE20', uses_count: '5' },
      { id: 'code-2', code: 'FREE10', uses_count: '0' }
    ];
    mockDbQuery.mockResolvedValueOnce({ rows });

    const req = mockReq();
    const res = mockRes();
    await getCodes(req, res);

    expect(mockDbQuery.mock.calls[0][0]).toContain('FROM promo_codes');
    expect(mockDbQuery.mock.calls[0][1]).toEqual(['affiliate-uuid-123']);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: rows });
  });

  test('500 — database error', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq();
    const res = mockRes();
    await getCodes(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── deleteCode ────────────────────────────────────────────────────────────────

describe('deleteCode', () => {
  test('200 — deletes via affiliate_links (new system)', async () => {
    // affiliate_links lookup → found
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'link-123', code: 'TESTCODE' }] });
    // DELETE affiliate_link_discounts
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // DELETE affiliate_links
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ params: { id: 'link-123' } });
    const res = mockRes();
    await deleteCode(req, res);

    expect(mockDbQuery).toHaveBeenCalledTimes(3);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Code "TESTCODE" deleted' });
  });

  test('200 — deletes via promo_codes (legacy fallback)', async () => {
    // affiliate_links lookup → not found
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // promo_codes lookup → found
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'promo-123', code: 'LEGACY10' }] });
    // DELETE affiliate_link_discounts
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // DELETE affiliate_links
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // DELETE promo_codes
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ params: { id: 'promo-123' } });
    const res = mockRes();
    await deleteCode(req, res);

    expect(mockDbQuery).toHaveBeenCalledTimes(5);
  });

  test('404 — code not found in either table', async () => {
    // affiliate_links lookup → not found
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // promo_codes lookup → not found
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ params: { id: 'nonexistent' } });
    const res = mockRes();
    await deleteCode(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Code not found' });
  });

  test('500 — database error', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq({ params: { id: '123' } });
    const res = mockRes();
    await deleteCode(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── generateAffiliateLink ────────────────────────────────────────────────────

describe('generateAffiliateLink', () => {
  test('200 — returns shareable link using affiliate username', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ username: 'testaffiliate' }] });

    const req = mockReq();
    const res = mockRes();
    await generateAffiliateLink(req, res);

    expect(mockDbQuery.mock.calls[0][0]).toContain('SELECT username FROM affiliates');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        code: 'testaffiliate',
        link: expect.stringContaining('/affiliate/testaffiliate'),
        status: 'active'
      })
    });
  });

  test('404 — affiliate not found', async () => {
    // Default mockDbQuery returns { rows: [] }

    const req = mockReq();
    const res = mockRes();
    await generateAffiliateLink(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
  });

  test('500 — database error', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq();
    const res = mockRes();
    await generateAffiliateLink(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── getMetrics ────────────────────────────────────────────────────────────────

describe('getMetrics', () => {
  test('200 — returns signups, conversions, earnings, and links', async () => {
    // SELECT affiliate username
    mockDbQuery.mockResolvedValueOnce({ rows: [{ username: 'testaffiliate' }] });
    // SELECT referrals (signups, active_referrals)
    mockDbQuery.mockResolvedValueOnce({ rows: [{ signups: '10', active_referrals: '3' }] });
    // SELECT transactions (earnings)
    mockDbQuery.mockResolvedValueOnce({ rows: [{ paid_cents: '5000', pending_cents: '1500' }] });
    // SELECT payout_config (minimum_payout_cents)
    mockDbQuery.mockResolvedValueOnce({ rows: [{ amount: '1000' }] });

    const req = mockReq();
    const res = mockRes();
    await getMetrics(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        signups: 10,
        conversions: 3,
        activeSubscriptions: 3,
        earnings: {
          total: '65.00',
          pending: '15.00',
          paid: '50.00'
        },
        conversionRate: 30, // 3/10 * 100 rounded
        minimumPayoutCents: 1000,
        availableToCashOut: '15.00'
      })
    }));
  });

  test('200 — zero signups returns zero conversion rate', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ username: 'newaffiliate' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ signups: '0', active_referrals: '0' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ paid_cents: '0', pending_cents: '0' }] });
    // SELECT payout_config (minimum_payout_cents)
    mockDbQuery.mockResolvedValueOnce({ rows: [{ amount: '1000' }] });

    const req = mockReq();
    const res = mockRes();
    await getMetrics(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        signups: 0,
        conversionRate: 0,
        minimumPayoutCents: 1000,
        availableToCashOut: '0.00'
      })
    }));
  });

  test('200 — defaults to $10 minimum when payout_config not set', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ username: 'testaffiliate' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ signups: '5', active_referrals: '2' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ paid_cents: '2000', pending_cents: '500' }] });
    // payout_config returns empty — should default to 1000 cents ($10)
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq();
    const res = mockRes();
    await getMetrics(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        minimumPayoutCents: 1000,
        availableToCashOut: '5.00'
      })
    }));
  });

  test('500 — database error', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq();
    const res = mockRes();
    await getMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── getEarnings ───────────────────────────────────────────────────────────────

describe('getEarnings', () => {
  test('200 — returns summary and ledger', async () => {
    const summaryRows = [{ paid_out_cents: '10000', pending_payout_cents: '2500', total_earned_cents: '12500' }];
    const ledgerRows = [
      { id: 'tx-1', created_at: new Date(), type: 'commission', amount_cents: 500, description: 'Referral signup', paid_out_at: null }
    ];
    mockDbQuery.mockResolvedValueOnce({ rows: summaryRows });
    mockDbQuery.mockResolvedValueOnce({ rows: ledgerRows });

    const req = mockReq();
    const res = mockRes();
    await getEarnings(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        summary: summaryRows[0],
        ledger: ledgerRows
      }
    });
  });

  test('500 — database error', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq();
    const res = mockRes();
    await getEarnings(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── getReferralPerformance ───────────────────────────────────────────────────

describe('getReferralPerformance', () => {
  test('200 — returns paginated referrals with pagination metadata', async () => {
    const referralsRows = [
      { id: 'ref-1', plan: 'vpn-monthly', amount_cents: 999, status: 'active', created_at: new Date() }
    ];
    // SELECT referrals (paginated)
    mockDbQuery.mockResolvedValueOnce({ rows: referralsRows });
    // SELECT COUNT(*) total
    mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '42' }] });

    const req = mockReq({ query: { page: '2', limit: '10' } });
    const res = mockRes();
    await getReferralPerformance(req, res);

    expect(mockDbQuery.mock.calls[0][1]).toEqual(['affiliate-uuid-123', 10, 10]); // offset = (2-1)*10
    // Note: controller calls res.json() directly (Express default 200), not res.status(200).json()
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: referralsRows,
      pagination: {
        page: 2,
        limit: 10,
        total: 42,
        pages: 5 // ceil(42/10)
      }
    });
  });

  test('200 — uses default page=1, limit=20', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const req = mockReq({ query: {} });
    const res = mockRes();
    await getReferralPerformance(req, res);

    expect(mockDbQuery.mock.calls[0][1]).toEqual(['affiliate-uuid-123', 20, 0]);
  });

  test('500 — database error', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq({ query: {} });
    const res = mockRes();
    await getReferralPerformance(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── getPayoutHistory ─────────────────────────────────────────────────────────

describe('getPayoutHistory', () => {
  test('200 — returns payout requests', async () => {
    const rows = [
      { id: 'payout-1', amount_cents: 10000, status: 'paid', requested_at: new Date(), processed_at: new Date() }
    ];
    mockDbQuery.mockResolvedValueOnce({ rows });

    const req = mockReq();
    const res = mockRes();
    await getPayoutHistory(req, res);

    // Note: getPayoutHistory calls res.json() directly (Express default 200), not res.status(200).json()
    expect(res.json).toHaveBeenCalledWith({ success: true, data: rows });
  });

  test('500 — database error', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq();
    const res = mockRes();
    await getPayoutHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── requestPayout ────────────────────────────────────────────────────────────

describe('requestPayout', () => {
  test('201 — creates payout request successfully', async () => {
    // SELECT pending balance
    mockDbQuery.mockResolvedValueOnce({ rows: [{ pending_payout_cents: '15000' }] }); // $150
    // INSERT payout_request
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'payout-new', amount_cents: 10000, status: 'pending' }] });

    const req = mockReq({ body: { amount: 100 } }); // $100
    const res = mockRes();
    await requestPayout(req, res);

    // Note: requestPayout calls res.json() directly (Express default 200), not res.status(201).json()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: expect.stringContaining('Email Ahoyvpn@ahoyvpn.net')
    }));
  });

  test('400 — amount must be greater than 0', async () => {
    for (const amount of [0, -50]) {
      const req = mockReq({ body: { amount } });
      const res = mockRes();
      await requestPayout(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Amount must be greater than 0' });
    }
  });

  test('400 — below minimum $50 payout', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ pending_payout_cents: '10000' }] }); // $100 balance

    const req = mockReq({ body: { amount: 25 } }); // $25
    const res = mockRes();
    await requestPayout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Minimum payout is $50' });
  });

  test('400 — amount exceeds available balance', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ pending_payout_cents: '5000' }] }); // $50 balance

    const req = mockReq({ body: { amount: 75 } }); // $75 > $50
    const res = mockRes();
    await requestPayout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Amount exceeds available balance' });
  });

  // Line 451: parseInt(null) || 0 — pending_payout_cents can be null (COALESCE in SQL, but edge case if row is null)
  test('400 — zero balance (parseInt null-or-zero fallback)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ pending_payout_cents: null }] }); // null — COALESCE would catch this but guard anyway

    const req = mockReq({ body: { amount: 10 } }); // $10
    const res = mockRes();
    await requestPayout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Minimum payout is $50' });
  });

  test('500 — database error', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq({ body: { amount: 100 } });
    const res = mockRes();
    await requestPayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── changePassword ────────────────────────────────────────────────────────────

describe('changePassword', () => {
  test('200 — password changed successfully', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-uuid-456', password_hash: MOCK_AFFILIATE.password_hash }] });
    argon2.verify.mockImplementation(() => Promise.resolve(true));
    argon2.hash.mockImplementation(() => Promise.resolve('new-hash'));
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE

    const req = mockReq({ body: { oldPassword: 'old-pass', newPassword: 'NewSecurePass123!' } });
    const res = mockRes();
    await changePassword(req, res);

    expect(argon2.verify).toHaveBeenCalledWith(MOCK_AFFILIATE.password_hash, 'old-pass');
    expect(argon2.hash).toHaveBeenCalledWith('NewSecurePass123!');
    // Note: changePassword calls res.json() directly (Express default 200), not res.status(200).json()
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Password changed successfully' });
  });

  test('400 — missing old or new password', async () => {
    for (const body of [{ oldPassword: 'old' }, { newPassword: 'new' }, {}]) {
      const req = mockReq({ body });
      const res = mockRes();
      await changePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });

  test('404 — affiliate not found', async () => {
    // Default mockDbQuery returns { rows: [] }

    const req = mockReq({ body: { oldPassword: 'old', newPassword: 'new' } });
    const res = mockRes();
    await changePassword(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
  });

  test('401 — incorrect old password', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-uuid-456', password_hash: MOCK_AFFILIATE.password_hash }] });
    argon2.verify.mockImplementation(() => Promise.resolve(false)); // wrong password

    const req = mockReq({ body: { oldPassword: 'wrong', newPassword: 'new' } });
    const res = mockRes();
    await changePassword(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Current password is incorrect' });
  });

  test('500 — database error on SELECT', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq({ body: { oldPassword: 'old', newPassword: 'new' } });
    const res = mockRes();
    await changePassword(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── getRecoveryKit ────────────────────────────────────────────────────────────

describe('getRecoveryKit', () => {
  test('200 — returns active recovery kit', async () => {
    // SELECT affiliate for user_id
    mockDbQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-uuid-456' }] });
    // SELECT active recovery kit
    const kitRow = { id: 'kit-1', created_at: new Date(), last_shown_at: new Date() };
    mockDbQuery.mockResolvedValueOnce({ rows: [kitRow] });

    const req = mockReq();
    const res = mockRes();
    await getRecoveryKit(req, res);

    // Note: getRecoveryKit calls res.json() directly (Express default 200), not res.status(200).json()
    expect(res.json).toHaveBeenCalledWith({ success: true, data: kitRow });
  });

  test('404 — affiliate not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // affiliate not found

    const req = mockReq();
    const res = mockRes();
    await getRecoveryKit(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
  });

  test('404 — no active recovery kit found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-uuid-456' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no active kit

    const req = mockReq();
    const res = mockRes();
    await getRecoveryKit(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'No active recovery kit found' });
  });

  test('500 — database error', async () => {
    mockDbQuery.mockRejectedValue(new Error('db error'));

    const req = mockReq();
    const res = mockRes();
    await getRecoveryKit(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── regenerateRecoveryKit ───────────────────────────────────────────────────

describe('regenerateRecoveryKit', () => {
  test('200 — deactivates old kit, creates new one, returns raw kit value', async () => {
    // Only 3 db.query calls: SELECT affiliate, UPDATE deactivate, INSERT new kit
    // Note: We use mockImplementation to provide sequential responses (more reliable than mockResolvedValueOnce
    // when beforeEach sets a default mockImplementation). Set all 3 responses upfront.
    mockDbQuery.mockImplementation(() =>
      Promise.resolve({ rows: [] })
    );
    // Override the first 3 calls with specific responses using mockResolvedValueOnce chains
    // Call 1: SELECT affiliate
    mockDbQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-uuid-456', password_hash: MOCK_AFFILIATE.password_hash }] });
    // Call 2: UPDATE deactivate old kits
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // Call 3: INSERT new kit
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    // Note: crypto.randomBytes is already mocked via global.crypto in beforeEach
    // (global.crypto.randomBytes = mockGlobalRandomBytes)

    const req = mockReq({ body: { password: 'correct-password' } });
    const res = mockRes();
    await regenerateRecoveryKit(req, res);

    // Verify all 3 db.query calls were made
    expect(mockDbQuery).toHaveBeenCalledTimes(3);

    // Verify UPDATE deactivates old kits (contains UPDATE)
    const updateCall = mockDbQuery.mock.calls.find(([sql]) => sql.includes('UPDATE'));
    expect(updateCall).toBeDefined();

    // Verify INSERT creates new kit (contains INSERT INTO recovery_kits)
    const insertCall = mockDbQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO recovery_kits'));
    expect(insertCall).toBeDefined();

    // Note: regenerateRecoveryKit calls res.json() directly (Express default 200), not res.status(200).json()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { recoveryKit: '0'.repeat(32) },
      message: 'Recovery kit regenerated successfully'
    }));
  });

  test('400 — password not provided', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await regenerateRecoveryKit(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Password required' });
  });

  test('404 — affiliate not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ body: { password: 'pass' } });
    const res = mockRes();
    await regenerateRecoveryKit(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
  });

  test('401 — incorrect password', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-uuid-456', password_hash: MOCK_AFFILIATE.password_hash }] });
    argon2.verify.mockImplementation(() => Promise.resolve(false));

    const req = mockReq({ body: { password: 'wrong' } });
    const res = mockRes();
    await regenerateRecoveryKit(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Password is incorrect' });
  });

  test('500 — database error on INSERT', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-uuid-456', password_hash: MOCK_AFFILIATE.password_hash }] });
    argon2.verify.mockImplementation(() => Promise.resolve(true));
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE succeeds
    mockDbQuery.mockRejectedValueOnce(new Error('db error')); // INSERT fails

    const req = mockReq({ body: { password: 'correct' } });
    const res = mockRes();
    await regenerateRecoveryKit(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
