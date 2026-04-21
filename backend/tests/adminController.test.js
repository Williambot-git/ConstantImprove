/**
 * adminController unit tests
 *
 * Tests all 22 exported functions from adminController.js:
 * - Auth:       login, logout
 * - Customers:  getCustomers, getCustomer, resetCustomerPassword,
 *               rotateCustomerRecoveryKit, sendMessageToCustomer,
 *               deactivateCustomer, deleteCustomer
 * - Affiliates: createAffiliate, getAffiliates, getAffiliate,
 *               disableAffiliate, adjustAffiliateEarnings
 * - Metrics:    getKPIs, getAdminMetrics, getReferralTracking
 * - Export:     exportAffiliatesCSV, exportAffiliateReferralsCSV
 * - Payouts:    logPayout
 * - Settings:   getSystemSettings, updateSystemSettings
 *
 * Mocks:
 *   - db                (PostgreSQL queries)
 *   - argon2            (password hashing)
 *   - jsonwebtoken      (JWT signing)
 *   - crypto            (randomBytes for password/code generation)
 *   - authMiddleware_new (setCsrfTokenCookie)
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

// ─── Load controller AFTER mocks are set up ─────────────────────────────────
const {
  login,
  logout,
  getCustomers,
  getCustomer,
  resetCustomerPassword,
  rotateCustomerRecoveryKit,
  sendMessageToCustomer,
  deactivateCustomer,
  deleteCustomer,
  createAffiliate,
  getAffiliates,
  getAffiliate,
  disableAffiliate,
  adjustAffiliateEarnings,
  getKPIs,
  exportAffiliatesCSV,
  exportAffiliateReferralsCSV,
  getAdminMetrics,
  getReferralTracking,
  logPayout,
  getSystemSettings,
  updateSystemSettings
} = require('../src/controllers/adminController');

// ─── Mock req/res helpers ─────────────────────────────────────────────────────
const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  user: { id: 'admin-1' },
  ...overrides
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

describe('adminController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default crypto.randomBytes to return deterministic hex
    crypto.randomBytes.mockReturnValue(Buffer.from('deadbeefdeadbeef', 'hex'));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════════════════

  describe('login', () => {
    const validAdmin = {
      id: 'admin-1',
      username: 'admin',
      password_hash: 'hashed_password',
      role: 'admin',
      is_active: true
    };

    it('returns 400 when username or password missing', async () => {
      const req = mockReq({ body: { username: 'admin' } });
      const res = mockRes();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Username and password are required' });
    });

    it('returns 401 when admin not found', async () => {
      const req = mockReq({ body: { username: 'nobody', password: 'pass' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('returns 401 when password is invalid', async () => {
      const req = mockReq({ body: { username: 'admin', password: 'wrong' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [validAdmin] });
      argon2.verify = jest.fn().mockResolvedValue(false);

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('returns 200 with tokens on successful login', async () => {
      const req = mockReq({ body: { username: 'admin', password: 'correct' } });
      const res = mockRes();
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [validAdmin] })   // SELECT admin
        .mockResolvedValueOnce({ rows: [] });              // UPDATE last_login
      argon2.verify = jest.fn().mockResolvedValue(true);
      jwt.sign = jest.fn().mockReturnValue('signed-token');

      await login(req, res);

      expect(jwt.sign).toHaveBeenCalledTimes(2);
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'signed-token', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'signed-token', expect.any(Object));
      expect(setCsrfTokenCookie).toHaveBeenCalledWith(res, 'admin-1');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { username: 'admin', role: 'admin', message: 'Admin login successful' }
      });
    });
  });

  describe('logout', () => {
    it('clears all auth cookies and returns success', async () => {
      const req = mockReq();
      const res = mockRes();

      await logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('accessToken');
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.clearCookie).toHaveBeenCalledWith('csrfToken');
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Logged out successfully' });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CUSTOMERS
  // ══════════════════════════════════════════════════════════════════════════

  describe('getCustomers', () => {
    it('returns paginated customers list', async () => {
      const req = mockReq({ query: { page: '1', limit: '10' } });
      const res = mockRes();
      const mockCustomers = [
        { id: 'u1', account_number: 'ACC001', is_active: true, subscription_status: 'active' }
      ];
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: mockCustomers })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await getCustomers(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockCustomers,
        pagination: expect.objectContaining({ page: 1, limit: 10, total: 1, pages: 1 })
      });
    });

    it('filters by search term (account number)', async () => {
      const req = mockReq({ query: { search: 'ACC001', page: '1', limit: '20' } });
      const res = mockRes();
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await getCustomers(req, res);

      const selectCall = db.query.mock.calls[0];
      expect(selectCall[0]).toContain('ILIKE');
      expect(selectCall[1]).toContain('%ACC001%');
    });
  });

  describe('getCustomer', () => {
    it('returns 404 when customer not found', async () => {
      const req = mockReq({ params: { id: 'unknown-id' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await getCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });

    it('returns customer data when found', async () => {
      const req = mockReq({ params: { id: 'cust-1' } });
      const res = mockRes();
      const customer = { id: 'cust-1', account_number: 'ACC001', is_active: true };
      db.query = jest.fn().mockResolvedValue({ rows: [customer] });

      await getCustomer(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: customer });
    });
  });

  describe('resetCustomerPassword', () => {
    it('generates new 8-digit numeric password and hashes it', async () => {
      const req = mockReq({ params: { id: 'cust-1' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });
      argon2.hash = jest.fn().mockResolvedValue('hashed_new_password');

      await resetCustomerPassword(req, res);

      // argon2.hash called with the generated password
      expect(argon2.hash).toHaveBeenCalledWith(expect.stringMatching(/^\d{8}$/));
      expect(db.query).toHaveBeenCalledTimes(2); // UPDATE users + INSERT audit_events
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Password reset successfully'
      }));
    });
  });

  describe('rotateCustomerRecoveryKit', () => {
    it('deactivates old kit, creates new one, and logs audit event', async () => {
      const req = mockReq({ params: { id: 'cust-1' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });
      argon2.hash = jest.fn().mockResolvedValue('hashed_kit');

      await rotateCustomerRecoveryKit(req, res);

      // Called twice: UPDATE old kit + INSERT new kit
      expect(db.query).toHaveBeenCalledTimes(3); // UPDATE + INSERT kit + INSERT audit
      expect(argon2.hash).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Recovery kit rotated successfully'
      }));
    });
  });

  describe('sendMessageToCustomer', () => {
    it('returns 400 when subject or message missing', async () => {
      const req = mockReq({ params: { id: 'cust-1' }, body: { subject: 'Hi' } });
      const res = mockRes();

      await sendMessageToCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Subject and message required' });
    });

    it('inserts message and logs audit event on success', async () => {
      const req = mockReq({
        params: { id: 'cust-1' },
        body: { subject: 'Hello', message: 'Your VPN is ready' }
      });
      const res = mockRes();
      const messageRow = { id: 'msg-1', subject: 'Hello', created_at: new Date().toISOString() };
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [messageRow] })  // INSERT message
        .mockResolvedValueOnce({ rows: [] });             // INSERT audit

      await sendMessageToCustomer(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: messageRow,
        message: 'Message sent successfully'
      }));
    });
  });

  describe('deactivateCustomer', () => {
    it('sets is_active=false and logs audit event', async () => {
      const req = mockReq({ params: { id: 'cust-1' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await deactivateCustomer(req, res);

      const updateCall = db.query.mock.calls.find(c => c[0].includes('UPDATE users'));
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toContain('cust-1');
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Customer deactivated successfully' });
    });
  });

  describe('deleteCustomer', () => {
    it('soft deletes customer (sets deleted_at) and logs audit', async () => {
      const req = mockReq({ params: { id: 'cust-1' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await deleteCustomer(req, res);

      const updateCall = db.query.mock.calls.find(c => c[0].includes('deleted_at'));
      expect(updateCall).toBeDefined();
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Customer scheduled for deletion' });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AFFILIATES
  // ══════════════════════════════════════════════════════════════════════════

  describe('createAffiliate', () => {
    it('returns 400 when neither userId nor email provided', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      await createAffiliate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Either userId or email is required' });
    });

    it('returns 404 when user not found by userId', async () => {
      const req = mockReq({ body: { userId: 'unknown' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await createAffiliate(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns 400 when user already an affiliate', async () => {
      const req = mockReq({ body: { userId: 'user-1' } });
      const res = mockRes();
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', account_number: 'ACC001' }] })  // SELECT user
        .mockResolvedValueOnce({ rows: [{ id: 'aff-already' }] });                       // SELECT existing affiliate

      await createAffiliate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User is already an affiliate' });
    });

    it('returns 400 when affiliate code already in use', async () => {
      const req = mockReq({ body: { userId: 'user-1', code: 'TAKEN123' } });
      const res = mockRes();
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', account_number: 'ACC001' }] })  // SELECT user
        .mockResolvedValueOnce({ rows: [] })                                            // SELECT existing affiliate (none)
        .mockResolvedValueOnce({ rows: [{ id: 'conflict' }] });                       // SELECT code (conflict)

      await createAffiliate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate code already in use' });
    });

    it('creates affiliate with generated password when user found', async () => {
      const req = mockReq({ body: { userId: 'user-1' } });
      const res = mockRes();
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', account_number: 'ACC001' }] })  // SELECT user
        .mockResolvedValueOnce({ rows: [] })                                            // SELECT existing affiliate
        .mockResolvedValueOnce({ rows: [] })                                            // SELECT code uniqueness
        .mockResolvedValueOnce({ rows: [] });                                           // INSERT affiliate (no return — but we need it to return)
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', account_number: 'ACC001' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'aff-new',
            username: expect.any(String),
            status: 'active',
            created_at: new Date().toISOString()
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // audit

      argon2.hash = jest.fn().mockResolvedValue('hashed_password');

      await createAffiliate(req, res);

      expect(argon2.hash).toHaveBeenCalled(); // temp password hashed
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.stringContaining('Affiliate created successfully')
      }));
    });
  });

  describe('getAffiliates', () => {
    it('returns list of affiliates with referral counts', async () => {
      const req = mockReq();
      const res = mockRes();
      const affiliates = [{ id: 'aff-1', username: 'WILLIAM', status: 'active' }];
      db.query = jest.fn().mockResolvedValue({ rows: affiliates });

      await getAffiliates(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: affiliates });
    });
  });

  describe('getAffiliate', () => {
    it('returns 404 when affiliate not found', async () => {
      const req = mockReq({ params: { id: 'unknown' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await getAffiliate(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
    });

    it('returns affiliate data when found', async () => {
      const req = mockReq({ params: { id: 'aff-1' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [{ id: 'aff-1', username: 'WILLIAM' }] });

      await getAffiliate(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 'aff-1', username: 'WILLIAM' }
      });
    });
  });

  describe('disableAffiliate', () => {
    it('sets affiliate status to suspended and logs audit', async () => {
      const req = mockReq({ params: { id: 'aff-1' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await disableAffiliate(req, res);

      const updateCall = db.query.mock.calls.find(c => c[0].includes("status ="));
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toContain('aff-1');
      expect(updateCall[1]).toContain('suspended');
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Affiliate disabled successfully' });
    });
  });

  describe('adjustAffiliateEarnings', () => {
    it('returns 400 when amountCents missing', async () => {
      const req = mockReq({ params: { id: 'aff-1' }, body: {} });
      const res = mockRes();

      await adjustAffiliateEarnings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Amount required' });
    });

    it('inserts adjustment transaction and logs audit', async () => {
      const req = mockReq({ params: { id: 'aff-1' }, body: { amountCents: 5000, reason: 'Correction' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await adjustAffiliateEarnings(req, res);

      const insertCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO transactions'));
      expect(insertCall).toBeDefined();
      expect(insertCall[1]).toContain(5000);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Affiliate earnings adjusted successfully' });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // METRICS & KPIs
  // ══════════════════════════════════════════════════════════════════════════

  describe('getKPIs', () => {
    it('returns KPIs from admin_kpis table', async () => {
      const req = mockReq();
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [{ total_users: 100, active_subs: 50 }] });

      await getKPIs(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { total_users: 100, active_subs: 50 }
      });
    });
  });

  describe('getAdminMetrics', () => {
    it('returns aggregated dashboard metrics', async () => {
      const req = mockReq();
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({
        rows: [{
          total_affiliates: '10',
          active_affiliates: '8',
          total_referred_customers: '25',
          total_commissions_paid: '50000',
          pending_payouts: '5000',
          total_customers: '200',
          active_subscriptions: '150'
        }]
      });

      await getAdminMetrics(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          totalAffiliates: 10,
          activeAffiliates: 8,
          totalReferredCustomers: 25,
          totalCommissionsPaid: 500.00,
          pendingPayouts: 50.00,
          totalCustomers: 200,
          activeSubscriptions: 150
        })
      });
    });
  });

  describe('getReferralTracking', () => {
    it('returns paginated referral list with filters', async () => {
      const req = mockReq({
        query: { affiliateId: 'aff-1', page: '1', limit: '10' }
      });
      const res = mockRes();
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'ref-1', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await getReferralTracking(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{ id: 'ref-1', status: 'active' }],
        pagination: expect.objectContaining({ page: 1, limit: 10, total: 1, pages: 1 })
      });
    });

    it('filters by startDate and endDate', async () => {
      const req = mockReq({
        query: { startDate: '2024-01-01', endDate: '2024-12-31', page: '1', limit: '20' }
      });
      const res = mockRes();
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await getReferralTracking(req, res);

      const selectCall = db.query.mock.calls[0];
      expect(selectCall[0]).toContain('r.created_at >=');
      expect(selectCall[0]).toContain('r.created_at <=');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CSV EXPORTS
  // ══════════════════════════════════════════════════════════════════════════

  describe('exportAffiliatesCSV', () => {
    it('sets CSV headers and sends affiliate data', async () => {
      const req = mockReq();
      const res = mockRes();
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'aff-1', username: 'WILLIAM', status: 'active', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ affiliate_id: 'aff-1', total_earned_cents: '10000', pending_payout_cents: '0', paid_out_cents: '10000' }] });

      await exportAffiliatesCSV(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('affiliates_payout_'));
      expect(res.send).toHaveBeenCalled();
      const csvContent = res.send.mock.calls[0][0];
      expect(csvContent).toContain('WILLIAM');
    });
  });

  describe('exportAffiliateReferralsCSV', () => {
    it('returns 404 when affiliate not found', async () => {
      const req = mockReq({ params: { id: 'unknown' } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await exportAffiliateReferralsCSV(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('sends CSV with referral data for valid affiliate', async () => {
      const req = mockReq({ params: { id: 'aff-1' } });
      const res = mockRes();
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ code: 'WILLIAM', account_number: 'ACC001', created_at: '2024-01-01T00:00:00.000Z' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'ref-1', referred_user_id: 'u1', status: 'active', commission_cents: 2500, paid_at: '2024-02-01T00:00:00.000Z', created_at: '2024-01-15T00:00:00.000Z' }] });

      await exportAffiliateReferralsCSV(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.send).toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PAYOUTS
  // ══════════════════════════════════════════════════════════════════════════

  describe('logPayout', () => {
    it('returns 400 when affiliateUsername or amount missing', async () => {
      const req = mockReq({ body: { amount: 100 } });
      const res = mockRes();

      await logPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when affiliate not found', async () => {
      const req = mockReq({ body: { affiliateUsername: 'unknown', amount: 100 } });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await logPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate not found' });
    });

    it('inserts payout record and logs audit on success', async () => {
      const req = mockReq({ body: { affiliateUsername: 'WILLIAM', amount: 50.00, datePaid: '2024-01-15', notes: 'January payout' } });
      const res = mockRes();
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'aff-1', username: 'WILLIAM' }] })  // SELECT affiliate
        .mockResolvedValueOnce({ rows: [] })                                        // UPDATE transactions
        .mockResolvedValueOnce({ rows: [{ id: 'payout-1', amount_cents: 5000, status: 'processed' }] }) // INSERT payout
        .mockResolvedValueOnce({ rows: [] });                                         // INSERT audit

      await logPayout(req, res);

      const payoutCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO payout_requests'));
      expect(payoutCall).toBeDefined();
      expect(payoutCall[1]).toContain(5000); // $50 * 100 = 5000 cents
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Payout logged successfully'
      }));
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════════════════

  describe('getSystemSettings', () => {
    it('returns payout config with defaults when no row exists', async () => {
      const req = mockReq();
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await getSystemSettings(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          minimumPayout: 50.00,
          commissionRates: expect.objectContaining({
            monthly: 0.10,
            quarterly: 0.10,
            semiannual: 0.10,
            annual: 0.10
          }),
          holdPeriodDays: 30
        })
      });
    });

    it('returns payout config from database when row exists', async () => {
      const req = mockReq();
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({
        rows: [{
          minimum_payout: 7500,
          commission_rate_monthly: 0.15,
          commission_rate_quarterly: 0.15,
          commission_rate_semiannual: 0.12,
          commission_rate_annual: 0.20,
          hold_period_days: 15
        }]
      });

      await getSystemSettings(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          minimumPayout: 75.00,
          commissionRates: expect.objectContaining({
            monthly: 0.15,
            annual: 0.20
          }),
          holdPeriodDays: 15
        })
      });
    });
  });

  describe('updateSystemSettings', () => {
    it('upserts payout config and returns success', async () => {
      const req = mockReq({
        body: {
          minimumPayout: 100,
          commissionRates: { monthly: 0.20, quarterly: 0.18, semiannual: 0.15, annual: 0.25 },
          holdPeriodDays: 45
        }
      });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await updateSystemSettings(req, res);

      const upsertCall = db.query.mock.calls[0];
      expect(upsertCall[0]).toContain('INSERT INTO payout_config');
      expect(upsertCall[0]).toContain('ON CONFLICT');
      expect(upsertCall[1]).toContain(10000);   // $100 * 100 = 10000 cents
      expect(upsertCall[1]).toContain(0.20);     // monthly rate
      expect(upsertCall[1]).toContain(45);       // hold period
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'System settings updated successfully' });
    });

    it('uses default values when optional fields missing', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await updateSystemSettings(req, res);

      const upsertCall = db.query.mock.calls[0];
      expect(upsertCall[1]).toContain(5000);   // default minimumPayout: 50 * 100
      expect(upsertCall[1]).toContain(0.10);  // default commission rates
      expect(upsertCall[1]).toContain(30);    // default holdPeriodDays
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Error handling — catch blocks across admin functions
// ════════════════════════════════════════════════════════════════════════════════
describe('Error handling', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    jest.clearAllMocks();
    db.query = jest.fn().mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('getCustomers — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ query: {} });
    const res = mockRes();
    await getCustomers(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('getAffiliates — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB unavailable')));
    const req = mockReq({ query: {} });
    const res = mockRes();
    await getAffiliates(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('exportAffiliatesCSV — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ query: {} });
    const res = mockRes();
    await exportAffiliatesCSV(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('getSystemSettings — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ body: {} });
    const res = mockRes();
    await getSystemSettings(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('updateSystemSettings — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB constraint violation')));
    const req = mockReq({ body: { minimumPayout: 100 } });
    const res = mockRes();
    await updateSystemSettings(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('getCustomer — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ params: { id: 'cust-1' } });
    const res = mockRes();
    await getCustomer(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('resetCustomerPassword — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ params: { id: 'cust-1' } });
    const res = mockRes();
    await resetCustomerPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('rotateCustomerRecoveryKit — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ params: { id: 'cust-1' } });
    const res = mockRes();
    await rotateCustomerRecoveryKit(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('sendMessageToCustomer — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ params: { id: 'cust-1' }, body: { subject: 'Hi', message: 'Hello' } });
    const res = mockRes();
    await sendMessageToCustomer(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('deactivateCustomer — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ params: { id: 'cust-1' } });
    const res = mockRes();
    await deactivateCustomer(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('deleteCustomer — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ params: { id: 'cust-1' } });
    const res = mockRes();
    await deleteCustomer(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('disableAffiliate — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ params: { id: 'aff-1' } });
    const res = mockRes();
    await disableAffiliate(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('adjustAffiliateEarnings — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB error')));
    const req = mockReq({ params: { id: 'aff-1' }, body: { amountCents: 5000 } });
    const res = mockRes();
    await adjustAffiliateEarnings(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('getReferralTracking — returns 500 when db.query throws', async () => {
    db.query = jest.fn().mockImplementation(() => Promise.reject(new Error('DB unavailable')));
    const req = mockReq({ query: {} });
    const res = mockRes();
    await getReferralTracking(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
