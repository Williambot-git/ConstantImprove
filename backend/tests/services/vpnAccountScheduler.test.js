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
  });

  // ============================================================
  // cleanupAbandonedCheckouts
  // ============================================================

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
