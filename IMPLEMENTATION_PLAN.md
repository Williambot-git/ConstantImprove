# Fixing Circular Dependency: invoicePollingService ↔ webhookController

## Problem Analysis

**Circular dependency chain:**
```
invoicePollingService.js
  └─ imports processPlisioPaymentAsync from webhookController.js
  
webhookController.js
  └─ imports plisioService, promoService, emailService, userService, authorizeNetUtils
  └─ imports applyAffiliateCommissionIfEligible from paymentController.js
```

**Where processPlisioPaymentAsync is used:**
- `invoicePollingService.js` lines 67, 82 (polling service)
- `webhookController.js` line 212 (inside `plisioWebhook` handler)

**Dependencies of processPlisioPaymentAsync:**
- `db` (database)
- `plisioService` (invoice status, switched invoice resolution)
- `promoService.markPromoCodeUsed()`
- `emailService.sendAccountCreatedEmail()`
- `createVpnAccount` from userService
- `applyAffiliateCommissionIfEligible` from paymentController

---

## Implementation Plan

### Step 1: Create `paymentProcessingService.js`

Extract `processPlisioPaymentAsync` into a new shared service:

**File:** `/tmp/Decontaminate/backend/src/services/paymentProcessingService.js`

```javascript
const db = require('../config/database');
const plisioService = require('./plisioService');
const promoService = require('./promoService');
const emailService = require('./emailService');
const { createVpnAccount } = require('./userService');
const { applyAffiliateCommissionIfEligible } = require('../controllers/paymentController');

async function processPlisioPaymentAsync(invoice_id, tx_id, amount, currency) {
  // Full implementation moved from webhookController.js lines 223-390
  // (see actual file for complete code)
}

module.exports = {
  processPlisioPaymentAsync
};
```

### Step 2: Update `invoicePollingService.js`

**Before (line 4):**
```javascript
const { processPlisioPaymentAsync } = require('../controllers/webhookController');
```

**After:**
```javascript
const { processPlisioPaymentAsync } = require('./paymentProcessingService');
```

### Step 3: Update `webhookController.js`

**Before (line 11):**
```javascript
const { createVpnAccount } = require('../services/userService');
```
(Note: webhookController no longer needs to import createVpnAccount directly since it's used only inside processPlisioPaymentAsync which is now moved)

**Before (line 13):**
```javascript
const { applyAffiliateCommissionIfEligible } = require('./paymentController');
```
(Note: Same — this is now imported by paymentProcessingService)

**After:**
Remove the above two imports if they are not used elsewhere in webhookController.
Remove `processPlisioPaymentAsync` from the `module.exports` at line 846.

### Step 4: Write Unit Tests for `invoicePollingService`

**File:** `/tmp/Decontaminate/backend/tests/unit/invoicePollingService.test.js`

Test coverage:
- `runOnce()` — normal polling with no matching subscriptions
- `runOnce()` — subscription at checkpoint, invoice completed → calls processPlisioPaymentAsync
- `runOnce()` — subscription at checkpoint, cancelled/duplicate with activeInvoiceId → calls processPlisioPaymentAsync
- `runOnce()` — subscription at checkpoint, no payment yet → updates metadata
- `runOnce()` — subscription exceeds max poll attempts → skips
- `runOnce()` — handles plisioService.getInvoiceStatus error gracefully
- `pollArbSubscriptions()` — ARB suspended → deactivates VPN
- `pollArbSubscriptions()` — ARB settled → activates subscription
- `pollArbSubscriptions()` — handles error gracefully

---

## Files Summary

| Action | File |
|--------|------|
| **CREATE** | `src/services/paymentProcessingService.js` |
| **CREATE** | `tests/unit/invoicePollingService.test.js` |
| **MODIFY** | `src/services/invoicePollingService.js` (1 line) |
| **MODIFY** | `src/controllers/webhookController.js` (remove 3 imports + 1 export) |

---

## Verification

After implementing:

1. **Syntax check:** `node --check src/services/paymentProcessingService.js`
2. **Syntax check:** `node --check src/services/invoicePollingService.js`
3. **Syntax check:** `node --check src/controllers/webhookController.js`
4. **Run tests:** `npm test -- tests/unit/invoicePollingService.test.js`
5. **Verify no circular import error** when requiring any of the three modules

---

## Risk Assessment

- **Low risk** — purely a refactor moving one async function to a shared service
- `processPlisioPaymentAsync` signature is unchanged
- Callers (`invoicePollingService`, `plisioWebhook`) require zero logic changes
- Invoice polling should continue to work identically
- No database schema changes
