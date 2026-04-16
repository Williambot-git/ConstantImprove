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