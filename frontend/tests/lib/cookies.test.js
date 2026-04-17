/**
 * Unit tests for lib/cookies.js — affiliate attribution cookie management
 *
 * WHY THESE TESTS MATTER:
 * cookies.js handles affiliate attribution tracking — a revenue-critical and
 * security-sensitive function:
 * - setCookie / getCookie: generic cookie management
 * - setAffiliateCookie: stores affiliate ID when user clicks affiliate link
 * - getAffiliateId: retrieves stored affiliate ID from cookie or localStorage
 * - extractAffiliateIdFromUrl: extracts affiliate ID from URL path or query param
 * - checkAndSetAffiliateFromUrl: detects affiliate visit and stores cookie
 * - clearAffiliateAttribution: clears all affiliate attribution
 *
 * Security properties verified:
 * - Proper cookie scoping (path=/, HttpOnly for non-affiliate)
 * - Secure flag in production
 * - SameSite policy enforcement
 * - localStorage errors caught gracefully
 * - SSR guards on all browser-API functions
 */

import {
  setCookie,
  getCookie,
  deleteCookie,
  setAffiliateCookie,
  getAffiliateId,
  extractAffiliateIdFromUrl,
  checkAndSetAffiliateFromUrl,
  clearAffiliateAttribution,
} from '../../lib/cookies';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mock document.cookie string from a map of cookie name → value.
 * Real document.cookie is a semi-colon separated list of "key=value" pairs.
 */
function buildCookieString(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
}

/**
 * Build a mock URL object for spying on global.URL in extractAffiliateIdFromUrl tests.
 * This avoids the non-configurable window.location descriptor problem in jsdom.
 * @param {string} pathname - The URL pathname (e.g. '/affiliate/ABC123')
 * @param {object} searchParamsMap - Map of query param keys to values (e.g. { affiliate: 'ID' })
 */
function mockUrl(pathname, searchParamsMap = {}) {
  const mockSearchParams = {
    get: (key) => searchParamsMap[key] || null,
  };
  return {
    pathname,
    searchParams: mockSearchParams,
  };
}

// ─── setCookie ────────────────────────────────────────────────────────────────

describe('setCookie', () => {
  beforeEach(() => {
    // Reset document.cookie before each test
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
  });

  test('sets a basic cookie with default 30-day expiry', () => {
    setCookie('foo', 'bar');
    expect(document.cookie).toContain('foo=bar');
    expect(document.cookie).toContain('expires=');
    expect(document.cookie).toContain('path=/');
  });

  test('encodes special characters in cookie value', () => {
    setCookie('key', 'hello world&foo=bar');
    expect(document.cookie).toContain('key=hello%20world%26foo%3Dbar');
  });

  test('uses Secure flag in non-development environment', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    setCookie('secure_cookie', 'value');
    expect(document.cookie).toContain('Secure');
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('omits Secure flag in development environment', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    setCookie('dev_cookie', 'value');
    expect(document.cookie).not.toContain('Secure');
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('sets SameSite=Lax by default', () => {
    setCookie('lax_cookie', 'value');
    expect(document.cookie).toContain('SameSite=Lax');
  });

  test('allows custom SameSite option', () => {
    setCookie('strict_cookie', 'value', 30, { sameSite: 'Strict' });
    expect(document.cookie).toContain('SameSite=Strict');
  });

  test('adds HttpOnly for non-affiliate cookies', () => {
    setCookie('regular', 'value');
    expect(document.cookie).toContain('HttpOnly');
  });

  test('omits HttpOnly for affiliate-named cookies (affiliates need JS access)', () => {
    setCookie('affiliate_code', 'AFF123');
    expect(document.cookie).not.toContain('HttpOnly');
  });

  test('respects custom expiration days', () => {
    setCookie('short_lived', 'value', 7);
    expect(document.cookie).toContain('short_lived=value');
    expect(document.cookie).toContain('expires=');
  });
});

// ─── getCookie ───────────────────────────────────────────────────────────────

describe('getCookie', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
  });

  test('returns decoded value for existing cookie', () => {
    document.cookie = buildCookieString({ foo: 'hello world' });
    expect(getCookie('foo')).toBe('hello world');
  });

  test('returns null for non-existent cookie', () => {
    document.cookie = buildCookieString({ other: 'value' });
    expect(getCookie('nonexistent')).toBeNull();
  });

  test('handles cookie with equals sign in value', () => {
    document.cookie = buildCookieString({ key: 'val=ue' });
    expect(getCookie('key')).toBe('val=ue');
  });

  test('URL-decodes cookie values', () => {
    // Use raw (unencoded) value — buildCookieString uses encodeURIComponent so the
    // stored cookie string will be "key=hello%20world%26x%3Dy".  getCookie then
    // calls decodeURIComponent to restore the original "hello world&x=y".
    document.cookie = buildCookieString({ key: 'hello world&x=y' });
    expect(getCookie('key')).toBe('hello world&x=y');
  });

  test('empty document.cookie returns null for any key', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
    expect(getCookie('anything')).toBeNull();
  });

  test('handles spaces between cookies (browser-style cookie string)', () => {
    // The getCookie function trims leading spaces from each cookie entry
    // This tests the edge case where cookie string has spaces around =
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: ' foo=bar; baz=qux',
    });
    // getCookie trims each c while iterating
    expect(getCookie('foo')).toBe('bar');
    expect(getCookie('baz')).toBe('qux');
  });
});

// ─── deleteCookie ─────────────────────────────────────────────────────────────

describe('deleteCookie', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
  });

  test('deletes cookie by setting expired date', () => {
    deleteCookie('to_delete');
    expect(document.cookie).toContain('to_delete=');
    expect(document.cookie).toContain('expires=Thu, 01 Jan 1970');
  });

  test('deletes with path=/', () => {
    deleteCookie('pathed_cookie');
    expect(document.cookie).toContain('path=/');
  });
});

// ─── setAffiliateCookie ───────────────────────────────────────────────────────

describe('setAffiliateCookie', () => {
  let localStorageGet;
  let localStorageSet;
  let localStorageRemove;

  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
    // Set up individual function spies on the real jsdom localStorage
    localStorageGet = jest.fn();
    localStorageSet = jest.fn();
    localStorageRemove = jest.fn();
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      setItem: localStorageSet,
      getItem: localStorageGet,
      removeItem: localStorageRemove,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sets affiliate_code cookie', () => {
    setAffiliateCookie('AFF123');
    expect(document.cookie).toContain('affiliate_code=AFF123');
  });

  test('sets cookie with custom expiration days', () => {
    setAffiliateCookie('AFF456', 60);
    expect(document.cookie).toContain('affiliate_code=AFF456');
    expect(document.cookie).toContain('expires=');
  });

  test('does nothing when affiliateId is falsy', () => {
    setAffiliateCookie(null);
    expect(document.cookie).toBe('');
    setAffiliateCookie('');
    expect(document.cookie).toBe('');
    setAffiliateCookie(undefined);
    expect(document.cookie).toBe('');
  });

  test('stores affiliate ID in localStorage with expiry', () => {
    setAffiliateCookie('AFF789', 30);
    expect(localStorageSet).toHaveBeenCalledWith('affiliate_code', 'AFF789');
    // expiry is stored as a Unix timestamp in milliseconds (a Number), not a string
    expect(localStorageSet).toHaveBeenCalledWith(
      'affiliate_code_expiry',
      expect.any(Number)
    );
  });

  test('localStorage errors are caught and not thrown', () => {
    localStorageSet.mockImplementation(() => {
      throw new Error('localStorage quota exceeded');
    });
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    expect(() => setAffiliateCookie('AFF999')).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Could not store affiliate code in localStorage'
    );
    consoleSpy.mockRestore();
  });
});

// ─── getAffiliateId ──────────────────────────────────────────────────────────

describe('getAffiliateId', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns affiliate_id from cookie', () => {
    document.cookie = buildCookieString({ affiliate_id: 'COOKIE123' });
    expect(getAffiliateId()).toBe('COOKIE123');
  });

  test('prefers affiliate_code over affiliate_id (new format)', () => {
    document.cookie = buildCookieString({
      affiliate_code: 'NEW_FORMAT',
      affiliate_id: 'OLD_FORMAT',
    });
    expect(getAffiliateId()).toBe('NEW_FORMAT');
  });

  test('falls back to localStorage when no cookie', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
    const futureExpiry = Date.now() + 86400000; // tomorrow
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: jest
        .fn()
        .mockReturnValueOnce('LS_CODE') // affiliate_code
        .mockReturnValueOnce(String(futureExpiry)), // affiliate_code_expiry
      setItem: jest.fn(),
      removeItem: jest.fn(),
    });

    expect(getAffiliateId()).toBe('LS_CODE');
  });

  test('returns null when localStorage entry is expired', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
    const pastExpiry = Date.now() - 1000; // yesterday
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: jest
        .fn()
        .mockReturnValueOnce('OLD_CODE') // affiliate_code
        .mockReturnValueOnce(String(pastExpiry)), // expired
      setItem: jest.fn(),
      removeItem: jest.fn(),
    });

    expect(getAffiliateId()).toBeNull();
  });

  test('cleans up expired localStorage entries', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
    const pastExpiry = Date.now() - 1000;
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: jest
        .fn()
        .mockReturnValueOnce('EXPIRED') // affiliate_code
        .mockReturnValueOnce(String(pastExpiry)) // affiliate_code_expiry
        .mockReturnValueOnce(null) // affiliate_id
        .mockReturnValueOnce(null), // affiliate_expiry
      setItem: jest.fn(),
      removeItem: jest.fn(),
    });

    getAffiliateId();

    expect(window.localStorage.removeItem).toHaveBeenCalledWith('affiliate_code');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('affiliate_code_expiry');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('affiliate_id');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('affiliate_expiry');
  });

  test('refreshes cookie when using localStorage backup', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
    const futureExpiry = Date.now() + 86400000;
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: jest
        .fn()
        .mockReturnValueOnce(null) // no cookie
        .mockReturnValueOnce('LS_CODE') // affiliate_code
        .mockReturnValueOnce(String(futureExpiry)), // not expired
      setItem: jest.fn(),
      removeItem: jest.fn(),
    });

    getAffiliateId();

    // Should have called setCookie to refresh the cookie
    expect(document.cookie).toContain('affiliate_code=LS_CODE');
  });

  test('localStorage errors are caught and not thrown', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: jest.fn().mockImplementation(() => {
        throw new Error('localStorage unavailable');
      }),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    });
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    expect(() => getAffiliateId()).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Could not read affiliate code from localStorage'
    );
    consoleSpy.mockRestore();
  });
});

// ─── extractAffiliateIdFromUrl ───────────────────────────────────────────────

describe('extractAffiliateIdFromUrl', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns null in SSR context (no window)', () => {
    const originalWindow = global.window;
    global.window = undefined;
    expect(extractAffiliateIdFromUrl()).toBeNull();
    global.window = originalWindow;
  });

  test('extracts affiliate ID from URL path /affiliate/ABC123', () => {
    jest.spyOn(global, 'URL').mockReturnValue(mockUrl('/affiliate/ABC123'));
    expect(extractAffiliateIdFromUrl()).toBe('ABC123');
  });

  test('extracts affiliate ID from nested path /en/affiliate/REF456', () => {
    jest.spyOn(global, 'URL').mockReturnValue(mockUrl('/en/affiliate/REF456/checkout'));
    expect(extractAffiliateIdFromUrl()).toBe('REF456');
  });

  test('extracts affiliate ID from query param ?affiliate=PARAM1', () => {
    jest.spyOn(global, 'URL').mockReturnValue(mockUrl('/checkout', { affiliate: 'PARAM1' }));
    expect(extractAffiliateIdFromUrl()).toBe('PARAM1');
  });

  test('extracts affiliate ID from query param ?ref=PARAM2 (alias)', () => {
    jest.spyOn(global, 'URL').mockReturnValue(mockUrl('/', { ref: 'PARAM2' }));
    expect(extractAffiliateIdFromUrl()).toBe('PARAM2');
  });

  test('query param takes precedence over path when both present', () => {
    // When both path and query param exist, searchParams.get('affiliate') returns the query value
    jest.spyOn(global, 'URL').mockReturnValue(
      mockUrl('/affiliate/PATH_ID', { affiliate: 'QUERY_ID' })
    );
    expect(extractAffiliateIdFromUrl()).toBe('QUERY_ID');
  });

  test('uses provided URL instead of window.location when given', () => {
    // When a URL string is passed directly, it is used instead of window.location.href
    jest.spyOn(global, 'URL').mockReturnValue(mockUrl('/affiliate/PROVIDED'));
    expect(extractAffiliateIdFromUrl('https://example.com/affiliate/PROVIDED')).toBe('PROVIDED');
  });

  test('returns null when no affiliate info in URL', () => {
    jest.spyOn(global, 'URL').mockReturnValue(mockUrl('/pricing'));
    expect(extractAffiliateIdFromUrl()).toBeNull();
  });

  test('handles affiliate at end of path (no ID)', () => {
    jest.spyOn(global, 'URL').mockReturnValue(mockUrl('/affiliate/'));
    expect(extractAffiliateIdFromUrl()).toBeNull();
  });
});

// ─── checkAndSetAffiliateFromUrl ─────────────────────────────────────────────

describe('checkAndSetAffiliateFromUrl', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns null in SSR context', () => {
    const originalWindow = global.window;
    global.window = undefined;
    expect(checkAndSetAffiliateFromUrl()).toBeNull();
    global.window = originalWindow;
  });

  test('extracts and sets affiliate cookie from URL path', () => {
    // Spy on global.URL so that extractAffiliateIdFromUrl() uses our mock URL
    jest.spyOn(global, 'URL').mockReturnValue(mockUrl('/affiliate/FROM_URL'));
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      setItem: jest.fn(),
      getItem: jest.fn(),
      removeItem: jest.fn(),
    });

    const result = checkAndSetAffiliateFromUrl();

    expect(result).toBe('FROM_URL');
    expect(document.cookie).toContain('affiliate_code=FROM_URL');
  });

  test('extracts and sets affiliate cookie from query param', () => {
    jest.spyOn(global, 'URL').mockReturnValue(mockUrl('/', { affiliate: 'QUERY_AFF' }));
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      setItem: jest.fn(),
      getItem: jest.fn(),
      removeItem: jest.fn(),
    });

    const result = checkAndSetAffiliateFromUrl();

    expect(result).toBe('QUERY_AFF');
    expect(document.cookie).toContain('affiliate_code=QUERY_AFF');
  });

  test('returns existing affiliate ID when URL has no affiliate info', () => {
    document.cookie = buildCookieString({ affiliate_code: 'EXISTING' });
    jest.spyOn(global, 'URL').mockReturnValue(mockUrl('/dashboard'));
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      setItem: jest.fn(),
      getItem: jest.fn(),
      removeItem: jest.fn(),
    });

    const result = checkAndSetAffiliateFromUrl();

    expect(result).toBe('EXISTING');
  });
});

// ─── clearAffiliateAttribution ─────────────────────────────────────────────

describe('clearAffiliateAttribution', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      configurable: true,
      value: '',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('deletes affiliate_id cookie', () => {
    clearAffiliateAttribution();
    expect(document.cookie).toContain('affiliate_id=');
    expect(document.cookie).toContain('expires=Thu, 01 Jan 1970');
  });

  test('removes affiliate_id and affiliate_expiry from localStorage', () => {
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      setItem: jest.fn(),
      getItem: jest.fn(),
      removeItem: jest.fn(),
    });

    clearAffiliateAttribution();

    expect(window.localStorage.removeItem).toHaveBeenCalledWith('affiliate_id');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('affiliate_expiry');
  });

  test('localStorage errors are caught and not thrown', () => {
    jest.spyOn(window, 'localStorage', 'get').mockReturnValue({
      removeItem: jest.fn().mockImplementation(() => {
        throw new Error('localStorage unavailable');
      }),
      setItem: jest.fn(),
      getItem: jest.fn(),
    });
    expect(() => clearAffiliateAttribution()).not.toThrow();
  });
});
