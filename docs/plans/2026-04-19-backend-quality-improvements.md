# Backend Quality Improvements Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Clean up debug console.log statements from production services and improve service layer robustness.

**Architecture:** Two independent tasks targeting debug logging in production services.

---

## Task 1: Remove debug console.log from plisioService.js

**Objective:** Remove the debug console.log statement that logs raw Plisio API responses in production code.

**Files:**
- Modify: `backend/src/services/plisioService.js` (line 31)

**Step 1: Read the file context**

```bash
grep -n -B2 -A2 "console.log" /tmp/Decontaminate/backend/src/services/plisioService.js
```

**Step 2: Remove the debug statement**

The line 31 in plisioService.js reads:
```javascript
console.log('Plisio createInvoice raw response:', JSON.stringify(response.data, null, 2));
```

This debug logging of raw API responses should be removed. Replace it with nothing (delete the line).

**Step 3: Run tests to verify no regression**

Run: `cd /tmp/Decontaminate/backend && npm test -- tests/services/plisioService.test.js`
Expected: PASS (all 9 tests pass)

**Step 4: Commit**

```bash
cd /tmp/Decontaminate
git add backend/src/services/plisioService.js
git commit -m "fix(plisioService): remove debug console.log of raw API response"
```

---

## Task 2: Remove informational console.log from paymentProcessingService.js

**Objective:** The success-path console.log statements in paymentProcessingService (lines 89, 154, 162, 182, 287) are useful during development but should use a proper logging utility in production. Currently these log payment outcomes (commission credited, promo code used, referral found) which could be handled by a structured logger instead.

**Files:**
- Modify: `backend/src/services/paymentProcessingService.js`

**Note:** These are informational success logs, not debug logs. They indicate:
- Line 89: Promo code usage
- Line 154: Referral code found
- Line 162: Commission credited
- Line 182: Payment processed successfully (Plisio)
- Line 287: PaymentsCloud payment processed

These are lower priority. Only remove if they contain sensitive data or if the noise level in logs is problematic. They do NOT log sensitive payment details (card numbers, etc.) — they log affiliate/promo identifiers and subscription IDs.

**Verification step:**

```bash
cd /tmp/Decontaminate && grep -n "console.log" backend/src/services/paymentProcessingService.js
```

If the logs are deemed acceptable for production (they don't leak PII and are useful for operations), document them as intentional. If they should be removed:

```javascript
// REMOVE these lines:
Line 89:  console.log(`Promo code ${subscription.promo_code_id} marked as used`);
Line 154: console.log(`Referral code found: ${subscription.referral_code}`);
Line 162: console.log(`💰 Commission $${(commissionCents / 100).toFixed(2)} credited for referral`);
Line 182: console.log(`✅ Payment processed for user ${userId}, subscription ${subscription.id}`);
Line 287: console.log(`✅ PaymentsCloud payment processed for user ${userId}, subscription ${subscription.id}`);
```

**Step 3: Run tests**

Run: `cd /tmp/Decontaminate/backend && npm test -- tests/services/paymentProcessingService.test.js`
Expected: PASS

**Step 4: Commit**

```bash
git add backend/src/services/paymentProcessingService.js
git commit -m "fix(paymentProcessingService): remove informational console.logs from success paths"
```

---

## Task 3: Document remaining console.log statements

**Objective:** Audit all remaining console.log statements in backend/src/ and categorize them as intentional (operations) vs. debug vs. error logging.

**Files to check:**
- `backend/src/services/` (all services)

**Step 1: Audit remaining console.log statements**

```bash
grep -rn "console\.(log|warn|error)" backend/src/services/ --include="*.js"
```

**Step 2: For each service, document the purpose of each logging statement**

Categorize as:
- **Operational** (normal events: startup, shutdown, scheduled tasks) — KEEP
- **Error** (error conditions that need operator attention) — KEEP
- **Debug** (development-only diagnostics that shouldn't fire in production) — REMOVE
- **Security** (audit events) — KEEP with appropriate redaction

**Step 3: Update this file with findings**

---

## Verification

After all tasks:

```bash
cd /tmp/Decontaminate/backend && npm test 2>&1 | tail -10
# Expected: all 1,144 tests pass
cd /tmp/Decontaminate && npm test 2>&1 | tail -10
# Expected: all 781 frontend tests pass
```
