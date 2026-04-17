/**
 * refRoute unit tests
 *
 * Tests the single route: GET /api/ref/:refCode
 * - Normalizes and validates referral codes
 * - Looks up affiliate by username
 * - Sets affiliate_code cookie (httpOnly: false, 30-day maxAge)
 * - Redirects to target URL or /
 *
 * No prior coverage — refRoute was the only route file with zero tests.
 */

'use strict';

// ─── MOCKS ───────────────────────────────────────────────────────────────────

// Mock db before importing route
const mockDbQuery = jest.fn();
jest.mock('../src/config/database', () => ({ query: mockDbQuery }));

// ─── ENV SETUP ───────────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';

// ─── ROUTE UNDER TEST ─────────────────────────────────────────────────────────
// Import AFTER mocks are set up — refRoute imports db.config which uses mockDbQuery
const express = require('express');

// Build a fresh router from the route module's source by injecting the mock db
// We test normalizeAffiliateCode and the route handler directly.
const refRouteModule = require('../src/routes/refRoute');
const router = refRouteModule;

// Extract the normalizeAffiliateCode function by reading the route's source.
// It is a private function in the module scope, so we test it via behavior.
const path = require('path');
const fs = require('fs');
const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/refRoute.js'), 'utf8');

// ─── HELPER: extract normalizeAffiliateCode from source ───────────────────
// Since normalizeAffiliateCode is module-scoped (not exported), we parse the
// source to verify its logic indirectly through the route's behavior.
function buildReq(refCode, options = {}) {
  const { affiliateDbRow = null } = options;

  mockDbQuery.mockReset();
  mockDbQuery.mockResolvedValue({ rows: affiliateDbRow ? [affiliateDbRow] : [] });

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
  };

  return {
    req: { params: { refCode }, query: options.query || {}, headers: {} },
    res
  };
}

/**
 * Invoke the route handler directly by finding it on the router stack.
 * Works because express Router stores matched routes in .stack.
 */
function getHandler() {
  // The router has one route: /ref/:refCode
  const layer = router.stack.find(layer => layer.route && layer.route.path === '/ref/:refCode');
  if (!layer) throw new Error('Route /ref/:refCode not found in router stack');
  // layer.route.stack[0] is the layer for this route; .handle is the handler function
  return layer.route.stack[0].handle;
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe('refRoute — GET /api/ref/:refCode', () => {
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = getHandler();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Affiliate code validation (normalizeAffiliateCode logic)
  // ════════════════════════════════════════════════════════════════════════════

  describe('normalizeAffiliateCode validation', () => {
    test('rejects empty refCode → 400', async () => {
      const { req, res } = buildReq('');
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid referral code' });
    });

    test('rejects whitespace-only refCode → 400', async () => {
      const { req, res } = buildReq('   ');
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid referral code' });
    });

    test('strips special characters from refCode during lookup', async () => {
      const { req, res } = buildReq('abc@def!#$');
      await handler(req, res);
      // normalizeAffiliateCode strips [^a-zA-Z0-9_-] → 'abcdef'
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['abcdef']
      );
    });

    test('truncates refCode to 64 characters', async () => {
      const longCode = 'a'.repeat(80);
      const { req, res } = buildReq(longCode);
      await handler(req, res);
      // normalizeAffiliateCode slices to 64 chars before lookup
      expect(mockDbQuery.mock.calls[0][1][0]).toHaveLength(64);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Affiliate lookup
  // ════════════════════════════════════════════════════════════════════════════

  describe('affiliate lookup', () => {
    test('queries affiliates table by LOWER(username)', async () => {
      const { req, res } = buildReq('MyAffiliate', {
        affiliateDbRow: { id: 1, username: 'MyAffiliate', status: 'active' }
      });
      await handler(req, res);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(username) = LOWER'),
        ['MyAffiliate']
      );
    });

    test('redirects to / when affiliate not found (uses raw code as affiliate_code)', async () => {
      const { req, res } = buildReq('NonExistent');
      await handler(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/');
      expect(res.cookie).toHaveBeenCalledWith(
        'affiliate_code',
        'NonExistent',
        expect.any(Object)
      );
    });

    test('uses DB username (not input code) when affiliate found', async () => {
      const { req, res } = buildReq('lowercase', {
        affiliateDbRow: { id: 1, username: 'RealUsername', status: 'active' }
      });
      await handler(req, res);

      // affiliateResult.rows[0].username = 'RealUsername' is used for the cookie
      expect(res.cookie).toHaveBeenCalledWith(
        'affiliate_code',
        'RealUsername',
        expect.any(Object)
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Cookie settings
  // ════════════════════════════════════════════════════════════════════════════

  describe('cookie settings', () => {
    test('sets affiliate_code cookie with correct options', async () => {
      const { req, res } = buildReq('TestAffiliate');
      await handler(req, res);

      expect(res.cookie).toHaveBeenCalledWith('affiliate_code', 'TestAffiliate', {
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days in ms
        httpOnly: false,    // Must be readable by frontend JS at checkout
        sameSite: 'Lax',
        secure: false      // NODE_ENV = 'test' ≠ 'production'
      });
    });

    test('sets secure: true when NODE_ENV=production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Need to re-require to pick up the changed NODE_ENV
      jest.resetModules();
      jest.mock('../src/config/database', () => ({ query: mockDbQuery }));

      const { req, res } = buildReq('TestAffiliate');
      const prodHandler = getHandler();
      await prodHandler(req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'affiliate_code',
        'TestAffiliate',
        expect.objectContaining({ secure: true })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Redirect behavior
  // ════════════════════════════════════════════════════════════════════════════

  describe('redirect behavior', () => {
    test('redirects to / by default', async () => {
      const { req, res } = buildReq('SomeCode');
      await handler(req, res);
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('redirects to query.redirect when provided', async () => {
      const { req, res } = buildReq('SomeCode', { query: { redirect: '/checkout' } });
      await handler(req, res);
      expect(res.redirect).toHaveBeenCalledWith('/checkout');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Error handling
  // ════════════════════════════════════════════════════════════════════════════

  describe('error handling', () => {
    test('redirects to / on database error', async () => {
      mockDbQuery.mockRejectedValue(new Error('DB connection failed'));

      const req = { params: { refCode: 'SomeCode' }, query: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        redirect: jest.fn().mockReturnThis(),
        cookie: jest.fn().mockReturnThis(),
      };

      await handler(req, res);
      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });
});
