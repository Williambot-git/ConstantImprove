/**
 * authController — unit tests
 * Tests 9 uncovered exported functions: forgotPassword, resetPassword, enable2FA,
 * verify2FA, verify2FALogin, generateNewRecoveryCodes, verifyRecoveryCode,
 * disable2FA, verifyEmail
 *
 * Mock strategy:
 *   Uses jest.unstable_mockModule (ESM hoisting) to mock nodemailer BEFORE any
 *   CJS module that depends on it is loaded. This is required because
 *   emailService.js instantiates a nodemailer transporter as a singleton in its
 *   constructor at module-load time — we must intercept that before it happens.
 *
 * Note: authController uses in-memory Map for temp2faTokens which is imported
 * from the module directly for test access.
 */
process.env.NODE_ENV = 'test';

// ─── Mock transporter (used by emailService singleton) ─────────────────────────
// Defined BEFORE all unstable_mockModule calls so the factory closure captures it.
const mockTransporter = {
  sendMail: jest.fn(() => Promise.resolve({ messageId: 'mock-message-id' })),
};

// ─── Mock nodemailer via unstable_mockModule (hoisted, ESM) ─────────────────
// emailService.js does `const nodemailer = require('nodemailer')` at module level
// and creates the transporter in its class constructor. We MUST mock this before
// emailService is imported, otherwise the real nodemailer constructor runs and
// crashes because SMTP_HOST is undefined in the test environment.
// jest.unstable_mockModule is hoisted to the top of the file regardless of
// where it appears in source, unlike CJS jest.mock which has different semantics.
jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn(() => mockTransporter),
  },
}));

// ─── Now import emailService (singleton was created with mock transporter) ──────
// Note: require() in CJS after unstable_mockModule gets the mocked ESM module.
const emailService = require('../../src/services/emailService');
// Replace the singleton's transporter with our mock (belt-and-suspenders)
emailService.transporter = mockTransporter;

// ─── Mock declarations (CJS jest.mock — used for tracking, not interception) ──
const mockDbQuery = jest.fn();
const mockGenerateToken = jest.fn(() => 'mock-access-token');
const mockGenerateRefreshToken = jest.fn(() => 'mock-refresh-token');
const mockVerifyRefreshToken = jest.fn();
const mockVerifyToken = jest.fn();
const mockGenerateCsrfToken = jest.fn(() => 'mock-csrf-token');
const mockStoreCsrfToken = jest.fn();
const mockValidatePasswordComplexity = jest.fn(() => ({ valid: true, errors: [] }));
const mockGenerateSecret = jest.fn(() => ({
  secret: 'MOCKTOTP',
  otpauthUrl: 'otpauth://totp/AhoyVPN:user@test.com?secret=MOCKTOTP&issuer=AhoyVPN',
}));
const mockGenerateQRCode = jest.fn(() => Promise.resolve('data:image/png;base64,mockqrcode'));
const mockVerifyTotpToken = jest.fn();

// Mock userModel methods
const mockSetTotpSecret = jest.fn();
const mockEnableTotp = jest.fn();
const mockDisableTotp = jest.fn();
const mockGenerateAndStoreRecoveryCodes = jest.fn();
const mockUpdateLast2faVerification = jest.fn();
const mockUpdate = jest.fn();
const mockVerifyRecoveryCode = jest.fn();
const mockVerifyPassword = jest.fn();
const mockFindById = jest.fn();
const mockFindByEmail = jest.fn();

// Mock bcrypt
const mockBcryptCompare = jest.fn(() => Promise.resolve(true));
const mockBcryptHash = jest.fn(() => Promise.resolve('hashed-password'));

// ─── Mock emailService — self-contained factory (no external variable refs) ───
// Must be self-contained: CJS jest.mock factories can't reference module-level
// variables due to Jest's mock hoisting. We provide a working mock class that
// matches the emailService singleton interface. The nodemailer mock above ensures
// the transporter is a safe mock. Tests verify calls via jest.spyOn in beforeEach.
jest.mock('../../src/services/emailService', () => {
  const mockSendPw = jest.fn(() => Promise.resolve({ messageId: 'mock-reset-id' }));
  return {
    default: class MockEmailService {
      constructor() {
        this.transporter = mockTransporter;
      }
      sendTransactional(...args) { return Promise.resolve({ messageId: 'mock' }); }
    },
    sendPasswordResetEmail: mockSendPw,
    sendTransactional: jest.fn(() => Promise.resolve({ messageId: 'mock-transactional' })),
  };
});

// ─── Mock database ───────────────────────────────────────────────────────────
jest.mock('../../src/config/database', () => ({ query: mockDbQuery }));

// ─── Mock jwt ────────────────────────────────────────────────────────────────
jest.mock('../../src/utils/jwt', () => ({
  generateToken: mockGenerateToken,
  generateRefreshToken: mockGenerateRefreshToken,
  verifyRefreshToken: mockVerifyRefreshToken,
  verifyToken: mockVerifyToken,
  decodeToken: jest.fn(),
}));

// ─── Mock authMiddleware_new ─────────────────────────────────────────────────
jest.mock('../../src/middleware/authMiddleware_new', () => ({
  generateCsrfToken: mockGenerateCsrfToken,
  storeCsrfToken: mockStoreCsrfToken,
  verifyCsrfToken: jest.fn(() => true),
}));

// ─── Mock passwordValidation ─────────────────────────────────────────────────
jest.mock('../../src/middleware/passwordValidation', () => ({
  validatePasswordComplexity: mockValidatePasswordComplexity,
}));

// ─── Mock userModel ──────────────────────────────────────────────────────────
jest.mock('../../src/models/userModel', () => ({
  setTotpSecret: mockSetTotpSecret,
  enableTotp: mockEnableTotp,
  disableTotp: mockDisableTotp,
  generateAndStoreRecoveryCodes: mockGenerateAndStoreRecoveryCodes,
  updateLast2faVerification: mockUpdateLast2faVerification,
  update: mockUpdate,
  verifyRecoveryCode: mockVerifyRecoveryCode,
  verifyPassword: mockVerifyPassword,
  findById: mockFindById,
  findByEmail: mockFindByEmail,
}));

// ─── Mock totp utils ─────────────────────────────────────────────────────────
jest.mock('../../src/utils/totp', () => ({
  generateSecret: mockGenerateSecret,
  generateQRCode: mockGenerateQRCode,
  verifyToken: mockVerifyTotpToken,
  generateRecoveryCodes: jest.fn(() => ['code1', 'code2', 'code3']),
}));

// ─── Mock bcrypt ──────────────────────────────────────────────────────────────
jest.mock('bcrypt', () => ({
  hash: (...args) => mockBcryptHash(...args),
  compare: (...args) => mockBcryptCompare(...args),
}));

// ─── Import controller after all mocks are set up ────────────────────────────
const authController = require('../../src/controllers/authController');

// ─── Helpers ────────────────────────────────────────────────────────────────
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (opts = {}) => ({
  body: opts.body || {},
  params: opts.params || {},
  query: opts.query || {},
  user: opts.user || null,
});

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe('authController', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // bcrypt — reset to safe default
    mockBcryptHash.mockReset();
    mockBcryptHash.mockImplementation(() => Promise.resolve('hashed-password'));
    mockBcryptCompare.mockReset();
    mockBcryptCompare.mockImplementation(() => Promise.resolve(true));

    // validatePasswordComplexity — default: valid
    mockValidatePasswordComplexity.mockReset();
    mockValidatePasswordComplexity.mockImplementation(() => ({ valid: true, errors: [] }));

    // emailService — spy on sendPasswordResetEmail for call verification
    const emailService = require('../../src/services/emailService');
    jest.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue({ messageId: 'mock-reset-id' });

    // TOTP mocks — default: valid token
    mockVerifyTotpToken.mockReset();
    mockVerifyTotpToken.mockImplementation(() => true);

    // User model mocks — reset all
    [
      mockSetTotpSecret, mockEnableTotp, mockDisableTotp,
      mockGenerateAndStoreRecoveryCodes, mockUpdateLast2faVerification,
      mockUpdate, mockVerifyRecoveryCode, mockVerifyPassword,
      mockFindById, mockFindByEmail,
    ].forEach(m => { m.mockReset(); });

    // Clear the in-memory 2FA temp tokens map
    authController.temp2faTokens.clear();
  });

  // =============================================================================
  // forgotPassword
  // =============================================================================
  describe('forgotPassword', () => {

    it('returns 400 when email is missing', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await authController.forgotPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email is required' });
    });

    it('returns generic success when email not found (don\'t reveal existence)', async () => {
      const req = mockRequest({ body: { email: 'notfound@test.com' } });
      const res = mockResponse();

      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      await authController.forgotPassword(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link shortly.'
      });
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('generates token, stores in DB, and sends password reset email', async () => {
      const req = mockRequest({ body: { email: 'user@test.com' } });
      const res = mockResponse();

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ id: 42, email: 'user@test.com' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await authController.forgotPassword(req, res);

      expect(mockDbQuery).toHaveBeenCalledTimes(2);
      expect(mockDbQuery.mock.calls[1][0]).toContain('INSERT INTO password_reset_tokens');
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining('/recover?email=user%40test.com&token=')
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link shortly.'
      });
    });

    it('uses FRONTEND_URL env var for reset link base', async () => {
      const origEnv = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://custom.ahoyvpn.net';

      const req = mockRequest({ body: { email: 'user@test.com' } });
      const res = mockResponse();

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ id: 42, email: 'user@test.com' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await authController.forgotPassword(req, res);

      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining('https://custom.ahoyvpn.net/recover')
      );

      process.env.FRONTEND_URL = origEnv;
    });

    it('returns 500 on database error', async () => {
      const req = mockRequest({ body: { email: 'user@test.com' } });
      const res = mockResponse();

      mockDbQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await authController.forgotPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      consoleSpy.mockRestore();
    });
  });

  // =============================================================================
  // resetPassword
  // =============================================================================
  describe('resetPassword', () => {

    it('returns 400 when token, password, or confirmPassword missing', async () => {
      const res = mockResponse();

      await authController.resetPassword(mockRequest({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token, password, and confirm password are required' });

      await authController.resetPassword(mockRequest({ body: { token: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);

      await authController.resetPassword(mockRequest({ body: { token: 'abc', password: 'pass' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when passwords do not match', async () => {
      const req = mockRequest({ body: { token: 'abc', password: 'pass1', confirmPassword: 'pass2' } });
      const res = mockResponse();

      await authController.resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Passwords do not match' });
    });

    it('returns 400 when password complexity validation fails', async () => {
      const req = mockRequest({ body: { token: 'abc', password: 'weak', confirmPassword: 'weak' } });
      const res = mockResponse();

      mockValidatePasswordComplexity.mockReturnValueOnce({ valid: false, errors: ['Too short'] });

      await authController.resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password validation failed', message: 'Too short' });
    });

    it('returns 400 for invalid or expired token', async () => {
      const req = mockRequest({ body: { token: 'bad-token', password: 'Password123!', confirmPassword: 'Password123!' } });
      const res = mockResponse();

      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      await authController.resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired reset token' });
    });

    it('successfully resets password and marks token as used', async () => {
      const req = mockRequest({ body: { token: 'valid-token', password: 'Password123!', confirmPassword: 'Password123!' } });
      const res = mockResponse();

      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 99, email: 'user@test.com', token_hash: 'hash1' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await authController.resetPassword(req, res);

      expect(mockDbQuery).toHaveBeenCalledTimes(3);
      expect(mockBcryptHash).toHaveBeenCalledWith('Password123!', 10);
      expect(mockDbQuery.mock.calls[1][0]).toContain('UPDATE users SET password_hash');
      expect(mockDbQuery.mock.calls[2][0]).toContain('UPDATE password_reset_tokens SET used = true');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password reset successfully. You can now login with your new password.'
      });
    });

    it('returns 500 on database error', async () => {
      const req = mockRequest({ body: { token: 't', password: 'Password123!', confirmPassword: 'Password123!' } });
      const res = mockResponse();

      mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await authController.resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      consoleSpy.mockRestore();
    });
  });

  // =============================================================================
  // enable2FA
  // =============================================================================
  describe('enable2FA', () => {
    const mockUser = { id: 1, email: 'user@test.com', totp_enabled: false, totp_secret: null };

    it('returns 400 when 2FA already enabled', async () => {
      const req = mockRequest({ user: { ...mockUser, totp_enabled: true } });
      const res = mockResponse();

      await authController.enable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '2FA already enabled' });
    });

    it('generates secret, stores temporarily, and returns QR code', async () => {
      const req = mockRequest({ user: mockUser });
      const res = mockResponse();

      mockGenerateSecret.mockReturnValueOnce({ secret: 'NEWSECRET', otpauthUrl: 'otpauth://totp/Test' });
      mockGenerateQRCode.mockResolvedValueOnce('data:image/png;base64,newqr');

      await authController.enable2FA(req, res);

      expect(mockGenerateSecret).toHaveBeenCalledWith('AhoyVPN', 'user@test.com');
      expect(mockSetTotpSecret).toHaveBeenCalledWith(1, 'NEWSECRET');
      expect(mockGenerateQRCode).toHaveBeenCalledWith('otpauth://totp/Test');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          secret: 'NEWSECRET',
          otpauthUrl: 'otpauth://totp/Test',
          qrCodeDataUrl: 'data:image/png;base64,newqr',
        },
      });
    });

    it('returns 500 on error', async () => {
      const req = mockRequest({ user: mockUser });
      const res = mockResponse();

      mockGenerateSecret.mockImplementationOnce(() => { throw new Error('TOTP init failed'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await authController.enable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      consoleSpy.mockRestore();
    });
  });

  // =============================================================================
  // verify2FA
  // =============================================================================
  describe('verify2FA', () => {
    const mockUser = { id: 1, email: 'user@test.com', totp_enabled: false, totp_secret: 'EXISTING_SECRET' };

    it('returns 400 when token is missing', async () => {
      const req = mockRequest({ user: mockUser, body: {} });
      const res = mockResponse();

      await authController.verify2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token is required' });
    });

    it('returns 400 when totp_secret not set up', async () => {
      const req = mockRequest({ user: { ...mockUser, totp_secret: null }, body: { token: '123456' } });
      const res = mockResponse();

      await authController.verify2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '2FA not set up. Please enable first.' });
    });

    it('returns 400 when token is invalid', async () => {
      const req = mockRequest({ user: mockUser, body: { token: '000000' } });
      const res = mockResponse();

      mockVerifyTotpToken.mockReturnValueOnce(false);

      await authController.verify2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('enables 2FA, generates recovery codes, and returns them', async () => {
      const req = mockRequest({ user: mockUser, body: { token: '123456' } });
      const res = mockResponse();

      const recoveryCodes = ['AAAAA-BBBBB', 'CCCCC-DDDDD'];
      mockVerifyTotpToken.mockReturnValueOnce(true);
      mockGenerateAndStoreRecoveryCodes.mockResolvedValueOnce(recoveryCodes);

      await authController.verify2FA(req, res);

      expect(mockVerifyTotpToken).toHaveBeenCalledWith('EXISTING_SECRET', '123456');
      expect(mockEnableTotp).toHaveBeenCalledWith(1);
      expect(mockGenerateAndStoreRecoveryCodes).toHaveBeenCalledWith(1, 10);
      expect(mockUpdateLast2faVerification).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          recoveryCodes,
          message: 'Two-factor authentication enabled successfully',
        },
      });
    });

    it('returns 500 on error', async () => {
      const req = mockRequest({ user: mockUser, body: { token: '123456' } });
      const res = mockResponse();

      mockVerifyTotpToken.mockImplementationOnce(() => { throw new Error('TOTP verify failed'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await authController.verify2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      consoleSpy.mockRestore();
    });
  });

  // =============================================================================
  // verify2FALogin
  // =============================================================================
  describe('verify2FALogin', () => {

    it('returns 400 when tempToken or token missing', async () => {
      const res = mockResponse();

      await authController.verify2FALogin(mockRequest({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Temp token and token are required' });

      await authController.verify2FALogin(mockRequest({ body: { tempToken: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid temp token', async () => {
      const req = mockRequest({ body: { tempToken: 'invalid', token: '123456' } });
      const res = mockResponse();

      await authController.verify2FALogin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired temporary token' });
    });

    it('returns 400 when user not found or 2FA not enabled', async () => {
      authController.temp2faTokens.set('valid-temp-token', { userId: 99 });
      mockFindById.mockResolvedValueOnce(null);

      const req = mockRequest({ body: { tempToken: 'valid-temp-token', token: '123456' } });
      const res = mockResponse();

      await authController.verify2FALogin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found or 2FA not enabled' });
    });

    it('returns 400 for invalid TOTP token', async () => {
      authController.temp2faTokens.set('valid-temp-token', { userId: 1 });
      mockFindById.mockResolvedValueOnce({ id: 1, email: 'user@test.com', totp_enabled: true, totp_secret: 'SECRET' });
      mockVerifyTotpToken.mockReturnValueOnce(false);

      const req = mockRequest({ body: { tempToken: 'valid-temp-token', token: '000000' } });
      const res = mockResponse();

      await authController.verify2FALogin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('sets cookies and returns success on valid 2FA login', async () => {
      authController.temp2faTokens.set('valid-temp-token', { userId: 1 });
      mockFindById.mockResolvedValueOnce({ id: 1, email: 'user@test.com', totp_enabled: true, totp_secret: 'SECRET' });
      mockVerifyTotpToken.mockReturnValueOnce(true);

      const req = mockRequest({ body: { tempToken: 'valid-temp-token', token: '123456' } });
      const res = mockResponse();

      await authController.verify2FALogin(req, res);

      // Token consumed (single-use)
      expect(authController.temp2faTokens.has('valid-temp-token')).toBe(false);
      expect(mockGenerateToken).toHaveBeenCalledWith({ userId: 1, twoFactorVerified: true });
      expect(mockGenerateRefreshToken).toHaveBeenCalledWith({ userId: 1 });
      // Only accessToken + refreshToken cookies — no csrfToken in verify2FALogin
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'mock-access-token', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'mock-refresh-token', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          user: expect.objectContaining({ id: 1, email: 'user@test.com' }),
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        }),
      });
    });
  });

  // =============================================================================
  // generateNewRecoveryCodes
  // =============================================================================
  describe('generateNewRecoveryCodes', () => {
    // Note: generateNewRecoveryCodes does NOT require a password — it directly
    // calls User.generateAndStoreRecoveryCodes if totp_enabled is true
    const mockUser = { id: 1, email: 'user@test.com', totp_enabled: true };

    it('returns 400 when 2FA not enabled', async () => {
      const req = mockRequest({ user: { ...mockUser, totp_enabled: false } });
      const res = mockResponse();

      await authController.generateNewRecoveryCodes(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '2FA is not enabled' });
    });

    it('generates and returns new recovery codes directly (no password check)', async () => {
      const req = mockRequest({ user: mockUser });
      const res = mockResponse();

      const newCodes = ['NEWCOD1-AAAAA', 'NEWCOD2-BBBBB'];
      mockGenerateAndStoreRecoveryCodes.mockResolvedValueOnce(newCodes);

      await authController.generateNewRecoveryCodes(req, res);

      expect(mockGenerateAndStoreRecoveryCodes).toHaveBeenCalledWith(1, 10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          recoveryCodes: newCodes,
          message: 'New recovery codes generated. Save them securely.',
        },
      });
    });

    it('returns 500 on error', async () => {
      const req = mockRequest({ user: mockUser });
      const res = mockResponse();

      mockGenerateAndStoreRecoveryCodes.mockImplementationOnce(() => { throw new Error('DB failed'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await authController.generateNewRecoveryCodes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      consoleSpy.mockRestore();
    });
  });

  // =============================================================================
  // verifyRecoveryCode
  // =============================================================================
  describe('verifyRecoveryCode', () => {
    // Note: verifyRecoveryCode requires email, password, and recoveryCode fields.
    // It uses User.verifyRecoveryCode (not a DB query) to check the code.

    it('returns 400 when email, password, or recoveryCode missing', async () => {
      const res = mockResponse();

      await authController.verifyRecoveryCode(mockRequest({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email, password, and recovery code are required' });

      await authController.verifyRecoveryCode(mockRequest({ body: { email: 'a@b.com' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 401 when user not found', async () => {
      const req = mockRequest({ body: { email: 'notfound@test.com', password: 'pass', recoveryCode: 'AAAAA-BBBBB' } });
      const res = mockResponse();

      mockFindByEmail.mockResolvedValueOnce(null);

      await authController.verifyRecoveryCode(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('returns 401 when password is incorrect', async () => {
      const req = mockRequest({ body: { email: 'user@test.com', password: 'wrongpassword', recoveryCode: 'AAAAA-BBBBB' } });
      const res = mockResponse();

      mockFindByEmail.mockResolvedValueOnce({ id: 1, email: 'user@test.com', totp_enabled: true });
      mockVerifyPassword.mockResolvedValueOnce(false);

      await authController.verifyRecoveryCode(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('returns 400 when 2FA not enabled for account', async () => {
      const req = mockRequest({ body: { email: 'user@test.com', password: 'correct', recoveryCode: 'AAAAA-BBBBB' } });
      const res = mockResponse();

      mockFindByEmail.mockResolvedValueOnce({ id: 1, email: 'user@test.com', totp_enabled: false });
      mockVerifyPassword.mockResolvedValueOnce(true);

      await authController.verifyRecoveryCode(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '2FA is not enabled for this account' });
    });

    it('returns 400 when recovery code is invalid', async () => {
      const req = mockRequest({ body: { email: 'user@test.com', password: 'correct', recoveryCode: 'AAAAA-BBBBB' } });
      const res = mockResponse();

      mockFindByEmail.mockResolvedValueOnce({ id: 1, email: 'user@test.com', totp_enabled: true });
      mockVerifyPassword.mockResolvedValueOnce(true);
      mockVerifyRecoveryCode.mockResolvedValueOnce(false);

      await authController.verifyRecoveryCode(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid recovery code' });
    });

    it('updates login, sets cookies, and returns success', async () => {
      const req = mockRequest({ body: { email: 'user@test.com', password: 'correct', recoveryCode: 'AAAAA-BBBBB' } });
      const res = mockResponse();

      mockFindByEmail.mockResolvedValueOnce({ id: 5, email: 'user@test.com', totp_enabled: true, trial_ends_at: null });
      mockVerifyPassword.mockResolvedValueOnce(true);
      mockVerifyRecoveryCode.mockResolvedValueOnce(true);

      await authController.verifyRecoveryCode(req, res);

      expect(mockUpdate).toHaveBeenCalledWith(5, { last_login: expect.any(Date) });
      expect(mockUpdateLast2faVerification).toHaveBeenCalledWith(5);
      expect(mockGenerateToken).toHaveBeenCalledWith({ userId: 5, twoFactorVerified: true });
      expect(mockGenerateRefreshToken).toHaveBeenCalledWith({ userId: 5 });
      // accessToken + refreshToken only (verifyRecoveryCode does not call setCsrfTokenCookie)
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'mock-access-token', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'mock-refresh-token', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: { id: 5, email: 'user@test.com', trialEndsAt: null },
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        },
      });
    });

    it('returns 500 on error', async () => {
      const req = mockRequest({ body: { email: 'user@test.com', password: 'correct', recoveryCode: 'AAAAA-BBBBB' } });
      const res = mockResponse();

      mockFindByEmail.mockImplementationOnce(() => { throw new Error('DB error'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await authController.verifyRecoveryCode(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      consoleSpy.mockRestore();
    });
  });

  // =============================================================================
  // disable2FA
  // =============================================================================
  describe('disable2FA', () => {
    // Note: disable2FA requires password (uses User.verifyPassword), not bcrypt.compare.
    // It calls User.disableTotp(user.id), not User.enableTotp(user.id, false).

    it('returns 400 when password missing', async () => {
      const req = mockRequest({ user: { id: 1 }, body: {} });
      const res = mockResponse();

      await authController.disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password is required to disable 2FA' });
    });

    it('returns 401 when password incorrect (via User.verifyPassword)', async () => {
      const req = mockRequest({ user: { id: 1 }, body: { password: 'wrong' } });
      const res = mockResponse();

      mockVerifyPassword.mockResolvedValueOnce(false);

      await authController.disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid password' });
    });

    it('disables 2FA via User.disableTotp and returns success', async () => {
      const req = mockRequest({ user: { id: 1 }, body: { password: 'correct' } });
      const res = mockResponse();

      mockVerifyPassword.mockResolvedValueOnce(true);

      await authController.disable2FA(req, res);

      expect(mockDisableTotp).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication disabled successfully',
      });
    });

    it('returns 500 on error', async () => {
      const req = mockRequest({ user: { id: 1 }, body: { password: 'correct' } });
      const res = mockResponse();

      mockVerifyPassword.mockResolvedValueOnce(true);
      mockDisableTotp.mockImplementationOnce(() => { throw new Error('DB failed'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await authController.disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      consoleSpy.mockRestore();
    });
  });

  // =============================================================================
  // verifyEmail
  // =============================================================================
  describe('verifyEmail', () => {
    // Note: verifyEmail uses email_verify_tokens table (not password_reset_tokens).
    // It performs direct db.query UPDATE (not User.verifyEmail).

    it('returns 400 when token missing', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await authController.verifyEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Verification token is required' });
    });

    it('returns 400 when token not found', async () => {
      const req = mockRequest({ body: { token: 'unknown-token' } });
      const res = mockResponse();

      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      await authController.verifyEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired verification token' });
    });

    it('returns 400 when token is expired', async () => {
      const req = mockRequest({ body: { token: 'expired-token' } });
      const res = mockResponse();

      const pastDate = new Date(Date.now() - 3600 * 1000);
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ user_id: 7, email: 'newuser@test.com', email_verified: false, expires_at: pastDate }]
      });

      await authController.verifyEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Verification token has expired' });
    });

    it('returns 400 when email already verified', async () => {
      const req = mockRequest({ body: { token: 'already-verified-token' } });
      const res = mockResponse();

      mockDbQuery.mockResolvedValueOnce({
        rows: [{ user_id: 7, email: 'newuser@test.com', email_verified: true, expires_at: new Date(Date.now() + 3600 * 1000) }]
      });

      await authController.verifyEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email is already verified' });
    });

    it('verifies email, updates user, deletes token, and returns success with email', async () => {
      const req = mockRequest({ body: { token: 'valid-token' } });
      const res = mockResponse();

      mockDbQuery
        .mockResolvedValueOnce({
          rows: [{ user_id: 7, email: 'newuser@test.com', email_verified: false, expires_at: new Date(Date.now() + 3600 * 1000) }]
        })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await authController.verifyEmail(req, res);

      expect(mockDbQuery.mock.calls[1][0]).toContain('UPDATE users SET email_verified = true');
      expect(mockDbQuery.mock.calls[1][1]).toEqual(expect.arrayContaining([7]));
      expect(mockDbQuery.mock.calls[2][0]).toContain('DELETE FROM email_verify_tokens');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Email verified successfully',
        email: 'newuser@test.com',
      });
    });

    it('returns 500 on error', async () => {
      const req = mockRequest({ body: { token: 'some-token' } });
      const res = mockResponse();

      mockDbQuery.mockRejectedValueOnce(new Error('DB error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await authController.verifyEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      consoleSpy.mockRestore();
    });
  });
});
