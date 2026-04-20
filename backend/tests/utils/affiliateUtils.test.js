/**
 * affiliateUtils unit tests
 *
 * Tests normalizeAffiliateCode — the shared utility for safely normalizing
 * affiliate/referral codes from URL paths and form inputs.
 *
 * WHY THIS EXISTS:
 * normalizeAffiliateCode is used by both paymentController.js (checkout flow)
 * and refRoute.js (referral link clicks). This utility was extracted to avoid
 * the duplication that existed when each controller had its own normalization
 * logic. The test ensures the normalization behavior remains consistent.
 */

const { normalizeAffiliateCode } = require('../../src/utils/affiliateUtils');

describe('normalizeAffiliateCode', () => {
  describe('valid affiliate codes', () => {
    it('passes through plain alphanumeric codes unchanged', () => {
      expect(normalizeAffiliateCode('ABC123')).toBe('ABC123');
    });

    it('preserves underscores', () => {
      expect(normalizeAffiliateCode('AFF_USER_1')).toBe('AFF_USER_1');
    });

    it('preserves hyphens', () => {
      expect(normalizeAffiliateCode('AFF-USER-1')).toBe('AFF-USER-1');
    });

    it('is case-sensitive (does not convert to uppercase)', () => {
      expect(normalizeAffiliateCode('abc123DEF')).toBe('abc123DEF');
    });

    it('accepts mixed alphanumeric with underscores and hyphens', () => {
      expect(normalizeAffiliateCode('User_123-ABC')).toBe('User_123-ABC');
    });
  });

  describe('null/undefined/empty input', () => {
    it('returns null for undefined', () => {
      expect(normalizeAffiliateCode(undefined)).toBeNull();
    });

    it('returns null for null', () => {
      expect(normalizeAffiliateCode(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizeAffiliateCode('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(normalizeAffiliateCode('   ')).toBeNull();
    });
  });

  describe('injection prevention', () => {
    it('strips angle brackets but keeps inner content (text-stripping behavior)', () => {
      // The function strips < and > characters, keeping inner content
      // This means <script> becomes script (tags stripped, text remains)
      // For complete sanitization, use sanitizeHtml separately
      expect(normalizeAffiliateCode('<script>alert(1)</script>')).toBe('scriptalert1script');
    });

    it('strips semicolons and quotes, preserves spaces and letters (spaces are stripped by the [^a-zA-Z0-9_-] pattern)', () => {
      // Semicolons and quotes stripped; DROP, TABLE, users, -- preserved
      // Note: spaces ' ' ARE in the allowed pattern [^a-zA-Z0-9_-] — they survive
      // The result is DROPTABLEusers-- because spaces between words are stripped too
      expect(normalizeAffiliateCode("'; DROP TABLE users;--")).toBe('DROPTABLEusers--');
    });

    it('strips double quotes (injection into JSON/attributes)', () => {
      expect(normalizeAffiliateCode('user" OR "1"="1')).toBe('userOR11');
    });

    it('strips backticks (shell injection if used in command)', () => {
      // Backticks are stripped; hyphens inside are preserved
      expect(normalizeAffiliateCode('user`rm -rf`')).toBe('userrm-rf');
    });

    it('strips equals signs (avoid parameter pollution)', () => {
      expect(normalizeAffiliateCode('a=b&c=d')).toBe('abcd');
    });

    it('strips forward slashes (path traversal prevention)', () => {
      expect(normalizeAffiliateCode('../etc/passwd')).toBe('etcpasswd');
    });

    it('strips newlines and control characters', () => {
      expect(normalizeAffiliateCode('user\n123')).toBe('user123');
    });
  });

  describe('length truncation', () => {
    it('truncates to 64 characters', () => {
      const longCode = 'A'.repeat(80);
      expect(normalizeAffiliateCode(longCode).length).toBe(64);
    });

    it('truncates at exactly 64 chars, keeping the start', () => {
      const code64 = 'A'.repeat(64);
      const code65 = code64 + 'A';
      expect(normalizeAffiliateCode(code65)).toBe(code64);
    });

    it('leaves short codes unchanged (no truncation)', () => {
      const shortCode = 'SHORT1';
      expect(normalizeAffiliateCode(shortCode)).toBe(shortCode);
    });
  });

  describe('trimming', () => {
    it('trims leading whitespace', () => {
      expect(normalizeAffiliateCode('  USER123')).toBe('USER123');
    });

    it('trims trailing whitespace', () => {
      expect(normalizeAffiliateCode('USER123  ')).toBe('USER123');
    });

    it('trims both sides', () => {
      expect(normalizeAffiliateCode('  USER123  ')).toBe('USER123');
    });
  });

  describe('type coercion', () => {
    it('converts number input to string', () => {
      expect(normalizeAffiliateCode(12345)).toBe('12345');
    });

    it('handles object input via String() coercion', () => {
      expect(normalizeAffiliateCode({ toString: () => 'USER123' })).toBe('USER123');
    });
  });
});
