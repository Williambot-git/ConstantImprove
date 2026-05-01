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
- All 1,221 backend tests passing ✅

---

## Current Backend Coverage (2026-04-21)

Overall: **94.8% statements | 83.1% branches | 98.6% functions | 94.7% lines**

| Controller / Service | Stmt % | Branch % | Notes |
|----------------------|--------|----------|-------|
| adminController.js | 87.65 | 80.00 | 22 endpoints, 40 tests |
| affiliateAuthController.js | 99.28 | 98.36 | 1 line uncovered (110) |
| affiliateController.js | 100 | 98.63 | 1 line uncovered (262) |
| affiliateDashboardController.js | 100 | 98.03 | 1 line uncovered (305) |
| ahoymanController.js | 92.08 | 83.49 | 969 lines, 96 tests |
| authController.js | 95.43 | 97.72 | 659 lines, 66 tests |
| authController_csrf.js | 97.40 | 100 | 2 lines uncovered (173-174) |
| customerController.js | 90.28 | 88.50 | 43 tests |
| exportController.js | 94.50 | 100 | 55.55% funcs (unused fallback route) |
| pageController.js | 100 | 95.45 | 1 line uncovered (609) |
| paymentController.js | 84.58 | 67.47 | Large file (1705 lines), 53 tests |
| subscriptionController.js | 98.09 | 96.42 | 2 lines uncovered (36-37) |
| supportController.js | 100 | 100 | ✅ Full coverage |
| userController.js | 95.65 | 92.30 | |
| vpnController.js | 100 | 88.88 | 14 tests |
| webhookController.js | 86.86 | 63.71 | 75 tests |
| authorizeNetUtils.js | 99.13 | 83.10 | |
| cleanupService.js | 100 | 66.66 | Low branch due to untested error-throw paths |
| emailService.js | 100 | 90.00 | |
| exportService.js | 100 | 89.28 | |
| invoicePollingService.js | 93.90 | 68.88 | |
| paymentProcessingService.js | 100 | 87.09 | |
| plisioService.js | 96.66 | 63.33 | |
| promoService.js | 98.00 | 96.42 | |
| vpnresellersService.js | 100 | 83.78 | |
| userService.js | 99.13 | 83.09 | |
| vpnAccountScheduler.js | 97.67 | 100 | |
| vpnResellersService.js | 100 | 100 | ✅ Full coverage |
| ziptaxService.js | 100 | 96.29 | ✅ Full coverage |

**Total backend tests: 1,221 | Total frontend tests: 957 | Combined: 2,178**

---

## Remaining Coverage Opportunities

### High-value branch coverage improvements

1. **paymentController.js — 84.58% stmt / 67.47% branch**
   - 1,705 lines, 53 tests
   - Major uncovered: lines 51, 125-143 (param validation), 411-415, 762, 908, 1066, 1182-1184, 1212, 1290-1320, 1480-1578, 1592, 1666
   - These are error-handling branches, validateMiddleware catch blocks, and edge-case payment flows

2. **webhookController.js — 86.86% stmt / 63.71% branch**
   - 594 lines, 75 tests
   - Uncovered: inner catch blocks (404-417, 503-529, 542-560), null-handling branches (377-381, 445)
   - Many inner catch blocks are structurally similar to already-tested outer catch patterns

3. **invoicePollingService.js — 93.90% stmt / 68.88% branch**
   - Uncovered: lines 116-117, 231-232 (error-throw branches)

4. **cleanupService.js — 100% stmt / 66.66% branch**
   - Error-throw branches in cleanup functions not exercised in tests

5. **plisioService.js — 96.66% stmt / 63.33% branch**
   - Line 45 uncovered (likely error-throw path)

### Frontend test gaps

1. **recover.jsx** — component validated, test file removed due to mock isolation issues; needs rewrite with proper mock reset pattern
2. **Checkout flow edge cases** — additional error/loading state tests
3. **Auth flow integration tests** — full login→dashboard→logout flow

---

## Past Milestones

| Date | Achievement |
|------|-------------|
| 2026-04-21 | 2,178 total tests (1,221 backend + 957 frontend) |
| 2026-04-21 | recover.jsx client-side validation added |
| 2026-04-21 | register, payment-success, affiliate-agreement page tests |
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
