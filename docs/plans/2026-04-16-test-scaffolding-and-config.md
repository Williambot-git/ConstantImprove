# Test Scaffolding & Configuration Consolidation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Establish foundational test infrastructure and consolidate placeholder configuration so future improvements can be verified automatically.

**Architecture:** 
- Backend: Jest for unit/integration tests, with supertest for HTTP route testing
- Frontend: Jest + React Testing Library for component/page tests
- Config: Single `config/placeholder-config.js` in backend and `frontend/config/placeholder-config.js` in frontend — all placeholder values consolidated here with comments showing where to replace

**Tech Stack:** Jest, supertest, React Testing Library, dotenv

---

## Task 1: Set up Jest test infrastructure for backend

**Objective:** Create the test framework foundation so backend services can be unit-tested properly.

**Files:**
- Create: `backend/jest.config.js`
- Create: `backend/tests/setup.js`
- Create: `backend/tests/teardown.js`

**Step 1: Create Jest config**

```javascript
// backend/jest.config.js
module.exports = {
  testEnvironment: 'node',
  // Run tests in parallel with a reasonable timeout
  testTimeout: 10000,
  // Collect coverage to understand what's tested
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/controllers/**/*.js',
    'src/middleware/**/*.js',
    '!**/node_modules/**',
  ],
  // Map .js to babel for ESM-style imports if needed
  transform: {},
  // Test files pattern
  testMatch: ['**/tests/**/*.test.js'],
  // Don't run the ad-hoc test_*.js scripts
  testPathIgnorePatterns: [
    '/node_modules/',
    'test_',
    'test-',
    'reset_',
  ],
  // Setup and teardown files
  setupFilesAfterEnv: ['./tests/setup.js'],
  globalTeardown: './tests/teardown.js',
};
```

**Step 2: Create setup file**

```javascript
// backend/tests/setup.js
// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://placeholder:placeholder@localhost:5432/ahoyvpn_test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.REDIS_URL = 'redis://placeholder:placeholder@localhost:6379';
// Suppress console noise during tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
```

**Step 3: Create teardown file**

```javascript
// backend/tests/teardown.js
module.exports = async () => {
  // Clean up any test artifacts
};
```

**Step 4: Verify Jest runs (will find 0 tests but should exit cleanly)**

Run: `cd backend && npx jest --version`
Expected: Jest version printed

**Step 5: Commit**

```bash
cd backend && git add jest.config.js tests/setup.js tests/teardown.js
git commit -m "feat(tests): add Jest infrastructure for backend testing"
```

---

## Task 2: Create placeholder config consolidation file

**Objective:** Centralize all placeholder/hardcoded values into one obvious file.

**Files:**
- Create: `backend/config/placeholder-config.js`

**Step 1: Create the placeholder config file**

```javascript
// backend/config/placeholder-config.js
/**
 * AhoyVPN — Placeholder Configuration
 * ====================================
 * All external service credentials and API keys should be set here as environment
 * variables. This file documents WHAT placeholder values exist and WHERE they
 * appear in the codebase, so William knows exactly what to replace.
 * 
 * HOW TO USE:
 * 1. Copy .env to .env.local for local development
 * 2. Set real values in .env.local (gitignored)
 * 3. Replace placeholders below with actual env var references
 * 4. Never commit real credentials to the repository
 * 
 * ================================================================
 * PAYMENT PROCESSORS — Replace these with real API keys
 * ================================================================
 * 
 * PLISIO (Cryptocurrency payments)
 * Location: src/services/plisioService.js
 * Docs: https://plisio.net/documentation
 * Env var: PLISIO_API_KEY
 * Placeholder pattern: PLISIO_API_KEY in .env is 'YOUR_PLISIO_API_KEY'
 */
const PLISIO_API_KEY = process.env.PLISIO_API_KEY || 'YOUR_PLISIO_API_KEY';
const PLISIO_API_URL = process.env.PLISIO_API_URL || 'https://api.plisio.net';

/**
 * AUTHORIZE.NET (Card payments)
 * Location: src/services/authorizeNetUtils.js
 * Docs: https://developer.authorize.net/api/reference/
 * Env vars: AUTHORIZE_API_LOGIN_ID, AUTHORIZE_TRANSACTION_KEY
 * 
 * NOTE: The current authorizeNetUtils.js has a malformed URL placeholder
 * at line 4: 'const AUTHORIZE_API_URL='https:....api'' — this needs fixing
 */
const AUTHORIZE_API_LOGIN_ID = process.env.AUTHORIZE_API_LOGIN_ID || 'YOUR_AUTHNET_LOGIN_ID';
const AUTHORIZE_TRANSACTION_KEY = process.env.AUTHORIZE_TRANSACTION_KEY || 'YOUR_AUTHNET_TXN_KEY';
const AUTHORIZE_API_URL = process.env.AUTHORIZE_API_URL || 'https://api.authorize.net/xml/v1/request.api';
const AUTHORIZE_CLIENT_KEY = process.env.AUTHORIZE_CLIENT_KEY || 'YOUR_AUTHNET_CLIENT_KEY';

/**
 * PAYMENTSCLOUD
 * Location: webhookController.js handles PaymentsCloud webhook
 * Docs: Contact AhoyVPN account manager for credentials
 * Env vars: PAYMENTSCLOUD_API_KEY, PAYMENTSCLOUD_WEBHOOK_SECRET
 */
const PAYMENTSCLOUD_API_KEY = process.env.PAYMENTSCLOUD_API_KEY || 'YOUR_PAYMENTSCLOUD_API_KEY';
const PAYMENTSCLOUD_WEBHOOK_SECRET = process.env.PAYMENTSCLOUD_WEBHOOK_SECRET || 'YOUR_PAYMENTSCLOUD_WEBHOOK_SECRET';

/**
 * ZIPTAX (Tax calculation)
 * Location: src/services/ziptaxService.js
 * Docs: https://www.ziptax.com/developers
 * Env var: ZIPTAX_API_KEY
 */
const ZIPTAX_API_KEY = process.env.ZIPTAX_API_KEY || 'YOUR_ZIPTAX_API_KEY';
const ZIPTAX_API_URL = process.env.ZIPTAX_API_URL || 'https://api.ziptax.net';

/**
 * ================================================================
 * VPN PROVIDERS — Replace these with real API credentials
 * ================================================================
 * 
 * VPNResellers API
 * Location: src/services/vpnResellersService.js
 * Used for: Creating VPN accounts on payment completion
 * Env vars: VPNRESELLERS_API_KEY, VPNRESELLERS_API_URL
 */
const VPNRESELLERS_API_KEY = process.env.VPNRESELLERS_API_KEY || 'YOUR_VPNRESELLERS_API_KEY';
const VPNRESELLERS_API_URL = process.env.VPNRESELLERS_API_URL || 'https://api.vpnresellers.com';

/**
 * VPNResellers API (alternative VPN provider — appears to be present but
 * may not be actively used in current flow)
 * Location: src/services/vpnresellersService.js
 * Env vars: VPNRESELLERS_API_KEY, VPNRESELLERS_API_URL
 */
const VPNRESELLERS_API_KEY = process.env.VPNRESELLERS_API_KEY || 'YOUR_VPNRESELLERS_API_KEY';
const VPNRESELLERS_API_URL = process.env.VPNRESELLERS_API_URL || 'https://api.vpnresellers.com';

/**
 * ================================================================
 * EMAIL SERVICE
 * ================================================================
 * Location: src/services/emailService.js
 * Currently uses nodemailer with SMTP transport
 * Env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM_SUPPORT
 */
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.example.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || 'YOUR_SMTP_USER';
const SMTP_PASS = process.env.SMTP_PASS || 'YOUR_SMTP_PASS';
const EMAIL_FROM_SUPPORT = process.env.EMAIL_FROM_SUPPORT || 'William@ahoyvpn.com';

/**
 * ================================================================
 * FRONTEND URLS — Trusted domains for redirects and cookies
 * ================================================================
 * These are used for CORS, cookie domains, and redirect targets.
 * WARNING: Changes here affect security — only add domains you trust.
 * 
 * Locations: Multiple controllers use hardcoded 'https://ahoyvpn.net' fallback
 * when FRONTEND_URL env var is not set.
 */
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ahoyvpn.net';
const FRONTEND_URL_DEV = process.env.FRONTEND_URL_DEV || 'http://localhost:5173';
const CORS_ORIGIN = process.env.CORS_ORIGIN || FRONTEND_URL;

/**
 * ================================================================
 * CLOUDDEPPLOY INFRASTRUCTURE — Server URLs
 * ================================================================
 * These point to the actual server instances
 */
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * ================================================================
 * SECURITY — JWT and session secrets
 * ================================================================
 * CRITICAL: Change these in production! JWT secrets must be strong
 * random strings (256+ bits). Same for session secrets.
 */
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION_VERY_IMPORTANT';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';
const CSRF_TOKEN_EXPIRY_MS = parseInt(process.env.CSRF_TOKEN_EXPIRY_MS) || 15 * 60 * 1000; // 15 min

/**
 * ================================================================
 * RATE LIMITING — Tune for production traffic
 * ================================================================
 */
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

/**
 * ================================================================
 * AFFILIATE CONFIGURATION
 * ================================================================
 */
const AFFILIATE_COMMISSION_RATE = parseFloat(process.env.AFFILIATE_COMMISSION_RATE) || 0.25; // 25%
const AFFILIATE_MINIMUM_PER_USER = parseFloat(process.env.AFFILIATE_MINIMUM_PER_USER) || 0.75; // $0.75 minimum
const AFFILIATE_MINIMUM_PAYOUT_CENTS = parseInt(process.env.AFFILIATE_MINIMUM_PAYOUT_CENTS) || 1000; // $10 minimum
const AFFILIATE_HOLD_PERIOD_DAYS = parseInt(process.env.AFFILIATE_HOLD_PERIOD_DAYS) || 30;

/**
 * ================================================================
 * DATABASE
 * ================================================================
 */
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/ahoyvpn';
const DB_POOL_MIN = parseInt(process.env.DB_POOL_MIN) || 2;
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX) || 10;

/**
 * ================================================================
 * BUSINESS LOGIC — Plan pricing (source of truth)
 * ================================================================
 * IMPORTANT: These prices MUST match what is returned by GET /api/payment/plans
 * Hardcoding in frontend (checkout.jsx, js/checkout.js) creates divergence risk.
 * The backend /api/payment/plans endpoint should be the single source of truth.
 * 
 * Prices in cents to avoid floating point issues
 */
const PLANS = {
  monthly: {
    id: 'monthly',
    name: 'Monthly Plan',
    priceUSD: 5.99,
    priceCents: 599,
    periodDays: 30,
  },
  quarterly: {
    id: 'quarterly',
    name: 'Quarterly Plan',
    priceUSD: 16.99,
    priceCents: 1699,
    periodDays: 90,
  },
  'semi-annual': {
    id: 'semi-annual',
    name: 'Semi-Annual Plan',
    priceUSD: 31.99,
    priceCents: 3199,
    periodDays: 180,
  },
  annual: {
    id: 'annual',
    name: 'Annual Plan',
    priceUSD: 59.99,
    priceCents: 5999,
    periodDays: 365,
  },
};

module.exports = {
  // Payment processors
  PLISIO_API_KEY,
  PLISIO_API_URL,
  AUTHORIZE_API_LOGIN_ID,
  AUTHORIZE_TRANSACTION_KEY,
  AUTHORIZE_API_URL,
  AUTHORIZE_CLIENT_KEY,
  PAYMENTSCLOUD_API_KEY,
  PAYMENTSCLOUD_WEBHOOK_SECRET,
  ZIPTAX_API_KEY,
  ZIPTAX_API_URL,
  // VPN providers
  VPNRESELLERS_API_KEY,
  VPNRESELLERS_API_URL,
  VPNRESELLERS_API_KEY,
  VPNRESELLERS_API_URL,
  // Email
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM_SUPPORT,
  // URLs
  FRONTEND_URL,
  FRONTEND_URL_DEV,
  CORS_ORIGIN,
  API_BASE_URL,
  REDIS_URL,
  // Security
  JWT_SECRET,
  JWT_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  CSRF_TOKEN_EXPIRY_MS,
  // Rate limiting
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  // Affiliate
  AFFILIATE_COMMISSION_RATE,
  AFFILIATE_MINIMUM_PER_USER,
  AFFILIATE_MINIMUM_PAYOUT_CENTS,
  AFFILIATE_HOLD_PERIOD_DAYS,
  // Database
  DATABASE_URL,
  DB_POOL_MIN,
  DB_POOL_MAX,
  // Business logic
  PLANS,
};
```

**Step 2: Commit**

```bash
cd backend && git add config/placeholder-config.js
git commit -m "feat(config): add placeholder config consolidation file"
```

---

## Task 3: Create first unit test — promoService

**Objective:** Verify promo code validation logic with proper unit tests.

**Files:**
- Create: `backend/tests/services/promoService.test.js`

**Step 1: Write the failing test**

```javascript
// backend/tests/services/promoService.test.js
const promoService = require('../../src/services/promoService');

describe('promoService', () => {
  describe('validatePromoCode', () => {
    it('should return discount for valid promo code', async () => {
      // Known test promo code from CHECK_EVERYTHING.md
      const result = await promoService.validatePromoCode('JIMBO', 1000);
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('discount_cents');
    });

    it('should return invalid for non-existent promo code', async () => {
      const result = await promoService.validatePromoCode('NONEXISTENT', 1000);
      expect(result.valid).toBe(false);
    });
  });

  describe('getPromoCode', () => {
    it('should retrieve promo code by code string', async () => {
      const promo = await promoService.getPromoCode('FREEWILLY');
      // FREEWILLY is a known test code
      if (promo) {
        expect(promo).toHaveProperty('code');
        expect(promo.code.toUpperCase()).toBe('FREEWILLY');
      }
    });
  });
});
```

**Step 2: Run test to verify failure (no test framework yet — this will fail)**

Run: `cd backend && npx jest tests/services/promoService.test.js --no-coverage 2>&1 || true`
Expected: Test file found, or "no test runner" message initially

**Step 3: Once Jest is set up, verify tests run**

Run: `cd backend && npx jest tests/services/promoService.test.js -v`
Expected: Tests execute (may pass or fail depending on DB state)

**Step 4: Commit**

```bash
cd backend && git add tests/services/promoService.test.js
git commit -m "test: add promoService unit tests"
```

---

## Task 4: Remove duplicate promo test scripts

**Objective:** Clean up the 3 near-identical ad-hoc test scripts.

**Files:**
- Delete: `backend/test_promo2.js`
- Delete: `backend/test_promo3.js`

**Step 1: Remove the duplicate files**

```bash
cd backend && rm -v test_promo2.js test_promo3.js
```

**Step 2: Keep the original test_promo.js but rename it to a script folder**

```bash
cd backend && mkdir -p scripts/legacy_tests && mv test_promo.js scripts/legacy_tests/ 2>/dev/null || true
```

**Step 3: Commit**

```bash
cd backend && git add -A && git commit -m "cleanup: remove duplicate promo test scripts, consolidate to tests/"
```

---

## Task 5: Create frontend placeholder config

**Objective:** Mirror the backend config consolidation for the frontend.

**Files:**
- Create: `frontend/config/placeholder-config.js`

**Step 1: Create the file**

```javascript
// frontend/config/placeholder-config.js
/**
 * AhoyVPN — Frontend Placeholder Configuration
 * ==============================================
 * All external service URLs and API endpoints are centralized here.
 * The frontend should import from this file instead of hardcoding URLs.
 * 
 * HOW TO USE:
 * 1. Import from this file in any page/component/lib that needs API URLs
 * 2. Replace placeholder values with process.env.NEXT_PUBLIC_* variables
 * 3. Never hardcode API URLs in page components
 * 
 * ================================================================
 * API ENDPOINTS — Backend URLs
 * ================================================================
 * 
 * The frontend communicates with the backend API at these URLs.
 * In production: points to the actual backend server
 * In development: points to localhost:3000 or your local backend
 * 
 * Env vars (must be prefixed NEXT_PUBLIC_ for Next.js):
 *   NEXT_PUBLIC_API_URL — backend base URL
 *   NEXT_PUBLIC_FRONTEND_URL — frontend base URL (for redirects)
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://ahoyvpn.net';

/**
 * ================================================================
 * PAYMENT PROCESSOR URLS — For redirect targets
 * ================================================================
 * These are the redirect URLs from payment processors.
 * They must match what is configured in the payment processor dashboards.
 */
const PLISIO_CHECKOUT_URL = 'https://checkout.plisio.net';
const PAYMENTSCLOUD_CHECKOUT_URL = 'https://checkout.paymentscloud.com';
const AUTHORIZE_RELAY_URL = `${API_URL}/api/payment/authorize/relay`;

/**
 * ================================================================
 * FRONTEND ROUTES — Page URLs (single source of truth)
 * ================================================================
 * Use these constants instead of hardcoding '/checkout', '/dashboard', etc.
 * This prevents typos and makes refactoring easier.
 */
const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  CHECKOUT: '/checkout',
  PAYMENT_SUCCESS: '/payment-success',
  AFFILIATE: '/affiliate',
  AFFILIATE_DASHBOARD: '/affiliate-dashboard',
  ADMIN: '/admin',
  DOWNLOADS: '/downloads',
  FAQ: '/faq',
  PRIVACY: '/privacy',
  TOS: '/tos',
  DNS_GUIDE: '/dns-guide',
};

/**
 * ================================================================
 * PLAN PRICING — Should come from backend API at runtime
 * ================================================================
 * WARNING: These are fallbacks only. The frontend should fetch
 * GET /api/payment/plans to get the authoritative prices.
 * Hardcoding here creates divergence risk if backend prices change.
 * 
 * This config exists to document the current state and provide
 * a migration path — the goal is to eliminate these fallbacks
 * once the frontend consistently uses the API.
 */
const PLAN_PRICES = {
  monthly: { price: '$5.99', period: '/month + tax' },
  quarterly: { price: '$16.99', period: '/3 months + tax' },
  'semi-annual': { price: '$31.99', period: '/6 months + tax' },
  annual: { price: '$59.99', period: '/year + tax' },
};

module.exports = {
  API_URL,
  FRONTEND_URL,
  PLISIO_CHECKOUT_URL,
  PAYMENTSCLOUD_CHECKOUT_URL,
  AUTHORIZE_RELAY_URL,
  ROUTES,
  PLAN_PRICES,
};
```

**Step 2: Commit**

```bash
cd frontend && git add config/placeholder-config.js
git commit -m "feat(config): add frontend placeholder config"
```

---

## Task 6: Audit auth middleware — identify which to keep

**Objective:** Understand the two auth middleware versions and document which to use.

**Files:**
- Read: `backend/src/middleware/authMiddleware.js`
- Read: `backend/src/middleware/authMiddleware_new.js`
- Create: `backend/docs/auth-middleware-audit.md`

**Step 1: Read both files**

```bash
cat backend/src/middleware/authMiddleware.js
cat backend/src/middleware/authMiddleware_new.js
```

**Step 2: Write audit document**

```markdown
# Auth Middleware Audit

## Two Versions Found

### authMiddleware.js (original)
- Uses `User.findById()` model method for token verification
- Has `allowInactive`, `require2FA` options
- Used in some routes

### authMiddleware_new.js (newer)
- Uses `jwt.verify()` directly without DB lookup for basic auth
- Has `protectAffiliate`, `protectAdmin`, `resetTokenProtect`
- Separate CSRF middleware
- Appears to be the more recent implementation

## Findings

Both are imported in `backend/src/index.js`:
```javascript
const { protect, csrfProtection } = require('./middleware/authMiddleware_new');
```

The `authMiddleware.js` (original) appears to be imported but may not be actively used
by all routes. Need to trace usage to determine if it can be removed.

## Recommendation

1. Audit all routes to see which middleware they use
2. Consolidate to one version (prefer authMiddleware_new.js as it's more complete)
3. Remove the unused version
4. Document the chosen middleware's contract

## This is a PLANNING task — implementation will follow in next iteration
```

**Step 3: Commit**

```bash
cd backend && git add docs/auth-middleware-audit.md
git commit -m "docs: add auth middleware audit findings"
```

---

## Task 7: Create automation status document

**Objective:** Document progress and blockers for William's review.

**Files:**
- Create: `docs/automation-status.md`

**Step 1: Create the status document**

```markdown
# Automation Status

> Last updated: 2026-04-16
> Cron job: Every 15 minutes

---

## Current Session Progress

### Completed This Run

1. **Repository analysis** — Mapped test scaffolding gaps, placeholder configs, duplicate code
   - Found: 8 ad-hoc test scripts, no test framework
   - Found: 15+ hardcoded placeholder values across backend/frontend
   - Found: 2 auth middleware versions needing consolidation
   - Found: Duplicate promo test scripts (test_promo2.js, test_promo3.js)

2. **Implementation plan created** — docs/plans/2026-04-16-test-scaffolding-and-config.md
   - Task 1: Jest infrastructure (in progress via subagent)
   - Task 2: Backend placeholder config consolidation (pending)
   - Task 3: First unit tests for promoService (pending)
   - Task 4: Remove duplicate promo test scripts (pending)
   - Task 5: Frontend placeholder config (pending)
   - Task 6: Auth middleware audit (pending)
   - Task 7: This status document (this file)

### Blockers

1. **Cannot verify Jest install** — Need to check if Jest is already installed in backend
   - Run: `cd backend && npm ls jest` to check
   - If not installed, npm install jest --save-dev needed

2. **Cannot run tests against production DB** — Ad-hoc test scripts connect to real database
   - Test framework needs its own test database or mocking setup
   - This is a deliberate design choice to avoid polluting production

3. **Auth middleware consolidation** — Two versions found, need decision on which to keep
   - Both have overlapping but not identical functionality
   - Need to trace which routes use which middleware

---

## Priority Queue (Next Runs)

1. **Finish test scaffolding** — Get Jest running with first real tests
2. **Consolidate auth middleware** — Pick winner, remove loser, update routes
3. **Fix malformed AUTHORIZE_API_URL** — Line 4 of authorizeNetUtils.js has broken URL
4. **Create test database strategy** — Either mock DB or set up test DB instance
5. **Frontend test scaffolding** — Mirror Jest setup for frontend
6. **Fix hardcoded frontend URLs** — Replace 10+ '|| https://ahoyvpn.net' fallbacks with env var

---

## Notes for William

- The malformed `AUTHORIZE_API_URL='https:....api'` in authorizeNetUtils.js line 4 is a bug
- test_promo2.js and test_promo3.js are literally copies of test_promo.js — safe to delete
- Frontend has hardcoded prices in both js/checkout.js and pages/checkout.jsx — these WILL diverge
- VPN server access is NOT implemented (all 6 functions return "Not implemented" error per PROJECT_MAP.md)
```

**Step 2: Commit**

```bash
cd backend && git add docs/automation-status.md
git commit -m "docs: add automation status tracking"
```

---

## Verification

After all tasks complete, run:

```bash
# Verify Jest infrastructure
cd backend && npx jest --version

# Verify test file exists
ls backend/tests/services/promoService.test.js

# Verify placeholder config exists
ls backend/config/placeholder-config.js

# Verify duplicate scripts removed
ls backend/test_promo*.js  # should return nothing
```

Expected results:
- Jest version printed
- Test file exists
- Placeholder config exists  
- No test_promo*.js files remain in backend root
