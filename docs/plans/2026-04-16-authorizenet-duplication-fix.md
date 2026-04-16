# AuthorizeNetService Duplication Fix

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Eliminate duplicate `AuthorizeNetService` class — one lives in `authorizeNetUtils.js` (shared, used by webhook/invoicePolling/customer), another inline in `paymentController.js`. Consolidate into a single canonical service.

**Architecture:** Keep the full-featured class in `authorizeNetUtils.js` as the canonical service. Migrate paymentController to use it via dependency injection or import. The duplicate class has diverged — consolidation prevents future sync bugs.

**Tech Stack:** Node.js, existing Authorize.net XML API

---

## Context: Why This Matters

**Two `AuthorizeNetService` classes exist:**

| File | Lines | Used by | Key methods |
|------|-------|---------|------------|
| `authorizeNetUtils.js` | 114–201 | webhookController, invoicePollingService, customerController | `getArbSubscription`, `getTransactionDetails`, `cancelSubscription`, `_makeRequest` |
| `paymentController.js` (inline) | 31–795 | paymentController itself | `createTransaction`, `getHostedFormUrl`, `getApiEndpoint`, ARB creation |

Both import the same `paymentConfig` credentials but have **no awareness of each other**. Adding a feature (e.g., a new ARB method) requires updating two files — guaranteed to drift.

**Scope:** This plan ONLY consolidates the ARB/transaction-detail methods. `paymentController.createTransaction` (line ~1770) and other payment-specific flows are out of scope — they require supertest integration tests to verify behavior, which is a larger task.

---

## Task 1: Audit the inline AuthorizeNetService in paymentController.js

**Objective:** Document exactly which methods of the inline class are actually called from within paymentController.

**Files:**
- Read: `backend/src/controllers/paymentController.js` lines 31–795 (inline class + all usages)

**Step 1: List all method calls to the inline AuthorizeNetService**

Run: `grep -n "authorizeNetService\." backend/src/controllers/paymentController.js`
Output: Every call site within paymentController that invokes the local `authorizeNetService` instance (created at line 797).

**Step 2: For each call site, record method name and line number**

Example output format:
```
Line 1686: authorizeNetService.createHostedPaymentPage(...)
Line 1770: authorizeNetService.createTransaction(...)
Line 2652: authorizeNetService.createArbSubscriptionFromProfile(...)
```

**Step 3: Check if paymentController's inline class has any methods NOT also in authorizeNetUtils.js**

Run: Compare methods in `authorizeNetUtils.js` (lines 114–201) vs inline class (lines 31–795)
List methods unique to the inline class.

**Step 4: Commit**

```bash
cd /tmp/Decontaminate
git add -A
git commit -m "docs: audit AuthorizeNetService usage in paymentController"
```

---

## Task 2: Consolidate — make paymentController use authorizeNetUtils.js AuthorizeNetService

**Objective:** Replace the local `authorizeNetService = new AuthorizeNetService()` at line 797 with an import from `authorizeNetUtils.js`.

**Files:**
- Modify: `backend/src/controllers/paymentController.js` line 797 (replace instantiation with import)

**Step 1: Read the inline class methods used by paymentController**

Document which methods from the inline class are actually invoked (from Task 1 above).

**Step 2: Check if authorizeNetUtils AuthorizeNetService has equivalent methods**

Read `authorizeNetUtils.js` lines 114–201. For each method paymentController calls, check if the canonical class has it:
- `createHostedPaymentPage` — does authorizeNetUtils have this?
- `createTransaction` — does authorizeNetUtils have this?
- `createArbSubscriptionFromProfile` — does authorizeNetUtils have this?

**Step 3: If methods are missing, add them to authorizeNetUtils.js**

If the inline class has methods not in the canonical service, add those methods to `authorizeNetUtils.js`.

Example addition to AuthorizeNetService class in authorizeNetUtils.js:
```javascript
async createHostedPaymentPage(options) {
  return this._makeRequest({ createHostedPaymentPageRequest: { ... } });
}

async createTransaction(amount, cardData, billingInfo) {
  // moved from paymentController inline class
}

async createArbSubscriptionFromProfile(opts) {
  // moved from paymentController inline class
}
```

**Step 4: Update paymentController to import from authorizeNetUtils**

**Before (line 25):**
```javascript
const { getAuthorizeTransactionDetails } = require('../services/authorizeNetUtils');
```

**After (line 25):**
```javascript
const { getAuthorizeTransactionDetails, AuthorizeNetService } = require('../services/authorizeNetUtils');
```

**Before (line 797):**
```javascript
const authorizeNetService = new AuthorizeNetService();
```

**After:**
```javascript
// Uses the shared AuthorizeNetService from authorizeNetUtils.js
const authorizeNetService = new AuthorizeNetService();
```

**Step 5: Remove the duplicate inline class**

Delete lines 31–795 (the inline `class AuthorizeNetService { ... }`) from paymentController.js.

**Step 6: Syntax check**

```bash
node --check backend/src/controllers/paymentController.js
node --check backend/src/services/authorizeNetUtils.js
```

**Step 7: Run tests**

```bash
cd backend && npm test
```

Expected: All 197 tests pass (no behavioral change).

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor: consolidate AuthorizeNetService — single class in authorizeNetUtils.js"
```

---

## Task 3: Final verification

**Objective:** Confirm the refactor is correct end-to-end.

**Step 1: Verify no remaining duplicate class**

Run: `grep -rn "class AuthorizeNetService" backend/src/`
Expected: Only `authorizeNetUtils.js` defines it.

**Step 2: Verify all callers resolve to the same class**

Run: `grep -rn "new AuthorizeNetService()" backend/src/`
Expected: All `new AuthorizeNetService()` calls resolve to the canonical class in authorizeNetUtils.js.

**Step 3: Run full test suite**

```bash
cd backend && npm test
```
Expected: 197 tests pass.

**Step 4: Commit final state**

```bash
git add -A
git commit -m "docs: confirm AuthorizeNetService consolidation — no regressions"
```

---

## Files Summary

| Action | File |
|--------|------|
| **MODIFY** | `backend/src/services/authorizeNetUtils.js` (add missing methods from inline class) |
| **MODIFY** | `backend/src/controllers/paymentController.js` (replace inline class with import, remove duplicate class definition) |

---

## Risk Assessment

- **Low risk** — purely a refactor, no behavioral changes
- Methods are moved verbatim from inline class to canonical location
- All existing callers of `authorizeNetUtils.js` continue working
- paymentController's `authorizeNetService` is the same class instance, just defined in one place
- No database changes
- Tests confirm no regressions
