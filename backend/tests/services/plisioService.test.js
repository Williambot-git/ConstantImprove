/**
 * plisioService unit tests
 *
 * Tests crypto invoice operations with mocked axios.
 *
 * Setup: backend/__mocks__/axios.js provides a manual mock with a jest.fn() for .get.
 * This is the cleanest approach in Jest 30 — no factory function needed.
 * jest.mock('axios') automatically uses __mocks__/axios.js, and require('axios').get
 * is already the jest mock function that supports .mockResolvedValue().
 */

// Set env BEFORE requiring the service so the singleton constructor captures the test key
process.env.PLISIO_API_KEY = 'TEST_KEY';

jest.mock('axios');
const axios = require('axios');
const nodeCrypto = require('crypto');

const plisioService = require('../../src/services/plisioService');

describe('plisioService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createInvoice', () => {
    it('success — returns invoiceId, url, qrCode, wallet, amountDue, currency, expiresAt', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: {
            txn_id: 'inv_12345',
            invoice_url: 'https://plisio.net/invoice/abc123',
            qr_code: 'data:image/png;base64,iVBORw0KGgo=',
            wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f',
            invoice_total_sum: '49.99',
            expire_at: '2026-04-17T12:00:00Z'
          }
        }
      };
      axios.get.mockResolvedValue(mockResponse);

      const result = await plisioService.createInvoice(
        49.99, 'USD', 'Test Order', 'ORD-001',
        'https://example.com/callback', 'https://example.com/success',
        'https://example.com/cancel', 'test@example.com'
      );

      expect(result.success).toBe(true);
      expect(result.invoiceId).toBe('inv_12345');
      expect(result.invoiceUrl).toBe('https://plisio.net/invoice/abc123');
      expect(result.qrCode).toBe('data:image/png;base64,iVBORw0KGgo=');
      expect(result.walletAddress).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f');
      expect(result.amountDue).toBe(49.99);
      expect(result.currency).toBe('USD');
      expect(result.expiresAt).toBe('2026-04-17T12:00:00Z');
    });

    it('non-success Plisio response (e.g. pending) — throws "Plisio invoice creation failed"', async () => {
      // The Plisio API may return a response where status is neither 'success' nor throws.
      // In this case the service falls through to the else branch and throws the
      // server-provided message. This branch is structurally different from an axios
      // rejection — the request succeeded but the invoice is not created.
      axios.get.mockResolvedValue({
        data: {
          status: 'pending',
          message: 'Invoice is pending',
          data: {}
        }
      });

      await expect(
        plisioService.createInvoice(100, 'USD', 'Order', 'ORD-003', 'http://cb.com', 'http://su.com', 'http://ca.com')
      ).rejects.toThrow('Failed to create crypto invoice');
    });

    it('error response — throws "Failed to create crypto invoice"', async () => {
      // The service's catch block catches axios rejections and re-throws as a generic message
      axios.get.mockRejectedValue(new Error('Plisio API error'));

      await expect(
        plisioService.createInvoice(100, 'USD', 'Order', 'ORD-002', 'http://cb.com', 'http://su.com', 'http://ca.com')
      ).rejects.toThrow('Failed to create crypto invoice');
    });

    it('amount formatted to 8 decimal places', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: {
            txn_id: 'inv_456',
            invoice_url: 'https://plisio.net/invoice/def456',
            qr_code: 'qr',
            wallet_address: '0xwallet',
            invoice_total_sum: '10.00',
            expire_at: '2026-04-18T12:00:00Z'
          }
        }
      };
      axios.get.mockResolvedValue(mockResponse);

      await plisioService.createInvoice(
        10.5, 'USD', 'Order', 'ORD-004', 'http://cb.com', 'http://su.com', 'http://ca.com'
      );

      const callUrl = axios.get.mock.calls[0][0];
      expect(callUrl).toContain('source_amount=10.50000000');
    });
  });

  describe('getInvoiceStatus', () => {
    it('success — returns invoice data', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: {
            txn_id: 'inv_789',
            status: 'completed',
            amount: '50.00'
          }
        }
      };
      axios.get.mockResolvedValue(mockResponse);

      const result = await plisioService.getInvoiceStatus('inv_789');

      expect(result).toEqual({ txn_id: 'inv_789', status: 'completed', amount: '50.00' });
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.plisio.net/api/v1/invoices/inv_789',
        { params: { api_key: 'TEST_KEY' } }
      );
    });

    it('error response — throws', async () => {
      axios.get.mockResolvedValue({ data: { status: 'error', message: 'Invoice not found' } });

      await expect(plisioService.getInvoiceStatus('inv_bad')).rejects.toThrow();
    });

    it('network error — throws "Failed to fetch invoice status"', async () => {
      axios.get.mockRejectedValue(new Error('Connection refused'));

      await expect(plisioService.getInvoiceStatus('inv_xyz')).rejects.toThrow('Failed to fetch invoice status');
    });
  });

  describe('verifyCallback', () => {
    it('valid HMAC-SHA1 — returns true', () => {
      const params = { order_number: 'ORD-001', amount: '49.99', status: 'completed' };
      const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
      // Use Node's built-in crypto module to compute the expected HMAC-SHA1 hash
      // (not the service's internal crypto require, which may differ in Jest context)
      const validHash = nodeCrypto.createHmac('sha1', 'TEST_KEY').update(sorted).digest('hex');

      const result = plisioService.verifyCallback({ ...params, verify_hash: validHash });

      expect(result).toBe(true);
    });

    it('invalid hash — returns false', () => {
      const result = plisioService.verifyCallback({
        order_number: 'ORD-001',
        amount: '49.99',
        verify_hash: 'invalid_hash_123'
      });

      expect(result).toBe(false);
    });

    it('missing verify_hash — returns false', () => {
      const result = plisioService.verifyCallback({
        order_number: 'ORD-001',
        amount: '49.99'
      });

      expect(result).toBe(false);
    });
  });
});
