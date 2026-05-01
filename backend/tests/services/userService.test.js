/**
 * userService unit tests
 * 
 * Test userService methods with mocked database and VPN resellers service.
 * Note: Tests will fail if database is not available, which is expected behavior.
 */

// Create mock functions that can be reset between tests
const mockCheckUsername = jest.fn();
const mockCreateAccount = jest.fn();
const mockSetExpiry = jest.fn();

// Mock VpnResellersService BEFORE requiring userService
// Since userService instantiates it at module load time, we need the mock ready first
jest.mock('../../src/services/vpnResellersService', () => {
  return jest.fn().mockImplementation(() => ({
    checkUsername: mockCheckUsername,
    createAccount: mockCreateAccount,
    setExpiry: mockSetExpiry
  }));
});

// Mock database
jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

// Mock userModel
jest.mock('../../src/models/userModel', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  createNumericAccount: jest.fn(),
  create: jest.fn()
}));

// Mock paymentConfig
jest.mock('../../src/config/paymentConfig', () => ({
  vpnResellers: { 
    planIds: { 
      month: 'plan_month', 
      quarter: 'plan_quarter', 
      semi_annual: 'plan_semi', 
      year: 'plan_year' 
    } 
  }
}));

// Mock password validation middleware
jest.mock('../../src/middleware/passwordValidation', () => ({
  validatePasswordComplexity: jest.fn()
}));

const userService = require('../../src/services/userService');
const db = require('../../src/config/database');
const User = require('../../src/models/userModel');
const { validatePasswordComplexity } = require('../../src/middleware/passwordValidation');

describe('userService', () => {
  beforeEach(() => {
    // Clear all mocks including their implementations
    jest.resetAllMocks();
    
    // Re-mock VpnResellersService methods with default implementations
    // This is needed because jest.resetAllMocks() clears mock implementations too
    mockCheckUsername.mockResolvedValue({ data: { message: 'Username not taken' } });
    mockCreateAccount.mockResolvedValue({ data: { id: 'vpn-account-default', allowed_countries: ['US'] } });
    mockSetExpiry.mockResolvedValue({});
  });

  describe('createUser', () => {
    it('should create user without email (numeric account)', async () => {
      const mockUser = {
        id: 'user-uuid-1',
        email: null,
        account_number: 12345,
        trial_ends_at: expect.any(Date)
      };

      User.createNumericAccount.mockResolvedValueOnce(mockUser);

      const result = await userService.createUser(null);

      expect(result).toEqual(mockUser);
      expect(User.createNumericAccount).toHaveBeenCalledWith({
        email: null,
        trialEndsAt: expect.any(Date)
      });
    });

    it('should throw error when email already exists', async () => {
      User.findByEmail.mockResolvedValueOnce({ id: 'existing-user', email: 'test@example.com' });

      await expect(userService.createUser('test@example.com')).rejects.toThrow('Email already in use');
      expect(User.findByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should create user with new email successfully', async () => {
      const mockUser = {
        id: 'user-uuid-2',
        email: 'new@example.com',
        account_number: 12346,
        trial_ends_at: expect.any(Date)
      };

      User.findByEmail.mockResolvedValueOnce(null);
      User.createNumericAccount.mockResolvedValueOnce(mockUser);

      const result = await userService.createUser('new@example.com');

      expect(result).toEqual(mockUser);
      expect(User.findByEmail).toHaveBeenCalledWith('new@example.com');
    });
  });

  describe('createUserWithPassword', () => {
    it('should throw error when email is missing', async () => {
      await expect(userService.createUserWithPassword(null, 'password123')).rejects.toThrow('Email is required');
    });

    it('should throw error when email already exists', async () => {
      User.findByEmail.mockResolvedValueOnce({ id: 'existing-user', email: 'taken@example.com' });

      await expect(userService.createUserWithPassword('taken@example.com', 'password123')).rejects.toThrow('Email already in use');
    });

    it('should throw error when password fails validation', async () => {
      User.findByEmail.mockResolvedValueOnce(null);
      validatePasswordComplexity.mockReturnValueOnce({ 
        valid: false, 
        errors: ['Password too short', 'Must contain uppercase'] 
      });

      await expect(userService.createUserWithPassword('new@example.com', 'weak')).rejects.toThrow('Password validation failed: Password too short, Must contain uppercase');
    });

    it('should create user with valid email and password', async () => {
      const mockUser = {
        id: 'user-uuid-3',
        email: 'valid@example.com',
        password_hash: 'hashed',
        is_affiliate: false
      };

      User.findByEmail.mockResolvedValueOnce(null);
      validatePasswordComplexity.mockReturnValueOnce({ valid: true });
      User.create.mockResolvedValueOnce(mockUser);

      const result = await userService.createUserWithPassword('valid@example.com', 'ValidPass123!');

      expect(result).toEqual(mockUser);
      expect(User.create).toHaveBeenCalledWith({
        email: 'valid@example.com',
        password: 'ValidPass123!',
        isAffiliate: false
      });
    });
  });

  describe('getPlanIdByKey', () => {
    it('should throw error for invalid plan key', async () => {
      await expect(userService.getPlanIdByKey('invalid')).rejects.toThrow('Invalid plan key');
    });

    it('should return plan id for valid monthly plan key', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'plan-month-uuid' }] });

      const result = await userService.getPlanIdByKey('monthly');

      expect(result).toBe('plan-month-uuid');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM plans WHERE interval = $1'),
        ['month']
      );
    });

    it('should return plan id for valid annual plan key', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'plan-year-uuid' }] });

      const result = await userService.getPlanIdByKey('annual');

      expect(result).toBe('plan-year-uuid');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM plans WHERE interval = $1'),
        ['year']
      );
    });

    it('should throw error when plan not found in database', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(userService.getPlanIdByKey('monthly')).rejects.toThrow('Plan not found in database');
    });
  });

  describe('getUserSubscription', () => {
    it('should return null when user has no subscription', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await userService.getUserSubscription('user-uuid-1');

      expect(result).toBeNull();
    });

    it('should return subscription with plan_key mapping', async () => {
      const mockSubscription = {
        id: 'sub-uuid-1',
        user_id: 'user-uuid-1',
        plan_id: 'plan-uuid-1',
        status: 'active',
        plan_name: 'Monthly VPN',
        interval: 'month',
        amount_cents: 999,
        currency: 'usd',
        current_period_end: new Date()
      };

      db.query.mockResolvedValueOnce({ rows: [mockSubscription] });

      const result = await userService.getUserSubscription('user-uuid-1');

      expect(result.plan_key).toBe('monthly');
      expect(result.planKey).toBe('monthly');
      expect(result.interval).toBe('month');
    });

    it('should map semi_annual interval to semiAnnual plan_key', async () => {
      const mockSubscription = {
        id: 'sub-uuid-2',
        user_id: 'user-uuid-2',
        plan_id: 'plan-uuid-2',
        status: 'active',
        plan_name: 'Semi-Annual VPN',
        interval: 'semi_annual',
        amount_cents: 2499,
        currency: 'usd',
        current_period_end: new Date()
      };

      db.query.mockResolvedValueOnce({ rows: [mockSubscription] });

      const result = await userService.getUserSubscription('user-uuid-2');

      expect(result.plan_key).toBe('semiAnnual');
      expect(result.planKey).toBe('semiAnnual');
    });
  });

  describe('createVpnAccount', () => {
    it('should throw error when user not found', async () => {
      User.findById.mockResolvedValueOnce(null);

      await expect(userService.createVpnAccount('nonexistent-user', 12345, 'month')).rejects.toThrow('User not found');
    });

    it('should throw error for invalid plan interval', async () => {
      User.findById.mockResolvedValueOnce({ id: 'user-uuid-1', email: 'test@example.com' });

      await expect(userService.createVpnAccount('user-uuid-1', 12345, 'invalid')).rejects.toThrow("VPN Resellers plan ID not configured for interval 'invalid'");
    });

    it('should create VPN account successfully', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'test@example.com', account_number: 12345 };
      const mockVpnResponse = { data: { id: 'vpn-account-123', allowed_countries: ['US', 'GB'] } };
      const mockDbResult = {
        rows: [{
          id: 'db-vpn-uuid',
          user_id: 'user-uuid-1',
          vpnresellers_username: 'user_12345',
          vpnresellers_password: expect.any(String),
          vpnresellers_uuid: 'vpn-account-123',
          status: 'active'
        }]
      };

      User.findById.mockResolvedValueOnce(mockUser);
      mockCheckUsername.mockResolvedValueOnce({ data: { message: 'Username not taken' } });
      mockCreateAccount.mockResolvedValueOnce(mockVpnResponse);
      db.query.mockResolvedValueOnce(mockDbResult);

      const result = await userService.createVpnAccount('user-uuid-1', 12345, 'month');

      expect(result.username).toBe('user_12345');
      expect(result.accountId).toBe('vpn-account-123');
      expect(result.account).toEqual(mockDbResult.rows[0]);
    });

    it('should handle username collision by appending timestamp suffix', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'test@example.com', account_number: 99999 };
      const mockVpnResponse = { data: { id: 'vpn-account-456', allowed_countries: ['US'] } };
      const mockDbResult = {
        rows: [{
          id: 'db-vpn-uuid-2',
          user_id: 'user-uuid-1',
          vpnresellers_username: expect.stringContaining('user_99999_'),
          vpnresellers_password: expect.any(String),
          vpnresellers_uuid: 'vpn-account-456',
          status: 'active'
        }]
      };

      User.findById.mockResolvedValueOnce(mockUser);
      mockCheckUsername.mockResolvedValueOnce({ data: { message: 'Username is taken' } });
      mockCreateAccount.mockResolvedValueOnce(mockVpnResponse);
      db.query.mockResolvedValueOnce(mockDbResult);

      const result = await userService.createVpnAccount('user-uuid-1', 99999, 'month');

      expect(result.username).toMatch(/^user_99999_\d{4}$/);
      expect(result.accountId).toBe('vpn-account-456');
    });

    it('should throw when vpnResellersService.createAccount returns no accountId', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'test@example.com', account_number: 12345 };

      User.findById.mockResolvedValueOnce(mockUser);
      mockCheckUsername.mockResolvedValueOnce({ data: { message: 'Username not taken' } });
      mockCreateAccount.mockResolvedValueOnce({ data: {} }); // No id field

      await expect(userService.createVpnAccount('user-uuid-1', 12345, 'month'))
        .rejects.toThrow('VPN Resellers account ID missing from create response');
    });

    it('should handle VPN service failure gracefully', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'test@example.com', account_number: 12345 };
      const mockDbResult = {
        rows: [{
          id: 'db-vpn-uuid',
          user_id: 'user-uuid-1',
          vpnresellers_username: 'user_12345',
          vpnresellers_password: expect.any(String),
          vpnresellers_uuid: 'vpn-account-789',
          status: 'active'
        }]
      };

      User.findById.mockResolvedValueOnce(mockUser);
      mockCheckUsername.mockResolvedValueOnce({ data: { message: 'Username not taken' } });
      mockCreateAccount.mockResolvedValueOnce({ data: { id: 'vpn-account-789', allowed_countries: ['US'] } });
      mockSetExpiry.mockRejectedValueOnce(new Error('VPN service unavailable'));
      db.query.mockResolvedValueOnce(mockDbResult);

      // Should not throw even if setExpiry fails
      const result = await userService.createVpnAccount('user-uuid-1', 12345, 'month');

      expect(result.username).toBe('user_12345');
      expect(result.accountId).toBe('vpn-account-789');
    });

    it('should handle checkUsername failure gracefully by using timestamp suffix', async () => {
      const mockUser = { id: 'user-uuid-1', email: 'test@example.com', account_number: 12345 };
      const mockVpnResponse = { data: { id: 'vpn-account-err', allowed_countries: ['US'] } };
      const mockDbResult = {
        rows: [{
          id: 'db-vpn-uuid-err',
          user_id: 'user-uuid-1',
          vpnresellers_username: expect.stringContaining('user_12345_'),
          vpnresellers_password: expect.any(String),
          vpnresellers_uuid: 'vpn-account-err',
          status: 'active'
        }]
      };

      User.findById.mockResolvedValueOnce(mockUser);
      mockCheckUsername.mockRejectedValueOnce(new Error('Network error'));
      mockCreateAccount.mockResolvedValueOnce(mockVpnResponse);
      db.query.mockResolvedValueOnce(mockDbResult);

      const result = await userService.createVpnAccount('user-uuid-1', 12345, 'month');

      expect(result.username).toMatch(/^user_12345_\d{4}$/);
      expect(result.accountId).toBe('vpn-account-err');
    });

    // ── { renew: true } branch tests ──────────────────────────────────────────

    it('renew:true — extends expiry on existing vpn_accounts row without calling VPN Resellers createAccount', async () => {
      // Existing VPN account for user_id=1
      User.findById.mockResolvedValueOnce({ id: 'user-uuid-1', email: 'test@example.com', account_number: 12345 });
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 10, vpnresellers_uuid: 'uuid_123', vpnresellers_username: 'user_acc1', vpnresellers_password: 'secret_old' }] }) // existing lookup
        .mockResolvedValueOnce({ rowCount: 1 })   // UPDATE expiry
        .mockResolvedValueOnce({ rows: [{ id: 10, vpnresellers_uuid: 'uuid_123', vpnresellers_username: 'user_acc1', vpnresellers_password: 'secret_old', expiry_date: '2026-05-19' }] }); // SELECT updated row

      const result = await userService.createVpnAccount('user-uuid-1', 12345, 'month', { renew: true });

      // createAccount must NOT be called — credentials must stay the same
      expect(mockCreateAccount).not.toHaveBeenCalled();
      // setExpiry must be called on VPN Resellers with existing UUID
      expect(mockSetExpiry).toHaveBeenCalledTimes(1);
      const [calledUuid, calledDate] = mockSetExpiry.mock.calls[0];
      expect(calledUuid).toBe('uuid_123');
      expect(calledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
      // Returns existing credentials + renewed: true
      expect(result.username).toBe('user_acc1');
      expect(result.password).toBe('secret_old');
      expect(result.accountId).toBe('uuid_123');
      expect(result.renewed).toBe(true);
    });

    it('renew:true — updates local vpn_accounts expiry_date and updated_at', async () => {
      User.findById.mockResolvedValueOnce({ id: 'user-uuid-1', email: 'test@example.com', account_number: 12345 });
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 10, vpnresellers_uuid: 'uuid_456', vpnresellers_username: 'user_acc2', vpnresellers_password: 'pw456' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 10, vpnresellers_uuid: 'uuid_456', vpnresellers_username: 'user_acc2', vpnresellers_password: 'pw456', expiry_date: '2026-06-19' }] });

      await userService.createVpnAccount('user-uuid-1', 12345, 'month', { renew: true });

      // Second db.query call should be UPDATE with new expiry
      const updateCall = db.query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE vpn_accounts');
      expect(updateCall[0]).toContain('expiry_date');
      expect(updateCall[1][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('renew:true — VPN Resellers setExpiry failure does not throw', async () => {
      User.findById.mockResolvedValueOnce({ id: 'user-uuid-1', email: 'test@example.com', account_number: 12345 });
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 10, vpnresellers_uuid: 'uuid_789', vpnresellers_username: 'user_acc3', vpnresellers_password: 'pw789' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 10, vpnresellers_uuid: 'uuid_789', vpnresellers_username: 'user_acc3', vpnresellers_password: 'pw789', expiry_date: '2026-05-19' }] });
      mockSetExpiry.mockRejectedValueOnce(new Error('VPN Resellers down'));

      await expect(userService.createVpnAccount('user-uuid-1', 12345, 'month', { renew: true })).resolves.toBeDefined();
    });

    it('renew:true — does not call VPN Resellers setExpiry when existing vpnresellers_uuid is null', async () => {
      User.findById.mockResolvedValueOnce({ id: 'user-uuid-1', email: 'test@example.com', account_number: 12345 });
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 10, vpnresellers_uuid: null, vpnresellers_username: 'user_acc4', vpnresellers_password: 'pw4' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 10, vpnresellers_uuid: null, vpnresellers_username: 'user_acc4', vpnresellers_password: 'pw4', expiry_date: '2026-05-19' }] });

      const result = await userService.createVpnAccount('user-uuid-1', 12345, 'month', { renew: true });

      expect(mockSetExpiry).not.toHaveBeenCalled();
      expect(result.renewed).toBe(true);
    });

    it('renew:true — falls through to normal creation when no existing vpn_accounts row', async () => {
      // No existing VPN account
      db.query.mockResolvedValueOnce({ rows: [] });
      // Normal creation path
      User.findById.mockResolvedValueOnce({ id: 'user-uuid-1', email: 'test@example.com', account_number: 12345 });
      mockCheckUsername.mockResolvedValueOnce({ data: { message: 'Username not taken' } });
      mockCreateAccount.mockResolvedValueOnce({ data: { id: 'new_vpn_uuid', allowed_countries: ['US'] } });
      mockSetExpiry.mockResolvedValueOnce(undefined);
      db.query.mockResolvedValueOnce({ rows: [{ id: 20, vpnresellers_uuid: 'new_vpn_uuid' }] });

      const result = await userService.createVpnAccount('user-uuid-1', 12345, 'month', { renew: true });

      // Falls through to normal creation — createAccount IS called
      expect(mockCreateAccount).toHaveBeenCalledTimes(1);
      expect(result.renewed).toBeUndefined();
    });

    it('renew:false (default) — normal account creation unchanged', async () => {
      User.findById.mockResolvedValueOnce({ id: 'user-uuid-1', email: 'test@example.com', account_number: 12345 });
      mockCheckUsername.mockResolvedValueOnce({ data: { message: 'Username not taken' } });
      mockCreateAccount.mockResolvedValueOnce({ data: { id: 'brand_new_uuid', allowed_countries: ['US'] } });
      mockSetExpiry.mockResolvedValueOnce(undefined);
      db.query.mockResolvedValueOnce({ rows: [{ id: 99, vpnresellers_uuid: 'brand_new_uuid' }] });

      const result = await userService.createVpnAccount('user-uuid-1', 12345, 'month');

      expect(mockCreateAccount).toHaveBeenCalledTimes(1);
      expect(result.renewed).toBeUndefined();
    });
  });

  describe('createSubscription', () => {
    it('should throw when user already has active subscription', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'plan-month-uuid' }] }) // getPlanIdByKey
        .mockResolvedValueOnce({ rows: [{ id: 'existing-sub' }] }); // existing subscription check

      await expect(userService.createSubscription('user-uuid-1', 'monthly'))
        .rejects.toThrow('User already has an active subscription');
    });

    it('should create subscription with correct period dates for monthly plan', async () => {
      const mockSubscription = {
        id: 'sub-uuid-new',
        user_id: 'user-uuid-1',
        plan_id: 'plan-month-uuid',
        status: 'active',
        current_period_start: expect.any(Date),
        current_period_end: expect.any(Date)
      };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'plan-month-uuid' }] }) // getPlanIdByKey
        .mockResolvedValueOnce({ rows: [] }) // no existing subscription
        .mockResolvedValueOnce({ rows: [mockSubscription] }) // insert subscription
        .mockResolvedValueOnce({ rows: [] }); // update trial_ends_at

      const result = await userService.createSubscription('user-uuid-1', 'monthly');

      expect(result).toEqual(mockSubscription);
      // Verify the insert query was called with period_end ~1 month later
      const insertCall = db.query.mock.calls[2];
      const periodEnd = new Date(insertCall[1][3]);
      const now = new Date();
      const diffDays = Math.round((periodEnd - now) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(29);
      expect(diffDays).toBeLessThanOrEqual(31);
    });

    it('should create subscription with correct period dates for quarterly plan', async () => {
      const mockSubscription = {
        id: 'sub-uuid-quarterly',
        user_id: 'user-uuid-1',
        plan_id: 'plan-quarter-uuid',
        status: 'active'
      };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'plan-quarter-uuid' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockSubscription] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.createSubscription('user-uuid-1', 'quarterly');

      const insertCall = db.query.mock.calls[2];
      const periodEnd = new Date(insertCall[1][3]);
      const now = new Date();
      const diffDays = Math.round((periodEnd - now) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(89);
      expect(diffDays).toBeLessThanOrEqual(92);
    });

    it('should create subscription with correct period dates for semiAnnual plan', async () => {
      const mockSubscription = {
        id: 'sub-uuid-semi',
        user_id: 'user-uuid-1',
        plan_id: 'plan-semi-uuid',
        status: 'active'
      };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'plan-semi-uuid' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockSubscription] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.createSubscription('user-uuid-1', 'semiAnnual');

      const insertCall = db.query.mock.calls[2];
      const periodEnd = new Date(insertCall[1][3]);
      const now = new Date();
      const diffDays = Math.round((periodEnd - now) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(179);
      expect(diffDays).toBeLessThanOrEqual(185);
    });

    it('should create subscription with correct period dates for annual plan', async () => {
      const mockSubscription = {
        id: 'sub-uuid-annual',
        user_id: 'user-uuid-1',
        plan_id: 'plan-year-uuid',
        status: 'active'
      };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'plan-year-uuid' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockSubscription] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.createSubscription('user-uuid-1', 'annual');

      const insertCall = db.query.mock.calls[2];
      const periodEnd = new Date(insertCall[1][3]);
      const now = new Date();
      const diffDays = Math.round((periodEnd - now) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(364);
      expect(diffDays).toBeLessThanOrEqual(366);
    });

    it('should update user trial_ends_at to NULL', async () => {
      const mockSubscription = {
        id: 'sub-uuid-trial',
        user_id: 'user-uuid-1',
        plan_id: 'plan-month-uuid',
        status: 'active'
      };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'plan-month-uuid' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockSubscription] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.createSubscription('user-uuid-1', 'monthly');

      // Verify the UPDATE query was called with NULL for trial_ends_at
      const updateCall = db.query.mock.calls[3];
      expect(updateCall[0]).toContain('UPDATE users');
      expect(updateCall[1]).toContain('user-uuid-1');
    });
  });

  describe('getUserWithSubscription', () => {
    it('should throw when user not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(userService.getUserWithSubscription('nonexistent-user'))
        .rejects.toThrow('User not found');
    });

    it('should return user with subscription data when found', async () => {
      const mockUserWithSub = {
        id: 'user-uuid-1',
        email: 'test@example.com',
        plan_id: 'plan-uuid-1',
        subscription_status: 'active',
        current_period_end: new Date(),
        plan_name: 'Monthly VPN',
        plan_interval: 'month',
        price_cents: 999
      };

      db.query.mockResolvedValueOnce({ rows: [mockUserWithSub] });

      const result = await userService.getUserWithSubscription('user-uuid-1');

      expect(result).toEqual(mockUserWithSub);
      expect(result.subscription_status).toBe('active');
      expect(result.plan_interval).toBe('month');
    });

    it('should return user without subscription when no active subscription exists', async () => {
      const mockUserNoSub = {
        id: 'user-uuid-2',
        email: 'nopack@example.com',
        plan_id: null,
        subscription_status: null,
        current_period_end: null,
        plan_name: null,
        plan_interval: null,
        price_cents: null
      };

      db.query.mockResolvedValueOnce({ rows: [mockUserNoSub] });

      const result = await userService.getUserWithSubscription('user-uuid-2');

      expect(result.id).toBe('user-uuid-2');
      expect(result.subscription_status).toBeNull();
    });
  });
});
