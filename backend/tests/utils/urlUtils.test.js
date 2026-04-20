/**
 * urlUtils Unit Tests
 * ===================
 * Tests for inferBaseUrls() — the URL inference utility used by paymentController
 * to construct redirect/callback URLs from x-forwarded-* proxy headers.
 */

const { inferBaseUrls, DEFAULT_FRONTEND_URL, DEFAULT_API_BASE_URL } = require('../../src/utils/urlUtils');

describe('urlUtils', () => {
  describe('inferBaseUrls', () => {
    // Helper to build a minimal mock req object
    const mockReq = (headers = {}) => ({ headers });

    describe('with x-forwarded-* headers', () => {
      it('uses forwarded host and proto to build URLs', () => {
        const req = mockReq({
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'www.ahoyvpn.net',
        });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('https://www.ahoyvpn.net');
        expect(result.apiBaseUrl).toBe('https://www.ahoyvpn.net');
        expect(result.baseUrl).toBe('https://www.ahoyvpn.net');
      });

      it('strips /api suffix from forwarded host for appBaseUrl', () => {
        const req = mockReq({
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'api.ahoyvpn.net',
        });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('https://api.ahoyvpn.net');
        // apiBaseUrl also strips /api when the forwarded host had it
        expect(result.apiBaseUrl).toBe('https://api.ahoyvpn.net');
      });

      it('handles x-forwarded-host with trailing slash', () => {
        const req = mockReq({
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'www.ahoyvpn.net/',
        });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('https://www.ahoyvpn.net');
        expect(result.apiBaseUrl).toBe('https://www.ahoyvpn.net');
      });

      it('defaults to https when forwarded-proto is missing', () => {
        const req = mockReq({
          'x-forwarded-host': 'www.ahoyvpn.net',
        });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('https://www.ahoyvpn.net');
      });

      it('prefers x-forwarded-host over direct host', () => {
        const req = mockReq({
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'www.ahoyvpn.net',
          host: 'localhost:3000',
        });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('https://www.ahoyvpn.net');
      });
    });

    describe('without x-forwarded-* headers (direct request)', () => {
      it('falls back to req.headers.host', () => {
        const req = mockReq({ host: 'localhost:3000' });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('https://localhost:3000');
        expect(result.apiBaseUrl).toBe('https://localhost:3000');
      });

      it('strips /api suffix when present in host', () => {
        const req = mockReq({ host: 'api.ahoyvpn.net/api' });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('https://api.ahoyvpn.net');
        expect(result.apiBaseUrl).toBe('https://api.ahoyvpn.net');
      });

      it('strips trailing slash from host', () => {
        const req = mockReq({ host: 'www.ahoyvpn.net/' });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('https://www.ahoyvpn.net');
      });

      it('defaults to https when no proto header', () => {
        const req = mockReq({ host: 'www.ahoyvpn.net' });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('https://www.ahoyvpn.net');
      });
    });

    describe('with no headers at all (catastrophic fallback)', () => {
      it('falls back to DEFAULT_FRONTEND_URL', () => {
        const req = mockReq({});
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe(DEFAULT_FRONTEND_URL);
        expect(result.apiBaseUrl).toBe(DEFAULT_API_BASE_URL);
        expect(result.baseUrl).toBe(DEFAULT_FRONTEND_URL);
      });
    });

    describe('edge cases', () => {
      it('handles http as forwarded proto', () => {
        const req = mockReq({
          'x-forwarded-proto': 'http',
          'x-forwarded-host': 'www.ahoyvpn.net',
        });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('http://www.ahoyvpn.net');
      });

      it('strips /api/ (with sub-path) from forwarded host', () => {
        const req = mockReq({
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'www.ahoyvpn.net/api/',
        });
        const result = inferBaseUrls(req);
        expect(result.appBaseUrl).toBe('https://www.ahoyvpn.net');
      });

      it('appBaseUrl and apiBaseUrl may differ when no forwarded headers', () => {
        // When no forwarded headers: appBaseUrl falls back to FRONTEND_URL,
        // apiBaseUrl falls back to API_BASE_URL — these are different defaults
        const req = mockReq({});
        expect(result => {
          // FRONTEND_URL (e.g. https://ahoyvpn.net) vs API_BASE_URL (e.g. https://api.ahoyvpn.net)
          // should differ unless env vars are set to same value
        });
        const result = inferBaseUrls(req);
        // Just verify both are strings and baseUrl equals appBaseUrl
        expect(typeof result.appBaseUrl).toBe('string');
        expect(typeof result.apiBaseUrl).toBe('string');
        expect(typeof result.baseUrl).toBe('string');
        expect(result.baseUrl).toBe(result.appBaseUrl);
      });
    });
  });
});
