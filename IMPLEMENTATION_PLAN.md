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
- All 413 backend tests passing ✅

---

## Next Priority Tasks

See `docs/automation-status.md` Priority Queue (Section 3) for the full backlog.

Top candidates after this session:
1. **ahoymanController unit tests** (969 lines, 0% coverage, 31 endpoints)
2. **authController unit tests** (659 lines, 0% coverage)
3. **webhookController unit tests** (679 lines, 0% coverage)
4. **Frontend checkout component additional edge-case coverage**
5. **Frontend auth flow integration tests**

---

## Recent Test Coverage Progress

| Task | Tests | Coverage | Commit |
|------|-------|----------|--------|
| customerController | 43 tests | 0% (staggered) | aee0277 |
| adminController | 40 tests | 82.5% | 7e3c117 |
| invoicePollingService | 13 tests | 97.26% | bef2373 |
| paymentProcessingService | 10 tests | 96.82% | 2924be3 |
| paymentController routes | 33 tests | 63.66% | staged |

*Total backend tests: 413 | Total frontend tests: 277*
