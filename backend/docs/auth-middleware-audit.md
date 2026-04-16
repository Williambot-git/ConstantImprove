# Auth Middleware Audit

> **Status:** ✅ RESOLVED — `authMiddleware.js` deleted, all routes consolidated onto `authMiddleware_new.js`

## Resolution Summary (2026-04-16)

## 1. Overview of Both Middleware Files

### authMiddleware.js (Original)
**Location:** `src/middleware/authMiddleware.js`  
**Lines:** 138  
**Exports:** `protect`, `allowInactive`, `require2FA`

**Key characteristics:**
- Uses MongoDB `User` model (`User.findById`)
- `protect` middleware handles both API routes and web page redirects
- For non-API routes: redirects to `/login.html?redirect=<url>`
- For API routes: returns JSON `401` errors
- Supports both `id` (customer tokens) and `userId` (legacy) JWT formats
- `allowInactive`: skips active-user check for specific routes (e.g., plans endpoint)
- `require2FA`: checks `req.user.totp_enabled` with 30-minute window
- Heavy use of `console.error` for debugging/logging

### authMiddleware_new.js (New/Extended)
**Location:** `src/middleware/authMiddleware_new.js`  
**Lines:** 347  
**Exports:** `protect`, `protectAffiliate`, `protectAdmin`, `csrfProtection`, `requireRole`, `requireAffiliate`, `require2FA`, `loginRateLimiter`, `accountLockout`, `generateCsrfToken`, `storeCsrfToken`, `verifyCsrfToken`, `setCsrfTokenCookie`, `resetTokenProtect`

**Key characteristics:**
- Uses PostgreSQL directly via `db.query()` — no MongoDB dependency
- JSON-only responses (no web page redirects)
- `PUBLIC_PATHS` whitelist: skips auth for login/register/recovery endpoints
- Role-specific middleware: `protectAffiliate`, `protectAdmin`
- Full CSRF protection with token generation/storage/verification
- Rate limiting via `loginRateLimiter` (5 attempts per 15 minutes)
- Account lockout via `accountLockout` middleware
- 2FA uses 15-minute verification window (vs 30 in original)
- `resetTokenProtect`: handles password reset token flow

## 2. Usage Analysis

### authMiddleware (original) Usage
| File | Import Style | Functions Used |
|------|--------------|----------------|
| `src/routes/authRoutes.js` | Named import | `protect` |
| `src/routes/paymentRoutes.js` | Named import | `allowInactive` |
| `src/routes/subscriptionRoutes.js` | Namespace import (`authMiddleware`) | `authMiddleware.protect` |
| `src/routes/supportRoutes.js` | Namespace import (`authMiddleware`) | `authMiddleware.protect` |
| `src/routes/vpnRoutes.js` | Namespace import (`authMiddleware`) | `authMiddleware.protect` |
| `src/routes/userRoutes.js` | Namespace import (`authMiddleware`) | `authMiddleware.protect`, `authMiddleware.require2FA` |

**Total routes using original:** 6

### authMiddleware_new Usage
| File | Functions Used |
|------|----------------|
| `src/index.js` | `protect`, `csrfProtection` |
| `src/routes/affiliateDashboardRoutes.js` | `protectAffiliate`, `csrfProtection` |
| `src/routes/authRoutes_csrf.js` | `protect`, `csrfProtection` |
| `src/routes/affiliateRoutes.js` | `protectAffiliate`, `protectAdmin`, `loginRateLimiter` |
| `src/routes/affiliateAuthRoutes.js` | `protectAffiliate`, `csrfProtection`, `loginRateLimiter`, `setCsrfTokenCookie`, `resetTokenProtect` |
| `src/routes/adminRoutes.js` | `protectAdmin`, `loginRateLimiter` |
| `src/routes/customerRoutes.js` | `protect`, `csrfProtection`, `require2FA`, `loginRateLimiter`, `accountLockout` |
| `src/routes/ahoymanRoutes.js` | `protectAdmin` |

**Dual import (both files):** 4 routes import BOTH middleware versions:
- `subscriptionRoutes.js` — imports `authMiddleware.protect` + `authMiddleware_new.csrfProtection`
- `supportRoutes.js` — imports `authMiddleware.protect` + `authMiddleware_new.csrfProtection`
- `vpnRoutes.js` — imports `authMiddleware.protect` + `authMiddleware_new.csrfProtection`
- `userRoutes.js` — imports `authMiddleware.protect` + `authMiddleware_new.csrfProtection`

**Total routes using new:** 12 (including index.js)

## 3. Findings

### Finding 1: Original authMiddleware.js IS still actively used
The original middleware is NOT dead code. It is used by:
- `authRoutes.js` — customer auth
- `paymentRoutes.js` — `allowInactive` for payment/subscription flows
- `subscriptionRoutes.js`, `supportRoutes.js`, `vpnRoutes.js`, `userRoutes.js` — using `authMiddleware.protect`

### Finding 2: Dual imports create inconsistency
Four routes import BOTH files and mix functions:
```js
const authMiddleware = require('../middleware/authMiddleware');
const { csrfProtection, setCsrfToken } = require('../middleware/authMiddleware_new');
// ...
router.use(authMiddleware.protect);  // from original
// but also using csrfProtection from new
```

This means these routes use two different `protect` implementations simultaneously.

### Finding 3: Duplicate require2FA implementations
Both files export `require2FA` with different logic:
- **Original:** checks `req.user.totp_enabled`, 30-minute window, uses MongoDB
- **New:** queries DB directly for `totp_enabled` and `last_2fa_verification`, 15-minute window, uses PostgreSQL

### Finding 4: Different auth patterns
- **Original:** MongoDB User model, web redirects for non-API
- **New:** PostgreSQL only, pure JSON API

This suggests a migration from MongoDB to PostgreSQL is in progress but incomplete.

### Finding 5: No clear canonical version
Both files are being actively developed and used. The "new" file is more feature-rich but the "original" persists because some routes still need the MongoDB-based auth or web redirect behavior.

## 4. Recommendation

### Recommended Canonical Version: `authMiddleware_new.js`

**Rationale:**
1. **Feature superset** — includes all original functionality (protect, require2FA) plus CSRF, rate limiting, account lockout, role-based access
2. **PostgreSQL-native** — aligns with the apparent DB migration direction
3. **Broader adoption** — 12 usage points vs 6 for original
4. **CSRF protection** — critical security feature absent in original
5. **Rate limiting & lockout** — production-grade security features

### Actions Required to Consolidate

1. **Migrate remaining original middleware consumers to new:**
   - `authRoutes.js` → change `require('../middleware/authMiddleware')` to use `protect` from `authMiddleware_new`
   - `paymentRoutes.js` → `allowInactive` needs to be ported to new file or reimplemented
   - Routes using dual imports (`subscriptionRoutes.js`, `supportRoutes.js`, `vpnRoutes.js`, `userRoutes.js`) → remove namespace import of original, use `protect` from new

2. **Port missing functionality from original to new:**
   - `allowInactive` from original → add to `authMiddleware_new.js` (or determine if still needed after PostgreSQL migration)
   - Web redirect behavior for non-API routes (if still needed)

3. **Remove duplicate `require2FA`:**
   - The `require2FA` in original should be removed after migration; ensure `authMiddleware_new`'s version covers all use cases

4. **Delete `authMiddleware.js` after migration:**
   - Once all consumers are migrated, delete the original file
   - Update `authMiddleware_new.js` filename to `authMiddleware.js` for cleaner imports

5. **Update `src/index.js`:**
   - Currently imports from `authMiddleware_new` — after consolidation, update import path accordingly

### Risk Note
The migration from MongoDB to PostgreSQL auth is not complete. Until all routes use the PostgreSQL-based `authMiddleware_new`, there is a risk of inconsistency where some user lookups go to MongoDB and others to PostgreSQL.
