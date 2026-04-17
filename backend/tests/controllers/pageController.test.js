/**
 * pageController unit tests
 *
 * Tests all 3 exported functions from pageController.js:
 *   verifyEmailPage, resetPasswordPage, resendVerificationEmail
 *
 * Dependencies mocked:
 *   - db.query                  — all database operations
 *   - emailService.sendTransactional — email sending (fire-and-forget, errors suppressed)
 *   - User.findByEmail           — user lookup
 *
 * Mock strategy (same pattern as other controller tests in this codebase):
 *   - mockImplementation(() => default) in beforeEach for persistent defaults
 *   - mockResolvedValueOnce() per test for specific query responses
 */

process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'https://test.ahoyvpn.net';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockDbQuery = jest.fn();
jest.mock('../../src/config/database', () => ({ query: mockDbQuery }));

const mockSendTransactional = jest.fn();
jest.mock('../../src/services/emailService', () => ({
  sendTransactional: mockSendTransactional
}));

const mockFindByEmail = jest.fn();
jest.mock('../../src/models/userModel', () => ({
  findByEmail: mockFindByEmail
}));

// Mock console.error to keep test output clean
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

// ─── Imports after mocks ───────────────────────────────────────────────────────

const {
  verifyEmailPage,
  resetPasswordPage,
  resendVerificationEmail
} = require('../../src/controllers/pageController');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

function mockReq(overrides = {}) {
  return {
    params: {},
    body: {},
    ...overrides
  };
}

// ─── Test data helpers ────────────────────────────────────────────────────────

function futureDate(msFromNow = 24 * 60 * 60 * 1000) {
  return new Date(Date.now() + msFromNow).toISOString();
}

function pastDate(msAgo = 60 * 1000) {
  return new Date(Date.now() - msAgo).toISOString();
}

// ─── verifyEmailPage tests ────────────────────────────────────────────────────

describe('verifyEmailPage', () => {
  let req, res;

  beforeEach(() => {
    req = mockReq({ params: { token: 'valid-token-abc123' } });
    res = mockRes();
    mockDbQuery.mockReset();
    mockSendTransactional.mockReset();
  });

  describe('token validation', () => {
    test('returns 400 when token is missing', async () => {
      req = mockReq({ params: {} });

      await verifyEmailPage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalled();
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Invalid Verification Link');
    });

    test('returns 400 when token not found in database', async () => {
      // No token hash match — empty result
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      await verifyEmailPage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Invalid Verification Link');
      expect(html).toContain('resendForm');
    });
  });

  describe('token expiry', () => {
    test('returns 400 when token is expired', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 99,
          email: 'user@example.com',
          email_verified: false,
          expires_at: pastDate(60 * 60 * 1000), // expired 1h ago
          token_hash: 'somehash'
        }]
      });

      await verifyEmailPage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Link Expired');
      expect(html).toContain('24 hours');
    });
  });

  describe('already verified', () => {
    test('shows already-verified message when email_verified is true', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 99,
          email: 'user@example.com',
          email_verified: true, // already verified
          expires_at: futureDate(),
          token_hash: 'somehash'
        }]
      });

      await verifyEmailPage(req, res);

      expect(res.send).toHaveBeenCalled();
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Already Verified');
      expect(html).toContain('Go to Login');
      // Should NOT update database
      expect(mockDbQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('successful verification', () => {
    test('verifies email, deletes token, shows success page', async () => {
      mockDbQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 42,
            user_id: 99,
            email: 'user@example.com',
            email_verified: false,
            expires_at: futureDate(),
            token_hash: 'somehash'
          }]
        })
        // Update user email_verified = true
        .mockResolvedValueOnce({ rowCount: 1 })
        // Delete used token
        .mockResolvedValueOnce({ rowCount: 1 });

      await verifyEmailPage(req, res);

      expect(res.send).toHaveBeenCalled();
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Email Verified');
      expect(html).toContain('✅');
      expect(html).toContain('Go to Login');

      // Verify DB operations: 3 queries (select, update, delete)
      expect(mockDbQuery).toHaveBeenCalledTimes(3);
      expect(mockDbQuery.mock.calls[1][0]).toContain('UPDATE users');
      expect(mockDbQuery.mock.calls[1][1]).toEqual([99]);
      expect(mockDbQuery.mock.calls[2][0]).toContain('DELETE FROM email_verify_tokens');
      expect(mockDbQuery.mock.calls[2][1]).toEqual([42]);
    });
  });

  describe('error handling', () => {
    test('returns 500 on database error', async () => {
      mockDbQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      await verifyEmailPage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Something Went Wrong');
    });
  });
});

// ─── resetPasswordPage tests ──────────────────────────────────────────────────

describe('resetPasswordPage', () => {
  let req, res;

  beforeEach(() => {
    req = mockReq({ params: { token: 'reset-token-xyz' } });
    res = mockRes();
    mockDbQuery.mockReset();
  });

  describe('token validation', () => {
    test('returns 400 when token is missing', async () => {
      req = mockReq({ params: {} });

      await resetPasswordPage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Invalid Reset Link');
    });

    test('returns 400 when token not found or already used', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      await resetPasswordPage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Invalid Reset Link');
      expect(html).toContain('forgotForm');
    });
  });

  describe('token expiry', () => {
    test('returns 400 when token is expired', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{
          id: 5,
          user_id: 77,
          email: 'user@example.com',
          used: false,
          expires_at: pastDate(60 * 60 * 1000), // expired 1h ago
          token_hash: 'somehash'
        }]
      });

      await resetPasswordPage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Reset Link Expired');
      expect(html).toContain('30 minutes');
    });
  });

  describe('valid token — shows reset form', () => {
    test('shows password reset form with correct token value', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{
          id: 5,
          user_id: 77,
          email: 'user@example.com',
          used: false,
          expires_at: futureDate(),
          token_hash: 'somehash'
        }]
      });

      await resetPasswordPage(req, res);

      expect(res.send).toHaveBeenCalled();
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Set New Password');
      expect(html).toContain('resetPasswordForm');
      // Token should be embedded in the hidden form field
      expect(html).toContain('reset-token-xyz');
      expect(html).toContain('password');
      expect(html).toContain('confirmPassword');
    });
  });

  describe('error handling', () => {
    test('returns 500 on database error', async () => {
      mockDbQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      await resetPasswordPage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const html = res.send.mock.calls[0][0];
      expect(html).toContain('Something Went Wrong');
    });
  });
});

// ─── resendVerificationEmail tests ────────────────────────────────────────────

describe('resendVerificationEmail', () => {
  let req, res;

  beforeEach(() => {
    req = mockReq({ body: { email: 'user@example.com' } });
    res = mockRes();
    mockDbQuery.mockReset();
    mockSendTransactional.mockReset();
    mockFindByEmail.mockReset();
  });

  describe('input validation', () => {
    test('returns 400 when email is missing', async () => {
      req = mockReq({ body: {} });

      await resendVerificationEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email is required' });
    });
  });

  describe('user not found — security hardening', () => {
    test('returns 200 (non-revealing) when email not in database', async () => {
      mockFindByEmail.mockResolvedValueOnce(null);

      await resendVerificationEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with this email, a verification link has been sent.'
      });
      // No email sent, no token created
      expect(mockSendTransactional).not.toHaveBeenCalled();
      expect(mockDbQuery).not.toHaveBeenCalled();
    });
  });

  describe('already verified', () => {
    test('returns 400 when email already verified', async () => {
      mockFindByEmail.mockResolvedValueOnce({
        id: 99,
        email: 'user@example.com',
        email_verified: true
      });

      await resendVerificationEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email already verified' });
    });
  });

  describe('successful resend flow', () => {
    beforeEach(() => {
      mockFindByEmail.mockResolvedValueOnce({
        id: 99,
        email: 'user@example.com',
        email_verified: false
      });
    });

    test('deletes existing tokens, creates new one, sends email', async () => {
      mockDbQuery
        // Delete existing tokens
        .mockResolvedValueOnce({ rowCount: 1 })
        // Insert new token
        .mockResolvedValueOnce({ rowCount: 1 });

      mockSendTransactional.mockResolvedValueOnce(true);

      await resendVerificationEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with this email, a verification link has been sent.'
      });

      // DB: 2 queries — delete old + insert new
      expect(mockDbQuery).toHaveBeenCalledTimes(2);
      expect(mockDbQuery.mock.calls[0][0]).toContain('DELETE FROM email_verify_tokens');
      expect(mockDbQuery.mock.calls[0][1]).toEqual([99]);
      expect(mockDbQuery.mock.calls[1][0]).toContain('INSERT INTO email_verify_tokens');
      expect(mockDbQuery.mock.calls[1][1]).toEqual([99, expect.any(String), expect.any(Date)]);

      // Email sent with correct link
      expect(mockSendTransactional).toHaveBeenCalledWith(
        'user@example.com',
        'Verify Your AhoyVPN Email',
        'verification',
        { verificationLink: expect.stringContaining('https://test.ahoyvpn.net/verify-email/') }
      );
    });

    test('email send failure does not break the response (fire-and-forget)', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      mockSendTransactional.mockRejectedValueOnce(new Error('SMTP down'));

      // Should still return 200 — email failure is logged but not surfaced
      await resendVerificationEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with this email, a verification link has been sent.'
      });
    });
  });

  describe('error handling', () => {
    test('returns 500 on database error', async () => {
      mockFindByEmail.mockResolvedValueOnce({
        id: 99,
        email: 'user@example.com',
        email_verified: false
      });
      mockDbQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      await resendVerificationEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    test('returns 500 when findByEmail throws', async () => {
      mockFindByEmail.mockRejectedValueOnce(new Error('User model error'));

      await resendVerificationEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});
