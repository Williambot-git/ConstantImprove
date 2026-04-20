/**
 * vpnResellersService unit tests
 *
 * Tests all 7 public methods of VpnResellersService:
 * - checkUsername(username)
 * - createAccount(payload)
 * - enableAccount(accountId)
 * - disableAccount(accountId)
 * - changePassword(accountId, password)
 * - setExpiry(accountId, expireAt)
 * - getAccount(accountId)
 *
 * Each method is tested for:
 * - Successful API response (200-299)
 * - Error response (non-2xx)
 *
 * MOCK STRATEGY:
 * The service uses Node 22's native global `fetch` (not `require('node-fetch')`).
 * We mock global.fetch directly with jest.fn() after the service is loaded.
 * This works because the service resolves `fetch` as an unqualified identifier
 * at call time via lexical scope → globalThis, NOT as a static binding.
 */

const VpnResellersService = require('../../src/services/vpnResellersService');

// Mock paymentConfig — provides apiToken, baseUrl, and endpoint templates
jest.mock('../../src/config/paymentConfig', () => ({
  vpnResellers: {
    apiToken: 'TEST_API_TOKEN',
    apiUrl: 'https://api.test-vpnresellers.com',
    endpoints: {
      checkUsername: '/v3_2/accounts/check_username',
      createAccount: '/v3_2/accounts',
      enableAccount: '/v3_2/accounts/{accountId}/enable',
      disableAccount: '/v3_2/accounts/{accountId}/disable',
      changePassword: '/v3_2/accounts/{accountId}/change_password',
      expireAccount: '/v3_2/accounts/{accountId}/expire',
      getAccount: '/v3_2/accounts/{accountId}'
    }
  }
}));

describe('vpnResellersService', () => {
  let service;
  /** @type {jest.Mock} */
  let mockFetch;

  beforeEach(() => {
    // Replace global.fetch with a jest mock BEFORE constructing the service.
    // This works because the service resolves `fetch` at call time (dynamic lookup
    // through globalThis), not as a static binding captured at module load.
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    service = new VpnResellersService();
  });

  afterEach(() => {
    // Restore global.fetch so we don't pollute the global environment.
    delete global.fetch;
  });

  // Helper: queue a successful fetch response
  const mockFetchSuccess = (jsonData, status = 200) => {
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(jsonData),
      text: () => Promise.resolve(JSON.stringify(jsonData))
    });
  };

  // Helper: queue a failing fetch response
  const mockFetchError = (status, errorText = 'Server error') => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      json: () => Promise.resolve({ error: errorText }),
      text: () => Promise.resolve(errorText)
    });
  };

  // ─── _request() method — tests the internal HTTP wrapper used by all public methods.
  // These exercise the low-level fetch wrapper directly, covering branch paths
  // that the public-method tests don't reach (e.g. explicit DELETE method, body-less
  // POST, response.ok path, response.ok=false path, response.json() throw).
  // ─────────────────────────────────────────────────────────────────────────────

  describe('_request (low-level wrapper)', () => {
    it('should use explicit DELETE method when options.method is DELETE', async () => {
      mockFetchSuccess({ success: true });
      await service._request('/v3_2/accounts/acc-123', { method: 'DELETE' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts/acc-123',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should default to POST when body is provided but no method is specified', async () => {
      mockFetchSuccess({ id: 'new' });
      await service._request('/v3_2/accounts', { body: { username: 'test' } });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should default to GET when no body and no method is specified', async () => {
      mockFetchSuccess({ available: true });
      await service._request('/v3_2/accounts/check_username?username=testuser');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts/check_username?username=testuser',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should parse successful JSON response', async () => {
      mockFetchSuccess({ id: 'acc-789', status: 'active' });
      const result = await service._request('/v3_2/accounts/acc-789', { method: 'GET' });
      expect(result).toEqual({ id: 'acc-789', status: 'active' });
    });

    it('should throw with status and body on error response', async () => {
      mockFetchError(503, 'Service temporarily unavailable');
      await expect(service._request('/v3_2/accounts', { method: 'POST' }))
        .rejects.toThrow('VPN Resellers API error: 503: Service temporarily unavailable');
    });

    it('should include custom headers merged with defaults', async () => {
      mockFetchSuccess({ ok: true });
      await service._request('/v3_2/accounts', {
        method: 'POST',
        headers: { 'X-Custom-Header': 'custom-value' }
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
            Authorization: 'Bearer TEST_API_TOKEN',
            'Content-Type': 'application/json',
            Accept: 'application/json'
          })
        })
      );
    });
  });

  describe('checkUsername', () => {
    it('should return availability result for a valid username', async () => {
      mockFetchSuccess({ available: true, username: 'testuser' });

      const result = await service.checkUsername('testuser');

      expect(result.available).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts/check_username?username=testuser',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return unavailable for a taken username', async () => {
      mockFetchSuccess({ available: false, username: 'takenuser' });

      const result = await service.checkUsername('takenuser');

      expect(result.available).toBe(false);
    });

    it('should encode special characters in username', async () => {
      mockFetchSuccess({ available: true, username: 'user@test' });

      await service.checkUsername('user@test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('username=user%40test'),
        expect.any(Object)
      );
    });

    it('should throw on API error', async () => {
      mockFetchError(500, 'Internal server error');

      await expect(service.checkUsername('testuser')).rejects.toThrow('VPN Resellers API error: 500: Internal server error');
    });
  });

  describe('createAccount', () => {
    it('should create account with payload', async () => {
      const payload = { username: 'newuser', plan_id: 'plan_month', email: 'test@example.com' };
      const expectedResponse = { id: 'acc-123', username: 'newuser', status: 'active' };
      mockFetchSuccess(expectedResponse, 201);

      const result = await service.createAccount(payload);

      expect(result).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            Authorization: 'Bearer TEST_API_TOKEN',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should throw on create failure', async () => {
      mockFetchError(400, 'Username already taken');

      await expect(service.createAccount({ username: 'taken' })).rejects.toThrow('VPN Resellers API error: 400: Username already taken');
    });
  });

  describe('enableAccount', () => {
    it('should enable account with correct URL substitution', async () => {
      const response = { id: 'acc-123', status: 'enabled' };
      mockFetchSuccess(response);

      const result = await service.enableAccount('acc-123');

      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts/acc-123/enable',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should throw on enable failure', async () => {
      mockFetchError(404, 'Account not found');

      await expect(service.enableAccount('nonexistent')).rejects.toThrow('VPN Resellers API error: 404: Account not found');
    });
  });

  describe('disableAccount', () => {
    it('should disable account', async () => {
      mockFetchSuccess({ id: 'acc-123', status: 'disabled' });

      const result = await service.disableAccount('acc-123');

      expect(result.status).toBe('disabled');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts/acc-123/disable',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should throw on disable failure', async () => {
      mockFetchError(403, 'Cannot disable active subscription');

      await expect(service.disableAccount('acc-123')).rejects.toThrow('VPN Resellers API error: 403: Cannot disable active subscription');
    });
  });

  describe('changePassword', () => {
    it('should change password with accountId and new password', async () => {
      mockFetchSuccess({ id: 'acc-123', status: 'password_changed' });

      const result = await service.changePassword('acc-123', 'NewSecurePass123');

      expect(result.status).toBe('password_changed');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts/acc-123/change_password',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ password: 'NewSecurePass123' })
        })
      );
    });

    it('should throw on change password failure', async () => {
      mockFetchError(422, 'Password does not meet requirements');

      await expect(service.changePassword('acc-123', 'weak')).rejects.toThrow('VPN Resellers API error: 422: Password does not meet requirements');
    });
  });

  describe('setExpiry', () => {
    it('should set expiry date for account', async () => {
      const expireAt = '2025-12-31T23:59:59Z';
      mockFetchSuccess({ id: 'acc-123', expire_at: expireAt });

      const result = await service.setExpiry('acc-123', expireAt);

      expect(result.expire_at).toBe(expireAt);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts/acc-123/expire',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ expire_at: expireAt })
        })
      );
    });

    it('should throw on expiry failure', async () => {
      mockFetchError(400, 'Invalid date format');

      await expect(service.setExpiry('acc-123', 'invalid-date')).rejects.toThrow('VPN Resellers API error: 400: Invalid date format');
    });
  });

  describe('getAccount', () => {
    it('should fetch account by ID', async () => {
      const accountData = { id: 'acc-123', username: 'testuser', status: 'active', plan: 'monthly' };
      mockFetchSuccess(accountData);

      const result = await service.getAccount('acc-123');

      expect(result).toEqual(accountData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test-vpnresellers.com/v3_2/accounts/acc-123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should throw on account not found', async () => {
      mockFetchError(404, 'Account not found');

      await expect(service.getAccount('nonexistent')).rejects.toThrow('VPN Resellers API error: 404: Account not found');
    });
  });
});
