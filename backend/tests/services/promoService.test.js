/**
 * promoService unit tests
 * 
 * Test promoService methods with known promo codes from CHECK_EVERYTHING.md
 * Note: Tests will fail if database is not available, which is expected behavior.
 */

const promoService = require('../../src/services/promoService');

// Mock the database module
jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');

describe('promoService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // validatePromoCode — uncovered branches
  // ============================================================

  describe('validatePromoCode — plan restriction', () => {
    it('should reject promo code when plan not in applies_to_plan_keys', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'promo-id',
          code: 'RESTRICTED',
          discount_type: 'percent',
          discount_value: 10,
          max_uses: null,
          uses_count: 0,
          expires_at: null,
          applies_to_plan_keys: ['monthly']  // only monthly
        }]
      });
      // planKey is 'annual' — not in the list
      const result = await promoService.validatePromoCode('RESTRICTED', 'annual', 5999);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code not valid for this plan');
    });

    it('should accept promo code when plan is in applies_to_plan_keys', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'promo-id',
          code: 'MONTHLY10',
          discount_type: 'percent',
          discount_value: 10,
          max_uses: null,
          uses_count: 0,
          expires_at: null,
          applies_to_plan_keys: ['monthly', 'quarterly']
        }]
      });
      const result = await promoService.validatePromoCode('MONTHLY10', 'quarterly', 1699);
      expect(result.valid).toBe(true);
      expect(result.discountCents).toBe(170); // 10% of 1699
    });
  });

  describe('validatePromoCode — fixed discount type', () => {
    it('should calculate fixed discount correctly', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'promo-id',
          code: 'FIXED200',
          discount_type: 'fixed',
          discount_value: 200,  // $2.00 off in cents
          max_uses: null,
          uses_count: 0,
          expires_at: null,
          applies_to_plan_keys: null
        }]
      });
      const result = await promoService.validatePromoCode('FIXED200', 'monthly', 599);
      expect(result.valid).toBe(true);
      expect(result.discountCents).toBe(200);
      expect(result.discountType).toBe('fixed');
    });

    it('should cap fixed discount at basePriceCents', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'promo-id',
          code: 'BIGFIXED',
          discount_type: 'fixed',
          discount_value: 9999,  // $99.99 — way more than $5.99 plan
          max_uses: null,
          uses_count: 0,
          expires_at: null,
          applies_to_plan_keys: null
        }]
      });
      const result = await promoService.validatePromoCode('BIGFIXED', 'monthly', 599);
      expect(result.valid).toBe(true);
      expect(result.discountCents).toBe(599);  // capped at base price
    });
  });

  // ============================================================
  // validatePromoCode — discount type edge cases
  // ============================================================

  describe('validatePromoCode — invalid discount type', () => {
    it('should return error when promo code has an unknown discount_type', async () => {
      // DB returns a promo with discount_type that doesn't match any known case
      // (data corruption or misconfigured promo in DB)
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'bad-type-promo',
          code: 'BADDESC',
          discount_type: 'invalid_type',   // ← not 'percent', 'fixed', or 'free_trial'
          discount_value: 10,
          max_uses: null,
          uses_count: 0,
          expires_at: null,
          applies_to_plan_keys: null
        }]
      });
      const result = await promoService.validatePromoCode('BADDESC', 'monthly', 5999);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid discount type');
    });
  });

  describe('validatePromoCode — error handling', () => {
    it('should return error on database failure', async () => {
      db.query.mockRejectedValueOnce(new Error('DB connection lost'));
      const result = await promoService.validatePromoCode('ANYCODE', 'monthly', 599);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Internal error validating promo code');
    });
  });

  // ============================================================
  // markPromoCodeUsed — uncovered branch
  // ============================================================

  describe('markPromoCodeUsed — error handling', () => {
    it('should not throw on database error (non-fatal)', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));
      // Should not throw — error is caught and logged
      await expect(promoService.markPromoCodeUsed('some-id')).resolves.toBeUndefined();
    });
  });

  // ============================================================
  // createPromoCode — uncovered (lines 151-169)
  // ============================================================

  describe('createPromoCode', () => {
    it('should create promo code and return it', async () => {
      const mockRow = {
        id: 'new-promo-id',
        code: 'NEWCODE',
        discount_type: 'percent',
        discount_value: 15,
        max_uses: 100,
        expires_at: '2027-01-01',
        applies_to_plan_keys: ['monthly', 'quarterly']
      };
      db.query.mockResolvedValueOnce({ rows: [mockRow] });
      const result = await promoService.createPromoCode({
        code: 'NEWCODE',
        discount_type: 'percent',
        discount_value: 15,
        max_uses: 100,
        expires_at: '2027-01-01',
        applies_to_plan_keys: ['monthly', 'quarterly']
      });
      expect(result).toEqual(mockRow);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO promo_codes'),
        ['NEWCODE', 'percent', 15, 100, '2027-01-01', ['monthly', 'quarterly']]
      );
    });

    it('should create promo code with null expires_at', async () => {
      const mockRow = {
        id: 'no-expiry-promo',
        code: 'NOEXPIRY',
        discount_type: 'fixed',
        discount_value: 100,
        max_uses: null,
        expires_at: null,
        applies_to_plan_keys: null
      };
      db.query.mockResolvedValueOnce({ rows: [mockRow] });
      const result = await promoService.createPromoCode({
        code: 'NOEXPIRY',
        discount_type: 'fixed',
        discount_value: 100,
        max_uses: null,
        expires_at: null,
        applies_to_plan_keys: null
      });
      expect(result.code).toBe('NOEXPIRY');
    });
  });

  // ============================================================
  // listPromoCodes — additional coverage
  // ============================================================

  describe('listPromoCodes', () => {
    it('should return all promo codes ordered by created_at desc', async () => {
      const mockRows = [
        { id: 'p1', code: 'SECOND', created_at: '2026-01-02' },
        { id: 'p2', code: 'FIRST', created_at: '2026-01-01' }
      ];
      db.query.mockResolvedValueOnce({ rows: mockRows });
      const result = await promoService.listPromoCodes();
      expect(result).toEqual(mockRows);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC')
      );
    });
  });

  describe('validatePromoCode', () => {
    it('should validate a known promo code JIMBO', async () => {
      // Mock database response for JIMBO promo code
      const mockPromo = {
        id: 'test-uuid-1',
        code: 'JIMBO',
        discount_type: 'percent',
        discount_value: 20,
        max_uses: 100,
        uses_count: 5,
        expires_at: new Date(Date.now() + 86400000), // future date
        applies_to_plan_keys: null
      };

      db.query.mockResolvedValueOnce({ rows: [mockPromo] });

      const result = await promoService.validatePromoCode('JIMBO', 'monthly', 1000);

      expect(result.valid).toBe(true);
      expect(result.discountCents).toBe(200); // 20% of 1000 cents
      expect(result.discountType).toBe('percent');
      expect(db.query).toHaveBeenCalled();
    });

    it('should reject an invalid promo code', async () => {
      // Mock database response for non-existent code
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await promoService.validatePromoCode('INVALIDCODE', 'monthly', 1000);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid promo code');
    });

    it('should reject an expired promo code', async () => {
      const mockExpiredPromo = {
        id: 'test-uuid-2',
        code: 'EXPIRED',
        discount_type: 'percent',
        discount_value: 10,
        max_uses: 100,
        uses_count: 5,
        expires_at: new Date(Date.now() - 86400000), // past date
        applies_to_plan_keys: null
      };

      db.query.mockResolvedValueOnce({ rows: [mockExpiredPromo] });

      const result = await promoService.validatePromoCode('EXPIRED', 'monthly', 1000);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code expired');
    });

    it('should reject a promo code that has reached max uses', async () => {
      const mockMaxedOutPromo = {
        id: 'test-uuid-3',
        code: 'MAXEDOUT',
        discount_type: 'percent',
        discount_value: 15,
        max_uses: 10,
        uses_count: 10, // equals max_uses
        expires_at: null,
        applies_to_plan_keys: null
      };

      db.query.mockResolvedValueOnce({ rows: [mockMaxedOutPromo] });

      const result = await promoService.validatePromoCode('MAXEDOUT', 'monthly', 1000);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code usage limit reached');
    });
  });

  describe('getPromoCode', () => {
    // Note: The actual method in promoService is listPromoCodes(), not getPromoCode()
    // The task mentions getPromoCode but it's actually listPromoCodes that retrieves promo codes

    it('should retrieve promo code FREEWILLY details', async () => {
      const mockFreewillyPromo = {
        id: 'test-uuid-4',
        code: 'FREEWILLY',
        discount_type: 'free_trial',
        discount_value: 1000,
        max_uses: 50,
        uses_count: 3,
        expires_at: new Date(Date.now() + 86400000 * 30), // 30 days from now
        applies_to_plan_keys: null,
        created_at: new Date()
      };

      db.query.mockResolvedValueOnce({ rows: [mockFreewillyPromo] });

      const result = await promoService.validatePromoCode('FREEWILLY', 'monthly', 1000);

      expect(result.valid).toBe(true);
      expect(result.discountType).toBe('percent'); // free_trial becomes 100% percent
      expect(result.discountCents).toBe(1000); // full price off
    });

    it('should return all promo codes when using listPromoCodes', async () => {
      const mockPromos = [
        { id: '1', code: 'JIMBO', discount_type: 'percent', discount_value: 20 },
        { id: '2', code: 'FREEWILLY', discount_type: 'free_trial', discount_value: 1000 }
      ];

      db.query.mockResolvedValueOnce({ rows: mockPromos });

      const result = await promoService.listPromoCodes();

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('JIMBO');
      expect(result[1].code).toBe('FREEWILLY');
    });
  });

  describe('applyDiscount', () => {
    it('should return base price when no promo code provided', async () => {
      const result = await promoService.applyDiscount(1000, '', 'monthly');

      expect(result.basePriceCents).toBe(1000);
      expect(result.discountCents).toBe(0);
      expect(result.finalPriceCents).toBe(1000);
      expect(result.promoApplied).toBe(false);
    });

    it('should apply valid promo code discount', async () => {
      const mockPromo = {
        id: 'test-uuid-5',
        code: 'JIMBO',
        discount_type: 'percent',
        discount_value: 20,
        max_uses: 100,
        uses_count: 5,
        expires_at: new Date(Date.now() + 86400000),
        applies_to_plan_keys: null
      };

      db.query.mockResolvedValueOnce({ rows: [mockPromo] });

      const result = await promoService.applyDiscount(1000, 'JIMBO', 'monthly');

      expect(result.promoApplied).toBe(true);
      expect(result.discountCents).toBe(200);
      expect(result.finalPriceCents).toBe(800);
    });

    it('should reject invalid promo code in applyDiscount', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await promoService.applyDiscount(1000, 'BADCODE', 'monthly');

      expect(result.promoApplied).toBe(false);
      expect(result.promoValid).toBe(false);
      expect(result.promoError).toBe('Invalid promo code');
    });
  });

  describe('markPromoCodeUsed', () => {
    it('should increment uses_count for a promo code', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ uses_count: 6 }] });

      await promoService.markPromoCodeUsed('test-uuid-1');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE promo_codes'),
        ['test-uuid-1']
      );
    });
  });
});