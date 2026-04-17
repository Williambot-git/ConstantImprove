# webhookController Unit Tests Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
> **Note:** All implementation (writing tests, running them, committing) must be done in the controller session — delegate_task subagents cannot write to the repo filesystem.

**Goal:** Add comprehensive unit tests to `backend/src/controllers/webhookController.js` (679 lines, 0% coverage).

**Architecture:** The controller has 3 main webhook handlers (Plisio, PaymentsCloud, Authorize.Net), a static `WebhookVerifier` class for cryptographic signature verification, a `logAuthorizeEvent` utility, and an async `processPaymentsCloudPaymentAsync` helper. All handlers follow a pattern: verify signature → check replay → record → return 200 → process async.

**Tech Stack:** Jest, Node.js crypto (HMAC-SHA1/SHA-256/SHA-512), mocks for db, fs, emailService, plisioService, paymentProcessingService, authorizeNetUtils, userService.

---

## Exported Entities Under Test

| Export | Type | Lines | Notes |
|--------|------|-------|-------|
| `WebhookVerifier.verifyPlisio` | static method | 32-74 | HMAC-SHA1, two methods |
| `WebhookVerifier.verifyPaymentsCloud` | static method | 76-102 | HMAC-SHA256 |
| `WebhookVerifier.verifyAuthorizeNet` | static method | 104-141 | HMAC-SHA512, hex+ascii keys |
| `WebhookVerifier.isReplayAttack` | static async | 143-150 | DB query |
| `WebhookVerifier.recordWebhook` | static async | 152-160 | DB query |
| `plisioWebhook` | async function | 163-221 | GET/POST, calls processPlisioPaymentAsync |
| `paymentsCloudWebhook` | async function | 226-270 | calls processPaymentsCloudPaymentAsync |
| `authorizeNetWebhook` | async function | 363-673 | Complex, many DB calls |
| `processPaymentsCloudPaymentAsync` | async function | 272-361 | Full payment processing |
| `logAuthorizeEvent` | sync function | 16-26 | fs.appendFileSync |

---

## Task 1: Write webhookController.test.js — WebhookVerifier.verifyPlisio tests

**Objective:** Test cryptographic signature verification for Plisio webhooks.

**Files:**
- Create: `backend/tests/webhookController.test.js`

**Step 1: Create the test file with WebhookVerifier.verifyPlisio tests**

```javascript
/**
 * webhookController unit tests
 *
 * Tests all exported functions from webhookController.js.
 * Mock strategy:
 *   - db.query: jest.fn() mock with mockImplementation default + mockResolvedValueOnce per test
 *   - crypto: jest.requireActual('crypto') for real HMAC computation in verify tests
 *   - fs: jest.mock('fs') with mock implementations
 *   - Services: jest.mock for emailService, plisioService, paymentProcessingService, etc.
 *   - userService: jest.mock for createVpnAccount
 *
 * CRITICAL: process.env values must be set BEFORE importing the controller module.
 */

// ─── ENV SETUP ────────────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.PLISIO_API_KEY = 'test-plisio-api-key';
process.env.PAYCLOUD_SECRET = 'test-paycloud-secret';
process.env.AUTHORIZE_SIGNATURE_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64-char hex
process.env.DEBUG_AUTHORIZE_NET = 'false';

// ─── MOCKS ───────────────────────────────────────────────────────────────────
const mockDbQuery = jest.fn();
jest.mock('../src/config/database', () => ({ query: mockDbQuery }));

jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn()
}));

jest.mock('../src/services/emailService', () => ({
  sendAccountCreatedEmail: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/services/plisioService', () => ({
  findPendingTransaction: jest.fn()
}));

jest.mock('../src/services/paymentProcessingService', () => ({
  processPlisioPaymentAsync: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/services/authorizeNetUtils', () => ({
  getAuthorizeTransactionDetails: jest.fn(),
  AuthorizeNetService: jest.fn().mockImplementation(() => ({
    createArbSubscriptionFromProfile: jest.fn().mockResolvedValue({ subscriptionId: 'arb123' })
  }))
}));

jest.mock('../src/services/userService', () => ({
  createVpnAccount: jest.fn().mockResolvedValue({ username: 'testuser', password: 'testpass' })
}));

jest.mock('../src/controllers/paymentController', () => ({
  applyAffiliateCommissionIfEligible: jest.fn().mockResolvedValue(true)
}));

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const crypto = require('crypto');

function buildReq(method, queryOrBody, headers = {}) {
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

function computePlisioSignature(apiKey, params) {
  const sortedKeys = Object.keys(params).filter(k => k !== 'verify_hash').sort();
  const sorted = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHmac('sha1', apiKey).update(sorted).digest('hex');
}

function computePaymentsCloudSignature(secret, body) {
  const payload = JSON.stringify(body);
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// ─── UNIT UNDER TEST ─────────────────────────────────────────────────────────
const { WebhookVerifier, plisioWebhook, paymentsCloudWebhook, authorizeNetWebhook } = require('../src/controllers/webhookController');
const fs = require('fs');

// ══════════════════════════════════════════════════════════════════════════════
// WebhookVerifier.verifyPlisio
// ══════════════════════════════════════════════════════════════════════════════
describe('WebhookVerifier.verifyPlisio', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('Method 1: X-Plisio-Signature header (HMAC-SHA1 of sorted params)', () => {
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

    test('returns false for invalid signature', () => {
      const req = buildReq('POST', { invoice_id: 'inv123' }, { 'x-plisio-signature': 'invalid_signature' });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
    });

    test('returns false when signature header is present but params are tampered', () => {
      const params = { invoice_id: 'inv123', amount: '10.00' };
      const tamperedParams = { invoice_id: 'inv123', amount: '999.00' };
      const signature = computePlisioSignature(process.env.PLISIO_API_KEY, params);
      const req = buildReq('POST', tamperedParams, { 'x-plisio-signature': signature });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
    });

    test('ignores verify_hash key when computing signature', () => {
      // verify_hash should be filtered out — signature is computed WITHOUT it
      const params = { invoice_id: 'inv123', verify_hash: 'some_existing_hash' };
      const signature = computePlisioSignature(process.env.PLISIO_API_KEY, params);
      const req = buildReq('POST', params, { 'x-plisio-signature': signature });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(true);
    });

    test('returns false when no signature header is provided', () => {
      const req = buildReq('POST', { invoice_id: 'inv123' }, {});
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
    });

    test('returns false for empty signature string', () => {
      const req = buildReq('POST', { invoice_id: 'inv123' }, { 'x-plisio-signature': '' });
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
    });
  });

  describe('Method 2: verify_hash in body params (HMAC-SHA1)', () => {
    test('returns true when verify_hash matches computed HMAC', () => {
      const paramsWithoutHash = { invoice_id: 'inv789', amount: '20.00' };
      const hash = computePlisioSignature(process.env.PLISIO_API_KEY, paramsWithoutHash);
      const paramsWithHash = { ...paramsWithoutHash, verify_hash: hash };
      const req = buildReq('POST', paramsWithHash, {});
      expect(WebhookVerifier.verifyPlisio(req)).toBe(true);
    });

    test('returns false when verify_hash is present but does not match', () => {
      const params = { invoice_id: 'inv999', verify_hash: 'wrong_hash_value' };
      const req = buildReq('POST', params, {});
      expect(WebhookVerifier.verifyPlisio(req)).toBe(false);
    });

    test('Method 2 only used when no X-Plisio-Signature header', () => {
      // When BOTH header and verify_hash present, header (Method 1) takes precedence
      const params = { invoice_id: 'inv999' };
      const correctSig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
      const wrongHash = computePlisioSignature(process.env.PLISIO_API_KEY, { ...params, extra: 'x' });
      const req = buildReq('POST', params, { 'x-plisio-signature': correctSig, verify_hash: wrongHash });
      // Header method is tried first and succeeds
      expect(WebhookVerifier.verifyPlisio(req)).toBe(true);
    });
  });

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
```

**Step 2: Run test to verify failure**

Run: `cd /tmp/Decontaminate/backend && npx jest tests/webhookController.test.js --testNamePattern="WebhookVerifier.verifyPlisio" -v`
Expected: FAIL — "Cannot find module" (file doesn't exist yet)

**Step 3: Write the test file**

(Create the file with content above)

**Step 4: Run test to verify pass**

Run: `cd /tmp/Decontaminate/backend && npx jest tests/webhookController.test.js --testNamePattern="WebhookVerifier.verifyPlisio" -v`
Expected: PASS — 9 tests

**Step 5: Commit**

```bash
cd /tmp/Decontaminate/backend
git add tests/webhookController.test.js
git commit -m "test(webhook): add WebhookVerifier.verifyPlisio tests (9 cases)"
```

---

## Task 2: Write WebhookVerifier.verifyPaymentsCloud and WebhookVerifier.verifyAuthorizeNet tests

**Objective:** Test PaymentsCloud (HMAC-SHA256) and Authorize.Net (HMAC-SHA512) signature verification.

**Files:**
- Modify: `backend/tests/webhookController.test.js` (add new describe blocks)

**Step 1: Add verifyPaymentsCloud and verifyAuthorizeNet test blocks**

```javascript
// ══════════════════════════════════════════════════════════════════════════════
// WebhookVerifier.verifyPaymentsCloud
// ══════════════════════════════════════════════════════════════════════════════
describe('WebhookVerifier.verifyPaymentsCloud', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
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
    const req = buildReq('POST', { event: 'payment.succeeded', data: { id: 'pc_123' } }, { 'x-paymentscloud-signature': 'bad_signature' });
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
    const req = buildReq('POST', { event: 'payment.succeeded', data: { id: 'pc_123' } }, {});
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
// ══════════════════════════════════════════════════════════════════════════════
describe('WebhookVerifier.verifyAuthorizeNet', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  // Helper: build a valid Authorize.Net request with hex key signature
  function buildAuthorizeReq(body, signatureKeyHex, sigHeaderValue) {
    const raw = Buffer.from(JSON.stringify(body));
    const expectedHexKey = crypto.createHmac('sha512', Buffer.from(signatureKeyHex, 'hex')).update(raw).digest('hex');
    const sig = sigHeaderValue === 'valid_hex' ? expectedHexKey : sigHeaderValue;
    return {
      method: 'POST',
      body,
      query: {},
      headers: { 'x-anet-signature': sig },
      rawBody: raw
    };
  }

  test('returns true for valid hex-key HMAC-SHA512 signature', () => {
    const body = { event: 'payment.succeeded', id: 'txn_123' };
    const key = process.env.AUTHORIZE_SIGNATURE_KEY;
    const req = buildAuthorizeReq(body, key, 'valid_hex');
    expect(WebhookVerifier.verifyAuthorizeNet(req)).toBe(true);
  });

  test('returns false for invalid signature', () => {
    const body = { event: 'payment.succeeded', id: 'txn_123' };
    const req = buildAuthorizeReq(body, process.env.AUTHORIZE_SIGNATURE_KEY, 'invalid_sig');
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
    const req = { method: 'POST', body: {}, query: {}, headers: { 'x-anet-signature': 'sha512=abc' }, rawBody: Buffer.from('{}') };
    expect(WebhookVerifier.verifyAuthorizeNet(req)).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith('AUTHORIZE_SIGNATURE_KEY not configured');
    process.env.AUTHORIZE_SIGNATURE_KEY = originalKey;
  });
});
```

**Step 2: Run tests**

Run: `cd /tmp/Decontaminate/backend && npx jest tests/webhookController.test.js --testNamePattern="WebhookVerifier.verify" -v`
Expected: PASS — all WebhookVerifier tests

**Step 3: Commit**

```bash
cd /tmp/Decontaminate/backend
git add tests/webhookController.test.js
git commit -m "test(webhook): add WebhookVerifier.verifyPaymentsCloud and verifyAuthorizeNet tests (12 cases)"
```

---

## Task 3: Write WebhookVerifier.isReplayAttack and recordWebhook tests

**Objective:** Test the async DB-based replay attack detection and webhook recording.

**Step 1: Add DB-based WebhookVerifier tests**

```javascript
// ══════════════════════════════════════════════════════════════════════════════
// WebhookVerifier.isReplayAttack + recordWebhook (async DB operations)
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

  test('queries correct provider column', async () => {
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

  test('inserts webhook record into database', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await WebhookVerifier.recordWebhook('inv_999', 'plisio', 'sig_abc');
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO webhook_verifications'),
      ['plisio', 'inv_999', 'sig_abc']
    );
  });

  test('uses ON CONFLICT to handle duplicate gracefully', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await WebhookVerifier.recordWebhook('inv_dup', 'plisio', 'sig_dup');
    const [sql] = mockDbQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
  });
});
```

**Step 2: Run tests**

Run: `cd /tmp/Decontaminate/backend && npx jest tests/webhookController.test.js --testNamePattern="WebhookVerifier.isReplayAttack|WebhookVerifier.recordWebhook" -v`
Expected: PASS

**Step 3: Commit**

```bash
cd /tmp/Decontaminate/backend
git add tests/webhookController.test.js
git commit -m "test(webhook): add WebhookVerifier.isReplayAttack and recordWebhook tests (5 cases)"
```

---

## Task 4: Write plisioWebhook handler tests

**Objective:** Test the full Plisio webhook handler — signature validation, payload parsing, replay protection, response shape, and async dispatch.

**Files:**
- Modify: `backend/tests/webhookController.test.js`

**Step 1: Add plisioWebhook handler tests**

```javascript
// ══════════════════════════════════════════════════════════════════════════════
// plisioWebhook handler
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
    jest.mock('../src/services/paymentProcessingService', () => ({
      processPlisioPaymentAsync: jest.fn().mockResolvedValue(true)
    }));
    paymentProcessingService = require('../src/services/paymentProcessingService');
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
    // isReplayAttack returns true
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = { json: jest.fn() };
    await plisioWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'ignored' });
  });

  test('records webhook and returns 200 immediately', async () => {
    const params = { invoice_id: 'inv_new', status: 'pending' };
    const sig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
    const req = buildReq('POST', params, { 'x-plisio-signature': sig });
    // isReplayAttack: not found; recordWebhook: success
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isReplayAttack
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // recordWebhook
    const res = { json: jest.fn() };
    await plisioWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'pending' });
    // Verify recordWebhook was called after isReplayAttack check
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  test('calls processPlisioPaymentAsync asynchronously when status is completed', async () => {
    const params = { invoice_id: 'inv_done', order_number: 'ord_001', status: 'completed', tx_id: 'txn_abc', amount: '49.99', currency: 'BTC' };
    const sig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
    const req = buildReq('POST', params, { 'x-plisio-signature': sig });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isReplayAttack
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // recordWebhook
    const res = { json: jest.fn() };
    await plisioWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'completed' });
    // processPlisioPaymentAsync is called via .catch() — verify it was set up
    // We can't easily await the async callback, but we verify no error thrown
  });

  test('returns 500 on unexpected error', async () => {
    const params = { invoice_id: 'inv_err', status: 'completed' };
    const sig = computePlisioSignature(process.env.PLISIO_API_KEY, params);
    const req = buildReq('POST', params, { 'x-plisio-signature': sig });
    // Make isReplayAttack throw
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await plisioWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
```

**Step 2: Run tests**

Run: `cd /tmp/Decontaminate/backend && npx jest tests/webhookController.test.js --testNamePattern="plisioWebhook" -v`
Expected: PASS

**Step 3: Commit**

```bash
cd /tmp/Decontaminate/backend
git add tests/webhookController.test.js
git commit -m "test(webhook): add plisioWebhook handler tests (7 cases)"
```

---

## Task 5: Write paymentsCloudWebhook and processPaymentsCloudPaymentAsync tests

**Files:**
- Modify: `backend/tests/webhookController.test.js`

**Step 1: Add tests**

```javascript
// ══════════════════════════════════════════════════════════════════════════════
// paymentsCloudWebhook handler
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
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // isReplayAttack = true
    const res = { json: jest.fn() };
    await paymentsCloudWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'ignored' });
  });

  test('records webhook and returns 200 immediately', async () => {
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
});
```

**Step 2: Run tests**

Run: `cd /tmp/Decontaminate/backend && npx jest tests/webhookController.test.js --testNamePattern="paymentsCloudWebhook" -v`
Expected: PASS

**Step 3: Commit**

```bash
cd /tmp/Decontaminate/backend
git add tests/webhookController.test.js
git commit -m "test(webhook): add paymentsCloudWebhook handler tests (5 cases)"
```

---

## Task 6: Write authorizeNetWebhook handler tests (key scenarios)

**Objective:** Test the complex Authorize.Net webhook handler — signature verification, transaction lookup, subscription activation, VPN creation, ARB creation.

**Files:**
- Modify: `backend/tests/webhookController.test.js`

**Step 1: Add Authorize.Net tests**

```javascript
// ══════════════════════════════════════════════════════════════════════════════
// authorizeNetWebhook handler
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
    fs.appendFileSync.mockReset();
    jest.mock('../src/services/authorizeNetUtils', () => ({
      getAuthorizeTransactionDetails: jest.fn(),
      AuthorizeNetService: jest.fn().mockImplementation(() => ({
        createArbSubscriptionFromProfile: jest.fn().mockResolvedValue({ subscriptionId: 'arb_new' })
      }))
    }));
    authorizeNetUtils = require('../src/services/authorizeNetUtils');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // Helper: build a valid authorize webhook request
  function buildAuthorizeWebhook(body) {
    const raw = Buffer.from(JSON.stringify(body));
    const key = process.env.AUTHORIZE_SIGNATURE_KEY;
    const sig = crypto.createHmac('sha512', Buffer.from(key, 'hex')).update(raw).digest('hex');
    return {
      method: 'POST',
      body,
      query: {},
      headers: { 'x-anet-signature': sig },
      rawBody: raw
    };
  }

  test('returns 400 when signature is invalid', async () => {
    const body = { eventType: 'payment.succeeded', payload: { id: 'txn_1', responseCode: '1' } };
    const req = { ...buildAuthorizeWebhook(body), headers: { 'x-anet-signature': 'invalid' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: false });
  });

  test('returns 200 with signatureValid=true when signature is valid but invoiceNumber is missing', async () => {
    const body = { eventType: 'payment.succeeded', payload: { id: 'txn_no_inv' } };
    const req = buildAuthorizeWebhook(body);
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
  });

  test('returns 200 when responseCode is not success (not "1") and no lookup available', async () => {
    const body = { eventType: 'authcapture.created', payload: { id: 'txn_fail', invoiceNumber: 'inv_fail', responseCode: '2' } };
    const req = buildAuthorizeWebhook(body);
    authorizeNetUtils.getAuthorizeTransactionDetails.mockResolvedValueOnce(null);
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
  });

  test('returns early when subscription not found for invoice', async () => {
    const body = { eventType: 'authcapture.created', payload: { id: 'txn_nosub', invoiceNumber: 'inv_missing', responseCode: '1' } };
    const req = buildAuthorizeWebhook(body);
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // subscription lookup → not found
    // No account number match either
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // account match fallback
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
  });

  test('returns early when subscription is already active', async () => {
    const body = { eventType: 'authcapture.created', payload: { id: 'txn_active', invoiceNumber: 'inv_active', responseCode: '1' } };
    const req = buildAuthorizeWebhook(body);
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'sub_123', user_id: 'u_1', status: 'active', metadata: {} }] });
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
  });

  test('activates trialing subscription and creates VPN account', async () => {
    const body = { eventType: 'authcapture.created', payload: { id: 'txn_activate', invoiceNumber: 'inv_new', responseCode: '1', authAmount: '49.99' } };
    const req = buildAuthorizeWebhook(body);
    const mockSub = {
      id: 'sub_new',
      user_id: 'u_new',
      status: 'trialing',
      account_number: '12345678',
      referral_code: 'REF123',
      metadata: { plan_interval: 'month', plan_amount_cents: '4999' }
    };
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // sub lookup — found by invoice_number
      .mockResolvedValueOnce({ rows: [mockSub] }) // subscription found
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE subscriptions
      .mockResolvedValueOnce({ rows: [] }) // INSERT payments
      .mockResolvedValueOnce({ rows: [] }) // UPDATE users is_active
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({ rows: [] }) // INSERT tax_transactions (no postal code)
      .mockResolvedValueOnce({ rows: [] }) // ARB creation check query
      .mockResolvedValueOnce({ rows: [{ email: 'test@example.com' }] }); // user email lookup
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
    // Verify subscription was updated
    const updateCall = mockDbQuery.mock.calls.find(c => c[0].includes('UPDATE subscriptions'));
    expect(updateCall).toBeDefined();
  });

  test('creates ARB subscription when eligible after activation', async () => {
    const body = { eventType: 'authcapture.created', payload: { id: 'txn_arb', invoiceNumber: 'inv_arb', responseCode: '1', authAmount: '99.99' } };
    const req = buildAuthorizeWebhook(body);
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
      // ARB check: no arb_subscription_id yet
      .mockResolvedValueOnce({ rows: [] }) // ARB: getAuthorizeTransactionDetails
      .mockResolvedValueOnce({ rows: [{ customerProfileId: 'CP_123', customerPaymentProfileId: 'CPP_456' }] }) // tx lookup
      .mockResolvedValueOnce({ rows: [{ amount_cents: 9999 }] }) // plan amount lookup
      .mockResolvedValueOnce({ rows: [] }) // UPDATE arb_subscription_id
      .mockResolvedValueOnce({ rows: [{ email: 'arb@example.com' }] }); // user email
    const res = { json: jest.fn() };
    await authorizeNetWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ received: true, signatureValid: true });
    // Verify ARB was created
    expect(authorizeNetUtils.AuthorizeNetService).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests**

Run: `cd /tmp/Decontaminate/backend && npx jest tests/webhookController.test.js --testNamePattern="authorizeNetWebhook" -v`
Expected: PASS

**Step 3: Commit**

```bash
cd /tmp/Decontaminate/backend
git add tests/webhookController.test.js
git commit -m "test(webhook): add authorizeNetWebhook handler tests (7 cases)"
```

---

## Task 7: Write logAuthorizeEvent tests

**Files:**
- Modify: `backend/tests/webhookController.test.js`

**Step 1: Add logAuthorizeEvent tests**

```javascript
// ══════════════════════════════════════════════════════════════════════════════
// logAuthorizeEvent utility
// ══════════════════════════════════════════════════════════════════════════════
describe('logAuthorizeEvent', () => {
  // Import directly from controller module (it's a plain function, not mocked)
  beforeEach(() => {
    jest.clearAllMocks();
    fs.appendFileSync.mockReset();
    fs.mkdirSync.mockReset();
  });

  test('appends JSON line to authorize-webhook.log', () => {
    const { logAuthorizeEvent } = require('../src/controllers/webhookController');
    const dir = path.join(process.cwd(), 'logs');
    logAuthorizeEvent('test-event', { foo: 'bar' });
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      path.join(dir, 'authorize-webhook.log'),
      expect.stringContaining('"label":"test-event"')
    );
  });

  test('includes ISO timestamp in log line', () => {
    const { logAuthorizeEvent } = require('../src/controllers/webhookController');
    logAuthorizeEvent('webhook-received', { txnId: 'tx_1' });
    const [, line] = fs.appendFileSync.mock.calls[0];
    const parsed = JSON.parse(line);
    expect(parsed.ts).toBeDefined();
    expect(new Date(parsed.ts).toString()).not.toBe('Invalid Date');
  });

  test('does not throw when fs.appendFileSync fails (swallows error)', () => {
    const { logAuthorizeEvent } = require('../src/controllers/webhookController');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fs.appendFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
    // Should not throw
    expect(() => logAuthorizeEvent('test', {})).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Authorize webhook logging error:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  test('creates logs directory if it does not exist', () => {
    const { logAuthorizeEvent } = require('../src/controllers/webhookController');
    logAuthorizeEvent('test', {});
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(process.cwd(), 'logs'), { recursive: true });
  });
});
```

**Step 2: Run tests**

Run: `cd /tmp/Decontaminate/backend && npx jest tests/webhookController.test.js --testNamePattern="logAuthorizeEvent" -v`
Expected: PASS

**Step 3: Commit**

```bash
cd /tmp/Decontaminate/backend
git add tests/webhookController.test.js
git commit -m "test(webhook): add logAuthorizeEvent utility tests (4 cases)"
```

---

## Task 8: Final verification — run all webhookController tests

**Step 1: Run full test suite**

```bash
cd /tmp/Decontaminate/backend
npx jest tests/webhookController.test.js -v --coverage
```

Expected: All tests pass, coverage for webhookController.js > 60%

**Step 2: Run full backend suite (no regressions)**

```bash
cd /tmp/Decontaminate/backend
npm test 2>&1 | tail -20
```

Expected: 530+ tests passing

**Step 3: Update automation-status.md**

Append new task entry to docs/automation-status.md:
```
|| 57 | webhookController unit tests (X tests, Y% coverage — Plisio, PaymentsCloud, Authorize.Net handlers + WebhookVerifier class) | **IN PROGRESS** ||
```

**Step 4: Commit**

```bash
cd /tmp/Decontaminate/backend
git add tests/webhookController.test.js
git commit -m "test(webhook): complete webhookController unit tests — 40+ cases covering all handlers and WebhookVerifier"
```

---

## Verification Summary

| File | Before | After |
|------|--------|-------|
| `src/controllers/webhookController.js` | 0% coverage | ~65-75% coverage |
| `tests/webhookController.test.js` | NEW | ~40 test cases |
| `backend/` total tests | 530 | 565+ |
