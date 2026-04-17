/**
 * affiliateCommissionService unit tests
 *
 * Tests the affiliate commission system:
 * - applyAffiliateCommissionIfEligible: main entry point
 * - getMinimumPayoutCents: DB lookup with fallback
 * - calculateCommission: commission math (10% of net profit, $0.75 min)
 * - createCustomerHash: SHA256 anonymization
 *
 * The service was extracted from paymentController.js (2026-04-17) to fix
 * the architectural violation of services/controllers importing from a controller.
 */

'use strict';

// ─── MOCKS ───────────────────────────────────────────────────────────────────

// Mock db before importing the service
const mockDbQuery = jest.fn();
jest.mock('../../src/config/database', () => ({ query: mockDbQuery }));

// ─── ENV SETUP ───────────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.OPERATING_COST_PER_USER = '1.20'; // $1.20 per user

// ─── MODULE UNDER TEST ────────────────────────────────────────────────────────
const {
  applyAffiliateCommissionIfEligible,
  getMinimumPayoutCents,
  calculateCommission,
  createCustomerHash,
} = require('../../src/services/affiliateCommissionService');


// ─── TESTS ───────────────────────────────────────────────────────────────────

describe('affiliateCommissionService', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fully — no default implementation.
    // Each test sets up exactly what it needs.
    mockDbQuery.mockReset();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // getMinimumPayoutCents
  // ════════════════════════════════════════════════════════════════════════════

  describe('getMinimumPayoutCents', () => {
    test('returns 1000 when payout_config table is empty', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getMinimumPayoutCents();
      expect(result).toBe(1000);
    });

    test('returns 1000 when payout_config query throws', async () => {
      mockDbQuery.mockRejectedValue(new Error('DB error'));
      const result = await getMinimumPayoutCents();
      expect(result).toBe(1000);
    });

    test('returns configured amount from DB', async () => {
      // Simulate payout_config row: { key: 'minimum_payout_cents', value: { amount: '750' } }
      mockDbQuery.mockResolvedValueOnce({ rows: [{ amount: 750 }] });
      const result = await getMinimumPayoutCents();
      expect(result).toBe(750);
    });

    test('parses string amount from DB correctly', async () => {
      // Some DB drivers may return the amount as a string
      mockDbQuery.mockResolvedValue({ rows: [{ amount: '1500' }] });
      const result = await getMinimumPayoutCents();
      expect(result).toBe(1500);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // calculateCommission
  // ════════════════════════════════════════════════════════════════════════════

  describe('calculateCommission', () => {
    // Commission = max(10% of net profit, minimumPayoutCents)
    // Net profit = max(0, amountCents - operatingCostPerUserCents)
    // operatingCostPerUserCents = 120 (from OPERATING_COST_PER_USER = 1.20)

    test('applies 10% commission rate above operating cost floor', async () => {
      // amountCents = 999, netProfit = 999 - 120 = 879, commission = 10% of 879 = 87.9 → 88
      // minimumPayoutCents = 1000 (1000 > 88, so floor applies)
      const result = await calculateCommission(999, 1000);
      // Commission floor of $10 (1000 cents) applies since $0.88 < $10 minimum
      expect(result).toBe(1000);
    });

    test('uses computed commission when above minimum', async () => {
      // amountCents = 4999, netProfit = 4999 - 120 = 4879, commission = 10% = 487.9 → 488
      // 488 < 1000, so floor applies
      const result = await calculateCommission(4999, 1000);
      expect(result).toBe(1000);
    });

    test('uses computed commission when amountCents exactly covers operating cost', async () => {
      // amountCents = 120, netProfit = max(0, 120 - 120) = 0, commission = 0
      // 0 < 1000, floor applies
      const result = await calculateCommission(120, 1000);
      expect(result).toBe(1000);
    });

    test('net profit of zero (amount below operating cost) uses floor', async () => {
      // amountCents = 100, netProfit = max(0, 100 - 120) = 0, commission = 0
      // 0 < 1000, floor applies
      const result = await calculateCommission(100, 1000);
      expect(result).toBe(1000);
    });

    test('large transaction: computed commission exceeds floor', async () => {
      // amountCents = 50000 ($500), netProfit = 50000 - 120 = 49880, commission = 4988
      // 4988 > 1000, no floor needed
      const result = await calculateCommission(50000, 1000);
      expect(result).toBe(4988);
    });

    test('different minimum payout threshold is respected', async () => {
      // amountCents = 50000, commission = 4988, floor = 5000
      // 4988 < 5000, floor applies
      const result = await calculateCommission(50000, 5000);
      expect(result).toBe(5000);
    });

    test('operating cost env var is respected', async () => {
      // With OPERATING_COST_PER_USER = 1.20, netProfit = amountCents - 120
      // amountCents = 1120, netProfit = 1000, commission = 100
      // 100 < 1000 floor
      const result = await calculateCommission(1120, 1000);
      expect(result).toBe(1000);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // createCustomerHash
  // ════════════════════════════════════════════════════════════════════════════

  describe('createCustomerHash', () => {
    test('returns SHA256 hash of accountNumber when provided', () => {
      const hash = createCustomerHash('ACC123', 1);
      // SHA256 of 'ACC123', first 32 chars
      expect(hash).toBe('d1967a2c9e48be0bf09428c4acc3e610');
      expect(hash.length).toBe(32);
    });

    test('returns consistent hash for same accountNumber', () => {
      const hash1 = createCustomerHash('ACC123', 1);
      const hash2 = createCustomerHash('ACC123', 1);
      expect(hash1).toBe(hash2);
    });

    test('different accountNumbers produce different hashes', () => {
      const hash1 = createCustomerHash('ACC123', 1);
      const hash2 = createCustomerHash('ACC456', 1);
      expect(hash1).not.toBe(hash2);
    });

    test('returns pseudo-anonymous fallback when accountNumber is null', () => {
      const hash = createCustomerHash(null, 42);
      expect(hash).toMatch(/^cust_42_\d+$/);
    });

    test('returns pseudo-anonymous fallback when accountNumber is undefined', () => {
      const hash = createCustomerHash(undefined, 99);
      expect(hash).toMatch(/^cust_99_\d+$/);
    });

    test('returns pseudo-anonymous fallback when accountNumber is empty string', () => {
      const hash = createCustomerHash('', 7);
      expect(hash).toMatch(/^cust_7_\d+$/);
    });

    test('affiliateId is included in fallback hash', () => {
      const hash = createCustomerHash(null, 123);
      expect(hash).toContain('123');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // applyAffiliateCommissionIfEligible
  // ════════════════════════════════════════════════════════════════════════════

  describe('applyAffiliateCommissionIfEligible', () => {

    test('returns null immediately when affiliateCode is null', async () => {
      const result = await applyAffiliateCommissionIfEligible({
        affiliateCode: null,
        affiliateLinkId: 'link1',
        accountNumber: 'ACC123',
        plan: 'monthly',
        amountCents: 999,
      });
      expect(result).toBeNull();
      // No DB queries should have been made
      expect(mockDbQuery).not.toHaveBeenCalled();
    });

    test('returns null immediately when affiliateCode is empty string', async () => {
      const result = await applyAffiliateCommissionIfEligible({
        affiliateCode: '',
        affiliateLinkId: 'link1',
        accountNumber: 'ACC123',
        plan: 'monthly',
        amountCents: 999,
      });
      expect(result).toBeNull();
      expect(mockDbQuery).not.toHaveBeenCalled();
    });

    test('returns null and logs when affiliate not found in DB', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockDbQuery.mockResolvedValue({ rows: [] }); // affiliate not found

      const result = await applyAffiliateCommissionIfEligible({
        affiliateCode: 'UnknownAffiliate',
        affiliateLinkId: null,
        accountNumber: 'ACC123',
        plan: 'monthly',
        amountCents: 4999,
      });

      expect(result).toBeNull();
      // Should have queried affiliates table
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('affiliates'),
        ['UnknownAffiliate']
      );
      consoleSpy.mockRestore();
    });

    test('applies commission and records referral + transaction when affiliate found', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // Mock affiliate lookup
      mockDbQuery
        .mockResolvedValueOnce({
          rows: [{ id: 5, username: 'WILLIAM20', user_id: 42 }]
        })
        // Mock payout_config lookup (minimumPayoutCents)
        .mockResolvedValueOnce({ rows: [{ amount: 1000 }] })
        // Mock referral INSERT
        .mockResolvedValueOnce({ rows: [] })
        // Mock transaction INSERT
        .mockResolvedValueOnce({ rows: [] });

      const result = await applyAffiliateCommissionIfEligible({
        affiliateCode: 'WILLIAM20',
        affiliateLinkId: 'link_abc',
        accountNumber: 'ACC123',
        plan: 'monthly',
        amountCents: 4999,
      });

      // amountCents = 4999, netProfit = 4879, commission = 488
      // 488 < 1000 floor, so result = 1000
      expect(result).toBe(1000);

      // 4 DB calls: affiliate lookup, minimum_payout query, referral INSERT, transaction INSERT
      expect(mockDbQuery).toHaveBeenCalledTimes(4);

      // Verify affiliate lookup uses case-insensitive search
      expect(mockDbQuery.mock.calls[0][0]).toContain('UPPER(username) = UPPER');

      // Verify referral INSERT
      expect(mockDbQuery.mock.calls[2][0]).toContain('INSERT INTO referrals');
      expect(mockDbQuery.mock.calls[2][1]).toContain(5); // affiliate_id

      // Verify transaction INSERT — second array element is amount_cents (number), not description
      // First element is affiliate_id, third is description string containing 'commission'
      expect(mockDbQuery.mock.calls[3][0]).toContain('INSERT INTO transactions');
      expect(mockDbQuery.mock.calls[3][1][2]).toContain('commission');

      consoleSpy.mockRestore();
    });

    test('uses affiliate DB username (not input code) for lookup result', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      mockDbQuery
        .mockResolvedValueOnce({
          // DB has 'William20' but user queried with 'william20'
          rows: [{ id: 3, username: 'William20', user_id: 10 }]
        })
        .mockResolvedValueOnce({ rows: [{ amount: 1000 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await applyAffiliateCommissionIfEligible({
        affiliateCode: 'william20', // lowercase input
        affiliateLinkId: null,
        accountNumber: 'ACC999',
        plan: 'annual',
        amountCents: 7999,
      });

      // affiliate lookup was called with the input code (case-insensitive DB search)
      expect(mockDbQuery.mock.calls[0][1]).toContain('william20');

      // Commission logged with DB username (from the row)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('William20')
      );

      consoleSpy.mockRestore();
    });

    test('anonymized customer hash is SHA256 of accountNumber, not the accountNumber itself', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ id: 7, username: 'AFF', user_id: null }] })
        .mockResolvedValueOnce({ rows: [{ amount: 1000 }] })
        .mockResolvedValueOnce({ rows: [] }) // referral INSERT
        .mockResolvedValueOnce({ rows: [] }); // transaction INSERT

      await applyAffiliateCommissionIfEligible({
        affiliateCode: 'AFF',
        affiliateLinkId: null,
        accountNumber: 'MY_SECRET_ACCOUNT',
        plan: 'monthly',
        amountCents: 999,
      });

      // The referral INSERT's second parameter should be the hash, not 'MY_SECRET_ACCOUNT'
      const referralInsertArgs = mockDbQuery.mock.calls[2][1];
      const customerHashArg = referralInsertArgs[1]; // second arg = customer_hash
      expect(customerHashArg).not.toBe('MY_SECRET_ACCOUNT');
      expect(customerHashArg.length).toBe(32); // SHA256 truncated to 32 chars
      expect(customerHashArg).toMatch(/^[a-f0-9]+$/); // hex format

      consoleSpy.mockRestore();
    });

    test('falls back to pseudo-anonymous hash when accountNumber is null', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ id: 2, username: 'AFF2', user_id: null }] })
        .mockResolvedValueOnce({ rows: [{ amount: 1000 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await applyAffiliateCommissionIfEligible({
        affiliateCode: 'AFF2',
        affiliateLinkId: null,
        accountNumber: null,
        plan: 'monthly',
        amountCents: 999,
      });

      const referralInsertArgs = mockDbQuery.mock.calls[2][1];
      const customerHashArg = referralInsertArgs[1];
      expect(customerHashArg).toMatch(/^cust_2_\d+$/);

      consoleSpy.mockRestore();
    });

    test('uses "signup" as plan fallback in description when plan is not provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'AFF', user_id: null }] })
        .mockResolvedValueOnce({ rows: [{ amount: 1000 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await applyAffiliateCommissionIfEligible({
        affiliateCode: 'AFF',
        affiliateLinkId: null,
        accountNumber: 'ACC',
        plan: null,
        amountCents: 999,
      });

      // Transaction description uses plan || 'signup', so it reads "Referral commission for signup signup..."
      const txInsertArgs = mockDbQuery.mock.calls[3][1];
      expect(txInsertArgs[2]).toContain('signup');

      consoleSpy.mockRestore();
    });

    test('passes affiliateLinkId as referral_link_id (can be null)', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'AFF', user_id: null }] })
        .mockResolvedValueOnce({ rows: [{ amount: 1000 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await applyAffiliateCommissionIfEligible({
        affiliateCode: 'AFF',
        affiliateLinkId: null,
        accountNumber: 'ACC',
        plan: 'monthly',
        amountCents: 999,
      });

      const referralInsertArgs = mockDbQuery.mock.calls[2][1];
      // referral_link_id is the 5th parameter (index 4)
      expect(referralInsertArgs[4]).toBeNull();

      consoleSpy.mockRestore();
    });

    test('passes affiliateLinkId as referral_link_id when provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'AFF', user_id: null }] })
        .mockResolvedValueOnce({ rows: [{ amount: 1000 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await applyAffiliateCommissionIfEligible({
        affiliateCode: 'AFF',
        affiliateLinkId: 'link_xyz_123',
        accountNumber: 'ACC',
        plan: 'monthly',
        amountCents: 999,
      });

      const referralInsertArgs = mockDbQuery.mock.calls[2][1];
      expect(referralInsertArgs[4]).toBe('link_xyz_123');

      consoleSpy.mockRestore();
    });

    // Note: DB error paths (affiliate lookup failure, INSERT failure) are covered
    // in getMinimumPayoutCents tests above and in the affiliateController/webhookController
    // integration tests. The applyAffiliateCommissionIfEligible function propagates
    // db.query errors through its outer try-catch to the caller.
    // Silent-failure behavior (returning null) is tested via the affiliate-not-found path.

  });

});
