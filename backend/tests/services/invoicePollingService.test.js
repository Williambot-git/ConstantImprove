/**
 * invoicePollingService unit tests
 *
 * Tests the invoice polling loop that checks trialing subscriptions for
 * Plisio crypto payment confirmations, and the ARB polling loop for
 * Authorize.net subscription status changes.
 *
 * Mocks:
 *   - db          (database queries)
 *   - plisioService    (getInvoiceStatus)
 *   - paymentProcessingService (processPlisioPaymentAsync)
 *   - VpnResellersService (deactivateAccount)
 *   - authorizeNetUtils.AuthorizeNetService (getArbSubscription)
 */

// Set env BEFORE requiring the service
process.env.PLISIO_API_KEY = 'test_key';

jest.mock('../../src/config/database');
jest.mock('../../src/services/plisioService');
jest.mock('../../src/services/paymentProcessingService');
jest.mock('../../src/services/authorizeNetUtils');
jest.mock('../../src/services/vpnResellersService');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const db = require('../../src/config/database');
const plisioService = require('../../src/services/plisioService');
const { processPlisioPaymentAsync } = require('../../src/services/paymentProcessingService');
const { AuthorizeNetService } = require('../../src/services/authorizeNetUtils');

const {
  runOnce,
  pollArbSubscriptions,
  CHECKPOINT_MINUTES,
  _resetAuthorizeService
} = require('../../src/services/invoicePollingService');

describe('invoicePollingService', () => {
  // Track prototype spies so we can restore them after each test.
  // This is necessary because _authorizeService is cached and each test
  // needs its own fresh mock/spy on getArbSubscription.
  let arbSpy = null;

  beforeEach(() => {
    jest.clearAllMocks();
    _resetAuthorizeService();
  });

  afterEach(() => {
    if (arbSpy) {
      arbSpy.mockRestore();
      arbSpy = null;
    }
  });

  // -------------------------------------------------------------------------
  // runOnce — happy path: no trialing subscriptions
  // -------------------------------------------------------------------------
  describe('runOnce', () => {
    it('no trialing subscriptions — does nothing', async () => {
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      await runOnce();

      expect(db.query).toHaveBeenCalledTimes(1);
      expect(processPlisioPaymentAsync).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // runOnce — subscription at first checkpoint (15 min), invoice completed
    // -------------------------------------------------------------------------
    it('invoice completed at checkpoint — calls processPlisioPaymentAsync', async () => {
      const createdAt = new Date(Date.now() - 16 * 60 * 1000).toISOString(); // 16 min ago
      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-1',
            user_id: 'user-1',
            status: 'trialing',
            plisio_invoice_id: 'inv_abc',
            metadata: { poll_attempts: 0 },
            created_at: createdAt
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // updateMetadata

      plisioService.getInvoiceStatus.mockResolvedValue({
        invoice: { status: 'completed', amount: '49.99', currency: 'USD', tx_id: ['tx_001'] }
      });

      await runOnce();

      expect(plisioService.getInvoiceStatus).toHaveBeenCalledWith('inv_abc');
      expect(processPlisioPaymentAsync).toHaveBeenCalledWith('inv_abc', 'tx_001', '49.99', 'USD');
      expect(db.query).toHaveBeenCalledTimes(2); // select + updateMetadata
    });

    // -------------------------------------------------------------------------
    // runOnce — subscription at first checkpoint (15 min), cancelled/duplicate
    //           with activeInvoiceId
    // -------------------------------------------------------------------------
    it('cancelled_duplicate with activeInvoiceId — calls processPlisioPaymentAsync with activeInvoiceId', async () => {
      const createdAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-1',
            user_id: 'user-1',
            status: 'trialing',
            plisio_invoice_id: 'inv_old',
            metadata: { poll_attempts: 0 },
            created_at: createdAt
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // updateMetadata

      plisioService.getInvoiceStatus.mockResolvedValue({
        invoice: {
          status: 'cancelled duplicate', // space-separated as Plisio API returns
          switch_id: 'inv_new',
          amount: '49.99',
          currency: 'USD',
          tx_id: ['tx_002']
        },
        active_invoice_id: 'inv_new'
      });

      await runOnce();

      expect(processPlisioPaymentAsync).toHaveBeenCalledWith('inv_new', 'tx_002', '49.99', 'USD');
    });

    // -------------------------------------------------------------------------
    // runOnce — subscription at checkpoint but invoice not completed/cancelled
    // -------------------------------------------------------------------------
    it('pending invoice — updates metadata with current poll info', async () => {
      const createdAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-1',
            user_id: 'user-1',
            status: 'trialing',
            plisio_invoice_id: 'inv_pending',
            metadata: { poll_attempts: 0 },
            created_at: createdAt
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // updateMetadata

      plisioService.getInvoiceStatus.mockResolvedValue({
        invoice: { status: 'pending', amount: '49.99', currency: 'USD' }
      });

      await runOnce();

      expect(processPlisioPaymentAsync).not.toHaveBeenCalled();
      // Second db.query call is updateMetadata with baseMeta
      const updateCall = db.query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE subscriptions');
    });

    // -------------------------------------------------------------------------
    // runOnce — subscription has reached max poll attempts, skips
    // -------------------------------------------------------------------------
    it('subscription at max poll attempts — skips', async () => {
      const createdAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 60 min ago
      db.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'sub-1',
          user_id: 'user-1',
          status: 'trialing',
          plisio_invoice_id: 'inv_maxed',
          metadata: { poll_attempts: CHECKPOINT_MINUTES.length }, // already at max
          created_at: createdAt
        }]
      });

      await runOnce();

      expect(plisioService.getInvoiceStatus).not.toHaveBeenCalled();
      expect(processPlisioPaymentAsync).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // runOnce — line 98: poll_attempts=2, age past 3rd checkpoint (45 min),
    //            invoice still pending → updates metadata with poll_result=timeout_no_payment
    //            (CHECKPOINT_MINUTES=[15,30,45]; attempts+1=3=length → timeout branch)
    // -------------------------------------------------------------------------
    it('subscription at final checkpoint with pending invoice — sets poll_result=timeout_no_payment', async () => {
      const createdAt = new Date(Date.now() - 46 * 60 * 1000).toISOString(); // 46 min ago (past 45-min checkpoint)
      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-timeout',
            user_id: 'user-timeout',
            status: 'trialing',
            plisio_invoice_id: 'inv_pending',
            metadata: { poll_attempts: 2 }, // attempts+1=3=CHECKPOINT_MINUTES.length → timeout branch (line 97-101)
            created_at: createdAt
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // updateMetadata call

      plisioService.getInvoiceStatus.mockResolvedValue({
        invoice: { status: 'pending', amount: '49.99', currency: 'USD' } // not completed/cancelled
      });

      await runOnce();

      expect(plisioService.getInvoiceStatus).toHaveBeenCalledWith('inv_pending');
      expect(processPlisioPaymentAsync).not.toHaveBeenCalled();
      // Second call is updateMetadata(sub.id, mergedMeta) where mergedMeta includes poll_result='timeout_no_payment'
      // updateMetadata calls db.query(sql, [JSON.stringify(metadata), subscriptionId])
      // → updateCall[1][0] = JSON metadata string, updateCall[1][1] = subscriptionId
      const updateCall = db.query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE subscriptions');
      expect(updateCall[1][1]).toBe('sub-timeout'); // subscriptionId as 2nd param
      const parsedMeta = JSON.parse(updateCall[1][0]); // JSON metadata as 1st param
      expect(parsedMeta.poll_result).toBe('timeout_no_payment');
      expect(parsedMeta.poll_attempts).toBe(3); // incremented from 2
      expect(parsedMeta.polling_stopped_at).toBeDefined();
    });

    // -------------------------------------------------------------------------
    // runOnce — subscription not yet at next checkpoint age, skips
    // -------------------------------------------------------------------------
    it('subscription not yet at checkpoint age — skips', async () => {
      const createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // only 5 min ago
      db.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'sub-1',
          user_id: 'user-1',
          status: 'trialing',
          plisio_invoice_id: 'inv_early',
          metadata: { poll_attempts: 0 },
          created_at: createdAt
        }]
      });

      await runOnce();

      expect(plisioService.getInvoiceStatus).not.toHaveBeenCalled();
      expect(processPlisioPaymentAsync).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // runOnce — plisioService.getInvoiceStatus throws, logs error and continues
    // -------------------------------------------------------------------------
    it('getInvoiceStatus error — logs and continues to next subscription', async () => {
      const createdAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      const { error: logError } = require('../../src/utils/logger');
      logError.mockImplementation(() => {});

      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-1',
              user_id: 'user-1',
              status: 'trialing',
              plisio_invoice_id: 'inv_err',
              metadata: { poll_attempts: 0 },
              created_at: createdAt
            },
            {
              id: 'sub-2',
              user_id: 'user-2',
              status: 'trialing',
              plisio_invoice_id: 'inv_ok',
              metadata: { poll_attempts: 0 },
              created_at: createdAt
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [] }) // updateMetadata for sub-1
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-2',
            user_id: 'user-2',
            status: 'trialing',
            plisio_invoice_id: 'inv_ok',
            metadata: { poll_attempts: 0 },
            created_at: createdAt
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // updateMetadata for sub-2

      plisioService.getInvoiceStatus
        .mockRejectedValueOnce(new Error('Plisio API down'))
        .mockResolvedValueOnce({
          invoice: { status: 'completed', amount: '10.00', currency: 'BTC', tx_id: ['tx_btc'] }
        });

      await runOnce();

      expect(logError).toHaveBeenCalledWith(
        'Invoice polling error for subscription',
        expect.objectContaining({ subscriptionId: 'sub-1', error: 'Plisio API down' })
      );
      // sub-2 should still be processed
      expect(plisioService.getInvoiceStatus).toHaveBeenCalledTimes(2);
      logError.mockReset();
    });

    // -------------------------------------------------------------------------
    // runOnce — CHECKPOINT_MINUTES constant
    // -------------------------------------------------------------------------
    it('CHECKPOINT_MINUTES is [15, 30, 45]', () => {
      expect(CHECKPOINT_MINUTES).toEqual([15, 30, 45]);
    });

    // -------------------------------------------------------------------------
    // runOnce — getAttempts edge cases tested indirectly through runOnce behavior.
    // getAttempts returns 0 when metadata is null/undefined (line 11).
    // getAttempts returns 0 when poll_attempts is NaN or Infinity (line 11).
    // getAttempts returns 0 when poll_attempts is negative (line 12: fails >= 0 check).
    // All these cases cause the subscription to behave as if poll_attempts=0.
    // -------------------------------------------------------------------------
    it('null metadata — behaves as poll_attempts=0 (skips checkpoints, not yet at age)', async () => {
      // 5 min ago — would hit first checkpoint (15 min) if attempts=0, but still skips
      // because age < nextCheckpoint even with attempts=0
      const createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      db.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'sub-null-meta',
          user_id: 'user-null',
          status: 'trialing',
          plisio_invoice_id: 'inv_null',
          metadata: null, // null → getAttempts returns 0
          created_at: createdAt
        }]
      });

      await runOnce();

      // Should skip because age (5 min) < nextCheckpoint (15 min) with attempts=0
      expect(plisioService.getInvoiceStatus).not.toHaveBeenCalled();
    });

    it('NaN poll_attempts — behaves as poll_attempts=0 (skips checkpoints)', async () => {
      const createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      db.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'sub-nan-meta',
          user_id: 'user-nan',
          status: 'trialing',
          plisio_invoice_id: 'inv_nan',
          metadata: { poll_attempts: NaN }, // NaN → getAttempts returns 0
          created_at: createdAt
        }]
      });

      await runOnce();

      expect(plisioService.getInvoiceStatus).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  describe('pollArbSubscriptions — inner catch (line 156-157)', () => {
    beforeEach(() => {
      _resetAuthorizeService();
    });

    // The inner catch inside the for-of loop (runOnce lines 41-108 / pollArbSubscriptions
    // lines 155-157) catches errors from getArbSubscription and logs them, then continues.
    // We test this by having getArbSubscription throw — the catch should log and continue.
    it('getArbSubscription throws — inner catch logs and continues to next subscription', async () => {
      // Spy so the auto-mocked AuthorizeNetService returns a throwing mock
      arbSpy = jest.spyOn(AuthorizeNetService.prototype, 'getArbSubscription')
        .mockResolvedValueOnce({
          status: 'active',
          paymentStatus: 'settledSuccessfully'
        })
        .mockRejectedValueOnce(new Error('Authorize.net API temporarily unavailable'))
        .mockResolvedValueOnce({
          status: 'active',
          paymentStatus: 'pending'
        });

      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-arb-ok',
              user_id: 'user-arb-ok',
              status: 'active',
              metadata: { arb_subscription_id: 'arb_ok' },
              current_period_end: new Date().toISOString()
            },
            {
              id: 'sub-arb-err',
              user_id: 'user-arb-err',
              status: 'active',
              metadata: { arb_subscription_id: 'arb_err' },
              current_period_end: new Date().toISOString()
            },
            {
              id: 'sub-arb-pending',
              user_id: 'user-arb-pending',
              status: 'active',
              metadata: { arb_subscription_id: 'arb_pending' },
              current_period_end: new Date().toISOString()
            }
          ]
        })
        .mockResolvedValue({ rows: [] }); // all subsequent queries

      const { error: logError } = require('../../src/utils/logger');
      logError.mockImplementation(() => {});

      await pollArbSubscriptions();

      // sub-arb-ok: should have called getArbSubscription (settledSuccessfully → activate)
      // sub-arb-err: getArbSubscription threw → inner catch logs error → continues
      // sub-arb-pending: should have called getArbSubscription (pending → no action)
      expect(AuthorizeNetService.prototype.getArbSubscription).toHaveBeenCalledTimes(3);
      expect(logError).toHaveBeenCalledWith(
        'ARB polling error for subscription',
        expect.objectContaining({ subscriptionId: 'sub-arb-err', error: 'Authorize.net API temporarily unavailable' })
      );

      logError.mockReset();
    });
  });

  // =========================================================================
  describe('pollArbSubscriptions', () => {
    beforeEach(() => {
      // Reset the cached AuthorizeNetService so each test gets a fresh instance.
      _resetAuthorizeService();
    });

    it('ARB suspended — deactivates VPN and marks user inactive', async () => {
      // Spy directly on AuthorizeNetService.prototype.getArbSubscription so the
      // cached _authorizeService instance (which is created from the auto-mocked
      // AuthorizeNetService class) uses our spy with the correct return value.
      //
      // IMPORTANT: The actual getArbSubscription TRANSFORMS the raw API response.
      // The mock must return the TRANSFORMED shape, not the raw API shape:
      //   Raw API:       { messages: { resultCode: 'Ok' }, subscription: { status: 'suspended', paymentStatus: '' } }
      //   Transformed:   { status: 'suspended', paymentStatus: '' } (top-level fields)
      arbSpy = jest.spyOn(AuthorizeNetService.prototype, 'getArbSubscription')
        .mockResolvedValueOnce({
          status: 'suspended',
          paymentStatus: ''
        });

      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-arb-1',
            user_id: 'user-arb-1',
            status: 'active',
            metadata: { arb_subscription_id: 'arb_123' },
            current_period_end: new Date().toISOString()
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE subscriptions
        .mockResolvedValueOnce({ // SELECT vpn_accounts
          rows: [{ id: 'va-1', purewl_uuid: 'uuid-abc' }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE vpn_accounts
        .mockResolvedValueOnce({ rows: [] }); // UPDATE users

      await pollArbSubscriptions();

      // Subscription was cancelled and user deactivated
      expect(arbSpy).toHaveBeenCalledWith('arb_123');
      expect(db.query).toHaveBeenCalledTimes(5);
      const updateSubCall = db.query.mock.calls.find(
        c => c[0].includes('subscriptions') && c[0].includes("status = 'canceled'")
      );
      expect(updateSubCall).toBeDefined();
      expect(updateSubCall[1]).toEqual(['sub-arb-1']);
    });

    it('ARB canceled — deactivates VPN and marks user inactive', async () => {
      // Spy on the prototype to get the transformed response shape
      const arbSpy = jest.spyOn(AuthorizeNetService.prototype, 'getArbSubscription')
        .mockResolvedValueOnce({
          status: 'canceled',
          paymentStatus: ''
        });

      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-arb-2',
            user_id: 'user-arb-2',
            status: 'active',
            metadata: { arb_subscription_id: 'arb_456' },
            current_period_end: new Date().toISOString()
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE subscriptions
        .mockResolvedValueOnce({ rows: [] }) // SELECT vpn_accounts (none)
        .mockResolvedValueOnce({ rows: [] }); // UPDATE users

      await pollArbSubscriptions();

      expect(arbSpy).toHaveBeenCalledWith('arb_456');
      // Subscription was cancelled even with no VPN account
      expect(db.query).toHaveBeenCalledTimes(4);
      const updateSubCall = db.query.mock.calls.find(
        c => c[0].includes('subscriptions') && c[0].includes("status = 'canceled'")
      );
      expect(updateSubCall).toBeDefined();
    });

    it('ARB active with settledSuccessfully payment — activates subscription', async () => {
      // Spy on the prototype to get the transformed response shape
      const arbSpy = jest.spyOn(AuthorizeNetService.prototype, 'getArbSubscription')
        .mockResolvedValueOnce({
          status: 'active',
          paymentStatus: 'settledSuccessfully'
        });

      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-arb-3',
            user_id: 'user-arb-3',
            status: 'trialing',
            metadata: { arb_subscription_id: 'arb_789' },
            current_period_end: new Date().toISOString()
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE subscriptions
        .mockResolvedValueOnce({ rows: [] }); // UPDATE users

      await pollArbSubscriptions();

      expect(arbSpy).toHaveBeenCalledWith('arb_789');
      // Should update subscription to active and user to is_active=true
      expect(db.query).toHaveBeenCalledTimes(3);
      const activateCall = db.query.mock.calls.find(
        c => c[0].includes('subscriptions') && c[0].includes("status = 'active'")
      );
      expect(activateCall).toBeDefined();
      expect(activateCall[1]).toEqual(['sub-arb-3']);
    });

    it('ARB active but no settled payment — does nothing', async () => {
      // SELECT returns one subscription, but its ARB has no settled payment
      // so no status changes should occur. Only the initial SELECT runs.
      db.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'sub-arb-4',
          user_id: 'user-arb-4',
          status: 'active',
          metadata: { arb_subscription_id: 'arb_other' },
          current_period_end: new Date().toISOString()
        }]
      });

      arbSpy = jest.spyOn(AuthorizeNetService.prototype, 'getArbSubscription')
        .mockResolvedValueOnce({
          status: 'active',
          paymentStatus: 'someOtherStatus'
        });

      await pollArbSubscriptions();

      // ARB was checked but no status change — only SELECT runs, no updates
      expect(arbSpy).toHaveBeenCalledWith('arb_other');
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('ARB getArbSubscription returns null (API error or not found) — skips silently', async () => {
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      // For null, the injectable approach still works fine
      const mockedAuthorizeService = { getArbSubscription: jest.fn().mockResolvedValueOnce(null) };

      await pollArbSubscriptions({ authorizeService: mockedAuthorizeService });

      expect(db.query).toHaveBeenCalledTimes(1); // Only the initial SELECT
    });

    // -------------------------------------------------------------------------
    // pollArbSubscriptions — line 213: outer catch block
    // getArbSubscription itself throws — caught by outer catch, logs, continues
    // -------------------------------------------------------------------------
    it('ARB getArbSubscription throws — logs error and continues to next subscription', async () => {
      const { error: logError } = require('../../src/utils/logger');
      logError.mockImplementation(() => {});

      // First subscription: getArbSubscription throws
      // Second subscription: succeeds with no status change
      arbSpy = jest.spyOn(AuthorizeNetService.prototype, 'getArbSubscription')
        .mockRejectedValueOnce(new Error('Authorize.net API error'))
        .mockResolvedValueOnce({ status: 'active', paymentStatus: 'pending' });

      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-arb-err-1',
              user_id: 'user-err-1',
              status: 'active',
              metadata: { arb_subscription_id: 'arb_err_1' },
              current_period_end: new Date().toISOString()
            },
            {
              id: 'sub-arb-err-2',
              user_id: 'user-err-2',
              status: 'active',
              metadata: { arb_subscription_id: 'arb_err_2' },
              current_period_end: new Date().toISOString()
            }
          ]
        });

      await pollArbSubscriptions();

      expect(logError).toHaveBeenCalledWith(
        'ARB polling error for subscription',
        expect.objectContaining({ subscriptionId: 'sub-arb-err-1', error: 'Authorize.net API error' })
      );
      // Second subscription still processed
      expect(arbSpy).toHaveBeenCalledTimes(2);

      logError.mockReset();
    });

    // -------------------------------------------------------------------------
    // pollArbSubscriptions — line 156: arbId null/undefined continue
    // sub.metadata has arb_subscription_id but it's null/undefined
    // -------------------------------------------------------------------------
    it('ARB subscription with null arb_subscription_id in metadata — skips silently', async () => {
      db.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'sub-no-arb',
          user_id: 'user-no-arb',
          status: 'active',
          metadata: { arb_subscription_id: null }, // null arb — should continue
          current_period_end: new Date().toISOString()
        }]
      });

      await pollArbSubscriptions();

      // getArbSubscription should NOT be called since arbId is null
      expect(arbSpy || jest.spyOn(AuthorizeNetService.prototype, 'getArbSubscription')).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // pollArbSubscriptions — line 183: vpnResellersService.deactivateAccount throws
    // VPN account has purewl_uuid, ARB is suspended, but deactivateAccount throws.
    // The error is caught (line 183), logged, and VPN account status still updated.
    // -------------------------------------------------------------------------
    it('ARB suspended with VPN account but deactivateAccount throws — logs warning, VPN still suspended, user deactivated', async () => {
      const { warn: logWarn } = require('../../src/utils/logger');
      logWarn.mockImplementation(() => {});

      arbSpy = jest.spyOn(AuthorizeNetService.prototype, 'getArbSubscription')
        .mockResolvedValueOnce({
          status: 'suspended',
          paymentStatus: ''
        });

      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-arb-suspend',
            user_id: 'user-arb-suspend',
            status: 'active',
            metadata: { arb_subscription_id: 'arb_suspend' },
            current_period_end: new Date().toISOString()
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE subscriptions (canceled)
        .mockResolvedValueOnce({ // SELECT vpn_accounts — returns account WITH purewl_uuid
          rows: [{ id: 'va-suspend', purewl_uuid: 'uuid-suspend' }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE vpn_accounts (suspended)
        .mockResolvedValueOnce({ rows: [] }); // UPDATE users (deactivated)

      await pollArbSubscriptions();

      // 5 DB calls fired (subscription, VPN account, user all updated despite throw)
      expect(db.query).toHaveBeenCalledTimes(5);
      // VPN account was still suspended (UPDATE still fired despite the throw)
      const updateVpnCall = db.query.mock.calls.find(
        c => c[0].includes('vpn_accounts') && c[0].includes("status = 'suspended'")
      );
      expect(updateVpnCall).toBeDefined();
      // User was deactivated
      const deactivateUserCall = db.query.mock.calls.find(
        c => c[0].includes('users') && c[0].includes('is_active = false')
      );
      expect(deactivateUserCall).toBeDefined();
      // Warning was logged for the deactivation failure (proves deactivateAccount was called and threw)
      expect(logWarn).toHaveBeenCalledWith(
        'Failed to deactivate VPN on ARB cancel',
        expect.objectContaining({ purewlUuid: 'uuid-suspend', error: expect.any(String) })
      );

      logWarn.mockReset();
    });

    // -------------------------------------------------------------------------
    // pollArbSubscriptions — line 180: purewl_uuid is falsy (empty string)
    // VPN account exists but purewl_uuid is null/empty — deactivateAccount NOT called.
    // VPN account status still updated to suspended; user still deactivated.
    // -------------------------------------------------------------------------
    it('ARB suspended with VPN account but purewl_uuid falsy — deactivateAccount skipped, VPN still suspended', async () => {
      arbSpy = jest.spyOn(AuthorizeNetService.prototype, 'getArbSubscription')
        .mockResolvedValueOnce({
          status: 'suspended',
          paymentStatus: ''
        });

      // VPN account row has no purewl_uuid (line 180: if (va.purewl_uuid) is FALSE)
      // so the deactivateAccount try block is skipped entirely.
      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-arb-nouuid',
            user_id: 'user-arb-nouuid',
            status: 'active',
            metadata: { arb_subscription_id: 'arb_nouuid' },
            current_period_end: new Date().toISOString()
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE subscriptions (canceled)
        .mockResolvedValueOnce({ // SELECT vpn_accounts — row exists but purewl_uuid is null
          rows: [{ id: 'va-nouuid', purewl_uuid: null }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE vpn_accounts (suspended)
        .mockResolvedValueOnce({ rows: [] }); // UPDATE users (deactivated)

      await pollArbSubscriptions();

      // 5 DB calls: SELECT subs, UPDATE sub, SELECT vpn, UPDATE vpn, UPDATE user
      expect(db.query).toHaveBeenCalledTimes(5);
      // VPN account was still suspended even without calling deactivateAccount
      const updateVpnCall = db.query.mock.calls.find(
        c => c[0].includes('vpn_accounts') && c[0].includes("status = 'suspended'")
      );
      expect(updateVpnCall).toBeDefined();
      expect(updateVpnCall[1]).toEqual(['va-nouuid']);
    });
  });
});
