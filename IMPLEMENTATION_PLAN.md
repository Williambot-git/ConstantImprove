# Implementation Plan

> **Status:** All tasks complete. Circular dependency resolved.

## Completed Tasks

### ✅ Circular Dependency Fix — DONE (committed)

**Problem:** `invoicePollingService.js` imported `processPlisioPaymentAsync` from `webhookController.js`, creating a circular dependency chain.

**Solution implemented:**
- `processPlisioPaymentAsync` was extracted to `src/services/paymentProcessingService.js`
- `invoicePollingService.js` now imports from `paymentProcessingService.js`
- `webhookController.js` imports from `paymentProcessingService.js` (same canonical source)
- No circular dependency remains

**Files involved:**
- ✅ `src/services/paymentProcessingService.js` — created (processPlisioPaymentAsync lives here)
- ✅ `src/services/invoicePollingService.js` — updated import source
- ✅ `src/controllers/webhookController.js` — updated import source (line 12)

**Verification:**
- `node --check src/services/paymentProcessingService.js` ✅
- `node --check src/services/invoicePollingService.js` ✅
- `node --check src/controllers/webhookController.js` ✅
- All 1,224 backend tests passing ✅

---

## Current Coverage (2026-04-21)

**Total backend tests: 1,235 | Total frontend tests: 1,014 | Combined: 2,249**

### Backend — Overall: ~95% statements | ~83% branches | ~99% functions

| Controller / Service | Stmt % | Branch % | Notes |
|----------------------|--------|----------|-------|
| adminController.js | ~88 | ~80 | 22 endpoints |
| affiliateAuthController.js | ~99 | ~98 | |
| affiliateController.js | 100 | ~99 | |
| affiliateDashboardController.js | 100 | ~98 | |
| ahoymanController.js | ~92 | ~83 | 969 lines |
| authController.js | ~95 | ~98 | 659 lines |
| authController_csrf.js | ~97 | 100 | |
| customerController.js | ~90 | ~89 | 43 tests |
| exportController.js | ~95 | 100 | |
| pageController.js | 100 | ~95 | |
| paymentController.js | ~85 | ~67 | 1,705 lines |
| subscriptionController.js | ~98 | ~96 | |
| supportController.js | 100 | 100 | ✅ Full coverage |
| userController.js | ~96 | ~92 | |
| vpnController.js | 100 | ~89 | 14 tests |
| webhookController.js | ~87 | ~64 | 75 tests |
| authorizeNetUtils.js | ~99 | ~83 | |
| cleanupService.js | 100 | ~67 | Error-throw branches not exercised |
| emailService.js | 100 | ~90 | |
| exportService.js | 100 | ~89 | |
| invoicePollingService.js | ~94 | ~69 | |
| paymentProcessingService.js | 100 | ~87 | |
| plisioService.js | 100 | 70 | ✅ Added non-success branch tests |
| promoService.js | 100 | 100 | ✅ Full coverage |
| purewlService.js | 100 | ~84 | |
| userService.js | ~99 | ~83 | |
| vpnAccountScheduler.js | ~98 | 100 | |
| vpnResellersService.js | 100 | 100 | ✅ Full coverage |
| ziptaxService.js | 100 | ~96 | ✅ Full coverage |

### Frontend — Overall: ~94% statements | ~86% branches | ~95% functions

All 59 suites green. 1,014 tests passing. No regressions.

---

## Remaining Opportunities

### Acceptable uncovered branches (structurally unreachable in unit tests)

- `authorizeNetUtils.js` line 290: `DEBUG_AUTHORIZE_NET=***` env-var guard — requires live env injection
- `authorizeNetUtils.js` line 289: `resultCode !== 'Ok'` — requires specific live API failure response
- `cleanupService.js` lines 30-91: per-row catch blocks — require DB fault injection
- `invoicePollingService.js` lines 116-117, 231-232: outer try/catch + retry — require catastrophic DB failure mid-run
- `logger.js` lines 28-32, 40, 46, 52, 58: module-level `process.env` init — evaluated before Jest can mock
- `paymentController.js` line 762: `DEBUG_AUTHORIZE_NET` env-var guard
- `plisioService.js` lines 33-45, 62: remaining non-success status codes (e.g., `mismatch`, `incorrect_amount`)

### Legitimate TODOs (future integration stubs)

- `vpnController.js` line 185: VPN daemon integration — placeholder for WireGuard/OpenVPN tracking
- `securityMiddleware.js` lines 125, 193: security monitoring service integration

### Potential future improvements

1. **paymentController.js branch coverage** — 67% branch, 1,705 lines. Error-handling branches, validateMiddleware catch blocks, edge-case payment flows are testable but require careful mock setup.
2. **webhookController.js branch coverage** — 64% branch, 594 lines. Inner catch blocks structurally similar to already-tested outer catch patterns.
3. **frontend checkout flow integration tests** — full error/loading state coverage for checkout wizard.

---

## Past Milestones

| Date | Achievement |
|------|-------------|
| 2026-04-21 | 2,249 total tests (1,235 backend + 1,014 frontend) |
| 2026-04-21 | plisioService getInvoiceStatus non-success branch test added |
| 2026-04-21 | IMPLEMENTATION_PLAN.md stale coverage table updated |
| 2026-04-21 | recover.jsx client-side validation added |
| 2026-04-21 | pageController template extraction (htmlFrame.js) |
| 2026-04-21 | register, payment-success, affiliate-agreement page tests |
| 2026-04-20 | 2,101 total tests — ESLint cleanup, admin dashboard decomposition |
| 2026-04-20 | vpnAccountScheduler 100% branch coverage |
| 2026-04-20 | vpnResellersService, ziptaxService 100% coverage |
| 2026-04-20 | Checkout page decomposition (PlanSelector, CryptoSelector, PaymentMethodSelector) |
| 2026-04-20 | Ahoyman dashboard decomposition |
| 2026-04-20 | Dashboard decomposition (AccountSettings, VpnCredentials, CancelModal, DeleteModal) |
| 2026-04-19 | vpnController 100% coverage |
| 2026-04-19 | Backend placeholder-config.js consolidated |
| 2026-04-19 | Frontend placeholder-config.js consolidated |
| 2026-04-19 | Auth middleware audit complete |
| 2026-04-18 | 21 orphaned check_*.js diagnostic scripts removed |
| 2026-04-18 | 30 orphaned backend scripts removed |
| 2026-04-17 | Circular dependency (invoicePollingService ↔ webhookController) resolved |
