/**
 * Unit tests for authMiddleware_new.js
 *
 * Covers:
 * - protect: standard user JWT verification
 * - protectAffiliate: affiliate-specific JWT verification
 * - protectAdmin: admin-specific JWT verification
 * - resetTokenProtect: password reset token verification
 * - csrfProtection: CSRF token validation
 * - requireRole: role-based access control
 * - requireAffiliate: affiliate membership check
 * - require2FA: two-factor authentication check
 * - createRateLimiter: rate limiting
 * - accountLockout: account lockout check
 * - CSRF token generation/storage/verification
 * - setCsrfTokenCookie
 */

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

// Mock db.query before requiring the middleware
const mockDbQuery = jest.fn();
jest.mock('../../src/config/database', () => ({ query: mockDbQuery }));

// Mock jsonwebtoken — verify is used in middleware, sign is tested here
const mockJwtVerify = jest.fn();
const mockJwtSign = jest.fn();
jest.mock('jsonwebtoken', () => ({
  sign: (...args) => mockJwtSign(...args),
  verify: (...args) => mockJwtVerify(...args)
}));

const {
  protect,
  protectAffiliate,
  protectAdmin,
  resetTokenProtect,
  csrfProtection,
  requireRole,
  requireAffiliate,
  require2FA,
  createRateLimiter,
  accountLockout,
  generateCsrfToken,
  storeCsrfToken,
  verifyCsrfToken,
  setCsrfTokenCookie,
  csrfTokens // exported for test isolation
} = require('../../src/middleware/authMiddleware_new');

describe('authMiddleware_new', () => {
  // Reusable mock req/res/next factory
  const mockReq = (overrides = {}) => ({
    cookies: {},
    headers: {},
    body: {},
    originalUrl: '',
    url: '',
    path: '',
    user: null,
    ip: '127.0.0.1',
    method: 'GET',
    ...overrides
  });

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    res.getHeader = jest.fn();
    res.setHeader = jest.fn();
    return res;
  };

  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    mockJwtVerify.mockReset();
    mockJwtSign.mockReset();
    // Reset the in-memory CSRF token store between tests
    csrfTokens.clear();
  });

  // =============================================================================
  // CSRF Token Utilities
  // =============================================================================
  describe('generateCsrfToken', () => {
    test('returns a 64-character hex string (32 bytes)', () => {
      const token = generateCsrfToken();
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    test('returns different tokens on each call', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toEqual(token2);
    });
  });

  describe('storeCsrfToken', () => {
    test('stores token without throwing', () => {
      expect(() => storeCsrfToken('user-abc', 'token-xyz')).not.toThrow();
    });

    test('stored token is verifiable via verifyCsrfToken', () => {
      storeCsrfToken('user-verify', 'valid-token');
      expect(verifyCsrfToken('user-verify', 'valid-token')).toBe(true);
    });

    test('unknown token returns false', () => {
      expect(verifyCsrfToken('user-unknown', 'wrong-token')).toBe(false);
    });

    test('old tokens are cleaned up on store (15 min cutoff)', () => {
      // Manually inject an old token directly into the Map (20 min ago)
      const oldKey = 'user-old:old-token';
      csrfTokens.set(oldKey, Date.now() - 20 * 60 * 1000);

      storeCsrfToken('user-old', 'fresh-token');

      expect(csrfTokens.has(oldKey)).toBe(false); // old entry pruned
      expect(csrfTokens.has('user-old:fresh-token')).toBe(true); // new entry kept
    });
  });

  describe('verifyCsrfToken', () => {
    test('returns true for stored token', () => {
      storeCsrfToken('user-check', 'check-token');
      expect(verifyCsrfToken('user-check', 'check-token')).toBe(true);
    });

    test('returns false for missing user', () => {
      expect(verifyCsrfToken('nobody', 'any-token')).toBe(false);
    });

    test('returns false for wrong token', () => {
      storeCsrfToken('user-wrong', 'correct');
      expect(verifyCsrfToken('user-wrong', 'incorrect')).toBe(false);
    });
  });

  describe('setCsrfTokenCookie', () => {
    test('sets cookie with correct name, token, and options', () => {
      const res = mockRes();
      setCsrfTokenCookie(res, 'user-cookie');
      expect(res.cookie).toHaveBeenCalledTimes(1);
      const [name, token, options] = res.cookie.mock.calls[0];
      expect(name).toBe('csrfToken');
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(options.httpOnly).toBe(false);
      expect(options.sameSite).toBe('strict');
      expect(options.maxAge).toBe(15 * 60 * 1000);
    });

    test('secure is true in production', () => {
      const orig = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = mockRes();
        setCsrfTokenCookie(res, 'user-prod');
        expect(res.cookie.mock.calls[0][2].secure).toBe(true);
      } finally {
        process.env.NODE_ENV = orig;
      }
    });

    test('secure is false in development', () => {
      const orig = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        const res = mockRes();
        setCsrfTokenCookie(res, 'user-dev');
        expect(res.cookie.mock.calls[0][2].secure).toBe(false);
      } finally {
        process.env.NODE_ENV = orig;
      }
    });

    test('stores the token in csrfTokens map', () => {
      const res = mockRes();
      const beforeSize = csrfTokens.size;
      setCsrfTokenCookie(res, 'user-map-check');
      expect(csrfTokens.size).toBe(beforeSize + 1);
    });
  });

  // =============================================================================
  // protect — Standard User JWT Verification
  // =============================================================================
  describe('protect', () => {
    test('skips auth for public path /auth/customer/login', async () => {
      const req = mockReq({ originalUrl: '/auth/customer/login' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockJwtVerify).not.toHaveBeenCalled();
    });

    test('skips auth for public path /auth/login', async () => {
      const req = mockReq({ originalUrl: '/auth/login' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('skips auth for public path /auth/register', async () => {
      const req = mockReq({ originalUrl: '/auth/register' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('skips auth for public path /auth/customer/register', async () => {
      const req = mockReq({ originalUrl: '/auth/customer/register' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('skips auth for public path /auth/customer/recovery', async () => {
      const req = mockReq({ originalUrl: '/auth/customer/recovery' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('returns 401 when no token in cookies or Authorization header', async () => {
      const req = mockReq({ originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('reads token from cookies.accessToken', async () => {
      mockJwtVerify.mockReturnValue({ userId: 'user-123', role: 'user' });
      const req = mockReq({ cookies: { accessToken: 'cookie-token' }, originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(mockJwtVerify).toHaveBeenCalledWith('cookie-token', 'test-secret');
      expect(req.user.id).toBe('user-123');
      expect(req.user.role).toBe('user');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('reads token from Authorization Bearer header when no cookie', async () => {
      mockJwtVerify.mockReturnValue({ userId: 'user-456', role: 'user' });
      const req = mockReq({ headers: { authorization: 'Bearer bearer-token' }, originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(mockJwtVerify).toHaveBeenCalledWith('bearer-token', 'test-secret');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('returns 401 when token payload has no identifiable user ID', async () => {
      mockJwtVerify.mockReturnValue({}); // no userId, id, adminId, or affiliateId
      const req = mockReq({ cookies: { accessToken: 'bad-token' }, originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token payload' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('returns 401 when jwt.verify throws (expired/revoked token)', async () => {
      mockJwtVerify.mockImplementation(() => { throw new Error('jwt expired'); });
      const req = mockReq({ cookies: { accessToken: 'expired-token' }, originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('picks userId from decoded token', async () => {
      mockJwtVerify.mockReturnValue({ userId: 'uid-001', role: 'user' });
      const req = mockReq({ cookies: { accessToken: 'token' }, originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(req.user.id).toBe('uid-001');
      expect(req.user.role).toBe('user');
    });

    test('picks id as fallback from decoded token', async () => {
      mockJwtVerify.mockReturnValue({ id: 'id-002', role: 'user' });
      const req = mockReq({ cookies: { accessToken: 'token' }, originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(req.user.id).toBe('id-002');
    });

    test('picks adminId from decoded token', async () => {
      mockJwtVerify.mockReturnValue({ adminId: 'admin-003', role: 'admin' });
      const req = mockReq({ cookies: { accessToken: 'token' }, originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(req.user.id).toBe('admin-003');
    });

    test('picks affiliateId from decoded token', async () => {
      mockJwtVerify.mockReturnValue({ affiliateId: 'aff-004', role: 'affiliate' });
      const req = mockReq({ cookies: { accessToken: 'token' }, originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(req.user.id).toBe('aff-004');
    });

    test('sets affiliateId on req.user when present', async () => {
      mockJwtVerify.mockReturnValue({ userId: 'u-005', affiliateId: 'aff-005' });
      const req = mockReq({ cookies: { accessToken: 'token' }, originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(req.user.affiliateId).toBe('aff-005');
    });

    test('sets type from affiliateType field', async () => {
      mockJwtVerify.mockReturnValue({ userId: 'u-006', affiliateType: 'affiliate' });
      const req = mockReq({ cookies: { accessToken: 'token' }, originalUrl: '/api/user/profile' });
      const res = mockRes();
      await protect(req, res, mockNext);
      expect(req.user.type).toBe('affiliate');
    });

    test('uses originalUrl as the primary path source', async () => {
      // Even when both originalUrl and url are set, originalUrl takes precedence for PUBLIC_PATHS check
      // A path that IS in PUBLIC_PATHS via originalUrl should skip auth
      const req = mockReq({ originalUrl: '/auth/login', url: '/fallback' });
      const res = mockRes();
      await protect(req, res, mockNext);
      // /auth/login is a public path → jwt.verify should NOT be called
      expect(mockJwtVerify).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // protectAffiliate — Affiliate JWT Verification
  // =============================================================================
  describe('protectAffiliate', () => {
    test('returns 401 when no token provided', async () => {
      const req = mockReq();
      const res = mockRes();
      await protectAffiliate(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    });

    test('returns 403 when type is not affiliate', async () => {
      mockJwtVerify.mockReturnValue({ userId: 'u-aff-1', type: 'user' });
      const req = mockReq({ cookies: { accessToken: 'token' } });
      const res = mockRes();
      await protectAffiliate(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate access required' });
    });

    test('returns 403 when affiliateId is missing despite affiliate type', async () => {
      mockJwtVerify.mockReturnValue({ userId: 'u-aff-2', type: 'affiliate' }); // no affiliateId
      const req = mockReq({ cookies: { accessToken: 'token' } });
      const res = mockRes();
      await protectAffiliate(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('sets req.affiliateId for valid affiliate token', async () => {
      mockJwtVerify.mockReturnValue({ userId: 'u-aff-3', affiliateId: 'aff-3', type: 'affiliate' });
      const req = mockReq({ cookies: { accessToken: 'token' } });
      const res = mockRes();
      await protectAffiliate(req, res, mockNext);
      expect(req.user.id).toBe('u-aff-3');
      expect(req.user.affiliateId).toBe('aff-3');
      expect(req.user.type).toBe('affiliate');
      expect(req.affiliateId).toBe('aff-3');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('reads from Authorization Bearer header', async () => {
      mockJwtVerify.mockReturnValue({ userId: 'u-aff-4', affiliateId: 'aff-4', type: 'affiliate' });
      const req = mockReq({ headers: { authorization: 'Bearer aff-token' } });
      const res = mockRes();
      await protectAffiliate(req, res, mockNext);
      expect(mockJwtVerify).toHaveBeenCalledWith('aff-token', 'test-secret');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('returns 401 on jwt.verify error', async () => {
      mockJwtVerify.mockImplementation(() => { throw new Error('invalid'); });
      const req = mockReq({ cookies: { accessToken: 'token' } });
      const res = mockRes();
      await protectAffiliate(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });
  });

  // =============================================================================
  // protectAdmin — Admin JWT Verification
  // =============================================================================
  describe('protectAdmin', () => {
    test('returns 401 when no token provided', async () => {
      const req = mockReq();
      const res = mockRes();
      await protectAdmin(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('returns 403 when type is not admin', async () => {
      mockJwtVerify.mockReturnValue({ adminId: 'admin-1', type: 'user' });
      const req = mockReq({ cookies: { accessToken: 'token' } });
      const res = mockRes();
      await protectAdmin(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    });

    test('returns 403 when adminId is missing', async () => {
      mockJwtVerify.mockReturnValue({ type: 'admin' }); // no adminId
      const req = mockReq({ cookies: { accessToken: 'token' } });
      const res = mockRes();
      await protectAdmin(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('passes with valid admin token', async () => {
      mockJwtVerify.mockReturnValue({ adminId: 'admin-2', role: 'admin', type: 'admin' });
      const req = mockReq({ cookies: { accessToken: 'token' } });
      const res = mockRes();
      await protectAdmin(req, res, mockNext);
      expect(req.user.adminId).toBe('admin-2');
      expect(req.user.role).toBe('admin');
      expect(req.user.type).toBe('admin');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('reads from Authorization Bearer header', async () => {
      mockJwtVerify.mockReturnValue({ adminId: 'admin-3', type: 'admin' });
      const req = mockReq({ headers: { authorization: 'Bearer admin-token' } });
      const res = mockRes();
      await protectAdmin(req, res, mockNext);
      expect(mockJwtVerify).toHaveBeenCalledWith('admin-token', 'test-secret');
    });

    test('returns 401 on jwt.verify error', async () => {
      mockJwtVerify.mockImplementation(() => { throw new Error('jwt error'); });
      const req = mockReq({ cookies: { accessToken: 'token' } });
      const res = mockRes();
      await protectAdmin(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });
  });

  // =============================================================================
  // resetTokenProtect — Password Reset Token Verification
  // =============================================================================
  describe('resetTokenProtect', () => {
    test('returns 401 when x-reset-token header is missing', async () => {
      const req = mockReq({ headers: {} });
      const res = mockRes();
      await resetTokenProtect(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Reset token required' });
    });

    test('returns 401 when token purpose is not reset', async () => {
      mockJwtVerify.mockReturnValue({ purpose: 'other' });
      const req = mockReq({ headers: { 'x-reset-token': 'some-token' } });
      const res = mockRes();
      await resetTokenProtect(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid reset token' });
    });

    test('passes with valid reset token', async () => {
      mockJwtVerify.mockReturnValue({ affiliateId: 'aff-reset', purpose: 'reset' });
      const req = mockReq({ headers: { 'x-reset-token': 'valid-reset-token' } });
      const res = mockRes();
      await resetTokenProtect(req, res, mockNext);
      expect(req.user.affiliateId).toBe('aff-reset');
      expect(req.user.purpose).toBe('reset');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('returns 401 on jwt.verify error', async () => {
      mockJwtVerify.mockImplementation(() => { throw new Error('expired'); });
      const req = mockReq({ headers: { 'x-reset-token': 'bad-token' } });
      const res = mockRes();
      await resetTokenProtect(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired reset token' });
    });
  });

  // =============================================================================
  // csrfProtection — CSRF Protection
  // =============================================================================
  describe('csrfProtection', () => {
    test('skips GET requests', async () => {
      const req = mockReq({ method: 'GET' });
      const res = mockRes();
      await csrfProtection(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('skips HEAD requests', async () => {
      const req = mockReq({ method: 'HEAD' });
      const res = mockRes();
      await csrfProtection(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('skips OPTIONS requests', async () => {
      const req = mockReq({ method: 'OPTIONS' });
      const res = mockRes();
      await csrfProtection(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('returns 403 when CSRF token missing and user is not set', async () => {
      const req = mockReq({ method: 'POST', headers: {}, body: {} });
      const res = mockRes();
      await csrfProtection(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'CSRF token missing' });
    });

    test('returns 403 when user is not set on req', async () => {
      const req = mockReq({ method: 'POST', headers: { 'x-csrf-token': 'some-token' } });
      const res = mockRes();
      await csrfProtection(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 403 when CSRF token is invalid', async () => {
      storeCsrfToken('user-csrf', 'valid-token');
      const req = mockReq({ method: 'POST', user: { id: 'user-csrf' }, headers: { 'x-csrf-token': 'wrong-token' } });
      const res = mockRes();
      await csrfProtection(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ refreshCsrf: true }));
      // Should issue a refresh token cookie
      expect(res.cookie).toHaveBeenCalled();
    });

    test('passes when CSRF token is valid from header', async () => {
      storeCsrfToken('user-csrf2', 'good-token');
      const req = mockReq({ method: 'POST', user: { id: 'user-csrf2' }, headers: { 'x-csrf-token': 'good-token' } });
      const res = mockRes();
      await csrfProtection(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('passes when CSRF token is valid from body (_csrf)', async () => {
      storeCsrfToken('user-csrf3', 'body-token');
      const req = mockReq({ method: 'POST', user: { id: 'user-csrf3' }, body: { _csrf: 'body-token' } });
      const res = mockRes();
      await csrfProtection(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('uses adminId when user is admin', async () => {
      storeCsrfToken('admin-1', 'admin-token');
      const req = mockReq({ method: 'POST', user: { adminId: 'admin-1' }, headers: { 'x-csrf-token': 'admin-token' } });
      const res = mockRes();
      await csrfProtection(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('uses affiliateId when user is affiliate', async () => {
      storeCsrfToken('aff-csrf', 'aff-token');
      const req = mockReq({ method: 'POST', user: { affiliateId: 'aff-csrf' }, headers: { 'x-csrf-token': 'aff-token' } });
      const res = mockRes();
      await csrfProtection(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // requireRole — Role-Based Access Control
  // =============================================================================
  describe('requireRole', () => {
    test('returns 401 when req.user.id is missing', async () => {
      const middleware = requireRole('admin');
      const req = mockReq({ user: null });
      const res = mockRes();
      await middleware(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    });

    test('queries DB for is_admin when role is admin', async () => {
      mockDbQuery.mockResolvedValue({ rows: [{ is_admin: true }] });
      const middleware = requireRole('admin');
      const req = mockReq({ user: { id: 'user-admin' } });
      const res = mockRes();
      await middleware(req, res, mockNext);
      expect(mockDbQuery).toHaveBeenCalledWith(
        'SELECT is_admin FROM users WHERE id = $1',
        ['user-admin']
      );
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('returns 404 when user not found in DB', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });
      const middleware = requireRole('admin');
      const req = mockReq({ user: { id: 'ghost-user' } });
      const res = mockRes();
      await middleware(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    test('returns 403 when user is not admin but admin role required', async () => {
      mockDbQuery.mockResolvedValue({ rows: [{ is_admin: false }] });
      const middleware = requireRole('admin');
      const req = mockReq({ user: { id: 'regular-user' } });
      const res = mockRes();
      await middleware(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    });

    test('passes when user has admin role', async () => {
      mockDbQuery.mockResolvedValue({ rows: [{ is_admin: true }] });
      const middleware = requireRole('admin');
      const req = mockReq({ user: { id: 'real-admin' } });
      const res = mockRes();
      await middleware(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // requireAffiliate — Affiliate Membership Check
  // =============================================================================
  describe('requireAffiliate', () => {
    test('returns 401 when req.user.id is missing', async () => {
      const req = mockReq({ user: null });
      const res = mockRes();
      await requireAffiliate(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    });

    test('queries affiliates table for user_id', async () => {
      mockDbQuery.mockResolvedValue({ rows: [{ id: 'affiliate-row-id' }] });
      const req = mockReq({ user: { id: 'user-aff' } });
      const res = mockRes();
      await requireAffiliate(req, res, mockNext);
      expect(mockDbQuery).toHaveBeenCalledWith(
        'SELECT id FROM affiliates WHERE user_id = $1',
        ['user-aff']
      );
      expect(req.affiliateId).toBe('affiliate-row-id');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('returns 403 when user is not an affiliate', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });
      const req = mockReq({ user: { id: 'non-aff' } });
      const res = mockRes();
      await requireAffiliate(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Affiliate access required' });
    });
  });

  // =============================================================================
  // require2FA — Two-Factor Authentication Check
  // =============================================================================
  describe('require2FA', () => {
    test('returns 401 when req.user.id is missing', async () => {
      const req = mockReq({ user: null });
      const res = mockRes();
      await require2FA(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    });

    test('returns 404 when user not found', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });
      const req = mockReq({ user: { id: 'ghost-2fa' } });
      const res = mockRes();
      await require2FA(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    test('passes when 2FA is not enabled', async () => {
      mockDbQuery.mockResolvedValue({ rows: [{ totp_enabled: false }] });
      const req = mockReq({ user: { id: 'user-no-2fa' } });
      const res = mockRes();
      await require2FA(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('passes when 2FA is enabled and was verified within 15 minutes', async () => {
      const recent = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
      mockDbQuery.mockResolvedValue({
        rows: [{ totp_enabled: true, last_2fa_verification: recent }]
      });
      const req = mockReq({ user: { id: 'user-2fa-recent' } });
      const res = mockRes();
      await require2FA(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('returns 403 when 2FA is enabled but not verified recently', async () => {
      const old = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
      mockDbQuery.mockResolvedValue({
        rows: [{ totp_enabled: true, last_2fa_verification: old }]
      });
      const req = mockReq({ user: { id: 'user-2fa-stale' } });
      const res = mockRes();
      await require2FA(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ requires2FA: true })
      );
    });

    test('returns 403 when 2FA is enabled but never verified (null)', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [{ totp_enabled: true, last_2fa_verification: null }]
      });
      const req = mockReq({ user: { id: 'user-2fa-never' } });
      const res = mockRes();
      await require2FA(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ requires2FA: true })
      );
    });
  });

  // =============================================================================
  // createRateLimiter — Rate Limiting
  // =============================================================================
  describe('createRateLimiter', () => {
    test('allows requests under the limit', () => {
      const limiter = createRateLimiter(60 * 1000, 3); // 3 per minute
      const req = mockReq({ ip: '1.2.3.4', path: '/test' });
      const res = mockRes();
      limiter(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('blocks requests over the limit', () => {
      const limiter = createRateLimiter(60 * 1000, 2); // 2 per minute
      const req = mockReq({ ip: '5.6.7.8', path: '/limited' });
      const res = mockRes();

      // First two succeed
      limiter(req, res, mockNext);
      limiter(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);

      // Third is blocked
      const blockedRes = mockRes();
      const blockedNext = jest.fn();
      limiter(req, res, blockedNext);
      expect(blockedNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests' });
    });

    test('uses custom error message', () => {
      const limiter = createRateLimiter(60 * 1000, 1, 'Custom rate limit message');
      const req = mockReq({ ip: '9.9.9.9', path: '/custom' });
      const res = mockRes();

      limiter(req, res, mockNext); // first OK
      const blockedNext = jest.fn();
      const blockedRes = mockRes();
      limiter(req, res, blockedNext); // blocked
      expect(res.json).toHaveBeenCalledWith({ error: 'Custom rate limit message' });
    });

    test('rate limits per IP and path combination', () => {
      const limiter = createRateLimiter(60 * 1000, 1);
      const req1 = mockReq({ ip: '1.1.1.1', path: '/path-a' });
      const req2 = mockReq({ ip: '2.2.2.2', path: '/path-a' });
      const req3 = mockReq({ ip: '1.1.1.1', path: '/path-b' });
      const res = mockRes();

      limiter(req1, res, mockNext); // IP1 /path-a → OK
      limiter(req2, res, mockNext); // IP2 /path-a → OK (different IP)
      limiter(req3, res, mockNext); // IP1 /path-b → OK (different path)
      expect(mockNext).toHaveBeenCalledTimes(3);
    });

    test('old entries expire after windowMs', () => {
      jest.useFakeTimers();
      const limiter = createRateLimiter(5 * 1000, 1); // 1 per 5 seconds

      const req1 = mockReq({ ip: 't1', path: '/win' });
      const res1 = mockRes();
      limiter(req1, res1, mockNext); // first OK

      const blockedNext = jest.fn();
      const blockedRes = mockRes();
      limiter(req1, res1, blockedNext); // blocked
      expect(blockedNext).not.toHaveBeenCalled();

      // Advance time past the window
      jest.advanceTimersByTime(6 * 1000);

      const successNext = jest.fn();
      const successRes = mockRes();
      limiter(req1, res1, successNext); // should succeed now
      expect(successNext).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  // =============================================================================
  // accountLockout — Account Lockout Check
  // =============================================================================
  describe('accountLockout', () => {
    test('calls next() when accountNumber is not in body', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      await accountLockout(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockDbQuery).not.toHaveBeenCalled();
    });

    test('queries users table for account_number', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });
      const req = mockReq({ body: { accountNumber: 'ACC123' } });
      const res = mockRes();
      await accountLockout(req, res, mockNext);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT lockout_until, failed_attempts'),
        ['ACC123']
      );
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('returns 423 when account is locked out (future lockout_until)', async () => {
      const futureLockout = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
      mockDbQuery.mockResolvedValue({
        rows: [{ lockout_until: futureLockout, failed_attempts: 5 }]
      });
      const req = mockReq({ body: { accountNumber: 'LOCKED' } });
      const res = mockRes();
      await accountLockout(req, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(423);
      // lockoutUntil is passed as a raw Date object (middleware does: lockoutUntil: user.lockout_until)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Account temporarily locked. Please try again later.',
        lockoutUntil: futureLockout
      });
    });

    test('calls next() when lockout_until is in the past', async () => {
      const pastLockout = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
      mockDbQuery.mockResolvedValue({
        rows: [{ lockout_until: pastLockout, failed_attempts: 5 }]
      });
      const req = mockReq({ body: { accountNumber: 'UNLOCKED' } });
      const res = mockRes();
      await accountLockout(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });
});
