/**
 * Unit tests for securityMiddleware.js
 *
 * Covers:
 * - cspConfig structure and directives
 * - ScriptIntegrityMonitor class methods
 * - paymentSecurityMiddleware behavior
 * - handleCSPReport endpoint
 */

const {
  cspConfig,
  ScriptIntegrityMonitor,
  paymentSecurityMiddleware,
  handleCSPReport
} = require('../../src/middleware/securityMiddleware');

describe('securityMiddleware', () => {
  // =============================================================================
  // cspConfig Tests
  // =============================================================================
  describe('cspConfig', () => {
    test('has required directive keys', () => {
      expect(cspConfig.directives).toBeDefined();
      expect(typeof cspConfig.directives).toBe('object');

      // Required directive keys per CSP spec
      expect(cspConfig.directives.defaultSrc).toBeDefined();
      expect(cspConfig.directives.baseUri).toBeDefined();
      expect(cspConfig.directives.scriptSrc).toBeDefined();
      expect(cspConfig.directives.styleSrc).toBeDefined();
      expect(cspConfig.directives.imgSrc).toBeDefined();
      expect(cspConfig.directives.connectSrc).toBeDefined();
      expect(cspConfig.directives.frameAncestors).toBeDefined();
      expect(cspConfig.directives.objectSrc).toBeDefined();
    });

    test('defaultSrc uses self-only restrictive policy', () => {
      expect(cspConfig.directives.defaultSrc).toEqual(["'self'"]);
    });

    test('frameAncestors is set to none (clickjacking protection)', () => {
      expect(cspConfig.directives.frameAncestors).toEqual(["'none'"]);
    });

    test('objectSrc is set to none (plugin protection)', () => {
      expect(cspConfig.directives.objectSrc).toEqual(["'none'"]);
    });

    test('scriptSrcAttr is set to none (no inline event handlers)', () => {
      expect(cspConfig.directives.scriptSrcAttr).toEqual(["'none'"]);
    });

    test('formAction allows payment processor domains', () => {
      const formAction = cspConfig.directives.formAction;
      expect(formAction).toContain("'self'");
      expect(formAction).toContain('https://plisio.com');
      expect(formAction).toContain('https://*.plisio.com');
      expect(formAction).toContain('https://paymentscloud.com');
      expect(formAction).toContain('https://*.paymentscloud.com');
      expect(formAction).toContain('https://accept.authorize.net');
      expect(formAction).toContain('https://test.authorize.net');
    });

    test('scriptSrc allows payment processor and Cloudflare scripts', () => {
      const scriptSrc = cspConfig.directives.scriptSrc;
      expect(scriptSrc).toContain("'self'");
      expect(scriptSrc).toContain('https://static.cloudflareinsights.com');
      expect(scriptSrc).toContain('https://js.plisio.com');
      expect(scriptSrc).toContain('https://*.plisio.com');
      expect(scriptSrc).toContain('https://paymentscloud.com');
      expect(scriptSrc).toContain('https://*.paymentscloud.com');
      expect(scriptSrc).toContain('https://accept.authorize.net');
      expect(scriptSrc).toContain('https://test.authorize.net');
    });

    test('connectSrc allows Plisio and PaymentsCloud APIs', () => {
      const connectSrc = cspConfig.directives.connectSrc;
      expect(connectSrc).toContain("'self'");
      expect(connectSrc).toContain('https://api.plisio.com');
      expect(connectSrc).toContain('https://*.plisio.com');
      expect(connectSrc).toContain('https://api.paymentscloud.com');
      expect(connectSrc).toContain('https://*.paymentscloud.com');
      expect(connectSrc).toContain('https://accept.authorize.net');
      expect(connectSrc).toContain('https://test.authorize.net');
      expect(connectSrc).toContain('https://maps.googleapis.com');
    });

    test('imgSrc allows data: URIs for inline images', () => {
      const imgSrc = cspConfig.directives.imgSrc;
      expect(imgSrc).toContain("'self'");
      expect(imgSrc).toContain('data:');
      expect(imgSrc).toContain('https:');
      expect(imgSrc).toContain('blob:');
    });

    test('reportOnly is false (enforce CSP, not report-only)', () => {
      expect(cspConfig.reportOnly).toBe(false);
    });

    test('reportUri is set to security CSP report endpoint', () => {
      expect(cspConfig.reportUri).toBe('/api/security/csp-report');
    });
  });

  // =============================================================================
  // ScriptIntegrityMonitor Tests
  // =============================================================================
  describe('ScriptIntegrityMonitor', () => {
    const NODE_ENV = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = NODE_ENV;
    });

    describe('constructor', () => {
      test('creates instance with empty scriptHashes map', () => {
        const monitor = new ScriptIntegrityMonitor();
        expect(monitor.scriptHashes).toBeInstanceOf(Map);
        expect(monitor.scriptHashes.size).toBe(0);
      });

      test('enables monitoring in production', () => {
        process.env.NODE_ENV = 'production';
        const monitor = new ScriptIntegrityMonitor();
        expect(monitor.monitoringEnabled).toBe(true);
      });

      test('disables monitoring in non-production', () => {
        process.env.NODE_ENV = 'development';
        const monitor = new ScriptIntegrityMonitor();
        expect(monitor.monitoringEnabled).toBe(false);
      });
    });

    describe('generateSRIHash', () => {
      test('generates sha384 hash in base64 format', () => {
        const monitor = new ScriptIntegrityMonitor();
        const content = 'console.log("test")';
        const hash = monitor.generateSRIHash(content);

        expect(hash).toMatch(/^sha384-[A-Za-z0-9+/=]+$/);
        expect(hash.startsWith('sha384-')).toBe(true);
      });

      test('generates different hashes for different content', () => {
        const monitor = new ScriptIntegrityMonitor();
        const hash1 = monitor.generateSRIHash('content1');
        const hash2 = monitor.generateSRIHash('content2');
        expect(hash1).not.toEqual(hash2);
      });

      test('generates same hash for same content (deterministic)', () => {
        const monitor = new ScriptIntegrityMonitor();
        const content = 'console.log("test")';
        const hash1 = monitor.generateSRIHash(content);
        const hash2 = monitor.generateSRIHash(content);
        expect(hash1).toEqual(hash2);
      });
    });

    describe('registerScript', () => {
      test('stores expected hash for a URL', () => {
        const monitor = new ScriptIntegrityMonitor();
        monitor.registerScript('https://example.com/script.js', 'sha384-abc123');

        expect(monitor.scriptHashes.get('https://example.com/script.js')).toBe('sha384-abc123');
      });

      test('can register multiple scripts', () => {
        const monitor = new ScriptIntegrityMonitor();
        monitor.registerScript('https://example.com/script1.js', 'sha384-hash1');
        monitor.registerScript('https://example.com/script2.js', 'sha384-hash2');

        expect(monitor.scriptHashes.size).toBe(2);
        expect(monitor.scriptHashes.get('https://example.com/script1.js')).toBe('sha384-hash1');
        expect(monitor.scriptHashes.get('https://example.com/script2.js')).toBe('sha384-hash2');
      });

      test('overwrites existing hash for same URL', () => {
        const monitor = new ScriptIntegrityMonitor();
        monitor.registerScript('https://example.com/script.js', 'sha384-old');
        monitor.registerScript('https://example.com/script.js', 'sha384-new');

        expect(monitor.scriptHashes.get('https://example.com/script.js')).toBe('sha384-new');
        expect(monitor.scriptHashes.size).toBe(1);
      });
    });

    describe('verifyScriptIntegrity', () => {
      test('returns true when monitoring is disabled', async () => {
        process.env.NODE_ENV = 'development';
        const monitor = new ScriptIntegrityMonitor();
        const result = await monitor.verifyScriptIntegrity('https://example.com/script.js', 'content');

        expect(result).toBe(true);
      });

      test('returns true when hash matches', async () => {
        process.env.NODE_ENV = 'production';
        const monitor = new ScriptIntegrityMonitor();
        const content = 'console.log("test")';
        const hash = monitor.generateSRIHash(content);
        monitor.registerScript('https://example.com/script.js', hash);

        const result = await monitor.verifyScriptIntegrity('https://example.com/script.js', content);
        expect(result).toBe(true);
      });

      test('returns false when hash does not match', async () => {
        process.env.NODE_ENV = 'production';
        const monitor = new ScriptIntegrityMonitor();
        monitor.registerScript('https://example.com/script.js', 'sha384-expected');

        const result = await monitor.verifyScriptIntegrity('https://example.com/script.js', 'tampered content');
        expect(result).toBe(false);
      });

      test('returns false and warns when no hash is registered', async () => {
        process.env.NODE_ENV = 'production';
        const monitor = new ScriptIntegrityMonitor();
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const result = await monitor.verifyScriptIntegrity('https://example.com/unknown.js', 'content');

        expect(result).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith('No expected hash registered for script: https://example.com/unknown.js');

        consoleSpy.mockRestore();
      });
    });

    describe('alertIntegrityFailure', () => {
      test('logs security alert in production', () => {
        process.env.NODE_ENV = 'production';
        const monitor = new ScriptIntegrityMonitor();
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      monitor.alertIntegrityFailure('https://example.com/script.js', 'sha384-expected', 'sha384-actual');

      expect(consoleSpy).toHaveBeenCalled();
      // console.error is called with two separate arguments: label + JSON string
      expect(consoleSpy.mock.calls[0][0]).toBe('SECURITY ALERT:');
      const parsed = JSON.parse(consoleSpy.mock.calls[0][1]);
      expect(parsed.type).toBe('SCRIPT_INTEGRITY_FAILURE');
      expect(parsed.url).toBe('https://example.com/script.js');
      expect(parsed.severity).toBe('HIGH');

      consoleSpy.mockRestore();
    });

    test('does not log in non-production', () => {
      // Ensure NODE_ENV is explicitly development before creating monitor
      process.env.NODE_ENV = 'development';
      const monitor = new ScriptIntegrityMonitor();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      monitor.alertIntegrityFailure('https://example.com/script.js', 'sha384-expected', 'sha384-actual');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
    });

    describe('middleware', () => {
      test('calls next() immediately when monitoring is disabled', () => {
        process.env.NODE_ENV = 'development';
        const monitor = new ScriptIntegrityMonitor();
        const middleware = monitor.middleware();
        const req = { url: '/script.js' };
        const res = {};
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
      });

      test('calls next() for non-script URLs when monitoring is enabled', () => {
        process.env.NODE_ENV = 'production';
        const monitor = new ScriptIntegrityMonitor();
        const middleware = monitor.middleware();
        const req = { url: '/api/users' };
        const res = {};
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
      });

      test('logs script request when monitoring is enabled', () => {
        process.env.NODE_ENV = 'production';
        const monitor = new ScriptIntegrityMonitor();
        const middleware = monitor.middleware();
        const req = { url: '/static/script.js' };
        const res = {};
        const next = jest.fn();
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        middleware(req, res, next);

        expect(consoleSpy).toHaveBeenCalledWith('Script request: /static/script.js');
        expect(next).toHaveBeenCalledTimes(1);

        consoleSpy.mockRestore();
      });

      test('logs script request for /scripts/ path', () => {
        process.env.NODE_ENV = 'production';
        const monitor = new ScriptIntegrityMonitor();
        const middleware = monitor.middleware();
        const req = { url: '/scripts/app.js' };
        const res = {};
        const next = jest.fn();
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        middleware(req, res, next);

        expect(consoleSpy).toHaveBeenCalledWith('Script request: /scripts/app.js');
        expect(next).toHaveBeenCalledTimes(1);

        consoleSpy.mockRestore();
      });
    });
  });

  // =============================================================================
  // paymentSecurityMiddleware Tests
  // =============================================================================
  describe('paymentSecurityMiddleware', () => {
    const createMockReqRes = (path = '/payment/checkout') => ({
      req: { path },
      res: {
        setHeader: jest.fn(),
        getHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      },
      next: jest.fn()
    });

    test('skips non-payment routes', () => {
      const { req, res, next } = createMockReqRes('/api/users');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('skips /payment path routes', () => {
      const { req, res, next } = createMockReqRes('/payment/subscribe');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('skips /checkout path routes', () => {
      const { req, res, next } = createMockReqRes('/checkout');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('sets X-Content-Type-Options header', () => {
      const { req, res, next } = createMockReqRes('/payment/checkout');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    test('sets X-Frame-Options DENY header', () => {
      const { req, res, next } = createMockReqRes('/payment/checkout');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    test('sets X-XSS-Protection header', () => {
      const { req, res, next } = createMockReqRes('/payment/checkout');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    });

    test('sets Cache-Control no-store header', () => {
      const { req, res, next } = createMockReqRes('/payment/checkout');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    });

    test('sets Pragma no-cache header', () => {
      const { req, res, next } = createMockReqRes('/payment/checkout');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    });

    test('sets Expires 0 header', () => {
      const { req, res, next } = createMockReqRes('/payment/checkout');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
    });

    test('applies to nested payment paths', () => {
      const { req, res, next } = createMockReqRes('/payment/vpn/subscribe');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('applies to /checkout page routes', () => {
      const { req, res, next } = createMockReqRes('/checkout/plan');
      paymentSecurityMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // handleCSPReport Tests
  // =============================================================================
  describe('handleCSPReport', () => {
    const NODE_ENV = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = NODE_ENV;
    });

    test('returns 204 status (no content)', () => {
      process.env.NODE_ENV = 'development';
      const req = { body: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn()
      };

      handleCSPReport(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalledTimes(1);
    });

    test('logs CSP violation report via console.warn', () => {
      process.env.NODE_ENV = 'development';
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      try {
        const cspReport = {
          'csp-report': {
            'document-uri': 'https://example.com/page',
            'violated-directive': 'script-src',
            'blocked-uri': 'https://evil.com/script.js'
          }
        };
        const req = { body: cspReport };
        const res = {
          status: jest.fn().mockReturnThis(),
          end: jest.fn()
        };

        handleCSPReport(req, res);

        expect(consoleSpy).toHaveBeenCalled();
        // console.warn('CSP Violation Report:', JSON.stringify(report, null, 2))
        // First arg is label string, second arg is the formatted JSON string of the report
        expect(consoleSpy.mock.calls[0][0]).toBe('CSP Violation Report:');
        const jsonArg = consoleSpy.mock.calls[0][1];
        // The formatted JSON starts with a newline due to JSON.stringify(report, null, 2)
        expect(jsonArg).toContain('"document-uri": "https://example.com/page"');
        expect(jsonArg).toContain('"violated-directive": "script-src"');
      } finally {
        consoleSpy.mockRestore();
      }
    });

    test('logs security alert in production via console.error', () => {
      process.env.NODE_ENV = 'production';
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      try {
        const cspReport = { 'csp-report': { 'document-uri': 'https://example.com' } };
        const req = { body: cspReport };
        const res = {
          status: jest.fn().mockReturnThis(),
          end: jest.fn()
        };

        handleCSPReport(req, res);

        expect(consoleSpy).toHaveBeenCalled();
        // console.error('CSP VIOLATION:', JSON.stringify(auditLog))
        expect(consoleSpy.mock.calls[0][0]).toBe('CSP VIOLATION:');
        const parsed = JSON.parse(consoleSpy.mock.calls[0][1]);
        expect(parsed.type).toBe('CSP_VIOLATION');
      } finally {
        consoleSpy.mockRestore();
      }
    });

    test('does not call console.error in non-production', () => {
      process.env.NODE_ENV = 'development';
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      try {
        const req = { body: {} };
        const res = {
          status: jest.fn().mockReturnThis(),
          end: jest.fn()
        };

        handleCSPReport(req, res);

        expect(consoleSpy).not.toHaveBeenCalled();
      } finally {
        consoleSpy.mockRestore();
      }
    });

    test('handles empty body gracefully', () => {
      process.env.NODE_ENV = 'development';
      const req = { body: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn()
      };

      // Should not throw
      expect(() => handleCSPReport(req, res)).not.toThrow();
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });
});
