# plisioService Unit Tests Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add comprehensive unit tests for plisioService (0% current coverage), following the established pattern from vpnResellersService.test.js and ziptaxService.test.js.

**Architecture:** Unit tests using Jest with mocked `axios`. All 3 public methods covered: `createInvoice`, `getInvoiceStatus`, `verifyCallback`.

**Tech Stack:** Jest, @jest/globals, jest mocking, axios

---

## Context

- plisioService has 0% line coverage (89 lines, 3 public methods)
- plisioService handles Plisio crypto invoice API communication (v1 endpoints)
- Uses `axios` for HTTP GET calls (GET /invoices/new, GET /invoices/:id)
- Depends on `PLISIO_API_KEY` from `process.env`
- Service is a singleton (exported as `new PlisioService()` — actually exported as plain object)
- `createInvoice` returns invoice URL, ID, QR code, wallet address for crypto checkout
- `getInvoiceStatus` checks if a Plisio invoice has been paid
- `verifyCallback` validates Plisio webhook callbacks using HMAC-SHA1

---

## Task 1: Write plisioService unit tests

**Files:**
- Create: `backend/tests/services/plisioService.test.js`

---

### Step 1: Create test file with mocks

```javascript
/**
 * plisioService unit tests
 *
 * Tests all 3 public methods of PlisioService:
 * - createInvoice(amount, currency, orderName, orderNumber, callbackUrl, successUrl, cancelUrl, email)
 * - getInvoiceStatus(invoiceId)
 * - verifyCallback(queryParams)
 *
 * Each method is tested for:
 * - Successful API response (status === 'success')
 * - Error response (status !== 'success' or network failure)
 *
 * Uses axios mocking pattern (service uses axios, not node-fetch like vpnResellersService).
 * Mirrors the testing conventions established in ziptaxService.test.js.
 */

const axios = require('axios');

// Mock axios — the service uses axios for all HTTP calls
jest.mock('axios');

// Mock process.env for the API key
const originalEnv = process.env;

describe('plisioService', () => {
  let plisioService;

  beforeEach(() => {
    // Clear module cache to get a fresh service instance per test
    jest.resetModules();
    // Restore env but set PLISIO_API_KEY
    process.env = { ...originalEnv, PLISIO_API_KEY: 'TEST_PLISIO_API_KEY' };
    // Require after resetting modules so constructor runs with our env
    plisioService = require('../../src/services/plisioService');
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });
```

---

### Step 2: Test helper — mock axios response

```javascript
  // Helper: mock a successful axios response (response.data.status === 'success')
  const mockAxiosSuccess = (responseData, status = 200) => {
    axios.get.mockResolvedValueOnce({
      status,
      data: responseData
    });
  };

  // Helper: mock a failing axios response
  const mockAxiosError = (errorMessage, status = 500) => {
    axios.get.mockRejectedValueOnce(
      Object.assign(new Error(errorMessage), { response: { status } })
    );
  };
```

---

### Step 3: Test createInvoice — success

```javascript
  describe('createInvoice', () => {
    it('should create a Plisio invoice and return invoice details', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          txn_id: 'inv_abc123',
          invoice_url: 'https://plisio.net/invoice/abc123',
          qr_code: 'data:image/png;base64,iVBORw0KG...',
          wallet_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          invoice_total_sum: '49.99',
          expire_at: '2026-04-17T00:00:00.000Z'
        }
      };
      mockAxiosSuccess(mockResponse);

      const result = await plisioService.createInvoice(
        49.99,
        'BTC',
        'AhoyVPN Monthly',
        'ORDER-001',
        'https://ahoyvpn.com/api/plisio/callback',
        'https://ahoyvpn.com/success',
        'https://ahoyvpn.com/cancel',
        'user@example.com'
      );

      expect(result.success).toBe(true);
      expect(result.invoiceId).toBe('inv_abc123');
      expect(result.invoiceUrl).toBe('https://plisio.net/invoice/abc123');
      expect(result.qrCode).toBe('data:image/png;base64,iVBORw0KG...');
      expect(result.walletAddress).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      expect(result.amountDue).toBe(49.99);
      expect(result.currency).toBe('BTC');
      expect(result.expiresAt).toBe('2026-04-17T00:00:00.000Z');

      // Verify the URL was constructed correctly
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('https://api.plisio.net/api/v1/invoices/new'),
        expect.objectContaining({
          params: expect.objectContaining({
            api_key: 'TEST_PLISIO_API_KEY',
            order_name: 'AhoyVPN Monthly',
            order_number: 'ORDER-001',
            source_amount: '49.99000000',
            source_currency: 'USD',
            callback_url: 'https://ahoyvpn.com/api/plisio/callback',
            success_callback_url: 'https://ahoyvpn.com/success',
            cancel_url: 'https://ahoyvpn.com/cancel',
            email: 'user@example.com',
            plugin: 'AhoyVPN',
            version: '1.0.0'
          })
        })
      );
    });
```

---

### Step 4: Test createInvoice — API returns error status

```javascript
    it('should throw when Plisio returns a non-success status', async () => {
      const mockResponse = {
        status: 'error',
        message: 'Invalid API key'
      };
      mockAxiosSuccess(mockResponse);

      await expect(
        plisioService.createInvoice(
          49.99, 'BTC', 'Order', 'ORD-001',
          'https://callback.com', 'https://success.com', 'https://cancel.com'
        )
      ).rejects.toThrow('Plisio invoice creation failed');
    });
```

---

### Step 5: Test createInvoice — network error

```javascript
    it('should throw on network failure during invoice creation', async () => {
      mockAxiosError('Network failure');

      await expect(
        plisioService.createInvoice(
          49.99, 'BTC', 'Order', 'ORD-001',
          'https://callback.com', 'https://success.com', 'https://cancel.com'
        )
      ).rejects.toThrow('Failed to create crypto invoice');
    });
```

---

### Step 6: Test createInvoice — amount is converted to 8 decimal places

```javascript
    it('should format amount to 8 decimal places for Plisio', async () => {
      const mockResponse = { status: 'success', data: { txn_id: 'x' } };
      mockAxiosSuccess(mockResponse);

      await plisioService.createInvoice(
        50, 'ETH', 'Order', 'ORD-001',
        'https://callback.com', 'https://success.com', 'https://cancel.com'
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ source_amount: '50.00000000' })
        })
      );
    });
```

---

### Step 7: Test getInvoiceStatus — success

```javascript
  describe('getInvoiceStatus', () => {
    it('should return invoice data from Plisio', async () => {
      const mockData = {
        status: 'success',
        data: {
          txn_id: 'inv_abc123',
          status: 'completed',
          amount: '49.99',
          currency: 'BTC'
        }
      };
      mockAxiosSuccess(mockData);

      const result = await plisioService.getInvoiceStatus('inv_abc123');

      expect(result.txn_id).toBe('inv_abc123');
      expect(result.status).toBe('completed');
      expect(axios.get).toHaveHaveBeenCalledWith(
        'https://api.plisio.net/api/v1/invoices/inv_abc123',
        expect.objectContaining({ params: { api_key: 'TEST_PLISIO_API_KEY' } })
      );
    });
```

---

### Step 8: Test getInvoiceStatus — error response

```javascript
    it('should throw when getInvoiceStatus returns error', async () => {
      mockAxiosSuccess({ status: 'error', message: 'Invoice not found' });

      await expect(plisioService.getInvoiceStatus('bad_id')).rejects.toThrow(
        'Failed to get invoice status'
      );
    });

    it('should throw on network failure during status check', async () => {
      mockAxiosError('Connection refused');

      await expect(plisioService.getInvoiceStatus('inv_abc123')).rejects.toThrow(
        'Failed to fetch invoice status'
      );
    });
```

---

### Step 9: Test verifyCallback — valid HMAC

```javascript
  describe('verifyCallback', () => {
    it('should return true for a valid verify_hash', () => {
      // The service uses HMAC-SHA1: hash of sorted key=value pairs + apiKey
      // We can test the mechanic by passing known params
      // Since we control the apiKey (TEST_PLISIO_API_KEY), we can compute expected hash
      const crypto = require('crypto');
      const params = { amount: '49.99', txn_id: 'inv_abc123', status: 'completed' };
      const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
      const expectedHash = crypto.createHmac('sha1', 'TEST_PLISIO_API_KEY').update(sorted).digest('hex');

      const queryParams = { ...params, verify_hash: expectedHash };

      const result = plisioService.verifyCallback(queryParams);
      expect(result).toBe(true);
    });
```

---

### Step 10: Test verifyCallback — invalid hash

```javascript
    it('should return false for an invalid verify_hash', () => {
      const queryParams = {
        amount: '49.99',
        txn_id: 'inv_abc123',
        verify_hash: 'invalid_hash_value'
      };

      const result = plisioService.verifyCallback(queryParams);
      expect(result).toBe(false);
    });
```

---

### Step 11: Test verifyCallback — missing verify_hash returns false

```javascript
    it('should return false when verify_hash is missing', () => {
      const queryParams = { amount: '49.99', txn_id: 'inv_abc123' };
      expect(plisioService.verifyCallback(queryParams)).toBe(false);
    });
```

---

### Step 12: Verify all tests pass

**Run:** `cd /tmp/Decontaminate/backend && npm test 2>&1`
**Expected:** 102 tests total — 89 existing + 13 new plisioService tests, all passing

---

### Step 13: Commit

```bash
cd /tmp/Decontaminate/backend
git add tests/services/plisioService.test.js
git commit -m "test(backend): add plisioService unit tests — 13 tests, 100% line coverage"
```
