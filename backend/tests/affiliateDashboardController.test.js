/**
 * affiliateDashboardController unit tests
 *
 * Tests all 10 exported functions from affiliateDashboardController.js:
 *   getMetrics, getLinks, generateLink, getReferrals, getTransactions,
 *   getPayoutRequests, requestPayout, createCode, deleteCode
 *
 * Mock strategy:
 *   - mockImplementation in beforeEach (NOT mockResolvedValueOnce) for default behavior
 *   - mockResolvedValueOnce per test for specific responses
 *   - Why: jest.clearAllMocks() does NOT reset mockImplementation defaults,
 *     but DOES interfere with mockResolvedValueOnce in edge cases
 *
 * IMPORTANT: affiliateDashboardController.js uses the Node.js GLOBAL crypto object
 * (require('crypto') at module scope → global.crypto in Node.js).
 * We mock global.crypto.randomBytes in beforeEach.
 */

process.env.NODE_ENV = 'test';

const mockDbQuery = jest.fn();

// Mock global.crypto.randomBytes — used in generateLink for auto-code generation
// affiliateDashboardController calls require('crypto') at the top, which in Node.js
// resolves to the global crypto module.
global.crypto = { randomBytes: jest.fn((n) => Buffer.alloc(n)) };

jest.mock('../src/config/database', () => ({ query: mockDbQuery }));

// ─── Imports after mocks ───────────────────────────────
const {
  getMetrics,
  getLinks,
  generateLink,
  getReferrals,
  getTransactions,
  getPayoutRequests,
  requestPayout,
  createCode,
  deleteCode
} = require('../src/controllers/affiliateDashboardController');

// Mock affiliateCommissionService.getMinimumPayoutCents (called by requestPayout)
// Must be mocked BEFORE the controller module loads since it requires the service.
const mockGetMinimumPayoutCents = jest.fn();
jest.mock('../src/services/affiliateCommissionService', () => ({
  getMinimumPayoutCents: (...args) => mockGetMinimumPayoutCents(...args)
}));

// ─── Shared mock req/res helpers ───────────────────────
const mockReq = (overrides = {}) => ({
  affiliateId: 1,
  params: {},
  query: {},
  body: {},
  ...overrides
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// ─── beforeEach ─────────────────────────────────────────
// IMPORTANT: Use mockImplementation (not mockResolvedValueOnce) for the default db mock.
// jest.clearAllMocks() clears call history but NOT mockImplementation defaults.
// mockResolvedValueOnce queues are also cleared by clearAllMocks.
beforeEach(() => {
  jest.clearAllMocks();
  // Default db query: return empty rows
  mockDbQuery.mockImplementation(() => Promise.resolve({ rows: [] }));
  // Default minimum payout: $10 (1000 cents) — DB-backed via affiliateCommissionService
  mockGetMinimumPayoutCents.mockResolvedValue(1000);
  // Reset global crypto mock to predictable auto-generated code
  global.crypto.randomBytes.mockImplementation((n) => Buffer.alloc(n));
});

// ============================================================
// getMetrics
// ============================================================
describe('getMetrics', () => {
  test('returns aggregated metrics from transactions and referrals', async () => {
    // Override specific queries for this test
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ total_earned_cents: '1500', total_paid_cents: '500', pending_cents: '1000' }] })
      .mockResolvedValueOnce({ rows: [{ total_referrals: '20', active_referrals: '15' }] })
      .mockResolvedValueOnce({ rows: [{ this_month: '3' }] })
      .mockResolvedValueOnce({ rows: [{ held_cents: '400' }] });

    const res = mockRes();
    await getMetrics(mockReq({ affiliateId: 1 }), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        totalSignups: 20,
        signupsThisMonth: 3,
        activeReferrals: 15,
        totalEarned: 15.00,
        pendingPayout: 10.00,
        availableToCashOut: 6.00,  // 1000 - 400 = 600 cents
        heldAmount: 4.00
      }
    });
  });

  test('handles empty database (zero values)', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ total_earned_cents: '0', total_paid_cents: '0', pending_cents: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total_referrals: '0', active_referrals: '0' }] })
      .mockResolvedValueOnce({ rows: [{ this_month: '0' }] })
      .mockResolvedValueOnce({ rows: [{ held_cents: '0' }] });

    const res = mockRes();
    await getMetrics(mockReq({ affiliateId: 1 }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.data.totalSignups).toBe(0);
    expect(call.data.availableToCashOut).toBe(0);
    expect(call.data.heldAmount).toBe(0);
  });

  test('availableToCashOut is max(0, pending - held)', async () => {
    // pending = 200, held = 500 → available should be 0 (not negative)
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ total_earned_cents: '500', total_paid_cents: '0', pending_cents: '200' }] })
      .mockResolvedValueOnce({ rows: [{ total_referrals: '5', active_referrals: '2' }] })
      .mockResolvedValueOnce({ rows: [{ this_month: '1' }] })
      .mockResolvedValueOnce({ rows: [{ held_cents: '500' }] });

    const res = mockRes();
    await getMetrics(mockReq({ affiliateId: 1 }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.data.availableToCashOut).toBe(0);
  });

  test('returns 500 on database error', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB connection failed'));

    const res = mockRes();
    await getMetrics(mockReq({ affiliateId: 1 }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

// ============================================================
// getLinks
// ============================================================
describe('getLinks', () => {
  test('returns affiliate links with signups counts', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          { id: '1', code: 'MYCODE', url: 'https://ahoyvpn.net/affiliate/MYCODE', clicks: 10, active: true, created_at: '2026-01-01', discount_cents: '50' },
          { id: '2', code: 'OTHER', url: 'https://ahoyvpn.net/affiliate/OTHER', clicks: 5, active: true, created_at: '2026-01-02', discount_cents: '0' }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { referral_link_id: '1', signups: '7' },
          { referral_link_id: '2', signups: '2' }
        ]
      });

    const res = mockRes();
    await getLinks(mockReq({ affiliateId: 1 }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.success).toBe(true);
    expect(call.data).toHaveLength(2);
    expect(call.data[0]).toMatchObject({ code: 'MYCODE', signups: 7, discount_cents: '50' });
    expect(call.data[1]).toMatchObject({ code: 'OTHER', signups: 2, discount_cents: '0' });
  });

  test('handles link with no signups (no matching rows)', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{ id: '99', code: 'ZEROSIGN', url: 'https://ahoyvpn.net/affiliate/ZEROSIGN', clicks: 0, active: true, created_at: '2026-01-01', discount_cents: '25' }]
      })
      .mockResolvedValueOnce({ rows: [] }); // no referrals for link 99

    const res = mockRes();
    await getLinks(mockReq({ affiliateId: 1 }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.data[0].signups).toBe(0);
  });

  test('returns 500 on database error', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = mockRes();
    await getLinks(mockReq({ affiliateId: 1 }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================
// generateLink
// ============================================================
describe('generateLink', () => {
  test('creates link with custom code when code is unique', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // uniqueness check: not found
      .mockResolvedValueOnce({
        rows: [{ id: '5', code: 'MYCODE', url: 'https://ahoyvpn.net/affiliate/MYCODE', clicks: 0, active: true, created_at: '2026-01-01' }]
      });

    const res = mockRes();
    await generateLink(mockReq({ affiliateId: 1, body: { customCode: 'MYCODE' } }), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ code: 'MYCODE', signups: 0 })
    });
  });

  test('returns 400 when custom code is already in use', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] }); // found → conflict

    const res = mockRes();
    await generateLink(mockReq({ affiliateId: 1, body: { customCode: 'TAKEN' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Code already in use' });
  });

  test('generates random 8-char hex code when no customCode provided', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // unique on first try
      .mockResolvedValueOnce({
        rows: [{ id: '6', code: '00000000', url: 'https://ahoyvpn.net/affiliate/00000000', clicks: 0, active: true, created_at: '2026-01-01' }]
      });

    const res = mockRes();
    await generateLink(mockReq({ affiliateId: 1, body: {} }), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ code: '00000000' })
    });
  });

  test('retries up to 10 times when auto-generated code collides', async () => {
    // First 9 generated codes collide, 10th is unique
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: '2' }] })
      .mockResolvedValueOnce({ rows: [{ id: '3' }] })
      .mockResolvedValueOnce({ rows: [{ id: '4' }] })
      .mockResolvedValueOnce({ rows: [{ id: '5' }] })
      .mockResolvedValueOnce({ rows: [{ id: '6' }] })
      .mockResolvedValueOnce({ rows: [{ id: '7' }] })
      .mockResolvedValueOnce({ rows: [{ id: '8' }] })
      .mockResolvedValueOnce({ rows: [{ id: '9' }] })
      .mockResolvedValueOnce({ rows: [] }) // unique
      .mockResolvedValueOnce({
        rows: [{ id: '10', code: '00000000', url: 'https://ahoyvpn.net/affiliate/00000000', clicks: 0, active: true, created_at: '2026-01-01' }]
      });

    const res = mockRes();
    await generateLink(mockReq({ affiliateId: 1, body: {} }), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ code: '00000000' })
    });
    // 10 collision checks + 1 insert = 11 total queries
    expect(mockDbQuery).toHaveBeenCalledTimes(11);
  });

  test('returns 500 on database error', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = mockRes();
    await generateLink(mockReq({ affiliateId: 1, body: { customCode: 'TEST' } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================
// getReferrals
// ============================================================
describe('getReferrals', () => {
  test('returns paginated referrals with link code', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          { id: '1', plan: 'monthly', amount_cents: 599, transaction_date: '2026-01-15', status: 'active', created_at: '2026-01-15', link_code: 'MRBOSS' },
          { id: '2', plan: 'annual', amount_cents: 5999, transaction_date: '2026-02-01', status: 'active', created_at: '2026-02-01', link_code: 'MRBOSS' }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ count: '42' }] });

    const res = mockRes();
    await getReferrals(mockReq({ affiliateId: 1, query: { page: '1', limit: '20' } }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.success).toBe(true);
    expect(call.data).toHaveLength(2);
    expect(call.data[0]).toMatchObject({ plan: 'monthly', amount: 5.99 });
    expect(call.data[1]).toMatchObject({ plan: 'annual', amount: 59.99 });
    expect(call.pagination).toEqual({ page: 1, limit: 20, total: 42, pages: 3 });
  });

  test('handles custom page and limit', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '100' }] });

    const res = mockRes();
    await getReferrals(mockReq({ affiliateId: 1, query: { page: '3', limit: '10' } }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.pagination).toEqual({ page: 3, limit: 10, total: 100, pages: 10 });
  });

  test('returns 500 on database error', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = mockRes();
    await getReferrals(mockReq({ affiliateId: 1, query: {} }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================
// getTransactions
// ============================================================
describe('getTransactions', () => {
  test('returns paginated transactions', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          { id: '1', type: 'commission', amount_cents: 479, description: 'Referral signup', created_at: '2026-01-15', paid_out_at: null },
          { id: '2', type: 'payout', amount_cents: -1000, description: 'Payout', created_at: '2026-02-01', paid_out_at: '2026-02-01' }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ count: '15' }] });

    const res = mockRes();
    await getTransactions(mockReq({ affiliateId: 1, query: { page: '1', limit: '20' } }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.success).toBe(true);
    expect(call.data).toHaveLength(2);
    expect(call.data[0]).toMatchObject({ type: 'commission', amount: 4.79 });
    expect(call.data[1]).toMatchObject({ type: 'payout', amount: -10.00 });
    expect(call.pagination.total).toBe(15);
  });

  test('returns 500 on database error', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = mockRes();
    await getTransactions(mockReq({ affiliateId: 1, query: {} }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================
// getPayoutRequests
// ============================================================
describe('getPayoutRequests', () => {
  test('returns payout requests sorted by date descending', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        { id: '1', amount_cents: 1000, requested_at: '2026-02-01', processed_at: null, status: 'pending', notes: null },
        { id: '2', amount_cents: 500, requested_at: '2026-01-15', processed_at: '2026-01-16', status: 'approved', notes: 'Paid via PayPal' }
      ]
    });

    const res = mockRes();
    await getPayoutRequests(mockReq({ affiliateId: 1 }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.success).toBe(true);
    expect(call.data).toHaveLength(2);
    expect(call.data[0]).toMatchObject({ amount: 10.00, status: 'pending' });
    expect(call.data[1]).toMatchObject({ amount: 5.00, status: 'approved' });
  });

  test('returns empty array when no payout requests exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const res = mockRes();
    await getPayoutRequests(mockReq({ affiliateId: 1 }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.data).toHaveLength(0);
  });

  test('returns 500 on database error', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = mockRes();
    await getPayoutRequests(mockReq({ affiliateId: 1 }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================
// requestPayout
// ============================================================
describe('requestPayout', () => {
  const mockAffiliateBalance = (availableCents) => ({
    rows: [{ available_cents: String(availableCents) }]
  });

  test('rejects amount <= 0', async () => {
    const res = mockRes();
    await requestPayout(mockReq({ affiliateId: 1, body: { amount: 0 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Amount must be greater than 0' });
  });

  test('rejects amount below minimum payout ($10 default via DB lookup)', async () => {
    const res = mockRes();
    // minimumPayoutCents = 1000 from beforeEach default mockGetMinimumPayoutCents
    await requestPayout(mockReq({ affiliateId: 1, body: { amount: 5 } }), res); // $5 < $10

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('Minimum payout');
  });

  test('rejects amount below minimum payout when DB returns higher threshold', async () => {
    // Override beforeEach default: DB says minimum is $25
    mockGetMinimumPayoutCents.mockResolvedValueOnce(2500);
    const res = mockRes();
    await requestPayout(mockReq({ affiliateId: 1, body: { amount: 10 } }), res); // $10 < $25

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('Minimum payout');
  });

  test('rejects amount exceeding available balance', async () => {
    // mockGetMinimumPayoutCents uses beforeEach default (1000 cents = $10)
    mockDbQuery.mockResolvedValueOnce(mockAffiliateBalance(1500)); // $15 available

    const res = mockRes();
    await requestPayout(mockReq({ affiliateId: 1, body: { amount: 20 } }), res); // $20 > $15

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Amount exceeds available balance' });
  });

  test('creates payout request when all validations pass', async () => {
    // mockGetMinimumPayoutCents uses beforeEach default (1000 cents = $10)
    mockDbQuery
      .mockResolvedValueOnce(mockAffiliateBalance(5000)) // $50 available
      .mockResolvedValueOnce({
        rows: [{ id: '99', amount_cents: 3000, requested_at: '2026-04-17', status: 'pending' }]
      });

    const res = mockRes();
    await requestPayout(mockReq({ affiliateId: 1, body: { amount: 30 } }), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Payout request submitted. Email Ahoyvpn@ahoyvpn.net to complete.'
      })
    );
  });

  test('returns 500 when getMinimumPayoutCents throws', async () => {
    mockGetMinimumPayoutCents.mockRejectedValueOnce(new Error('DB error reading payout_config'));

    const res = mockRes();
    await requestPayout(mockReq({ affiliateId: 1, body: { amount: 30 } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('returns 500 on database error during balance check', async () => {
    // mockGetMinimumPayoutCents uses beforeEach default (1000 cents = $10)
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = mockRes();
    await requestPayout(mockReq({ affiliateId: 1, body: { amount: 30 } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('returns 500 on database error during insert', async () => {
    // mockGetMinimumPayoutCents uses beforeEach default (1000 cents = $10)
    mockDbQuery
      .mockResolvedValueOnce(mockAffiliateBalance(5000))
      .mockRejectedValueOnce(new Error('Insert failed'));

    const res = mockRes();
    await requestPayout(mockReq({ affiliateId: 1, body: { amount: 30 } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================
// createCode
// ============================================================
describe('createCode', () => {
  test('rejects code shorter than 3 characters', async () => {
    const res = mockRes();
    await createCode(mockReq({ affiliateId: 1, body: { code: 'AB', discountCents: 0 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Code must be 3-20 characters' });
  });

  test('rejects code longer than 20 characters', async () => {
    const res = mockRes();
    await createCode(mockReq({ affiliateId: 1, body: { code: 'A'.repeat(21), discountCents: 0 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects duplicate code', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] }); // code exists

    const res = mockRes();
    await createCode(mockReq({ affiliateId: 1, body: { code: 'EXISTING', discountCents: 0 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Code already exists' });
  });

  test('rejects invalid discount (only 0, 25, or 50 cents allowed)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // code unique

    const res = mockRes();
    await createCode(mockReq({ affiliateId: 1, body: { code: 'VALID', discountCents: 100 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Discount must be None, $0.25, or $0.50' });
  });

  test('creates link with discount when discountCents is 25', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // code unique
      .mockResolvedValueOnce({
        rows: [{ id: '10', code: 'MYCODE', url: 'https://ahoyvpn.net/affiliate/MYCODE', clicks: 0, active: true, created_at: '2026-01-01' }]
      })
      .mockResolvedValueOnce({ rows: [] }); // discount insert

    const res = mockRes();
    await createCode(mockReq({ affiliateId: 1, body: { code: 'MYCODE', discountCents: 25 } }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.success).toBe(true);
    expect(call.data).toMatchObject({ code: 'MYCODE', discount_cents: 25, signups: 0 });
  });

  test('creates link with discount when discountCents is 50', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: '11', code: 'BIGDIS', url: 'https://ahoyvpn.net/affiliate/BIGDIS', clicks: 0, active: true, created_at: '2026-01-01' }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = mockRes();
    await createCode(mockReq({ affiliateId: 1, body: { code: 'BIGDIS', discountCents: 50 } }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.data.discount_cents).toBe(50);
  });

  test('creates link without discount when discountCents is 0', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // unique check
      .mockResolvedValueOnce({
        rows: [{ id: '12', code: 'NODISC', url: 'https://ahoyvpn.net/affiliate/NODISC', clicks: 0, active: true, created_at: '2026-01-01' }]
      });
    // No discount insert expected

    const res = mockRes();
    await createCode(mockReq({ affiliateId: 1, body: { code: 'NODISC', discountCents: 0 } }), res);

    const call = res.json.mock.calls[0][0];
    expect(call.success).toBe(true);
    expect(call.data.discount_cents).toBe(0);
    // Should have only 2 queries: uniqueness check + insert (no discount insert)
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  test('returns 500 on database error during uniqueness check', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = mockRes();
    await createCode(mockReq({ affiliateId: 1, body: { code: 'SOMECODE', discountCents: 0 } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('returns 500 on database error during insert', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('Insert failed'));

    const res = mockRes();
    await createCode(mockReq({ affiliateId: 1, body: { code: 'INSERTFAIL', discountCents: 0 } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================
// deleteCode
// ============================================================
describe('deleteCode', () => {
  test('returns 404 when link does not exist or belongs to another affiliate', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no ownership match

    const res = mockRes();
    await deleteCode(mockReq({ affiliateId: 1, params: { id: '999' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Link not found' });
  });

  test('deletes discount and link when ownership verified', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: '5' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [] }) // DELETE affiliate_link_discounts
      .mockResolvedValueOnce({ rows: [] }); // DELETE affiliate_links

    const res = mockRes();
    await deleteCode(mockReq({ affiliateId: 1, params: { id: '5' } }), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Link deleted' });
  });

  test('returns 500 on database error', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = mockRes();
    await deleteCode(mockReq({ affiliateId: 1, params: { id: '5' } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
