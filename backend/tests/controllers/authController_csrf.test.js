/**
 * authController_csrf — unit tests
 * Tests all 4 exported functions: register, login, logout, refreshToken
 * Note: register is exported as an array [passwordValidationMiddleware, registerFn]
 * so we access it as authController_csrf.register[1]
 *
 * Mock strategy (matching working patterns in this codebase):
 *   - jest.fn() at module level, passed into jest.mock() factory
 *   - beforeEach: reset mocks and set per-test defaults via mockImplementation
 *   - per-test: use mockResolvedValueOnce() for specific responses
 */
process.env.NODE_ENV = 'test';

// ─── Mock declarations at module level ─────────────────────────────────────────
const mockDbQuery = jest.fn();
const mockGenerateToken = jest.fn(() => 'mock-access-token');
const mockGenerateRefreshToken = jest.fn(() => 'mock-refresh-token');
const mockVerifyRefreshToken = jest.fn();
const mockGenerateCsrfToken = jest.fn(() => 'mock-csrf-token');
const mockStoreCsrfToken = jest.fn();
const mockValidatePasswordComplexity = jest.fn(() => ({ valid: true, errors: [] }));
const mockCreateNumericAccountWithPassword = jest.fn();
const mockFindByAccountNumber = jest.fn();
const mockPasswordValidationMiddleware = jest.fn((req, res, next) => next());

// ─── Mock implementations ───────────────────────────────────────────────────────
// ─── Mock bcrypt — controlled via mockResolvedValueOnce per test ──
// Use jest.doMock (no hoist) + inline factory to avoid hoisting issues
const mockBcryptCompare = jest.fn(() => Promise.resolve(true));
const mockBcryptHash = jest.fn(() => Promise.resolve('hashed-password'));
jest.mock('bcrypt', () => ({
  hash: (...args) => mockBcryptHash(...args),
  compare: (...args) => mockBcryptCompare(...args),
}));
jest.mock('../../src/config/database', () => ({ query: mockDbQuery }));

jest.mock('../../src/config/jwt', () => ({
  secret: 'test-jwt-secret',
  expiresIn: '15m',
  refreshSecret: 'test-refresh-secret',
  refreshExpiresIn: '7d',
}));

jest.mock('../../src/utils/jwt', () => ({
  generateToken: mockGenerateToken,
  generateRefreshToken: mockGenerateRefreshToken,
  verifyRefreshToken: mockVerifyRefreshToken,
  verifyToken: jest.fn(),
  decodeToken: jest.fn(),
}));

jest.mock('../../src/middleware/authMiddleware_new', () => ({
  generateCsrfToken: mockGenerateCsrfToken,
  storeCsrfToken: mockStoreCsrfToken,
  verifyCsrfToken: jest.fn(() => true),
}));

jest.mock('../../src/middleware/passwordValidation', () => ({
  validatePasswordComplexity: mockValidatePasswordComplexity,
  passwordValidationMiddleware: mockPasswordValidationMiddleware,
}));

jest.mock('../../src/models/userModel', () => ({
  createNumericAccountWithPassword: mockCreateNumericAccountWithPassword,
  findByAccountNumber: mockFindByAccountNumber,
}));

// ─── Import controller after all mocks are set up ────────────────────────────────
const authController = require('../../src/controllers/authController_csrf');

// ─── Helpers ────────────────────────────────────────────────────────────────────
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}) => ({ body });

// ─── Tests ──────────────────────────────────────────────────────────────────────
describe('authController_csrf', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // bcrypt — reset to safe default (mockImplementation persists through clearAllMocks)
    mockBcryptHash.mockReset();
    mockBcryptHash.mockImplementation(() => Promise.resolve('hashed-password'));
    mockBcryptCompare.mockReset();
    mockBcryptCompare.mockImplementation(() => Promise.resolve(true));

    // validatePasswordComplexity — default: valid
    mockValidatePasswordComplexity.mockReset();
    mockValidatePasswordComplexity.mockImplementation(() => ({ valid: true, errors: [] }));
  });

  // =============================================================================
  // register — exported as [passwordValidationMiddleware, registerFn]
  // =============================================================================
  describe('register', () => {
    const registerFn = authController.register[1];

    test('201 — registration success', async () => {
      mockCreateNumericAccountWithPassword.mockResolvedValueOnce({
        id: 1,
        account_number: '12345678',
        email: 'test@example.com',
        is_affiliate: false,
        is_active: false,
        created_at: new Date(),
      });

      const req = mockRequest({
        email: 'test@example.com',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
      });
      const res = mockResponse();

      await registerFn(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Registration successful'),
          user: expect.objectContaining({
            id: 1,
            accountNumber: '12345678',
          }),
          accessToken: 'mock-access-token',
          csrfToken: 'mock-csrf-token',
        })
      );
    });

    test('400 — password mismatch', async () => {
      const req = mockRequest({
        email: 'test@example.com',
        password: 'ValidPass123!',
        confirmPassword: 'DifferentPass123!',
      });
      const res = mockResponse();

      await registerFn(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Password validation failed',
          message: 'Passwords do not match',
        })
      );
    });

    test('400 — weak password — validatePasswordComplexity returns invalid', async () => {
      mockValidatePasswordComplexity.mockReturnValueOnce({
        valid: false,
        errors: ['Password must be at least 8 characters'],
      });

      const req = mockRequest({
        email: 'test@example.com',
        password: 'weak',
        confirmPassword: 'weak',
      });
      const res = mockResponse();

      await registerFn(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Password validation failed',
        })
      );
    });

    test('500 — email already in use — createNumericAccountWithPassword throws', async () => {
      mockCreateNumericAccountWithPassword.mockRejectedValueOnce(
        new Error('duplicate key value violates unique constraint')
      );

      const req = mockRequest({
        email: 'existing@example.com',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
      });
      const res = mockResponse();

      await registerFn(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Registration failed',
        })
      );
    });
  });

  // =============================================================================
  // login
  // =============================================================================
  describe('login', () => {
    test('200 — successful login for active user', async () => {
      mockFindByAccountNumber.mockResolvedValueOnce({
        id: 1,
        account_number: '12345678',
        password_hash: 'hashed-password',
        email: 'user@example.com',
        is_affiliate: false,
        is_active: true,
        created_at: new Date(),
      });
      // bcrypt.compare already returns true by default

      const req = mockRequest({ accountNumber: '12345678', password: 'correct-password' });
      const res = mockResponse();

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Login successful',
          user: expect.objectContaining({
            id: 1,
            accountNumber: '12345678',
            isActive: true,
          }),
          accessToken: 'mock-access-token',
          csrfToken: 'mock-csrf-token',
        })
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'mock-refresh-token',
        expect.objectContaining({ httpOnly: true })
      );
    });

    test('401 — invalid account number', async () => {
      mockFindByAccountNumber.mockResolvedValueOnce(null);

      const req = mockRequest({ accountNumber: '00000000', password: 'any' });
      const res = mockResponse();

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    test('401 — wrong password (bcrypt.compare returns false)', async () => {
      mockFindByAccountNumber.mockResolvedValueOnce({
        id: 1,
        password_hash: 'hashed',
        is_active: true,
      });
      mockBcryptCompare.mockResolvedValueOnce(false);

      const req = mockRequest({ accountNumber: '12345678', password: 'wrong-password' });
      const res = mockResponse();

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    test('200 — inactive account within grace period returns gracePeriodEnd', async () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

      mockFindByAccountNumber.mockResolvedValueOnce({
        id: 1,
        account_number: '12345678',
        password_hash: 'hashed',
        email: 'user@example.com',
        is_affiliate: false,
        is_active: false,
        created_at: createdAt,
      });
      // bcrypt.compare already returns true by default

      const req = mockRequest({ accountNumber: '12345678', password: 'correct' });
      const res = mockResponse();

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Please purchase a plan'),
          user: expect.objectContaining({
            isActive: false,
            gracePeriodEnd: expect.any(String),
          }),
          accessToken: 'mock-access-token',
        })
      );
    });

    test('403 — inactive account past grace period is expired', async () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000); // 45 days ago (>30 day grace)

      mockFindByAccountNumber.mockResolvedValueOnce({
        id: 1,
        account_number: '12345678',
        password_hash: 'hashed',
        is_active: false,
        created_at: createdAt,
      });
      // bcrypt.compare already returns true by default

      const req = mockRequest({ accountNumber: '12345678', password: 'correct' });
      const res = mockResponse();

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Account expired',
          message: expect.stringContaining('expired'),
        })
      );
    });
  });

  // =============================================================================
  // logout
  // =============================================================================
  describe('logout', () => {
    test('200 — clears csrfToken and refreshToken cookies', async () => {
      const req = mockRequest();
      const res = mockResponse();

      await authController.logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.clearCookie).toHaveBeenCalledWith('csrfToken');
      expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
    });

    test('500 — handles errors gracefully', async () => {
      const req = mockRequest();
      const res = mockResponse();
      res.clearCookie.mockImplementationOnce(() => {
        throw new Error('Cookie error');
      });

      await authController.logout(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Logout failed' });
    });
  });

  // =============================================================================
  // refreshToken
  // =============================================================================
  describe('refreshToken', () => {
    test('200 — valid refresh token returns new access and CSRF tokens', async () => {
      mockVerifyRefreshToken.mockReturnValueOnce({ id: 42 });

      const req = mockRequest();
      req.body = { refreshToken: 'valid-refresh-token' };
      const res = mockResponse();

      await authController.refreshToken(req, res);

      expect(mockVerifyRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(res.json).toHaveBeenCalledWith({
        accessToken: 'mock-access-token',
        csrfToken: 'mock-csrf-token',
      });
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'mock-refresh-token',
        expect.objectContaining({ httpOnly: true })
      );
    });

    test('401 — missing refresh token', async () => {
      const req = mockRequest();
      req.body = {};
      const res = mockResponse();

      await authController.refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Refresh token required' });
    });

    test('401 — invalid/expired refresh token (verifyRefreshToken returns null)', async () => {
      mockVerifyRefreshToken.mockReturnValueOnce(null);

      const req = mockRequest();
      req.body = { refreshToken: 'invalid-token' };
      const res = mockResponse();

      await authController.refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid refresh token' });
    });

    test('401 — refresh token verify throws unexpected error', async () => {
      mockVerifyRefreshToken.mockImplementationOnce(() => {
        throw new Error('Unexpected token error');
      });

      const req = mockRequest();
      req.body = { refreshToken: 'bad-token' };
      const res = mockResponse();

      await authController.refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid refresh token' });
    });
  });
});
