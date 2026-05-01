/**
 * vpnresellersService unit tests
 *
 * Tests VPNResellersService class which wraps the VPNResellers VPN API (atomapi.com).
 * The service is exported as a singleton instance (module.exports = new VPNResellersService()).
 *
 * Mock strategy:
 * - jest.mock('axios') makes require('axios') return __mocks__/axios.js
 * - axios.__mockInstance__ exposes the mock client with post/get/put methods
 * - Set axios.__mockInstance__.post.mockResolvedValueOnce(...) BEFORE calling service methods
 * - Do NOT use jest.spyOn — it breaks after jest.restoreAllMocks() in afterEach
 * - axios.create was called at construction: verify via client.baseURL property
 */

process.env.VPNRESELLERS_BASE_URL = 'https://atomapi.com';
process.env.VPNRESELLERS_SECRET_KEY = 'testSecretKey';
process.env.VPNRESELLERS_RESELLER_ID = 'reseller123';

jest.mock('axios');
const axios = require('axios');

// Require the singleton ONCE — constructor runs once at module load
const vpnresellersService = require('../../src/services/vpnresellersService');

beforeEach(() => {
  jest.clearAllMocks();
  // Reset the mock implementation queues — jest.clearAllMocks() only clears
  // call history (.calls, .instances, .results), NOT mockResolvedValueOnce queues.
  // Without this, queues accumulate across tests and wrong responses get consumed.
  axios.__mockInstance__.post.mockReset();
  axios.__mockInstance__.get.mockReset();
  axios.__mockInstance__.put.mockReset();
  // Also reset module-level mocks (same underlying fns as instance methods)
  axios.post.mockReset();
  axios.get.mockReset();
  axios.put.mockReset();
  // Reset service token caching state between tests
  vpnresellersService.accessToken = null;
  vpnresellersService.tokenExpiry = null;
  vpnresellersService.resellerId = 'reseller123';
});

// Note: No jest.restoreAllMocks() here.
// jest.clearAllMocks() only clears .calls/.instances/.results — it does NOT
// remove mock implementations (mockResolvedValueOnce queues persist).
// jest.restoreAllMocks() would restore original functions and BREAK the mock
// because __mocks__/axios.js is not the original axios — it would become undefined.

// Helper: queue a successful auth token response on the mock client's post method
const queueAuthSuccess = (token = 'accessToken123', expirySecs = 3600) => {
  axios.__mockInstance__.post.mockResolvedValueOnce({
    data: {
      body: {
        accessToken: token,
        expiry: expirySecs,
        resellerId: 'reseller123',
        resellerUid: 'uid999'
      }
    }
  });
};

// Helper: queue a successful VPN account response
const queueVPNAccountResponse = (overrides = {}) => {
  const defaults = { vpnUsername: 'vpnuser_test', vpnPassword: 'vpnpass_test', expiryDate: '2027-01-01' };
  return { data: { body: { ...defaults, ...overrides } } };
};

// Helper: queue a successful account operation response (extend/renew/disable/enable)
const queueAccountOpResponse = (overrides = {}) => {
  const defaults = { status: 'success', vpnUsername: 'vpnuser_test', expiryDate: '2027-02-01' };
  return { data: { body: { ...defaults, ...overrides } } };
};

// ─── Constructor tests ───────────────────────────────────────────────────────

describe('VPNResellersService constructor', () => {
  it('sets baseUrl from VPNRESELLERS_BASE_URL env var', () => {
    expect(vpnresellersService.baseUrl).toBe('https://atomapi.com');
  });

  it('sets secretKey and resellerId from env vars', () => {
    expect(vpnresellersService.secretKey).toBe('testSecretKey');
    expect(vpnresellersService.resellerId).toBe('reseller123');
  });

  it('initializes accessToken and tokenExpiry to null', () => {
    // Reset by beforeEach to null; constructor also sets them to null
    expect(vpnresellersService.accessToken).toBeNull();
    expect(vpnresellersService.tokenExpiry).toBeNull();
  });

  it('creates axios client with correct baseURL and headers (verified via service.client)', () => {
    // axios.create was called at construction with the config.
    // The service stores the client and its defaults reflect what was passed.
    expect(vpnresellersService.client.defaults.baseURL).toBe('https://atomapi.com');
    expect(vpnresellersService.client.defaults.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(vpnresellersService.client.defaults.headers['Accept']).toBe('application/json');
  });
});

// ─── getAccessToken tests ─────────────────────────────────────────────────────

describe('getAccessToken', () => {
  it('returns cached token when expiry is still in the future', async () => {
    vpnresellersService.accessToken = 'cachedToken';
    vpnresellersService.tokenExpiry = Date.now() + 60000;

    const token = await vpnresellersService.getAccessToken();
    expect(token).toBe('cachedToken');
    // No HTTP calls should be made when token is cached
    expect(axios.__mockInstance__.post).not.toHaveBeenCalled();
  });

  it('calls POST /auth/v1/accessToken when no valid token is cached', async () => {
    queueAuthSuccess('newToken', 3600);

    const token = await vpnresellersService.getAccessToken();
    expect(token).toBe('newToken');
    expect(axios.__mockInstance__.post).toHaveBeenCalledTimes(1);
    expect(axios.__mockInstance__.post).toHaveBeenCalledWith('/auth/v1/accessToken', {
      secretKey: 'testSecretKey',
      grantType: 'secret',
    });
  });

  it('caches token and sets tokenExpiry after successful fetch', async () => {
    queueAuthSuccess('newToken', 7200);

    const before = Date.now();
    await vpnresellersService.getAccessToken();
    const after = Date.now();

    expect(vpnresellersService.accessToken).toBe('newToken');
    // expiry = Date.now() + (expirySecs * 1000) = Date.now() + 7200000
    expect(vpnresellersService.tokenExpiry).toBeGreaterThan(before + 7200000 - 1000);
    expect(vpnresellersService.tokenExpiry).toBeLessThan(after + 7200000 + 1000);
  });

  it('updates resellerId from auth response', async () => {
    axios.__mockInstance__.post.mockResolvedValueOnce({
      data: { body: { accessToken: 'tok', expiry: 3600, resellerId: 'newResellerId', resellerUid: 'uid1' } }
    });

    await vpnresellersService.getAccessToken();
    expect(vpnresellersService.resellerId).toBe('newResellerId');
  });

  it('throws descriptive error on auth failure with response data', async () => {
    axios.__mockInstance__.post.mockRejectedValueOnce({
      response: { data: { header: { message: 'Invalid secret key' } } }
    });

    await expect(vpnresellersService.getAccessToken()).rejects
      .toThrow('VPNResellers authentication failed: Invalid secret key');
  });

  it('throws generic message when error has no response data', async () => {
    axios.__mockInstance__.post.mockRejectedValueOnce(new Error('Network error'));

    await expect(vpnresellersService.getAccessToken()).rejects
      .toThrow('VPNResellers authentication failed: Network error');
  });
});

// ─── createVPNAccount tests ──────────────────────────────────────────────────

describe('createVPNAccount', () => {
  it('calls POST /vam/v3/create with uuid, period, subscriptionType and returns credentials', async () => {
    // Queue auth success then account creation response
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.post.mockResolvedValueOnce(
      queueVPNAccountResponse({ vpnUsername: 'created_user' })
    );

    const result = await vpnresellersService.createVPNAccount('user123', 30, { pref1: 'val' });
    expect(result.vpnUsername).toBe('created_user');
    expect(result.vpnPassword).toBe('vpnpass_test');
    expect(result.expiryDate).toBe('2027-01-01');

    // call[0] = auth, call[1] = account creation
    const createCall = axios.__mockInstance__.post.mock.calls[1];
    expect(createCall[0]).toBe('/vam/v3/create');
    expect(createCall[1]).toEqual({ uuid: 'user123', period: 30, subscriptionType: 'paid' });
    expect(createCall[2].headers['X-AccessToken']).toBe('tok');
  });

  it('uses default period of 30 when not specified', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.post.mockResolvedValueOnce(queueVPNAccountResponse());
    axios.__mockInstance__.post.mockResolvedValueOnce(queueVPNAccountResponse());

    await vpnresellersService.createVPNAccount('user123');
    const createCall = axios.__mockInstance__.post.mock.calls[1];
    expect(createCall[1].period).toBe(30);
  });

  it('re-uses cached token without calling auth again', async () => {
    vpnresellersService.accessToken = 'cachedToken';
    vpnresellersService.tokenExpiry = Date.now() + 60000;
    // Only queue account creation — no auth needed
    axios.__mockInstance__.post.mockResolvedValueOnce(queueVPNAccountResponse());

    await vpnresellersService.createVPNAccount('user123');
    // Only 1 call (account creation), not 2
    expect(axios.__mockInstance__.post).toHaveBeenCalledTimes(1);
  });

  it('throws descriptive error on account creation failure', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.post.mockRejectedValueOnce({
      response: { data: { header: { message: 'User already exists' } } }
    });

    await expect(vpnresellersService.createVPNAccount('user123')).rejects
      .toThrow('VPNResellers account creation failed: User already exists');
  });
});

// ─── generateVPNAccount tests ────────────────────────────────────────────────

describe('generateVPNAccount', () => {
  it('calls POST /vam/v2/generate with uuid and period', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.post.mockResolvedValueOnce(
      queueVPNAccountResponse({ vpnUsername: 'generated_user' })
    );

    const result = await vpnresellersService.generateVPNAccount('user456', 90);
    expect(result.vpnUsername).toBe('generated_user');

    const genCall = axios.__mockInstance__.post.mock.calls[1];
    expect(genCall[0]).toBe('/vam/v2/generate');
    expect(genCall[1]).toEqual({ uuid: 'user456', period: 90, subscriptionType: 'paid' });
  });

  it('throws descriptive error on generation failure', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.post.mockRejectedValueOnce({
      response: { data: { header: { message: 'Generation quota exceeded' } } }
    });

    await expect(vpnresellersService.generateVPNAccount('user456')).rejects
      .toThrow('VPNResellers account generation failed: Generation quota exceeded');
  });
});

// ─── extendVPNAccount tests ──────────────────────────────────────────────────

describe('extendVPNAccount', () => {
  it('calls PUT /vam/v2/extend with vpnUsername and extensionDate', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.put.mockResolvedValueOnce(queueAccountOpResponse());

    const result = await vpnresellersService.extendVPNAccount('vpnuser_test', '15-06-2027');
    expect(result.status).toBe('success');

    // PUT has only 1 call per test (vs POST which has 2: auth + operation), so index is 0
    const extendCall = axios.__mockInstance__.put.mock.calls[0];
    expect(extendCall[0]).toBe('/vam/v2/extend');
    expect(extendCall[1]).toEqual({ vpnUsername: 'vpnuser_test', extensionDate: '15-06-2027' });
    expect(extendCall[2].headers['X-AccessToken']).toBe('tok');
  });

  it('throws descriptive error on extension failure', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.put.mockRejectedValueOnce({
      response: { data: { header: { message: 'Account not found' } } }
    });

    await expect(vpnresellersService.extendVPNAccount('vpnuser_test', '15-06-2027')).rejects
      .toThrow('VPNResellers account extension failed: Account not found');
  });
});

// ─── renewVPNAccount tests ───────────────────────────────────────────────────

describe('renewVPNAccount', () => {
  it('calls PUT /vam/v2/renew with vpnUsername and period', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.put.mockResolvedValueOnce(queueAccountOpResponse());

    const result = await vpnresellersService.renewVPNAccount('vpnuser_test', 30);
    expect(result.status).toBe('success');

    const renewCall = axios.__mockInstance__.put.mock.calls[0];
    expect(renewCall[0]).toBe('/vam/v2/renew');
    expect(renewCall[1]).toEqual({ vpnUsername: 'vpnuser_test', period: 30 });
  });

  it('throws descriptive error on renewal failure', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.put.mockRejectedValueOnce({
      response: { data: { header: { message: 'Renewal payment failed' } } }
    });

    await expect(vpnresellersService.renewVPNAccount('vpnuser_test', 30)).rejects
      .toThrow('VPNResellers account renewal failed: Renewal payment failed');
  });
});

// ─── disableVPNAccount tests ─────────────────────────────────────────────────

describe('disableVPNAccount', () => {
  it('calls PUT /vam/v2/disable with vpnUsername', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.put.mockResolvedValueOnce({ data: { body: { status: 'disabled' } } });

    const result = await vpnresellersService.disableVPNAccount('vpnuser_test');
    expect(result.status).toBe('disabled');

    const disableCall = axios.__mockInstance__.put.mock.calls[0];
    expect(disableCall[0]).toBe('/vam/v2/disable');
    expect(disableCall[1]).toEqual({ vpnUsername: 'vpnuser_test' });
  });

  it('throws descriptive error on disable failure', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.put.mockRejectedValueOnce({
      response: { data: { header: { message: 'Account is locked' } } }
    });

    await expect(vpnresellersService.disableVPNAccount('vpnuser_test')).rejects
      .toThrow('VPNResellers account disable failed: Account is locked');
  });
});

// ─── enableVPNAccount tests ─────────────────────────────────────────────────

describe('enableVPNAccount', () => {
  it('calls PUT /vam/v2/enable with vpnUsername', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.put.mockResolvedValueOnce({ data: { body: { status: 'enabled' } } });

    const result = await vpnresellersService.enableVPNAccount('vpnuser_test');
    expect(result.status).toBe('enabled');

    const enableCall = axios.__mockInstance__.put.mock.calls[0];
    expect(enableCall[0]).toBe('/vam/v2/enable');
    expect(enableCall[1]).toEqual({ vpnUsername: 'vpnuser_test' });
  });

  it('throws descriptive error on enable failure', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.put.mockRejectedValueOnce({
      response: { data: { header: { message: 'Account is expired' } } }
    });

    await expect(vpnresellersService.enableVPNAccount('vpnuser_test')).rejects
      .toThrow('VPNResellers account enable failed: Account is expired');
  });
});

// ─── getVPNAccountStatus tests ───────────────────────────────────────────────

describe('getVPNAccountStatus', () => {
  it('calls GET /vam/v2/status with vpnUsername as query param', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.get.mockResolvedValueOnce({
      data: { body: { status: 'active', expiryDate: '2027-01-01' } }
    });

    const result = await vpnresellersService.getVPNAccountStatus('vpnuser_test');
    expect(result.status).toBe('active');

    expect(axios.__mockInstance__.get).toHaveBeenCalledTimes(1);
    expect(axios.__mockInstance__.get).toHaveBeenCalledWith(
      '/vam/v2/status?X-AccessToken=tok&vpnUsername=vpnuser_test'
    );
  });

  it('throws descriptive error on status check failure', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.get.mockRejectedValueOnce({
      response: { data: { header: { message: 'VPN username not found' } } }
    });

    await expect(vpnresellersService.getVPNAccountStatus('vpnuser_test')).rejects
      .toThrow('VPNResellers account status check failed: VPN username not found');
  });
});

// ─── getCountries tests ───────────────────────────────────────────────────────

describe('getCountries', () => {
  it('calls GET /inventory/v3/countries/{deviceType} and returns countries array', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.get.mockResolvedValueOnce({
      data: { body: { countries: [{ id: 1, name: 'United States', slug: 'us' }] } }
    });

    const result = await vpnresellersService.getCountries('mac');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('United States');

    expect(axios.__mockInstance__.get).toHaveBeenCalledTimes(1);
    expect(axios.__mockInstance__.get).toHaveBeenCalledWith(
      '/inventory/v3/countries/mac',
      { headers: { 'X-AccessToken': 'tok' } }
    );
  });

  it('defaults deviceType to windows when not specified', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.get.mockResolvedValueOnce({ data: { body: { countries: [] } } });
    axios.__mockInstance__.get.mockResolvedValueOnce({ data: { body: { countries: [] } } });

    await vpnresellersService.getCountries();
    expect(axios.__mockInstance__.get).toHaveBeenCalledWith(
      '/inventory/v3/countries/windows',
      { headers: { 'X-AccessToken': 'tok' } }
    );
  });

  it('throws descriptive error on countries fetch failure', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.get.mockRejectedValueOnce({
      response: { data: { header: { message: 'Inventory service unavailable' } } }
    });

    await expect(vpnresellersService.getCountries()).rejects
      .toThrow('VPNResellers countries fetch failed: Inventory service unavailable');
  });
});

// ─── getOptimizedServer tests ─────────────────────────────────────────────────

describe('getOptimizedServer', () => {
  const serverResponse = {
    data: {
      body: {
        servers: [{ id: 'srv1', host: 'us-east-1.vpn.com', country: 'United States', speed: 1000 }]
      }
    }
  };

  it('calls POST /speedtest/v4/serversWithoutPsk with correct payload', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.post.mockResolvedValueOnce(serverResponse);

    const result = await vpnresellersService.getOptimizedServer('us', 'tcp', 'vpnuser_test', 'mac');
    expect(result.host).toBe('us-east-1.vpn.com');

    const optCall = axios.__mockInstance__.post.mock.calls[1];
    expect(optCall[0]).toBe('/speedtest/v4/serversWithoutPsk');
    expect(optCall[1]).toEqual({
      sCountrySlug: 'us',
      sProtocolSlug1: 'tcp',
      sUsername: 'vpnuser_test',
      sDeviceType: 'mac',
      iResellerId: 'reseller123'
    });
    expect(optCall[2].headers['X-AccessToken']).toBe('tok');
  });

  it('defaults deviceType to windows when not specified', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.post.mockResolvedValueOnce(serverResponse);

    await vpnresellersService.getOptimizedServer('us', 'udp', 'vpnuser_test');
    const optCall = axios.__mockInstance__.post.mock.calls[1];
    expect(optCall[1].sDeviceType).toBe('windows');
  });

  it('returns servers[0] from the response', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.post.mockResolvedValueOnce({
      data: { body: { servers: [{ host: 'optimized.vpn.net' }] } }
    });

    const result = await vpnresellersService.getOptimizedServer('uk', 'wireguard', 'vpnuser_test');
    expect(result.host).toBe('optimized.vpn.net');
  });

  it('throws descriptive error on server optimization failure', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.post.mockRejectedValueOnce({
      response: { data: { header: { message: 'No servers available for country' } } }
    });

    await expect(vpnresellersService.getOptimizedServer('xx', 'tcp', 'vpnuser_test')).rejects
      .toThrow('VPNResellers server optimization failed: No servers available for country');
  });
});

// =============================================================================
// _request — POST (default) branch coverage
// =============================================================================

describe('_request POST (default) branch', () => {
  it('calls client.post when method is not GET or PUT (POST/DELETE)', async () => {
    queueAuthSuccess('tok', 3600);
    axios.__mockInstance__.post.mockResolvedValueOnce({
      data: { body: { vpnUsername: 'post_user', vpnPassword: 'pass', expiryDate: '2027-01-01' } }
    });

    // createVPNAccount uses POST → hits the `else` branch in _request
    await vpnresellersService.createVPNAccount('user999', 30);

    // call[1] is the VPN operation (call[0] was auth)
    const postCall = axios.__mockInstance__.post.mock.calls[1];
    expect(postCall[0]).toBe('/vam/v3/create');
    expect(axios.__mockInstance__.get).not.toHaveBeenCalled();
    expect(axios.__mockInstance__.put).not.toHaveBeenCalled();
  });
});

// =============================================================================
// getAccessToken — resellerId absent from auth response
// =============================================================================

describe('getAccessToken — resellerId absent', () => {
  it('does not overwrite resellerId when response does not include it', async () => {
    // Pre-set resellerId to a known value
    vpnresellersService.resellerId = 'originalReseller';
    vpnresellersService.accessToken = null;
    vpnresellersService.tokenExpiry = null;

    // Auth response WITHOUT resellerId field
    axios.__mockInstance__.post.mockResolvedValueOnce({
      data: {
        body: {
          accessToken: 'newTokenNoReseller',
          expiry: 3600
          // NO resellerId
        }
      }
    });

    await vpnresellersService.getAccessToken();

    // resellerId should remain unchanged ('originalReseller')
    expect(vpnresellersService.resellerId).toBe('originalReseller');
    expect(vpnresellersService.accessToken).toBe('newTokenNoReseller');
  });
});

// =============================================================================
// VPNResellersService constructor — throws when VPNRESELLERS_SECRET_KEY is missing
// =============================================================================
describe('VPNResellersService constructor', () => {
  it('throws when VPNRESELLERS_SECRET_KEY is not defined', () => {
    // Save and clear the env var so a fresh module load triggers the constructor throw.
    const saved = process.env.VPNRESELLERS_SECRET_KEY;
    delete process.env.VPNRESELLERS_SECRET_KEY;

    try {
      // jest.isolateModules gives us a fresh module registry — the service module
      // will re-evaluate and hit the constructor throw before axios is called.
      let threw = false;
      let thrownMsg = '';
      try {
        jest.isolateModules(() => {
          require('../../src/services/vpnresellersService');
        });
      } catch (e) {
        threw = true;
        thrownMsg = e.message;
      }

      expect(threw).toBe(true);
      expect(thrownMsg).toContain('VPNRESELLERS_SECRET_KEY is not defined');
    } finally {
      process.env.VPNRESELLERS_SECRET_KEY = saved;
    }
  });
});
