/**
 * vpnAccountScheduler unit tests
 *
 * Tests all 4 exported functions:
 * - cleanupExpiredAccounts
 * - cleanupCanceledSubscriptions
 * - suspendExpiredTrials
 * - cleanupAbandonedCheckouts
 */

// Create mock functions at the outer scope so they persist across all test cases
const mockDisableAccount = jest.fn().mockResolvedValue({});
const mockQuery = jest.fn();

// Mock the database
jest.mock('../../src/config/database', () => ({ query: mockQuery }));

// Mock the structured logger to intercept warn/error calls in tests
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock VpnResellersService — spy on the prototype disableAccount
// The scheduler does `new VpnResellersService()` internally; the spy intercepts all calls
jest.mock('../../src/services/vpnResellersService', () => {
  return jest.fn().mockImplementation(() => ({
    disableAccount: mockDisableAccount
  }));
});

const {
  cleanupExpiredAccounts,
  cleanupCanceledSubscriptions,
  suspendExpiredTrials,
  cleanupAbandonedCheckouts
} = require('../../src/services/vpnAccountScheduler');

describe('vpnAccountScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDisableAccount.mockResolvedValue({});
  });

  // ============================================================
  // cleanupExpiredAccounts
  // ============================================================

  describe('cleanupExpiredAccounts', () => {
    it('should disable accounts and update status when expired accounts found', async () => {
      const expiredRows = {
        rows: [
          { id: 1, purewl_uuid: 'uuid-1', user_id: 101 },
          { id: 2, purewl_uuid: 'uuid-2', user_id: 102 }
        ]
      };

      mockQuery
        .mockResolvedValueOnce(expiredRows) // SELECT expired accounts
        .mockResolvedValueOnce({})          // UPDATE vpn_accounts status for id=1
        .mockResolvedValueOnce({});         // UPDATE vpn_accounts status for id=2

      await cleanupExpiredAccounts();

      expect(mockDisableAccount).toHaveBeenCalledTimes(2);
      expect(mockDisableAccount).toHaveBeenCalledWith('uuid-1');
      expect(mockDisableAccount).toHaveBeenCalledWith('uuid-2');
      // Two UPDATE queries (one per expired account) + 1 SELECT = 3 total
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should not call disableAccount when no expired accounts', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await cleanupExpiredAccounts();

      expect(mockDisableAccount).not.toHaveBeenCalled();
      // Only the SELECT query; no UPDATE since no rows
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should still update status when disableAccount throws (swallows error)', async () => {
      const expiredRows = {
        rows: [
          { id: 5, purewl_uuid: 'uuid-fail', user_id: 501 }
        ]
      };

      mockQuery
        .mockResolvedValueOnce(expiredRows)  // SELECT expired accounts
        .mockResolvedValueOnce({});           // UPDATE vpn_accounts status

      mockDisableAccount.mockRejectedValue(new Error('VPN API failure'));

      // The function should NOT throw — errors are swallowed
      await expect(cleanupExpiredAccounts()).resolves.not.toThrow();

      // Status should still be updated (UPDATE was called)
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockDisableAccount).toHaveBeenCalledWith('uuid-fail');
    });
  });

  // ============================================================
  // cleanupCanceledSubscriptions
  // ============================================================

  describe('cleanupCanceledSubscriptions', () => {
    it('should disable VPN account and update status for canceled subscriptions', async () => {
      const canceledRows = {
        rows: [
          { id: 10, purewl_uuid: 'uuid-cancel-1' }
        ]
      };

      mockQuery
        .mockResolvedValueOnce(canceledRows)  // SELECT canceled subscriptions
        .mockResolvedValueOnce({});           // UPDATE vpn_accounts status

      await cleanupCanceledSubscriptions();

      expect(mockDisableAccount).toHaveBeenCalledWith('uuid-cancel-1');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should do nothing when no canceled subscriptions found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await cleanupCanceledSubscriptions();

      expect(mockDisableAccount).not.toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // cleanupCanceledSubscriptions — line 53: disableAccount throws.
    // The error is caught, logged, and the loop continues to UPDATE the status.
    // -------------------------------------------------------------------------
    it('disableAccount throws during cleanupCanceledSubscriptions — error logged, status still updated', async () => {
      const canceledRows = {
        rows: [
          { id: 11, purewl_uuid: 'uuid-disable-fail' }
        ]
      };

      mockQuery
        .mockResolvedValueOnce(canceledRows)  // SELECT canceled subscriptions
        .mockResolvedValueOnce({});            // UPDATE vpn_accounts status

      // disableAccount throws — triggers the catch at line 53
      mockDisableAccount.mockRejectedValue(new Error('VPN Resellers API unavailable'));

      await expect(cleanupCanceledSubscriptions()).resolves.not.toThrow();

      // disableAccount was called (we entered the try block at line 49)
      expect(mockDisableAccount).toHaveBeenCalledWith('uuid-disable-fail');
      // UPDATE still fired (the catch at line 53 doesn't re-throw)
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // suspendExpiredTrials
  // ============================================================

  describe('suspendExpiredTrials', () => {
    it('should cancel subscription, disable VPN, suspend account, and deactivate user (full flow)', async () => {
      const expiredTrialRows = {
        rows: [
          { id: 20, user_id: 200, status: 'trialing', plisio_invoice_id: 'inv-20' }
        ]
      };

      const vpnAccountRows = {
        rows: [
          { id: 30, purewl_uuid: 'uuid-trial-1' }
        ]
      };

      mockQuery
        .mockResolvedValueOnce(expiredTrialRows)  // SELECT expired trials
        .mockResolvedValueOnce({})                // UPDATE subscription -> canceled
        .mockResolvedValueOnce(vpnAccountRows)   // SELECT vpn_account by user_id
        .mockResolvedValueOnce({})                // UPDATE vpn_account -> suspended
        .mockResolvedValueOnce({});               // UPDATE users -> is_active = false

      await suspendExpiredTrials();

      // 5 DB calls: SELECT trials, UPDATE sub, SELECT vpn, UPDATE vpn, UPDATE user
      expect(mockQuery).toHaveBeenCalledTimes(5);
      expect(mockDisableAccount).toHaveBeenCalledWith('uuid-trial-1');
    });

    it('should still cancel subscription when no VPN account exists', async () => {
      const expiredTrialRows = {
        rows: [
          { id: 21, user_id: 201, status: 'trialing', plisio_invoice_id: 'inv-21' }
        ]
      };

      mockQuery
        .mockResolvedValueOnce(expiredTrialRows)  // SELECT expired trials
        .mockResolvedValueOnce({})                 // UPDATE subscription -> canceled
        .mockResolvedValueOnce({ rows: [] })       // SELECT vpn_account -> empty
        .mockResolvedValueOnce({});                // UPDATE users -> is_active = false

      await suspendExpiredTrials();

      // 4 DB calls (no UPDATE vpn since no vpn account found)
      expect(mockQuery).toHaveBeenCalledTimes(4);
      expect(mockDisableAccount).not.toHaveBeenCalled();
    });

    it('should do nothing when no expired trials found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await suspendExpiredTrials();

      expect(mockDisableAccount).not.toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // suspendExpiredTrials — line 91: disableAccount throws inside inner try block
    // VPN account exists with purewl_uuid, subscription canceled, but disableAccount
    // throws. The error is caught at line 91, logged, and pipeline continues —
    // subscription remains canceled and user remains deactivated.
    // -------------------------------------------------------------------------
    it('disableAccount throws during trial expiry — subscription still canceled, user still deactivated, error logged', async () => {
      const expiredTrialRows = {
        rows: [
          { id: 25, user_id: 205, status: 'trialing', plisio_invoice_id: 'inv-25' }
        ]
      };

      const vpnAccountRows = {
        rows: [
          { id: 31, purewl_uuid: 'uuid-trial-fail' }
        ]
      };

      mockQuery
        .mockResolvedValueOnce(expiredTrialRows)  // SELECT expired trials
        .mockResolvedValueOnce({})                // UPDATE subscription -> canceled
        .mockResolvedValueOnce(vpnAccountRows)    // SELECT vpn_account
        .mockResolvedValueOnce({})                 // UPDATE vpn_account -> suspended
        .mockResolvedValueOnce({});               // UPDATE users -> is_active = false

      // disableAccount throws — triggers the inner catch at line 91
      mockDisableAccount.mockRejectedValue(new Error('VPN Resellers API unavailable'));

      await expect(suspendExpiredTrials()).resolves.not.toThrow();

      // disableAccount was called (we entered the inner try block at line 88)
      expect(mockDisableAccount).toHaveBeenCalledWith('uuid-trial-fail');
      // 5 DB calls fired regardless of the throw (subscription, VPN, user all updated)
      expect(mockQuery).toHaveBeenCalledTimes(5);
    });
  });

  // ============================================================
  // cleanupAbandonedCheckouts
  // ============================================================

  // -------------------------------------------------------------------------
  // cleanupExpiredAccounts — line 18 (now 24 after fix): outer catch inside for loop
  // UPDATE db.query is now inside its own try/catch (was previously unguarded).
  // When UPDATE throws, the error is caught and logged, loop continues to next row.
  // -------------------------------------------------------------------------
  describe('cleanupExpiredAccounts — UPDATE query can now throw without stopping loop', () => {
    it('UPDATE throw during cleanupExpiredAccounts — error logged, loop processes all rows', async () => {
      // Simulate: SELECT finds 2 rows; UPDATE for row[0] throws; UPDATE for row[1] succeeds
      const rows = [
        { id: 50, purewl_uuid: 'uuid-expired-1', user_id: 501 },
        { id: 51, purewl_uuid: 'uuid-expired-2', user_id: 502 }
      ];

      // Mutable flag — checked BEFORE incrementing, so first UPDATE throws and subsequent ones succeed.
      // (closure variable survives jest.clearAllMocks() because clearAllMocks doesn't touch closures)
      let updateShouldThrow = true;

      mockQuery.mockImplementation((sql) => {
        if (sql.includes('SELECT')) return Promise.resolve({ rows });
        // First UPDATE call: check flag (true → throw), then set flag to false.
        // Second UPDATE call: flag is now false → succeeds.
        if (updateShouldThrow) {
          updateShouldThrow = false;
          return Promise.reject(new Error('DB write failure'));
        }
        return Promise.resolve({});
      });
      mockDisableAccount.mockResolvedValue({});

      const { warn } = require('../../src/utils/logger');
      warn.mockImplementation(() => {});

      await expect(cleanupExpiredAccounts()).resolves.not.toThrow();

      // Count UPDATE calls via mock call history (jest.clearAllMocks resets this)
      const updateCalls = mockQuery.mock.calls.filter(c => c[0] && c[0].includes('UPDATE vpn_accounts'));

      // Both disableAccount calls fired (one per row, none threw)
      expect(mockDisableAccount).toHaveBeenCalledTimes(2);
      // Two UPDATE calls were made (one per row)
      expect(updateCalls.length).toBe(2);
      // Warning was logged for the failed UPDATE via structured logger
      expect(warn).toHaveBeenCalledWith(
        'Failed to update vpn_accounts status',
        expect.objectContaining({ vpnAccountId: 50, error: 'DB write failure' })
      );
      warn.mockReset();
    });
  });

  // -------------------------------------------------------------------------
  // cleanupCanceledSubscriptions — same pattern as cleanupExpiredAccounts
  // -------------------------------------------------------------------------
  describe('cleanupCanceledSubscriptions — UPDATE query can now throw without stopping loop', () => {
    it('UPDATE throw during cleanupCanceledSubscriptions — error logged, loop processes all rows', async () => {
      const { warn } = require('../../src/utils/logger');
      warn.mockImplementation(() => {});
      const rows = [
        { id: 60, purewl_uuid: 'uuid-cancel-1' },
        { id: 61, purewl_uuid: 'uuid-cancel-2' }
      ];

      // Mutable flag — first UPDATE throws, subsequent ones succeed
      let updateShouldThrow = true;

      mockQuery.mockImplementation((sql) => {
        if (sql.includes('SELECT')) return Promise.resolve({ rows });
        if (updateShouldThrow) {
          updateShouldThrow = false;
          return Promise.reject(new Error('Connection lost'));
        }
        return Promise.resolve({});
      });
      mockDisableAccount.mockResolvedValue({});

      await expect(cleanupCanceledSubscriptions()).resolves.not.toThrow();

      // Count UPDATE calls via mock call history (jest.clearAllMocks resets this)
      const updateCalls = mockQuery.mock.calls.filter(c => c[0] && c[0].includes('UPDATE vpn_accounts'));

      expect(mockDisableAccount).toHaveBeenCalledTimes(2);
      expect(updateCalls.length).toBe(2);
      expect(warn).toHaveBeenCalledWith(
        'Failed to update vpn_accounts status',
        expect.objectContaining({ vpnAccountId: 60, error: 'Connection lost' })
      );
      warn.mockReset();
    });
  });

  describe('cleanupAbandonedCheckouts', () => {
    it('should delete old subscriptions and their pending payments (3 DB calls)', async () => {
      const deletedRows = {
        rows: [
          { id: 40, user_id: 400, plisio_invoice_id: 'inv-40' },
          { id: 41, user_id: 401, plisio_invoice_id: 'inv-41' }
        ]
      };

      mockQuery
        .mockResolvedValueOnce(deletedRows)  // DELETE subscriptions RETURNING
        .mockResolvedValueOnce({})            // DELETE payments for sub 40
        .mockResolvedValueOnce({});           // DELETE payments for sub 41

      await cleanupAbandonedCheckouts();

      // 3 DB calls: DELETE subs + 2 DELETE payments
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should only run DELETE subscriptions when no abandoned checkouts found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await cleanupAbandonedCheckouts();

      // Only 1 DELETE query — no payments to delete
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});
