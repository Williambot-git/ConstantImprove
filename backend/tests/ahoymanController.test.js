/**
 * ahoymanController unit tests
 *
 * Tests all 25 exported functions from ahoymanController.js (969 lines):
 *
 * Auth:
 * - adminLogin       — valid/invalid credentials, missing fields, argon2 verify
 * - adminLogout      — clears cookies, returns success
 *
 * Dashboard:
 * - getDashboardMetrics — aggregates affiliate/referral/transaction counts
 *
 * Affiliates:
 * - getAffiliates         — pagination, status filter, search, affiliate+tx+ref aggregation
 * - getAffiliate          — single affiliate with tx+ref stats
 * - createAffiliate       — create with recovery codes, duplicate username, short password
 * - suspendAffiliate      — sets status='suspended'
 * - reactivateAffiliate   — clears suspended_at, sets status='active'
 * - regenerateAffiliateRecoveryKit — regenerates 10 codes, hash stored as JSON
 * - resetAffiliatePassword — password < 8 chars rejected, argon2 hash stored, audit event
 * - deleteAffiliate       — deletes if no active referrals or pending payouts
 * - archiveAffiliate      — soft-delete (status='archived', archived_at)
 *
 * Referral Tracking:
 * - getReferrals — paginated, filterable by affiliateId/status/plan/date
 *
 * Payouts:
 * - getPayoutRequests — paginated, filterable by status
 * - approvePayout      — creates payout transaction, changes status to processed
 * - rejectPayout      — changes status to rejected
 * - logManualPayout   — manual payout with affiliate username lookup
 *
 * Settings:
 * - getSettings   — reads payout_config, maps to renamed fields
 * - updateSettings — upserts payout_config
 *
 * Tax:
 * - getTaxTransactions — filtered by date+state
 * - getTaxSummary      — aggregated by state
 * - exportTaxTransactionsCSV — CSV download with formatted columns
 *
 * Affiliate Codes:
 * - createAffiliateCode       — creates link + discount
 * - getAffiliateCodes         — all codes with discount
 * - updateAffiliateCodeDiscount — upserts discount
 *
 * Mocks:
 *   - db                  (PostgreSQL queries)
 *   - argon2              (password hashing + recovery code hashing)
 *   - crypto.randomBytes  (recovery code generation)
 *   - jsonwebtoken        (JWT signing)
 *   - authMiddleware_new  (setCsrfTokenCookie)
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
process.env.NODE_ENV = 'test';

jest.mock('../src/config/database');
jest.mock('argon2');
jest.mock('jsonwebtoken');
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn()
}));
jest.mock('../src/middleware/authMiddleware_new', () => ({
  setCsrfTokenCookie: jest.fn()
}));

const db = require('../src/config/database');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { setCsrfTokenCookie } = require('../src/middleware/authMiddleware_new');

// Load controller after mocks are set up
const {
  adminLogin,
  adminLogout,
  getDashboardMetrics,
  getAffiliates,
  getAffiliate,
  createAffiliate,
  suspendAffiliate,
  reactivateAffiliate,
  regenerateAffiliateRecoveryKit,
  resetAffiliatePassword,
  deleteAffiliate,
  archiveAffiliate,
  getReferrals,
  getPayoutRequests,
  approvePayout,
  rejectPayout,
  logManualPayout,
  getSettings,
  updateSettings,
  getTaxTransactions,
  getTaxSummary,
  exportTaxTransactionsCSV,
  getNexusOverview,
  createAffiliateCode,
  getAffiliateCodes,
  updateAffiliateCouponDiscount,
  updateAffiliateCodeDiscount,
} = require('../src/controllers/ahoymanController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  user: { id: 'admin-1' },
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RECOVERY_CODES = Array.from({ length: 10 }, (_, i) =>
  (i * 4).toString(16).padStart(8, '0').toUpperCase()
);

beforeEach(() => {
  jest.clearAllMocks();
  // Default: crypto.randomBytes returns deterministic hex
  crypto.randomBytes.mockReturnValue(Buffer.from('DEADBEEFDEAD', 'hex'));
  // Default: argon2.hash resolves to 'hashed_value'
  argon2.hash.mockResolvedValue('hashed_value');
  argon2.verify.mockResolvedValue(true);
  jwt.sign.mockReturnValue('signed-token');
});

describe('ahoymanController', () => {

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════════════════

  describe('adminLogin', () => {
    it('returns 400 when username or password missing', async () => {
      const res = mockRes();
      await adminLogin(mockReq({ body: { username: 'admin' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Username and password required' });
    });

    it('returns 401 when admin not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await adminLogin(mockReq({ body: { username: 'admin', password: 'pass' } }), res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('returns 401 when password does not match', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', password_hash: 'hash', role: 'admin' }] });
      argon2.verify.mockResolvedValueOnce(false);
      const res = mockRes();
      await adminLogin(mockReq({ body: { username: 'admin', password: 'wrong' } }), res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('sets cookies and returns token on success', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'ahoyman', password_hash: 'hash', role: 'admin' }]
      });
      const res = mockRes();
      await adminLogin(mockReq({ body: { username: 'ahoyman', password: 'correct' } }), res);
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'signed-token', expect.objectContaining({ httpOnly: true }));
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'signed-token', expect.objectContaining({ httpOnly: true }));
      expect(setCsrfTokenCookie).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { username: 'ahoyman', role: 'admin', token: 'signed-token' }
      });
    });

    it('returns 500 on unexpected error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await adminLogin(mockReq({ body: { username: 'admin', password: 'pass' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('adminLogout', () => {
    it('clears all cookies and returns success', async () => {
      const res = mockRes();
      await adminLogout(mockReq(), res);
      expect(res.clearCookie).toHaveBeenCalledWith('accessToken');
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.clearCookie).toHaveBeenCalledWith('csrfToken');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  describe('getDashboardMetrics', () => {
    it('returns aggregated affiliate + referral + transaction stats', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          total_affiliates: '5',
          active_affiliates: '3',
          total_referrals: '12',
          active_referrals: '8',
          total_earned_cents: '50000',
          total_paid_cents: '30000',
          pending_payout_cents: '5000',
        }]
      });
      const res = mockRes();
      await getDashboardMetrics(mockReq(), res);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          totalAffiliates: 5,
          activeAffiliates: 3,
          totalReferredCustomers: 12,
          activeReferrals: 8,
          totalCommissionsPaid: 300.00,
          pendingPayouts: 50.00,
          totalEarned: 500.00,
        }
      });
    });

    it('returns zeros when no data', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          total_affiliates: '0',
          active_affiliates: '0',
          total_referrals: '0',
          active_referrals: '0',
          total_earned_cents: null,
          total_paid_cents: null,
          pending_payout_cents: null,
        }]
      });
      const res = mockRes();
      await getDashboardMetrics(mockReq(), res);
      const call = res.json.mock.calls[0][0];
      expect(call.data.totalAffiliates).toBe(0);
      expect(call.data.totalCommissionsPaid).toBe(0);
      expect(call.data.pendingPayouts).toBe(0);
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await getDashboardMetrics(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AFFILIATES
  // ══════════════════════════════════════════════════════════════════════════

  describe('getAffiliates', () => {
    it('returns paginated affiliates with tx+referral stats', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, username: 'Alice', status: 'active', total_earned_cents: '1000', total_paid_cents: '500', total_referrals: '3', active_referrals: '2' }]
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = mockRes();
      await getAffiliates(mockReq({ query: { page: '1', limit: '20' } }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ username: 'Alice', totalEarned: 10.00, totalPaid: 5.00, pendingBalance: 5.00 })
        ]),
        pagination: expect.objectContaining({ page: 1, limit: 20, total: 1 })
      }));
    });

    it('filters by status and search', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = mockRes();
      await getAffiliates(mockReq({ query: { status: 'suspended', search: 'Bob', page: '1', limit: '10' } }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true, data: [], pagination: expect.objectContaining({ total: 0 })
      }));
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await getAffiliates(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getAffiliate', () => {
    it('returns single affiliate with aggregated tx+ref stats', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'Alice', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ total_earned_cents: '5000', total_paid_cents: '2000' }] })
        .mockResolvedValueOnce({ rows: [{ total_referrals: '7', active_referrals: '5' }] });

      const res = mockRes();
      await getAffiliate(mockReq({ params: { id: '1' } }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          username: 'Alice',
          totalEarned: 50.00,
          totalPaid: 20.00,
          pendingBalance: 30.00,
          totalReferrals: 7,
          activeReferrals: 5,
        })
      }));
    });

    it('returns 404 when affiliate not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await getAffiliate(mockReq({ params: { id: '999' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
    });
  });

  describe('createAffiliate', () => {
    beforeEach(() => {
      // Generate stable recovery codes
      let callCount = 0;
      crypto.randomBytes.mockImplementation((n) => {
        callCount++;
        // Each recovery code is 4 bytes (8 hex chars), 10 codes = 40 bytes total
        return Buffer.from((callCount * 0xDEADBEEF >>> 0).toString(16).padStart(n * 2, '0').slice(0, n * 2), 'hex');
      });
    });

    it('creates affiliate with hashed password + 10 recovery codes', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // username check
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'newaff', status: 'active', created_at: new Date() }] });

      const res = mockRes();
      await createAffiliate(mockReq({ body: { username: 'newaff', password: 'strongpass123' } }), res);

      expect(argon2.hash).toHaveBeenCalled(); // passwords hashed
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Affiliate created. Give them their recovery codes.',
        data: expect.objectContaining({ username: 'newaff', recoveryCodes: expect.any(Array) })
      }));
      // recoveryCodes array should have 10 items
      const call = res.json.mock.calls[0][0];
      expect(call.data.recoveryCodes).toHaveLength(10);
    });

    it('returns 400 when username or password missing', async () => {
      const res = mockRes();
      await createAffiliate(mockReq({ body: { username: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Username and password required' });
    });

    it('returns 400 when password < 8 chars', async () => {
      const res = mockRes();
      await createAffiliate(mockReq({ body: { username: 'aff', password: 'short' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password must be at least 8 characters' });
    });

    it('returns 400 when username already taken', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = mockRes();
      await createAffiliate(mockReq({ body: { username: 'existing', password: 'password123' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Username already taken' });
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await createAffiliate(mockReq({ body: { username: 'aff', password: 'password123' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('suspendAffiliate', () => {
    it('sets status to suspended', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 1 });
      const res = mockRes();
      await suspendAffiliate(mockReq({ params: { id: '5' } }), res);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'suspended'"),
        ['5']
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Affiliate suspended' });
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await suspendAffiliate(mockReq({ params: { id: '5' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('reactivateAffiliate', () => {
    it('sets status to active and clears suspended_at', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 1 });
      const res = mockRes();
      await reactivateAffiliate(mockReq({ params: { id: '5' } }), res);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'active'"),
        ['5']
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Affiliate reactivated' });
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await reactivateAffiliate(mockReq({ params: { id: '5' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('regenerateAffiliateRecoveryKit', () => {
    it('regenerates 10 recovery codes and stores hashed JSON', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 1 });
      const res = mockRes();
      await regenerateAffiliateRecoveryKit(mockReq({ params: { id: '5' } }), res);
      expect(crypto.randomBytes).toHaveBeenCalledTimes(10);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE affiliates SET recovery_codes_hash'),
        expect.arrayContaining([expect.any(String), '5'])
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Recovery kit regenerated. Old codes are invalidated.',
        data: expect.objectContaining({ recoveryCodes: expect.any(Array) })
      }));
      const call = res.json.mock.calls[0][0];
      expect(call.data.recoveryCodes).toHaveLength(10);
    });
  });

  describe('resetAffiliatePassword', () => {
    it('hashes password with argon2 and updates DB', async () => {
      db.query.mockResolvedValue({ rowCount: 1 });
      const res = mockRes();
      await resetAffiliatePassword(mockReq({ params: { id: '5' }, body: { password: 'newpassword123' }, user: { id: 'admin-1' } }), res);
      expect(argon2.hash).toHaveBeenCalledWith('newpassword123');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE affiliates SET password_hash'),
        expect.arrayContaining(['hashed_value', '5'])
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Password updated successfully' });
    });

    it('returns 400 if password < 8 characters', async () => {
      const res = mockRes();
      await resetAffiliatePassword(mockReq({ params: { id: '5' }, body: { password: 'short' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password must be at least 8 characters' });
    });

    it('returns 500 on db error during password update', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await resetAffiliatePassword(mockReq({ params: { id: '5' }, body: { password: 'newpassword123' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteAffiliate', () => {
    it('returns 404 if affiliate not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await deleteAffiliate(mockReq({ params: { id: '999' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 if affiliate has active referrals', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'Alice' }] })
        .mockResolvedValueOnce({ rows: [{ c: '3' }] }); // active referrals
      const res = mockRes();
      await deleteAffiliate(mockReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('active referrals')
      }));
    });

    it('returns 400 if affiliate has pending payouts', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'Alice' }] })
        .mockResolvedValueOnce({ rows: [{ c: '0' }] }) // no active referrals
        .mockResolvedValueOnce({ rows: [{ c: '2' }] }); // pending payouts
      const res = mockRes();
      await deleteAffiliate(mockReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('pending payouts')
      }));
    });

    it('deletes affiliate when safe', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'Alice' }] })
        .mockResolvedValueOnce({ rows: [{ c: '0' }] })
        .mockResolvedValueOnce({ rows: [{ c: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1 });
      const res = mockRes();
      await deleteAffiliate(mockReq({ params: { id: '1' } }), res);
      expect(db.query).toHaveBeenLastCalledWith(
        expect.stringContaining('DELETE FROM affiliates'),
        ['1']
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Affiliate permanently deleted' });
    });
  });

  describe('archiveAffiliate', () => {
    it('sets status=archived and archived_at=NOW()', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, username: 'Alice' }] });
      const res = mockRes();
      await archiveAffiliate(mockReq({ params: { id: '1' } }), res);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'archived'"),
        ['1']
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true, message: 'Affiliate archived', data: { id: 1, username: 'Alice' }
      }));
    });

    it('returns 404 if affiliate not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await archiveAffiliate(mockReq({ params: { id: '999' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // REFERRAL TRACKING
  // ══════════════════════════════════════════════════════════════════════════

  describe('getReferrals', () => {
    it('returns paginated referrals with affiliate info', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, plan: 'monthly', amount_cents: 599, status: 'active', created_at: new Date(), affiliate_username: 'Alice', affiliate_code: 'ALICE1' }]
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = mockRes();
      await getReferrals(mockReq({ query: { page: '1', limit: '20' } }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 1, amount: 5.99, affiliate_username: 'Alice' })
        ]),
        pagination: expect.objectContaining({ page: 1, total: 1 })
      }));
    });

    it('filters by affiliateId, status, plan, startDate, endDate', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = mockRes();
      await getReferrals(mockReq({
        query: { affiliateId: '1', status: 'active', plan: 'annual', startDate: '2026-01-01', endDate: '2026-12-31', page: '1', limit: '10' }
      }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: [] }));
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await getReferrals(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PAYOUTS
  // ══════════════════════════════════════════════════════════════════════════

  describe('getPayoutRequests', () => {
    it('returns paginated payout requests with affiliate username', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'payout-1', amount_cents: 5000, status: 'pending', affiliate_username: 'Alice', requested_at: new Date() }]
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = mockRes();
      await getPayoutRequests(mockReq({ query: { page: '1', limit: '20' } }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'payout-1', amount: 50.00, affiliate_username: 'Alice' })
        ]),
        pagination: expect.objectContaining({ page: 1, total: 1 })
      }));
    });

    it('filters by status', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = mockRes();
      await getPayoutRequests(mockReq({ query: { status: 'pending' } }), res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: [] }));
    });
  });

  describe('approvePayout', () => {
    it('approves pending payout, creates payout transaction', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ affiliate_id: 1, amount_cents: 5000, status: 'pending' }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // payout update
        .mockResolvedValueOnce({ rowCount: 1 }); // transaction insert

      const res = mockRes();
      await approvePayout(mockReq({ params: { id: 'payout-1' }, body: { notes: 'Paid via bank' } }), res);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'processed'"),
        expect.arrayContaining(['payout-1'])
      );
      // Verify the INSERT transaction call (3rd db.query call)
      const insertCall = db.query.mock.calls[2];
      expect(insertCall[0]).toContain('payout');
      expect(insertCall[1][0]).toBe(1);
      expect(insertCall[1][1]).toBe(-5000);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Payout approved and logged' });
    });

    it('returns 404 if payout not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await approvePayout(mockReq({ params: { id: 'none' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 if payout already processed', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ affiliate_id: 1, amount_cents: 5000, status: 'processed' }] });
      const res = mockRes();
      await approvePayout(mockReq({ params: { id: 'payout-1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Payout already processed' });
    });
  });

  describe('rejectPayout', () => {
    it('sets status to rejected', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 1 });
      const res = mockRes();
      await rejectPayout(mockReq({ params: { id: 'payout-1' }, body: { notes: 'Invalid details' } }), res);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'rejected'"),
        expect.arrayContaining(['payout-1'])
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Payout rejected' });
    });
  });

  describe('logManualPayout', () => {
    it('logs manual payout for affiliate by username', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // affiliate lookup
        .mockResolvedValueOnce({ rows: [{ id: 'new-payout' }] }) // payout request insert
        .mockResolvedValueOnce({ rowCount: 1 }); // transaction insert

      const res = mockRes();
      await logManualPayout(mockReq({ body: { affiliateUsername: 'Alice', amount: 75.00, notes: 'Bank transfer' } }), res);

      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Manual payout logged successfully' });
    });

    it('returns 400 if username or amount missing', async () => {
      const res = mockRes();
      await logManualPayout(mockReq({ body: { amount: 50 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate username and amount required' });
    });

    it('returns 404 if affiliate not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await logManualPayout(mockReq({ body: { affiliateUsername: 'Ghost', amount: 50 } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════════════════

  describe('getSettings', () => {
    it('returns payout config with renamed fields', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          minimum_payout_cents: 1000,
          commission_rate_monthly: 0.10,
          commission_rate_quarterly: 0.15,
          commission_rate_semiannual: 0.20,
          commission_rate_annual: 0.25,
          hold_period_days: 30,
        }]
      });

      const res = mockRes();
      await getSettings(mockReq(), res);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          minimumPayout: 10.00,
          commissionRateMonthly: 0.10,
          commissionRateQuarterly: 0.15,
          commissionRateSemiannual: 0.20,
          commissionRateAnnual: 0.25,
          holdPeriodDays: 30,
        }
      });
    });

    it('returns defaults when no config row', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await getSettings(mockReq(), res);
      const call = res.json.mock.calls[0][0];
      expect(call.data.minimumPayout).toBe(10);
      expect(call.data.commissionRateMonthly).toBe(0.10);
    });
  });

  describe('updateSettings', () => {
    it('upserts payout_config', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 1 });
      const res = mockRes();
      await updateSettings(mockReq({
        body: {
          minimumPayout: 25,
          commissionRateMonthly: 0.15,
          commissionRateQuarterly: 0.15,
          commissionRateSemiannual: 0.15,
          commissionRateAnnual: 0.15,
          holdPeriodDays: 45,
        }
      }), res);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (id) DO UPDATE'),
        expect.arrayContaining([2500, 0.15, 0.15, 0.15, 0.15, 45])
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Settings updated' });
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await updateSettings(mockReq({ body: { minimumPayout: 10 } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TAX TRANSACTIONS
  // ══════════════════════════════════════════════════════════════════════════

  describe('getTaxTransactions', () => {
    it('returns tax transactions filtered by date + state', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, state: 'PA', tax_amount_cents: 360, base_charge_cents: 599 }]
      });
      const res = mockRes();
      await getTaxTransactions(mockReq({
        query: { start_date: '2026-01-01', end_date: '2026-03-31', state: 'PA' }
      }), res);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([expect.any(Object)])
      });
    });

    it('returns all tax transactions when no filters', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await getTaxTransactions(mockReq({ query: {} }), res);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await getTaxTransactions(mockReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getTaxSummary', () => {
    it('aggregates tax by state with totals', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          { state: 'PA', total_transactions: '10', total_base_cents: '5000', total_tax_cents: '300' },
          { state: 'CA', total_transactions: '5', total_base_cents: '3000', total_tax_cents: '270' },
        ]
      });
      const res = mockRes();
      await getTaxSummary(mockReq({ query: {} }), res);
      const call = res.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.data.totalTransactions).toBe(15);
      expect(call.data.totalBaseRevenueCents).toBe(8000);
      expect(call.data.totalTaxCents).toBe(570);
      expect(call.data.byState.PA.total_transactions).toBe(10);
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await getTaxSummary(mockReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getNexusOverview', () => {
    it('returns per-state revenue and transaction counts', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          { state: 'PA', transaction_count: '14', total_revenue_cents: '167900' },
          { state: 'CA', transaction_count: '7', total_revenue_cents: '83950' },
        ]
      });
      const res = mockRes();
      await getNexusOverview(mockReq({ query: {} }), res);
      const call = res.json.mock.calls[0][0];
      expect(call.states).toHaveLength(2);
      expect(call.states[0].state).toBe('PA');
      expect(call.states[0].transaction_count).toBe(14);
      expect(call.states[0].total_revenue_cents).toBe(167900);
      expect(call.states[0].total_revenue_dollars).toBe('1679.00');
      expect(call.totals.grand_total_revenue_cents).toBe(251850);
      expect(call.totals.grand_total_transactions).toBe(21);
      expect(call.totals.grand_total_revenue_dollars).toBe('2518.50');
    });

    it('returns empty arrays when no transactions', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await getNexusOverview(mockReq({ query: {} }), res);
      const call = res.json.mock.calls[0][0];
      expect(call.states).toEqual([]);
      expect(call.totals.grand_total_revenue_cents).toBe(0);
      expect(call.totals.grand_total_transactions).toBe(0);
    });

    it('applies start_date and end_date filters', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await getNexusOverview(mockReq({ query: { start_date: '2026-01-01', end_date: '2026-03-31' } }), res);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('transaction_date::date >= $1'),
        ['2026-01-01', '2026-03-31']
      );
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await getNexusOverview(mockReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('exportTaxTransactionsCSV', () => {
    it('returns CSV with header + rows', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            date: '2026-04-01',
            invoice: 'INV-001',
            'Postal Code': '15417',
            country: 'US',
            state: 'PA',
            'Base Charge ($)': 5.99,
            'Tax Rate (%)': 0.06,
            'Tax Amount ($)': 0.36,
            'Total Amount ($)': 6.35,
          }
        ]
      });
      const res = mockRes();
      await exportTaxTransactionsCSV(mockReq({ query: {} }), res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('tax-transactions-')
      );
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Date,Invoice,Postal Code'));
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await exportTaxTransactionsCSV(mockReq({ query: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AFFILIATE CODES
  // ══════════════════════════════════════════════════════════════════════════

  describe('createAffiliateCode', () => {
    it('creates affiliate link with discount', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'Alice' }] }) // affiliate exists
        .mockResolvedValueOnce({ rows: [] }) // code not taken
        .mockResolvedValueOnce({ rows: [{ id: 10, code: 'ALICE1', url: 'https://ahoyvpn.net/affiliate/ALICE1', active: true, created_at: new Date() }] })
        .mockResolvedValueOnce({ rowCount: 1 }); // discount upsert

      const res = mockRes();
      await createAffiliateCode(mockReq({
        body: { affiliateId: 1, code: 'Alice1', discountCents: 500 }
      }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Affiliate code created',
        data: expect.objectContaining({ discount_cents: 500 })
      }));
    });

    it('returns 400 if affiliateId or code missing', async () => {
      const res = mockRes();
      await createAffiliateCode(mockReq({ body: { code: 'TEST' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'affiliateId and code are required' });
    });

    it('returns 404 if affiliate not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = mockRes();
      await createAffiliateCode(mockReq({ body: { affiliateId: 999, code: 'TEST' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 if code already taken', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'Alice' }] })
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }); // code exists
      const res = mockRes();
      await createAffiliateCode(mockReq({ body: { affiliateId: 1, code: 'TAKEN' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Code already exists' });
    });
  });

  describe('getAffiliateCodes', () => {
    it('returns all affiliate codes with usernames and discounts', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, code: 'ALICE1', url: 'https://ahoyvpn.net/affiliate/ALICE1', clicks: 5, discount_cents: 500, affiliate_username: 'Alice' }]
      });
      const res = mockRes();
      await getAffiliateCodes(mockReq(), res);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ code: 'ALICE1', discount_cents: 500, affiliate_username: 'Alice' })
        ])
      });
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await getAffiliateCodes(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateAffiliateCodeDiscount', () => {
    it('upserts discount for affiliate code', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 1 });
      const res = mockRes();
      await updateAffiliateCodeDiscount(mockReq({ params: { id: '10' }, body: { discountCents: 750 } }), res);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        ['10', 750]
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Discount updated' });
    });

    it('returns 500 on db error', async () => {
      db.query.mockRejectedValueOnce(new Error('db error'));
      const res = mockRes();
      await updateAffiliateCodeDiscount(mockReq({ params: { id: '10' }, body: { discountCents: 100 } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

}); // end describe('ahoymanController')
