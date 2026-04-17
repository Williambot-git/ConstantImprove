# Backend Coverage Improvements — paymentController, webhookController, customerController, adminController

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Increase line coverage on 4 backend controllers from ~75-85% to ~88-95% by adding targeted error-handler and branch tests.

**Architecture:** Express controllers, Jest with db.query mocking, supertest-style mock res objects.

**Tech Stack:** Jest, bcrypt, crypto mocks (follow existing test patterns).

---

## Strategy

All 4 target controllers have existing tests with good scaffolding. We add NEW test cases targeting specifically the uncovered blocks. Each uncovered block is either:
1. An error handler (`catch (error) { console.error(...); res.status(500)... }`)
2. A conditional branch not exercised (e.g., `if (!user || !user.is_active)`)

**Approach:** Add new `describe('Error handling')` blocks to each controller's test file with mocks that trigger the error paths.

---

## Task 1: paymentController — Improve from 73.86% to 83%+

**Objective:** Add error-handler tests targeting uncovered lines in paymentController.js

**Files:**
- Modify: `backend/tests/paymentController.test.js`
- Test subject: `backend/src/controllers/paymentController.js`

**Step 1: Read existing test file structure**

```bash
cd /tmp/Decontaminate/backend && wc -l tests/paymentController.test.js
```

Read the test file to understand the mock setup pattern (db.query, User model, jwt utils, etc.).

**Step 2: Identify exact uncovered blocks**

The uncovered lines are:
- **50**: `if (result.rows.length === 0)` — plan not found
- **136-154**: Legacy direct-card flow (fallback only)
- **422-426**: authorizeRelayResponse error handler
- **646**: authorizeRelayResponse responseCode ≠ '1' path
- **794**: General error in hosted redirect
- **858-940**: Legacy direct-card flow error handlers
- **966-1006**: Another hostedRedirectBridge error path
- **1156**: Response logging error
- **1272-1274**: createCheckout error handler
- **1302**: US billing path error
- **1402-1432**: Full createCheckout error path

**Step 3: Add error-handler tests**

Add a new `describe('Error handling')` block. Each test mocks db.query to throw, then asserts the 500 response.

```javascript
describe('Error handling', () => {
  test('getHostedRedirectBridge — throws 500 when db query fails', async () => {
    mockDbQuery.mockReset();
    mockDbQuery.mockImplementation(() => Promise.reject(new Error('DB error')));
    await controller.getHostedRedirectBridge(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('hostedRedirectScript — throws 500 when db query fails', async () => {
    // Similar pattern for the hosted redirect script error path
  });

  test('authorizeRelayResponse — throws 500 when db query fails', async () => {
    mockDbQuery.mockReset();
    mockDbQuery.mockImplementation(() => Promise.reject(new Error('DB error')));
    req.body = { ... };
    await controller.authorizeRelayResponse(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  
  // Add more for each uncovered error handler
});
```

**Step 4: Run tests**

```bash
cd /tmp/Decontaminate/backend && npx jest tests/paymentController.test.js --coverage --silent 2>&1 | grep -E "paymentController|Tests:|PASS|FAIL"
```

Expected: All existing tests pass + new tests pass. Coverage improves to 83%+.

**Step 5: Commit**

```bash
cd /tmp/Decontaminate/backend && git add tests/paymentController.test.js && git commit -m "test(paymentController): add error-handler coverage tests"
```

---

## Task 2: webhookController — Improve from 76.24% to 88%+

**Files:**
- Modify: `backend/tests/webhookController.test.js`
- Test subject: `backend/src/controllers/webhookController.js`

**Step 1: Read existing test structure**

```bash
cd /tmp/Decontaminate/backend && wc -l tests/webhookController.test.js
```

**Step 2: Uncovered blocks**

- **214**: `verifyWebhookSignature` error path
- **263**: plisioWebhook signature verification failure
- **284-359**: plisio webhook — invoice not found / status checks / error cases
- **404-408**: authorizeNetWebhook error handler
- **469-473**: authorizeNetWebhook transaction not approved path
- **496-509**: Another authorizeNetWebhook error path
- **580-606**: paymentsCloudWebhook error handlers
- **619-637**: Another paymentsCloudWebhook path
- **643**: verifyWebhookSignature error
- **653-654**: verifyWebhookSignature else path
- **659-660**: Unknown webhook source error

**Step 3: Add tests for webhook error handlers**

```javascript
describe('Error handling', () => {
  test('verifyWebhookSignature — throws 500 when hmac verification fails', async () => {
    // Mock crypto to throw
  });

  test('plisioWebhook — throws 500 on signature verification failure', async () => {
    // req.headers['x-plisio-signature'] = 'invalid'
  });

  test('plisioWebhook — returns 400 when invoice not found', async () => {
    // Mock db query to return empty rows
  });
  
  // Add for all uncovered blocks
});
```

**Step 4: Run tests**

```bash
cd /tmp/Decontaminate/backend && npx jest tests/webhookController.test.js --coverage --silent 2>&1 | grep -E "webhookController|Tests:|PASS|FAIL"
```

**Step 5: Commit**

```bash
cd /tmp/Decontaminate/backend && git add tests/webhookController.test.js && git commit -m "test(webhookController): add error-handler and branch coverage tests"
```

---

## Task 3: customerController — Improve from 84.55% to 92%+

**Files:**
- Modify: `backend/tests/customerController.test.js`
- Test subject: `backend/src/controllers/customerController.js`

**Step 1: Read existing test structure**

```bash
cd /tmp/Decontaminate/backend && wc -l tests/customerController.test.js
```

**Step 2: Uncovered blocks**

- **77,86**: Error handlers in recovery-kit generation
- **134-135,211-212**: Error handlers in getSubscription / getActivity
- **272-273,288**: Error handlers in recoverAccount
- **364-369**: Multiple error handlers
- **402-403,432-433,474-475,497-498,530-531,569-570,594-597,614-615,656-657,675-676,696-697,723-724**: Many error handlers across 13 functions

**Step 3: Add error-handler tests**

Add a new `describe('Error handling')` block at the end of the existing test file.

```javascript
describe('Error handling', () => {
  let consoleSpy;
  beforeEach(() => { consoleSpy = jest.spyOn(console, 'error').mockImplementation(); });
  afterEach(() => consoleSpy.mockRestore());

  test('getSubscription — throws 500 on db error', async () => {
    mockDbQuery.mockReset();
    mockDbQuery.mockImplementation(() => Promise.reject(new Error('DB error')));
    await controller.getSubscription(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('getActivity — throws 500 on db error', async () => {
    // ...
  });

  // Add for each uncovered error handler
});
```

**Step 4: Run tests**

```bash
cd /tmp/Decontaminate/backend && npx jest tests/customerController.test.js --coverage --silent 2>&1 | grep -E "customerController|Tests:|PASS|FAIL"
```

**Step 5: Commit**

```bash
cd /tmp/Decontaminate/backend && git add tests/customerController.test.js && git commit -m "test(customerController): add error-handler coverage tests"
```

---

## Task 4: adminController — Improve from 84.44% to 92%+

**Files:**
- Modify: `backend/tests/adminController.test.js`
- Test subject: `backend/src/controllers/adminController.js`

**Step 1: Read existing test structure**

```bash
cd /tmp/Decontaminate/backend && wc -l tests/adminController.test.js
```

**Step 2: Uncovered blocks**

Most are error handlers in catch blocks across ~30 functions. Same pattern as customerController.

**Step 3: Add error-handler tests**

```javascript
describe('Error handling', () => {
  let consoleSpy;
  beforeEach(() => { consoleSpy = jest.spyOn(console, 'error').mockImplementation(); });
  afterEach(() => { consoleSpy.mockRestore(); jest.clearAllMocks(); });

  test('getCustomers — throws 500 on db error', async () => {
    mockDbQuery.mockReset();
    mockDbQuery.mockImplementation(() => Promise.reject(new Error('DB error')));
    req.query = {};
    await controller.getCustomers(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('getMetrics — throws 500 on db error', async () => {
    // ...
  });

  // Add for each uncovered error handler across all functions
});
```

**Step 4: Run tests**

```bash
cd /tmp/Decontaminate/backend && npx jest tests/adminController.test.js --coverage --silent 2>&1 | grep -E "adminController|Tests:|PASS|FAIL"
```

**Step 5: Commit**

```bash
cd /tmp/Decontaminate/backend && git add tests/adminController.test.js && git commit -m "test(adminController): add error-handler coverage tests"
```

---

## Final Verification

```bash
cd /tmp/Decontaminate/backend && npx jest --coverage --silent 2>&1 | grep -E "Test Suites|Tests:|All files"
```

Expected:
- All 35 test suites passing
- 1,001+ tests passing (adding ~30-50 new tests across 4 files)
- Overall coverage: 91.82% → 93%+
