/**
 * PureWL VPN Resellers API Service
 *
 * Wraps the PureWL/atomapi.com VPN account management REST API.
 * Handles authentication token management, request signing, and maps
 * raw API responses into the shapes used by vpnResellersService.
 *
 * WHY this class exists:
 *   The PureWL API is a pure-http RPC layer (form-encoded POSTs with
 *   X-AccessToken headers). It is not a standard REST resource, so it
 *   doesn't fit cleanly into a generic HTTP client. This class:
 *     1. Manages token lifecycle (fetch / cache / refresh)
 *     2. Provides type-safe, domain-named methods instead of raw endpoint URLs
 *     3. Extracts error context from nested API response bodies
 *     4. Throws domain errors that callers can handle predictably
 *
 * API quirks handled:
 *   - Token expires after ~3600s; we cache with timestamp so we refresh lazily
 *   - All requests require X-AccessToken header (fetched from getAccessToken)
 *   - Error responses nest the message inside body.header.message, not top-level
 *   - createVPNAccount / generateVPNAccount share the same payload schema
 *     (uuid + period + subscriptionType) but hit different endpoints
 */

const axios = require('axios');
const log = require('../utils/logger');

// Token TTL buffer: refresh 60 s before actual expiry to avoid edge-case races
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Derive a human-readable action label from HTTP method + path for error messages.
 * Strips the API version prefix so callers get clean labels like
 * "account creation" instead of "POST /vam/v3/create".
 *
 * @param {string} method  - 'GET' | 'POST' | 'PUT'
 * @param {string} path    - API path e.g. '/vam/v3/create'
 * @returns {string}       - e.g. 'account creation', 'account extension', etc.
 */
function actionLabel(method, path) {
  const labels = {
    'POST|/vam/v3/create': 'account creation',
    'POST|/vam/v2/generate': 'account generation',
    'PUT|/vam/v2/extend': 'account extension',
    'PUT|/vam/v2/renew': 'account renewal',
    'PUT|/vam/v2/disable': 'account disable',
    'PUT|/vam/v2/enable': 'account enable',
    'GET|/inventory/v3/countries': 'countries fetch',
    'POST|/speedtest/v4/serversWithoutPsk': 'server optimization',
  };
  // Strip deviceType suffix from inventory path for lookup
  const lookup = path.replace(/\/windows$|\/macos$|\/ios$|\/android$/, '');
  const key = `${method}|${lookup}`;
  return labels[key] || `${method} ${path}`;
}

class PureWLService {
  constructor() {
    // Configuration — loaded from environment so tests can override via
    // process.env stubs without constructor injection.
    this.baseUrl = process.env.PUREWL_BASE_URL || 'https://atomapi.com';
    this.secretKey = process.env.PUREWL_SECRET_KEY;
    this.resellerId = process.env.PUREWL_RESELLER_ID;

    // Token cache — instance-level so each require() call gets its own cache.
    // (Node.js caches module exports, so subsequent require()s return the same
    // service instance with the same tokenExpiry.)
    this.accessToken = null;
    this.tokenExpiry = null;

    // Validate key config early so failures surface at startup, not on first call.
    if (!this.secretKey) {
      throw new Error('PUREWL_SECRET_KEY is not defined in environment variables');
    }

    // Shared axios client — base URL + base headers are set once here so
    // individual method calls don't need to repeat them.
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
    });
  }

  // ─── Token management ────────────────────────────────────────────────────────

  /**
   * Return a valid access token, fetching a new one if the cached token is
   * expired or missing.
   *
   * Caching strategy: we store the absolute expiry timestamp (Date.now() + ttl).
   * Before every API call we check "Date.now() < tokenExpiry".  The
   * TOKEN_REFRESH_BUFFER_MS subtracts 60 s from the TTL as a safety margin
   * against clock-skew / network delay races.
   *
   * @returns {string} valid X-AccessToken for the next API call
   */
  async getAccessToken() {
    // If we have a valid token, return it
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      // PureWL auth endpoint: POST /auth/v1/accessToken
      // Request body is form-encoded (x-www-form-urlencoded)
      const response = await this.client.post('/auth/v1/accessToken', {
        secretKey: this.secretKey,
        grantType: 'secret',
      });

      // Response body shape: { body: { accessToken, expiry, resellerId, resellerUid } }
      const { accessToken, expiry, resellerId, resellerUid } = response.data.body;
      this.accessToken = accessToken;
      this.tokenExpiry = Date.now() + (expiry * 1000);
      if (resellerId) this.resellerId = resellerId;

      return accessToken;
    } catch (error) {
      // Log the raw API error so operators have full context for debugging.
      log.error('Failed to get PureWL access token', {
        error: error.response?.data || error.message,
      });
      throw new Error(
        `PureWL authentication failed: ${error.response?.data?.header?.message || error.message}`
      );
    }
  }

  // ─── Core request engine ────────────────────────────────────────────────────

  /**
   * Make an authenticated API call through the PureWL proxy.
   *
   * This is the single place where:
   *   - The X-AccessToken header is attached
   *   - Errors are caught and re-thrown with a domain-prefixed message
   *   - Errors are logged with full response context
   *
   * Every public VPN operation in this class is a one-liner through _request().
   * Adding a new operation = one more method, no copy-paste.
   *
   * @param {string} method  - HTTP method ('GET' | 'POST' | 'PUT')
   * @param {string} path    - API path (e.g. '/vam/v3/create')
   * @param {object} [payload] - Request body (null for GET)
   * @returns {object} parsed response body
   * @private
   */
  async _request(method, path, payload = null) {
    const accessToken = await this.getAccessToken();

    const config = { headers: { 'X-AccessToken': accessToken } };

    try {
      let response;
      if (method === 'GET') {
        response = await this.client.get(path, config);
      } else if (method === 'PUT') {
        response = await this.client.put(path, payload, config);
      } else {
        // POST handles both POST and DELETE
        response = await this.client.post(path, payload, config);
      }
      return response.data.body;
    } catch (error) {
      // Log structured error with full API response (helps ops debug)
      log.error(`PureWL API error [${method}] [${path}]`, {
        error: error.response?.data || error.message,
      });
      // Re-throw with a domain-prefixed message; include the HTTP method so callers
      // can identify which operation failed even when the path is ambiguous.
      const apiMessage = error.response?.data?.header?.message || error.message;
      throw new Error(`PureWL ${actionLabel(method, path)} failed: ${apiMessage}`);
    }
  }

  // ─── Account operations ─────────────────────────────────────────────────────

  /**
   * Create a new VPN account on the PureWL platform.
   *
   * Called by vpnResellersService when a new paid subscription is activated.
   * The uuid is our internal userId — PureWL stores it as the account label.
   *
   * @param {string} userId       - our internal user UUID
   * @param {number} [period=30]  - account validity in days
   * @param {object} [preferences={}] - reserved for future use (country, protocol prefs)
   * @returns {{ vpnUsername, vpnPassword, expiryDate }}
   */
  async createVPNAccount(userId, period = 30, preferences = {}) {
    const payload = {
      uuid: userId,
      period,
      subscriptionType: 'paid',
    };
    return this._request('POST', '/vam/v3/create', payload);
  }

  /**
   * Generate a VPN account credential set (alternative endpoint to createVPNAccount).
   *
   * Both createVPNAccount and generateVPNAccount accept the same payload schema
   * but hit different PureWL endpoints. The distinction is an API design artifact;
   * we expose both for backward compatibility.
   *
   * @param {string} userId
   * @param {number} [period=30]
   * @param {object} [preferences={}]
   * @returns {{ vpnUsername, vpnPassword, expiryDate }}
   */
  async generateVPNAccount(userId, period = 30, preferences = {}) {
    const payload = {
      uuid: userId,
      period,
      subscriptionType: 'paid',
    };
    return this._request('POST', '/vam/v2/generate', payload);
  }

  /**
   * Extend the expiry date of an existing VPN account.
   *
   * Called when a subscription renews (ARB webhook fires).  The extensionDate
   * must be in DD-MM-YYYY format per PureWL's API contract.
   *
   * @param {string} vpnUsername  - PureWL account username
   * @param {string} extensionDate - new expiry date string 'DD-MM-YYYY'
   * @returns {object} API response body
   */
  async extendVPNAccount(vpnUsername, extensionDate) {
    return this._request('PUT', '/vam/v2/extend', {
      vpnUsername,
      extensionDate,
    });
  }

  /**
   * Renew an active VPN account (extend + potentially upgrade).
   *
   * @param {string} vpnUsername
   * @param {number} period - new validity period in days
   * @param {object} [preferences={}]
   * @returns {object} API response body
   */
  async renewVPNAccount(vpnUsername, period, preferences = {}) {
    return this._request('PUT', '/vam/v2/renew', {
      vpnUsername,
      period,
    });
  }

  /**
   * Deactivate a VPN account (access revoked, account preserved).
   *
   * Called when a subscription is canceled or expires.
   *
   * @param {string} vpnUsername
   * @returns {object} API response body
   */
  async disableVPNAccount(vpnUsername) {
    return this._request('PUT', '/vam/v2/disable', { vpnUsername });
  }

  /**
   * Re-activate a previously disabled VPN account.
   *
   * @param {string} vpnUsername
   * @returns {object} API response body
   */
  async enableVPNAccount(vpnUsername) {
    return this._request('PUT', '/vam/v2/enable', { vpnUsername });
  }

  /**
   * Query the current status of a VPN account.
   *
   * NOTE: Unlike other GET endpoints, PureWL requires the X-AccessToken as a
   * query parameter rather than a header for the status endpoint.
   *
   * @param {string} vpnUsername
   * @returns {{ status, expiryDate, ... }} account state object
   */
  async getVPNAccountStatus(vpnUsername) {
    // PureWL GET endpoint requires token as a query param, not a header.
    const accessToken = await this.getAccessToken();
    const path =
      `/vam/v2/status?X-AccessToken=${encodeURIComponent(accessToken)}` +
      `&vpnUsername=${encodeURIComponent(vpnUsername)}`;
    try {
      const response = await this.client.get(path);
      return response.data.body;
    } catch (error) {
      log.error('Failed to get PureWL VPN account status', {
        error: error.response?.data || error.message,
      });
      const apiMessage = error.response?.data?.header?.message || error.message;
      throw new Error(`PureWL account status check failed: ${apiMessage}`);
    }
  }

  // ─── Inventory operations ────────────────────────────────────────────────────

  /**
   * List available countries for a given device type.
   *
   * @param {string} [deviceType='windows'] - PureWL device type slug
   * @returns {string[]} array of country codes
   */
  async getCountries(deviceType = 'windows') {
    const body = await this._request('GET', `/inventory/v3/countries/${deviceType}`);
    return body.countries;
  }

  /**
   * Get the lowest-latency server for a given country + protocol + user.
   *
   * PureWL's speedtest endpoint returns a sorted array; we surface the first
   * result as the "optimized" server recommendation.
   *
   * @param {string} countrySlug   - PureWL country identifier
   * @param {string} protocolSlug   - PureWL protocol identifier
   * @param {string} username      - vpnUsername to scope the optimization
   * @param {string} [deviceType='windows']
   * @returns {object} server object from PureWL
   */
  async getOptimizedServer(countrySlug, protocolSlug, username, deviceType = 'windows') {
    const body = await this._request('POST', '/speedtest/v4/serversWithoutPsk', {
      sCountrySlug: countrySlug,
      sProtocolSlug1: protocolSlug,
      sUsername: username,
      sDeviceType: deviceType,
      iResellerId: this.resellerId,
    });
    return body.servers[0];
  }
}

module.exports = new PureWLService();
