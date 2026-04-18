/**
 * webhookController unit tests
 *
 * Tests all exported functions from webhookController.js (679 lines, 0% prior coverage).
 *
 * Mock strategy:
 *   - db.query: jest.fn() with mockImplementation default returning {rows:[]} + mockResolvedValueOnce per test
 *   - crypto: jest.requireActual('crypto') for real HMAC computation in signature verification tests
 *   - fs: jest.mock('fs') for logAuthorizeEvent tests
 *   - Services: jest.mock for emailService, plisioService, paymentProcessingService, authorizeNetUtils, userService
 *
 * CRITICAL: process.env values must be set BEFORE importing the controller module.
 *
 * Jest gotcha (documented in authController.test.js):
 *   jest.clearAllMocks() clears call history but NOT mockImpl/mockReturnValue.
 *   Use mockReset() + mockImplementation(() => default) in beforeEach instead.
 */

'use strict';

// ─── MOCKS — must be before controller import ─────────────────────────────────
// Mock fs FIRST (used by logAuthorizeEvent and path module setup)
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn()
}));

// Mock argon2 — required because webhookController.js imports it at top level
// (even though webhook handlers don't use it directly, the import itself triggers loading)
jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed_value'),
  verify: jest.fn().mockResolvedValue(true)
}));

// Mock uuid — used by authorizeNetWebhook to generate payment IDs
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-v4-0000-0000-0000-000000000000')
}));

// Mock node-fetch — imported at top level but not used in webhook handlers
jest.mock('node-fetch', () => jest.fn());

// Mock promoService — imported at top level but not used in webhook handlers
jest.mock('../src/services/promoService', () => ({
  applyPromotion: jest.fn().mockResolvedValue({ applied: true })
}));

// Mock DB — db.query is called for replay checks and subscription lookups
const mockDbQuery = jest.fn();
jest.mock('../src/config/database', () => ({ query: mockDbQuery }));

// Mock emailService — called when VPN account is created
jest.mock('../src/services/emailService', () => ({
  sendAccountCreatedEmail: jest.fn().mockResolvedValue(true)
}));

// Mock plisioService — imported but not used in webhook handlers
jest.mock('../src/services/plisioService', () => ({
  findPendingTransaction: jest.fn()
}));

// Mock paymentProcessingService — processPlisioPaymentAsync called by plisioWebhook
// processPaymentsCloudPaymentAsync called by paymentsCloudWebhook
jest.mock('../src/services/paymentProcessingService', () => ({
  processPlisioPaymentAsync: jest.fn().mockResolvedValue(true),
  processPaymentsCloudPaymentAsync: jest.fn().mockResolvedValue(true)
}));

// Mock authorizeNetUtils — getAuthorizeTransactionDetails and AuthorizeNetService
// used by authorizeNetWebhook for transaction lookup and ARB creation
jest.mock('../src/services/authorizeNetUtils', () => ({
  getAuthorizeTransactionDetails: jest.fn(),
  AuthorizeNetService: jest.fn().mockImplementation(() => ({
    createArbSubscriptionFromProfile: jest.fn().mockResolvedValue({ subscriptionId: 'arb123' })
  }))
}));

// Mock userService — createVpnAccount called by authorizeNetWebhook
jest.mock('../src/services/userService', () => ({
  createVpnAccount: jest.fn().mockResolvedValue({ username: 'testuser', password: 'testpass' })
}));

// Mock paymentController — applyAffiliateCommissionIfEligible imported but not used in handlers
jest.mock('../src/controllers/paymentController', () => ({
  applyAffiliateCommissionIfEligible: jest.fn().mockResolvedValue(true)
}));

// ─── ENV SETUP ────────────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.PLISIO_API_KEY = 'test-plisio-api-key-32chars!!';
process.env.PAYCLOUD_SECRET = 'test-paycloud-secret';
// 64-char hex string (32 bytes) as required by Authorize.Net SHA-512 signature
process.env.AUTHORIZE_SIGNATURE_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.DEBUG_AUTHORIZE_NET = 'false';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const path = require('path');

/**
 * Build a mock request object.
 * @param {string} method - 'GET' or 'POST'
 * @param {object} queryOrBody - query params for GET, body for POST
 * @param {object} headers - additional headers
 */
function buildReq(method, queryOrBody = {}, headers = {}) {
  return {
    method: method || 'POST',
    query: method === 'GET' ? queryOrBody : {},
    body: method !== 'GET' ? queryOrBody : {},
    headers: {
      'x-plisio-signature': headers['x-plisio-signature'],
      'x-paymentscloud-signature': headers['x-paymentscloud-signature'],
      'x-anet-signature': headers['x-anet-signature'],
      ...headers
    },
    rawBody: headers.rawBody || null
  };
}

/**
 * Compute expected Plisio HMAC-SHA1 signature for given params.
 * Mirrors the logic in WebhookVerifier.verifyPlisio (Method 1).
 */
function computePlisioSignature(apiKey, params) {
  const sortedKeys = Object.keys(params).filter(k => k !== 'verify_hash').sort();
  const sorted = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHmac('sha1', apiKey).update(sorted).digest('hex');
}

/**
 * Compute expected PaymentsCloud HMAC-SHA256 signature.
 */
function computePaymentsCloudSignature(secret, body) {
  const payload = JSON.stringify(body);
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Build a valid Authorize.Net request with hex-key HMAC-SHA512 signature.
 * @param {object} body - request body
 * @param {string} sigHeaderValue - 'valid_hex' to auto-compute, or a specific signature string
 */
function buildAuthorizeReq(body, sigHeaderValue = 'valid_hex') {
  const raw = Buffer.from(JSON.stringify(body));
  const key = process.env.AUTHORIZE_SIGNATURE_KEY;
  const expectedHexKey = crypto
    .createHmac('sha512', Buffer.from(key, 'hex'))
    .update(raw)
    .digest('hex');
  const sig = sigHeaderValue === 'valid_hex' ? expectedHexKey : sigHeaderValue;
  return {
    method: 'POST',
    body,
    query: {},
    headers: { 'x-anet-signature': sig },
    rawBody: raw
  };
}

// ─── UNIT UNDER TEST ─────────────────────────────────────────────────────────
const {
  WebhookVerifier,
  plisioWebhook,
  paymentsCloudWebhook,
  authorizeNetWebhook,
  logAuthorizeEvent
} = require('../src/controllers/webhookController');

const fs = require('fs');

// ══════════════════════════════════════════════════════════════════════════════
// WebhookVerifier.verifyPlisio
// HMAC-SHA1 signature verification — two methods: header (Method 1) and verify_hash (Method 2)
// ══════════════════════════════════════════════════════════════════════════════
describe('WebhookVerifier.verifyPlisio', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  // ─── Method 1: X-Plisio-Signature header ─────────────────────────────────
  describe('Method 1: X-Plisio-Signature header (HMAC-SHA1)', () => {
    test('returns true for valid signature on POST request', () => {
      const params = { invoice_id: 'inv123', amount: '10.00', currency: 'BTC' };
      const signature = computePlisioSignature(process.env.PLISIO_API_KEY, params);
      const req = buildReq('POST', params, { 'x-plisio-signature': signature });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(true);
    });

    test('returns true for valid signature on GET request (query params)', () => {
      const params = { invoice_id: 'inv456', status: 'completed' };
      const signature = computePlisioSignature(process.env.PLISIO_API_KEY, params);
      const req = buildReq('GET', params, { 'x-plisio-signature': signature });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(true);
    });

    test('returns false for invalid/tampered signature', () => {
      const params = { invoice_id: 'inv123', amount: '10.00' };
      const req = buildReq('POST', params, { 'x-plisio-signature': 'invalid_signature_here' });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
    });

    test('returns false when params are tampered after signing', () => {
      const originalParams = { invoice_id: 'inv123', amount: '10.00' };
      const tamperedParams = { invoice_id: 'inv123', amount: '999.00' };
      const signature = computePlisioSignature(process.env.PLISIO_API_KEY, originalParams);
      const req = buildReq('POST', tamperedParams, { 'x-plisio-signature': signature });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
    });

    test('returns false when no X-Plisio-Signature header is provided', () => {
      const req = buildReq('POST', { invoice_id: 'inv123' }, {});
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
    });

    test('returns false for empty signature string', () => {
      const req = buildReq('POST', { invoice_id: 'inv123' }, { 'x-plisio-signature': '' });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
    });
  });

  // ─── Method 2: verify_hash in body ───────────────────────────────────────
  describe('Method 2: verify_hash in body params (HMAC-SHA1)', () => {
    test('returns true when verify_hash matches computed HMAC', () => {
      const paramsWithoutHash = { invoice_id: 'inv789', amount: '20.00' };
      const hash = computePlisioSignature(process.env.PLISIO_API_KEY, paramsWithoutHash);
      const paramsWithHash = { ...paramsWithoutHash, verify_hash: hash };
      const req = buildReq('POST', paramsWithHash, {});
      expect(WebhookVerifier.verifyPlisio(req)).toBe(true);
    });

    test('returns false when verify_hash is present but does not match', () => {
      const params = { invoice_id: 'inv999', verify_hash: 'wrong_hash_value_000000' };
      const req = buildReq('POST', params, {});
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
    });
  });

  // ─── Method precedence ────────────────────────────────────────────────────
  describe('Method precedence (header wins over verify_hash)', () => {
    test('Method 1 (header) takes precedence when both header and verify_hash present', () => {
      const params = { invoice_id: 'inv_precedence' };
      const correctSig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
      // Wrong hash for Method 2 — but header (Method 1) is valid so overall is valid
      const wrongHash = computePlisioSignature(process.env.PLISIO_API_KEY, { ...params, extra: 'x' });
      const req = buildReq('POST', params, { 'x-plisio-signature': correctSig, verify_hash: wrongHash });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(true);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────
  describe('Environment edge cases', () => {
    test('returns false (and logs warning) when PLISIO_API_KEY is not set', () => {
      const originalKey = process.env.PLISIO_API_KEY;
      delete process.env.PLISIO_API_KEY;
      const req = buildReq('POST', { invoice_id: 'inv123' }, { 'x-plisio-signature': 'any' });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith('PLISIO_API_KEY not configured');
      process.env.PLISIO_API_KEY = originalKey;
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// WebhookVerifier.verifyPaymentsCloud
// HMAC-SHA256 signature verification for PaymentsCloud webhooks
// ══════════════════════════════════════════════════════════════════════════════
describe('WebhookVerifier.verifyPaymentsCloud', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  test('returns true for valid HMAC-SHA256 signature', () => {
    const body = { event: 'payment.succeeded', data: { id: 'pc_123' } };
    const signature = computePaymentsCloudSignature(process.env.PAYCLOUD_SECRET, body);
    const req = buildReq('POST', body, { 'x-paymentscloud-signature': signature });
    expect(WebhookVerifier.verifyPaymentsCloud(req)).toBe(true);
  });

  test('returns false for invalid signature', () => {
    const body = { event: 'payment.succeeded', data: { id: 'pc_123' } };
    const req = buildReq('POST', body, { 'x-paymentscloud-signature': 'bad_signature' });
    expect(WebhookVerifier.verifyPaymentsCloud(req)).toBe(false);
  });

  test('returns false for tampered payload', () => {
    const originalBody = { event: 'payment.succeeded', data: { id: 'pc_123' } };
    const tamperedBody = { event: 'payment.succeeded', data: { id: 'pc_999' } };
    const signature = computePaymentsCloudSignature(process.env.PAYCLOUD_SECRET, originalBody);
    const req = buildReq('POST', tamperedBody, { 'x-paymentscloud-signature': signature });
    expect(WebhookVerifier.verifyPaymentsCloud(req)).toBe(false);
  });

  test('returns false when no signature header is provided', () => {
    const body = { event: 'payment.succeeded', data: { id: 'pc_123' } };
    const req = buildReq('POST', body, {});
    expect(WebhookVerifier.verifyPaymentsCloud(req)).toBe(false);
  });

  test('returns false (and logs warning) when PAYCLOUD_SECRET is not set', () => {
    const originalSecret = process.env.PAYCLOUD_SECRET;
    delete process.env.PAYCLOUD_SECRET;
    const body = { event: 'payment.succeeded', data: { id: 'pc_123' } };
    const req = buildReq('POST', body, { 'x-paymentscloud-signature': 'any' });
    expect(WebhookVerifier.verifyPaymentsCloud(req)).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith('PAYCLOUD_SECRET not configured');
    process.env.PAYCLOUD_SECRET = originalSecret;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// WebhookVerifier.verifyAuthorizeNet
// HMAC-SHA512 with dual-key support: hex bytes (Authorize.Net docs) and ASCII string
// ══════════════════════════════════════════════════════════════════════════════
describe('WebhookVerifier.verifyAuthorizeNet', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  test('returns true for valid hex-key HMAC-SHA512 signature', () => {
    const body = { eventType: 'payment.succeeded', id: 'txn_123' };
    const req = buildAuthorizeReq(body, 'valid_hex');
    expect(WebhookVerifier.verifyAuthorizeNet(req)).toBe(true);
  });

  test('returns false for invalid signature', () => {
    const body = { eventType: 'payment.succeeded', id: 'txn_123' };
    const req = buildAuthorizeReq(body, 'invalid_sig_0000000000000000000000000000000000000000000000000000000000000000');
    expect(WebhookVerifier.verifyAuthorizeNet(req)).toBe(false);
  });

  test('returns false when no signature header is provided', () => {
    const req = { method: 'POST', body: {}, query: {}, headers: {}, rawBody: Buffer.from('{}') };
    expect(WebhookVerifier.verifyAuthorizeNet(req)).toBe(false);
  });

  test('accepts sha512= prefix on signature header', () => {
    const body = { id: 'txn_456' };
    const raw = Buffer.from(JSON.stringify(body));
    const key = process.env.AUTHORIZE_SIGNATURE_KEY;
    const sig = crypto.createHmac('sha512', Buffer.from(key, 'hex')).update(raw).digest('hex');
    const req = { method: 'POST', body, query: {}, headers: { 'x-anet-signature': `sha512=${sig}` }, rawBody: raw };
    expect(WebhookVerifier.verifyAuthorizeNet(req)).toBe(true);
  });

  test('accepts sha512: prefix on signature header', () => {
    const body = { id: 'txn_789' };
    const raw = Buffer.from(JSON.stringify(body));
    const key = process.env.AUTHORIZE_SIGNATURE_KEY;
    const sig = crypto.createHmac('sha512', Buffer.from(key, 'hex')).update(raw).digest('hex');
    const req = { method: 'POST', body, query: {}, headers: { 'x-anet-signature': `sha512:${sig}` }, rawBody: raw };
    expect(WebhookVerifier.verifyAuthorizeNet(req)).toBe(true);
  });

  test('returns false when AUTHORIZE_SIGNATURE_KEY is not set', () => {
    const originalKey = process.env.AUTHORIZE_SIGNATURE_KEY;
    delete process.env.AUTHORIZE_SIGNATURE_KEY;
    const raw = Buffer.from('{}');
    const req = { method: 'POST', body: {}, query: {}, headers: { 'x-anet-signature': 'sha512=abc' }, rawBody: raw };
    expect(WebhookVerifier.verifyAuthorizeNet(req)).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith('AUTHORIZE_SIGNATURE_KEY not configured');
    process.env.AUTHORIZE_SIGNATURE_KEY = originalKey;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// WebhookVerifier.isReplayAttack + recordWebhook
// Async DB-based replay attack detection and webhook recording
// ══════════════════════════════════════════════════════════════════════════════
describe('WebhookVerifier.isReplayAttack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
  });

  test('returns false when webhook_id is not in database (first time seen)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await WebhookVerifier.isReplayAttack('webhook_abc', 'plisio');
    expect(result).toBe(false);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'SELECT id FROM webhook_verifications WHERE webhook_id = $1 AND provider = $2',
      ['webhook_abc', 'plisio']
    );
  });

  test('returns true when webhook_id already exists in database', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const result = await WebhookVerifier.isReplayAttack('webhook_xyz', 'paymentscloud');
    expect(result).toBe(true);
  });

  test('queries correct provider column per call', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await WebhookVerifier.isReplayAttack('id_123', 'authorize');
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('provider = $2'),
      ['id_123', 'authorize']
    );
  });
});

describe('WebhookVerifier.recordWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
  });

  test('inserts webhook record into database with ON CONFLICT DO NOTHING', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await WebhookVerifier.recordWebhook('inv_999', 'plisio', 'sig_abc');
    const [sql] = mockDbQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO webhook_verifications');
    expect(sql).toContain('ON CONFLICT');
    expect(mockDbQuery).toHaveBeenCalledWith(
      sql,
      ['plisio', 'inv_999', 'sig_abc']
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// plisioWebhook handler
// GET/POST handler: verifies signature → checks replay → records → returns 200 → dispatches async
// ══════════════════════════════════════════════════════════════════════════════
describe('plisioWebhook handler', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let paymentProcessingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    paymentProcessingService = require('../src/services/paymentProcessingService');
    paymentProcessingService.processPlisioPaymentAsync.mockResolvedValue(true);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('returns 400 when signature is invalid', async () => {
    const req = buildReq('POST', { invoice_id: 'inv123', status: 'completed' }, { 'x-plisio-signature': 'bad' });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await plisioWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid signature' });
  });

  test('returns 400 when payload is missing status or invoice_id', async () => {
    const params = { amount: '10.00' }; // missing status and invoice_id
    const sig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
    const req = buildReq('POST', params, { 'x-plisio-signature': sig });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await plisioWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid payload' });
  });

  test('returns 200 + ignored when replay attack detected', async () => {
    const params = { invoice_id: 'inv_replay', status: 'completed' };
    const sig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
    const req = buildReq('POST', params, { 'x-plisio-signature': sig });
    // isReplayAttack → found in DB (replay attack!)
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = { json: jest.fn() };
    await plisioWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'ignored' });
  });

  test('records webhook and returns 200 immediately on success', async () => {
    const params = { invoice_id: 'inv_new', status: 'pending' };
    const sig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
    const req = buildReq('POST', params, { 'x-plisio-signature': sig });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isReplayAttack → not found
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // recordWebhook → success
    const res = { json: jest.fn() };
    await plisioWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'pending' });
    // isReplayAttack + recordWebhook = 2 DB calls
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  test('dispatches processPlisioPaymentAsync when status is completed (async, non-blocking)', async () => {
    const params = {
      invoice_id: 'inv_done',
      order_number: 'ord_001',
      status: 'completed',
      tx_id: 'txn_abc',
      amount: '49.99',
      currency: 'BTC'
    };
    const sig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
    const req = buildReq('POST', params, { 'x-plisio-signature': sig });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isReplayAttack
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // recordWebhook
    const res = { json: jest.fn() };
    await plisioWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'completed' });
    // processPlisioPaymentAsync is called via .catch() — verify it was invoked
    expect(paymentProcessingService.processPlisioPaymentAsync).toHaveBeenCalledWith('inv_done', 'txn_abc', '49.99', 'BTC');
  });

  test('returns 500 on unexpected error', async () => {
    const params = { invoice_id: 'inv_err', status: 'completed' };
    const sig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
    const req = buildReq('POST', params, { 'x-plisio-signature': sig });
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await plisioWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// paymentsCloudWebhook handler
// Verifies signature → checks replay → records → returns 200 immediately → dispatches async
// ══════════════════════════════════════════════════════════════════════════════
describe('paymentsCloudWebhook handler', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('returns 400 when signature is invalid', async () => {
    const body = { event: 'payment.succeeded', data: { id: 'pc_1' } };
    const req = buildReq('POST', body, { 'x-paymentscloud-signature': 'bad' });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await paymentsCloudWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid signature' });
  });

  test('returns 400 when payload is missing event or data.id', async () => {
    const body = { data: {} }; // missing event and data.id
    const sig = computePaymentsCloudSignature(process.env.PAYCLOUD_SECRET, body);
    const req = buildReq('POST', body, { 'x-paymentscloud-signature': sig });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await paymentsCloudWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 200 + ignored when replay attack detected', async () => {
    const body = { event: 'payment.succeeded', data: { id: 'pc_replay' } };
    const sig = computePaymentsCloudSignature(process.env.PAYCLOUD_SECRET, body);
    const req = buildReq('POST', body, { 'x-paymentscloud-signature': sig });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // isReplayAttack → found
    const res = { json: jest.fn() };
    await paymentsCloudWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'ignored' });
  });

  test('records webhook and returns 200 immediately on success', async () => {
    const body = { event: 'payment.succeeded', data: { id: 'pc_new' } };
    const sig = computePaymentsCloudSignature(process.env.PAYCLOUD_SECRET, body);
    const req = buildReq('POST', body, { 'x-paymentscloud-signature': sig });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isReplayAttack
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // recordWebhook
    const res = { json: jest.fn() };
    await paymentsCloudWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'payment.succeeded' });
  });

  test('returns 500 on unexpected error', async () => {
    const body = { event: 'payment.succeeded', data: { id: 'pc_err' } };
    const sig = computePaymentsCloudSignature(process.env.PAYCLOUD_SECRET, body);
    const req = buildReq('POST', body, { 'x-paymentscloud-signature': sig });
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await paymentsCloudWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  test('dispatches processPaymentsCloudPaymentAsync when event is payment.succeeded (async, non-blocking)', async () => {
    const body = {
      event: 'payment.succeeded',
      data: { id: 'pc_async', amount: '29.99', currency: 'USD', metadata: { account_number: '12345678', plan_key: 'month' } }
    };
    const sig = computePaymentsCloudSignature(process.env.PAYCLOUD_SECRET, body);
    const req = buildReq('POST', body, { 'x-paymentscloud-signature': sig });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isReplayAttack
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // recordWebhook
    const paymentProcessingService = require('../src/services/paymentProcessingService');
    paymentProcessingService.processPaymentsCloudPaymentAsync.mockResolvedValue(true);
    const res = { json: jest.fn() };
    await paymentsCloudWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'payment.succeeded' });
    // processPaymentsCloudPaymentAsync is called via .catch() — verify it was invoked
    expect(paymentProcessingService.processPaymentsCloudPaymentAsync).toHaveBeenCalledWith(body.data);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// authorizeNetWebhook handler
// Most complex: verifies signature → transaction lookup → subscription activation → ARB → VPN → email
// ══════════════════════════════════════════════════════════════════════════════
describe('authorizeNetWebhook handler', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let authorizeNetUtils;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    authorizeNetUtils = require('../src/services/authorizeNetUtils');
    authorizeNetUtils.getAuthorizeTransactionDetails.mockReset();
    authorizeNetUtils.AuthorizeNetService.mockImplementation(() => ({
      createArbSubscriptionFromProfile: jest.fn().mockResolvedValue({ subscriptionId: 'arb_new' })
    }));
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('returns 400 when signature is invalid', async () => {
    const body = { eventType: 'payment.succeeded', payload: { id: 'txn_1', responseCode: '1' } };
    const req = { ...buildAuthorizeReq(body, 'valid_hex'), headers: { 'x-anet-signature': 'invalid' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: false });
  });

  test('returns 200 with signatureValid=true when valid but invoiceNumber is missing', async () => {
    const body = { eventType: 'payment.succeeded', payload: { id: 'txn_no_inv' } };
    const req = buildAuthorizeReq(body, 'valid_hex');
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
  });

  test('returns 200 (signatureValid=true) when responseCode is not success and no transaction lookup available', async () => {
    const body = {
      eventType: 'authcapture.created',
      payload: { id: 'txn_fail', invoiceNumber: 'inv_fail', responseCode: '2' }
    };
    const req = buildAuthorizeReq(body, 'valid_hex');
    authorizeNetUtils.getAuthorizeTransactionDetails.mockResolvedValueOnce(null);
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
  });

  test('returns early when subscription not found for invoice (not trialing)', async () => {
    const body = {
      eventType: 'authcapture.created',
      payload: { id: 'txn_nosub', invoiceNumber: 'inv_missing', responseCode: '1' }
    };
    const req = buildAuthorizeReq(body, 'valid_hex');
    // Subscription lookup → not found; account number fallback → not found
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // main lookup
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // account fallback
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
  });

  test('returns early when subscription is already active', async () => {
    const body = {
      eventType: 'authcapture.created',
      payload: { id: 'txn_active', invoiceNumber: 'inv_active', responseCode: '1' }
    };
    const req = buildAuthorizeReq(body, 'valid_hex');
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 'sub_123', user_id: 'u_1', status: 'active', metadata: {} }]
    });
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
  });

  test('activates trialing subscription, records payment, and sends email', async () => {
    const body = {
      eventType: 'authcapture.created',
      payload: { id: 'txn_activate', invoiceNumber: 'inv_new', responseCode: '1', authAmount: '49.99' }
    };
    const req = buildAuthorizeReq(body, 'valid_hex');
    const mockSub = {
      id: 'sub_new',
      user_id: 'u_new',
      status: 'trialing',
      account_number: '12345678',
      referral_code: 'REF123',
      metadata: { plan_interval: 'month', plan_amount_cents: '4999' }
    };
    mockDbQuery
      .mockResolvedValueOnce({ rows: [mockSub] }) // subscription found
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE subscriptions
      .mockResolvedValueOnce({ rows: [] }) // INSERT payments
      .mockResolvedValueOnce({ rows: [] }) // UPDATE users is_active
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({ rows: [] }) // INSERT tax_transactions (no postal code)
      .mockResolvedValueOnce({ rows: [{ email: 'test@example.com' }] }); // user email
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
    // Verify UPDATE subscriptions was called (DB transaction)
    const updateCall = mockDbQuery.mock.calls.find(c => c[0].includes('UPDATE subscriptions'));
    expect(updateCall).toBeDefined();
    // Verify user email lookup was called
    expect(mockDbQuery.mock.calls.some(c => c[0].includes('SELECT email FROM users'))).toBe(true);
  });

  test('attempts ARB creation when subscription has no arb_subscription_id and transaction has profile IDs', async () => {
    const body = {
      eventType: 'authcapture.created',
      payload: { id: 'txn_arb', invoiceNumber: 'inv_arb', responseCode: '1', authAmount: '99.99' }
    };
    const req = buildAuthorizeReq(body, 'valid_hex');
    const mockSub = {
      id: 'sub_arb',
      user_id: 'u_arb',
      status: 'trialing',
      account_number: '87654321',
      arb_subscription_id: null,
      metadata: { plan_interval: 'year', plan_amount_cents: '9999' }
    };
    mockDbQuery
      .mockResolvedValueOnce({ rows: [mockSub] }) // subscription found
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE subscriptions
      .mockResolvedValueOnce({ rows: [] }) // INSERT payments
      .mockResolvedValueOnce({ rows: [] }) // UPDATE users
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({ rows: [] }) // tax_transactions
      // ARB creation path:
      .mockResolvedValueOnce({ rows: [] }) // getAuthorizeTransactionDetails (subscription has no arb yet)
      .mockResolvedValueOnce({ rows: [{ customerProfileId: 'CP_123', customerPaymentProfileId: 'CPP_456' }] }) // tx lookup
      .mockResolvedValueOnce({ rows: [{ amount_cents: 9999 }] }) // plan amount lookup
      .mockResolvedValueOnce({ rows: [] }) // UPDATE subscriptions with arb_subscription_id
      .mockResolvedValueOnce({ rows: [{ email: 'arb@example.com' }] }); // user email
    authorizeNetUtils.getAuthorizeTransactionDetails
      .mockResolvedValueOnce(null) // first call (sub has no arb)
      .mockResolvedValueOnce({ customerProfileId: 'CP_123', customerPaymentProfileId: 'CPP_456', responseCode: '1' }); // second call
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
    // Verify AuthorizeNetService was instantiated (for ARB creation)
    expect(authorizeNetUtils.AuthorizeNetService).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Branch coverage: async catch handlers in webhook handlers
// ══════════════════════════════════════════════════════════════════════════════
describe('plisioWebhook async error handler (line 213)', () => {
  let paymentProcessingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    // Require AFTER clearAllMocks so the mock is fresh (following existing pattern)
    paymentProcessingService = require('../src/services/paymentProcessingService');
    paymentProcessingService.processPlisioPaymentAsync.mockRejectedValueOnce(
      new Error('Plisio network failure')
    );
  });

  test('processPlisioPaymentAsync rejection is caught and does not crash the handler', async () => {
    const params = {
      invoice_id: 'INV456',
      order_number: 'ORD123',
      status: 'completed',
      tx_id: 'TX789',
      amount: '9.99',
      currency: 'BTC'
    };
    // Use proper signature computation (same as existing plisioWebhook tests)
    const sig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
    const req = buildReq('POST', params, { 'x-plisio-signature': sig });

    // isReplayAttack + recordWebhook checks pass (return empty rows)
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isReplayAttack → not found
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // recordWebhook → success

    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await plisioWebhook(req, res);

    // Handler must still return 200 OK even when async processing fails
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ received: true, status: 'completed' }));
    // processPlisioPaymentAsync was called and then rejected (caught by .catch)
    expect(paymentProcessingService.processPlisioPaymentAsync).toHaveBeenCalledWith('INV456', 'TX789', '9.99', 'BTC');
  });
});

describe('paymentsCloudWebhook async error handler (line 263)', () => {
  let paymentProcessingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    // Require AFTER clearAllMocks so the mock is fresh (following existing pattern)
    paymentProcessingService = require('../src/services/paymentProcessingService');
    paymentProcessingService.processPaymentsCloudPaymentAsync.mockRejectedValueOnce(
      new Error('PaymentsCloud processing error')
    );
  });

  test('processPaymentsCloudPaymentAsync rejection is caught and does not crash the handler', async () => {
    // Use same valid payload structure as existing paymentsCloudWebhook tests
    const body = {
      event: 'payment.succeeded',
      data: { id: 'pc_async', amount: '29.99', currency: 'USD', metadata: { account_number: '12345678', plan_key: 'month' } }
    };
    const sig = computePaymentsCloudSignature(process.env.PAYCLOUD_SECRET, body);
    const req = buildReq('POST', body, { 'x-paymentscloud-signature': sig });

    // isReplayAttack + recordWebhook pass
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isReplayAttack
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // recordWebhook

    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await paymentsCloudWebhook(req, res);

    // Handler must still return 200 OK even when async processing fails
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ received: true, status: 'payment.succeeded' }));
    expect(paymentProcessingService.processPaymentsCloudPaymentAsync).toHaveBeenCalled();
  });
});

describe('authorizeNetWebhook txDetails null branch (lines 311-322)', () => {
  let authorizeNetUtils;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    // Use 'valid_hex' so buildAuthorizeReq computes the correct HMAC signature
    process.env.AUTHORIZE_SIGNATURE_KEY = 'a'.repeat(64);
    authorizeNetUtils = require('../src/services/authorizeNetUtils');
    authorizeNetUtils.getAuthorizeTransactionDetails.mockReset();
    authorizeNetUtils.AuthorizeNetService.mockImplementation(() => ({
      createArbSubscriptionFromProfile: jest.fn().mockResolvedValue({ subscriptionId: 'arb_test' })
    }));
  });

  afterEach(() => {
    delete process.env.AUTHORIZE_SIGNATURE_KEY;
  });

  test('returns early when getAuthorizeTransactionDetails returns null (line 312)', async () => {
    const body = {
      eventType: 'authcapture.created',
      payload: { id: 'txn_test', invoiceNumber: '', responseCode: '' }
    };
    // 'valid_hex' makes buildAuthorizeReq compute the correct HMAC using AUTHORIZE_SIGNATURE_KEY
    const req = buildAuthorizeReq(body, 'valid_hex');

    // tx lookup returns null → line 312 if-block is skipped
    authorizeNetUtils.getAuthorizeTransactionDetails.mockResolvedValueOnce(null);

    // Subscription not found → early return at line 429
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // tx lookup (returns null)
      .mockResolvedValueOnce({ rows: [] }); // subscription not found

    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
  });

  test('logs transaction lookup when txDetails is found (line 317)', async () => {
    const body = {
      eventType: 'authcapture.created',
      payload: { id: 'txn_logged', invoiceNumber: '', responseCode: '' }
    };
    const req = buildAuthorizeReq(body, 'valid_hex');

    // txDetails found → line 312 if-block populates vars and logs at line 317
    const txDetails = {
      invoiceNumber: 'INV_LOG',
      responseCode: '1',
      amountRaw: '49.99',
      transactionStatus: 'settled'
    };
    authorizeNetUtils.getAuthorizeTransactionDetails.mockResolvedValueOnce(txDetails);

    // Subscription found (active)
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 'sub_log',
        user_id: 'u_log',
        status: 'active',
        metadata: {}
      }]
    });

    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);

    // logAuthorizeEvent called at line 317 with 'webhook-transaction-lookup'
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"label":"webhook-transaction-lookup"')
    );
  });
});

describe('authorizeNetWebhook ARB creation error handler (lines 551-553)', () => {
  let authorizeNetUtils;
  let userService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockReset();
    // Use 'valid_hex' for correct signature computation
    process.env.AUTHORIZE_SIGNATURE_KEY = 'a'.repeat(64);
    authorizeNetUtils = require('../src/services/authorizeNetUtils');
    authorizeNetUtils.getAuthorizeTransactionDetails.mockReset();
    authorizeNetUtils.AuthorizeNetService.mockImplementation(() => ({
      createArbSubscriptionFromProfile: jest.fn().mockRejectedValue(
        new Error('ARB API unavailable')
      )
    }));
    userService = require('../src/services/userService');
  });

  afterEach(() => {
    delete process.env.AUTHORIZE_SIGNATURE_KEY;
  });

  test('ARB creation failure is caught and does not crash handler (line 551)', async () => {
    const body = {
      eventType: 'authcapture.created',
      payload: { id: 'txn_arb_fail', invoiceNumber: 'inv_arb_fail', responseCode: '1', authAmount: '49.99' }
    };
    const req = buildAuthorizeReq(body, 'valid_hex');

    const mockSub = {
      id: 'sub_arb_fail',
      user_id: 'u_arb_fail',
      status: 'trialing',
      account_number: '11111111',
      arb_subscription_id: null,
      metadata: { plan_interval: 'month', plan_amount_cents: '4999' }
    };

    // Override the specific queries this test needs
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // tx lookup (first call) → null
      .mockResolvedValueOnce({ rows: [mockSub] }) // subscription query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN → ok
      .mockResolvedValueOnce({ rows: [] }) // UPDATE subscriptions → ok
      .mockResolvedValueOnce({ rows: [] }) // INSERT payments → ok
      .mockResolvedValueOnce({ rows: [] }) // UPDATE users is_active → ok
      .mockResolvedValueOnce({ rows: [] }) // COMMIT → ok
      .mockResolvedValueOnce({ rows: [] }) // INSERT tax_transactions (no postal) → ok
      .mockResolvedValueOnce({ rows: [] }) // BEGIN (ARB block) → ok
      .mockResolvedValueOnce({ rows: [{ amount_cents: 4999 }] }) // plan amount lookup → found
      // createArbSubscriptionFromProfile throws → caught at line 551
      // No UPDATE subscriptions call since ARB threw
      .mockResolvedValueOnce({ rows: [{ email: 'arb_fail@example.com' }] }); // user email lookup

    // AuthorizeNetService mock throws for ARB creation
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await authorizeNetWebhook(req, res);

    // Despite ARB throwing, handler must complete and return 200 (not 500)
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// logAuthorizeEvent utility
// Sync function that appends JSON to logs/authorize-webhook.log
// ══════════════════════════════════════════════════════════════════════════════
describe('logAuthorizeEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.appendFileSync.mockReset();
    fs.mkdirSync.mockReset();
  });

  test('appends JSON line to authorize-webhook.log', () => {
    const dir = path.join(process.cwd(), 'logs');
    logAuthorizeEvent('webhook-received', { responseCode: '1', transactionId: 'tx_123' });
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      path.join(dir, 'authorize-webhook.log'),
      expect.stringContaining('"label":"webhook-received"')
    );
  });

  test('includes ISO timestamp in log line', () => {
    logAuthorizeEvent('test-event', { foo: 'bar' });
    const [, line] = fs.appendFileSync.mock.calls[0];
    const parsed = JSON.parse(line);
    expect(parsed.ts).toBeDefined();
    expect(new Date(parsed.ts).toString()).not.toBe('Invalid Date');
  });

  test('does not throw when fs.appendFileSync fails (swallows error)', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fs.appendFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
    // Should not throw
    expect(() => logAuthorizeEvent('test', {})).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Authorize webhook logging error:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  test('creates logs directory recursively if it does not exist', () => {
    const dir = path.join(process.cwd(), 'logs');
    logAuthorizeEvent('test', {});
    expect(fs.mkdirSync).toHaveBeenCalledWith(dir, { recursive: true });
  });
});
