/**
 * totp.test.js — Unit tests for TOTP utility functions
 *
 * These test the security-critical TOTP (Time-based One-Time Password) functions
 * used for 2FA in the auth flow. The authController tests mock these utilities,
 * so we add dedicated unit tests here to verify the actual implementation.
 *
 * Coverage: generateSecret, generateQRCode, verifyToken, generateRecoveryCodes
 */

// Mock both external libraries before requiring the module under test
jest.mock('speakeasy');
jest.mock('qrcode');

const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const {
  generateSecret,
  generateQRCode,
  verifyToken,
  generateRecoveryCodes,
} = require('../../src/utils/totp');

describe('totp utility functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default qrcode mock — tests override per-case as needed
    qrcode.toDataURL.mockReset();
  });

  describe('generateSecret', () => {
    it('returns an object with secret and otpauthUrl properties', () => {
      speakeasy.generateSecret.mockReturnValue({
        base32: 'JBSWY3DPEHPK3PXP',
        otpauth_url: 'otpauth://totp/AhoyVPN:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=AhoyVPN',
      });

      const result = generateSecret('AhoyVPN', 'test@example.com');

      expect(result).toHaveProperty('secret', 'JBSWY3DPEHPK3PXP');
      expect(result).toHaveProperty('otpauthUrl');
      expect(typeof result.otpauthUrl).toBe('string');
    });

    it('calls speakeasy.generateSecret with correct issuer and account name', () => {
      speakeasy.generateSecret.mockReturnValue({
        base32: 'TESTSECRET',
        otpauth_url: 'otpauth://totp/TestIssuer:user@test.com?secret=TESTSECRET&issuer=TestIssuer',
      });

      generateSecret('TestIssuer', 'user@test.com');

      expect(speakeasy.generateSecret).toHaveBeenCalledTimes(1);
      expect(speakeasy.generateSecret).toHaveBeenCalledWith({
        length: 20,
        name: 'TestIssuer:user@test.com',
        issuer: 'TestIssuer',
      });
    });

    it('returns different secrets for different accounts', () => {
      speakeasy.generateSecret
        .mockReturnValueOnce({ base32: 'SECRETA', otpauth_url: 'urlA' })
        .mockReturnValueOnce({ base32: 'SECRETB', otpauth_url: 'urlB' });

      const result1 = generateSecret('App', 'user1@example.com');
      const result2 = generateSecret('App', 'user2@example.com');

      expect(result1.secret).toBe('SECRETA');
      expect(result2.secret).toBe('SECRETB');
    });
  });

  describe('generateQRCode', () => {
    it('returns a data URL string for a valid otpauth URL', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,abc123');

      const result = await generateQRCode('otpauth://totp/Test:user?secret=SECRET');

      expect(result).toBe('data:image/png;base64,abc123');
      expect(qrcode.toDataURL).toHaveBeenCalledTimes(1);
      expect(qrcode.toDataURL).toHaveBeenCalledWith('otpauth://totp/Test:user?secret=SECRET');
    });

    it('passes the otpauth URL directly to qrcode.toDataURL', async () => {
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,xyz');

      const url = 'otpauth://totp/AhoyVPN:alice@example.com?secret=ABC123&issuer=AhoyVPN';
      await generateQRCode(url);

      expect(qrcode.toDataURL).toHaveBeenCalledWith(url);
    });
  });

  describe('verifyToken', () => {
    it('returns true for a valid token within the default window', () => {
      speakeasy.totp.verify.mockReturnValue(true);

      const result = verifyToken('JBSWY3DPEHPK3PXP', '123456');

      expect(result).toBe(true);
      expect(speakeasy.totp.verify).toHaveBeenCalledTimes(1);
      expect(speakeasy.totp.verify).toHaveBeenCalledWith({
        secret: 'JBSWY3DPEHPK3PXP',
        encoding: 'base32',
        token: '123456',
        window: 1,
      });
    });

    it('returns false for an invalid token', () => {
      speakeasy.totp.verify.mockReturnValue(false);

      const result = verifyToken('JBSWY3DPEHPK3PXP', '000000');

      expect(result).toBe(false);
    });

    it('respects custom window parameter', () => {
      speakeasy.totp.verify.mockReturnValue(true);

      verifyToken('SECRET', '654321', 3);

      expect(speakeasy.totp.verify).toHaveBeenCalledWith({
        secret: 'SECRET',
        encoding: 'base32',
        token: '654321',
        window: 3,
      });
    });
  });

  describe('generateRecoveryCodes', () => {
    it('returns an array of the requested number of codes', () => {
      const codes = generateRecoveryCodes(10);
      expect(codes).toHaveLength(10);
    });

    it('returns 10 codes by default', () => {
      const codes = generateRecoveryCodes();
      expect(codes).toHaveLength(10);
    });

    it('each code is exactly 11 characters (5 chars + dash + 5 chars)', () => {
      const codes = generateRecoveryCodes(20);
      codes.forEach((code) => {
        expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
      });
    });

    it('codes contain only uppercase alphanumeric characters', () => {
      const codes = generateRecoveryCodes(50);
      codes.forEach((code) => {
        const withoutDash = code.replace('-', '');
        expect(withoutDash).toMatch(/^[A-Z0-9]+$/);
      });
    });

    it('all codes in a set are unique', () => {
      const codes = generateRecoveryCodes(20);
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });

    it('dash is always at position 5 (0-indexed)', () => {
      const codes = generateRecoveryCodes(10);
      codes.forEach((code) => {
        expect(code.charAt(5)).toBe('-');
      });
    });
  });
});
