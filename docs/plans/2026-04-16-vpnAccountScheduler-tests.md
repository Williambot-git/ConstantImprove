# vpnAccountScheduler Unit Tests Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add comprehensive unit tests for vpnAccountScheduler (0% current coverage), following the established patterns from other backend service tests.

**Architecture:** Unit tests using Jest with mocked `db` (PostgreSQL query helper) and `vpnResellersService`. All 4 scheduler functions covered.

**Tech Stack:** Jest, @jest/globals, jest mocking

---

## Context

- vpnAccountScheduler has 0% line coverage (142 lines, 4 exported functions)
- vpnAccountScheduler runs background cleanup jobs:
  - `cleanupExpiredAccounts()` — deactivates VPN accounts past their expiry date
  - `cleanupCanceledSubscriptions()` — deactivates VPN accounts for subscriptions marked cancel-at-period-end that have ended
  - `suspendExpiredTrials()` — cancels trialing subscriptions older than 30 days and suspends their VPN accounts
  - `cleanupAbandonedCheckouts()` — deletes trialing subscriptions older than 3 days and their pending payments
- Depends on `db.query()` (PostgreSQL) and `vpnResellersService.disableAccount()`
- These are fire-and-forget scheduler functions; they swallow errors and continue looping

---

## Task 1: Write vpnAccountScheduler unit tests

**Files:**
- Create: `backend/tests/services/vpnAccountScheduler.test.js`

---

### Step 1: Create test file with mocks

```javascript
/**
 * vpnAccountScheduler unit tests
 *
 * Tests all 4 scheduler cleanup functions:
 * - cleanupExpiredAccounts()
 * - cleanupCanceledSubscriptions()
 * - suspendExpiredTrials()
 * - cleanupAbandonedCheckouts()
 *
 * Each function is tested for:
 * - Happy path: rows found, disableAccount called, status updated
 * - Partial failure: disableAccount throws but status update still succeeds
 * - Empty result: no rows found, no side effects
 *
 * Uses db.query mock and vpnResellersService.disableAccount mock.
 */

const vpnAccountScheduler = require('../../src/services/vpnAccountScheduler');

// Mock the database module
jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

// Mock VpnResellersService (used for disableAccount)
jest.mock('../../src/services/vpnResellersService', () => {
  const mockDisable = jest.fn();
  return { disableAccount: mockDisable };
});

const db = require('../../src/config/database');
const VpnResellersService = require('../../src/services/vpnResellersService');
const { disableAccount } = new VpnResellersService();
```

---

### Step 2: Test cleanupExpiredAccounts — success path

```javascript
describe('cleanupExpiredAccounts', () => {
  it('should disable expired accounts and update status to expired', async () => {
    const mockRows = [
      { id: 1, purewl_uuid: 'uuid-1', user_id: 10 },
      { id: 2, purewl_uuid: 'uuid-2', user_id: 20 }
    ];
    db.query
      .mockResolvedValueOnce({ rows: mockRows }) // SELECT
      .mockResolvedValueOnce({ rows: [] })       // UPDATE #1
      .mockResolvedValueOnce({ rows: [] });       // UPDATE #2
    disableAccount.mockResolvedValueOnce({});
    disableAccount.mockResolvedValueOnce({});

    await vpnAccountScheduler.cleanupExpiredAccounts();

    expect(db.query).toHaveBeenCalledTimes(3); // 1 SELECT + 2 UPDATE
    expect(disableAccount).toHaveBeenCalledTimes(2);
    expect(disableAccount).toHaveBeenNthCalledWith(1, 'uuid-1');
    expect(disableAccount).toHaveBeenNthCalledWith(2, 'uuid-2');
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('UPDATE vpn_accounts'),
      [1]
    );
    expect(db.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('UPDATE vpn_accounts'),
      [2]
    );
  });
```

---

### Step 3: Test cleanupExpiredAccounts — no expired accounts

```javascript
  it('should do nothing when no expired accounts exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await vpnAccountScheduler.cleanupExpiredAccounts();

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(disableAccount).not.toHaveBeenCalled();
  });
```

---

### Step 4: Test cleanupExpiredAccounts — disableAccount throws but status still updated

```javascript
  it('should update status to expired even if disableAccount throws', async () => {
    const mockRows = [{ id: 5, purewl_uuid: 'uuid-fail', user_id: 50 }];
    db.query
      .mockResolvedValueOnce({ rows: mockRows })
      .mockResolvedValueOnce({ rows: [] });
    disableAccount.mockRejectedValueOnce(new Error('API error'));

    // Should not throw — errors are swallowed internally
    await expect(vpnAccountScheduler.cleanupExpiredAccounts()).resolves.not.toThrow();

    expect(disableAccount).toHaveBeenCalledWith('uuid-fail');
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE vpn_accounts'),
      [5]
    );
  });
```

---

### Step 5: Test cleanupCanceledSubscriptions — success path

```javascript
describe('cleanupCanceledSubscriptions', () => {
  it('should disable accounts for canceled subscriptions past period end', async () => {
    const mockRows = [
      { id: 1, purewl_uuid: 'uuid-c1' },
      { id: 2, purewl_uuid: 'uuid-c2' }
    ];
    db.query
      .mockResolvedValueOnce({ rows: mockRows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    disableAccount.mockResolvedValue({});

    await vpnAccountScheduler.cleanupCanceledSubscriptions();

    expect(disableAccount).toHaveBeenCalledTimes(2);
    expect(disableAccount).toHaveBeenNthCalledWith(1, 'uuid-c1');
    expect(disableAccount).toHaveBeenNthCalledWith(2, 'uuid-c2');
  });
```

---

### Step 6: Test cleanupCanceledSubscriptions — empty result

```javascript
  it('should do nothing when no canceled subscriptions need cleanup', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await vpnAccountScheduler.cleanupCanceledSubscriptions();

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(disableAccount).not.toHaveBeenCalled();
  });
```

---

### Step 7: Test suspendExpiredTrials — full flow with VPN account found

```javascript
describe('suspendExpiredTrials', () => {
  it('should cancel subscription, disable VPN account, mark user inactive', async () => {
    // Subscription query result
    const subRows = [{ id: 99, user_id: 77, plisio_invoice_id: 'inv_abc' }];
    // VPN account query result
    const vpnRows = [{ id: 15, purewl_uuid: 'uuid-trial' }];

    db.query
      // SELECT subscriptions
      .mockResolvedValueOnce({ rows: subRows })
      // UPDATE subscriptions (cancel)
      .mockResolvedValueOnce({ rows: [] })
      // SELECT vpn_accounts
      .mockResolvedValueOnce({ rows: vpnRows })
      // UPDATE vpn_accounts (suspend)
      .mockResolvedValueOnce({ rows: [] })
      // UPDATE users (deactivate)
      .mockResolvedValueOnce({ rows: [] });
    disableAccount.mockResolvedValueOnce({});

    await vpnAccountScheduler.suspendExpiredTrials();

    expect(db.query).toHaveBeenCalledTimes(5);
    expect(disableAccount).toHaveBeenCalledWith('uuid-trial');

    // Verify subscription was canceled
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining("SET status = 'canceled'"),
      [99]
    );
    // Verify VPN was suspended
    expect(db.query).toHaveBeenNthCalledWith(4,
      expect.stringContaining("SET status = 'suspended'"),
      [15]
    );
    // Verify user was deactivated
    expect(db.query).toHaveBeenNthCalledWith(5,
      expect.stringContaining('UPDATE users SET is_active = false'),
      [77]
    );
  });
```

---

### Step 8: Test suspendExpiredTrials — no VPN account found

```javascript
  it('should cancel subscription even if no VPN account exists', async () => {
    const subRows = [{ id: 88, user_id: 66, plisio_invoice_id: 'inv_xyz' }];

    db.query
      .mockResolvedValueOnce({ rows: subRows })  // SELECT subscriptions
      .mockResolvedValueOnce({ rows: [] })        // UPDATE subscriptions
      .mockResolvedValueOnce({ rows: [] });       // SELECT vpn_accounts (empty)

    await vpnAccountScheduler.suspendExpiredTrials();

    expect(db.query).toHaveBeenCalledTimes(3);
    // disableAccount should NOT be called
    expect(disableAccount).not.toHaveBeenCalled();
    // Subscription should still be canceled
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining("SET status = 'canceled'"),
      [88]
    );
  });
```

---

### Step 9: Test suspendExpiredTrials — no expired trials

```javascript
  it('should do nothing when no expired trial subscriptions exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await vpnAccountScheduler.suspendExpiredTrials();

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(disableAccount).not.toHaveBeenCalled();
  });
```

---

### Step 10: Test cleanupAbandonedCheckouts — deletes old pending subscriptions

```javascript
describe('cleanupAbandonedCheckouts', () => {
  it('should delete abandoned trialing subscriptions and their pending payments', async () => {
    const deletedRows = [
      { id: 11, user_id: 101, plisio_invoice_id: 'inv_p1' },
      { id: 22, user_id: 202, plisio_invoice_id: 'inv_p2' }
    ];

    db.query
      // DELETE subscriptions RETURNING
      .mockResolvedValueOnce({ rows: deletedRows })
      // DELETE payments #1
      .mockResolvedValueOnce({ rows: [] })
      // DELETE payments #2
      .mockResolvedValueOnce({ rows: [] });

    await vpnAccountScheduler.cleanupAbandonedCheckouts();

    expect(db.query).toHaveBeenCalledTimes(3);
    // First call should be the DELETE with interval
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('DELETE FROM subscriptions')
    );
    // Follow-up deletes for pending payments
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('DELETE FROM payments'),
      [11]
    );
    expect(db.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('DELETE FROM payments'),
      [22]
    );
  });
```

---

### Step 11: Test cleanupAbandonedCheckouts — no abandoned checkouts

```javascript
  it('should do nothing when no abandoned checkouts exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await vpnAccountScheduler.cleanupAbandonedCheckouts();

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(disableAccount).not.toHaveBeenCalled();
  });
```

---

### Step 12: Verify all tests pass

**Run:** `cd /tmp/Decontaminate/backend && npm test 2>&1`
**Expected:** 115 tests total — 89 existing + 13 plisioService + 13 vpnAccountScheduler tests, all passing

---

### Step 13: Commit

```bash
cd /tmp/Decontaminate/backend
git add tests/services/plisioService.test.js tests/services/vpnAccountScheduler.test.js
git commit -m "test(backend): add plisioService and vpnAccountScheduler unit tests (26 new tests)"
```
