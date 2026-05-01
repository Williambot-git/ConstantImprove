# ARB VPN Renewal Fix — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix the ARB VPN renewal bug in `authorizeNetWebhook` — on every monthly renewal webhook fire, the code was creating new VPN credentials and orphaning the old ones. The fix checks if a VPN account already exists for the user and extends the expiry by 30 days from `current_period_end` instead of generating new credentials.

**Root Cause:** `webhookController.js` line 557 unconditionally calls `createVpnAccount()` on every Authorize.net webhook fire. The VPN Resellers API creates a new sub-account each time; old credentials become orphaned.

**Architecture:** Add a `renew` boolean flag to `createVpnAccount`. When `renew: true`, skip VPN Resellers account creation and just extend the expiry on the existing local vpn_accounts row (which keeps the same VPN Resellers credentials). When `renew: false` (default), behave exactly as before.

---

## Task 1: Add `renew` parameter to `createVpnAccount` in userService.js

**Objective:** Add `renew` option to `createVpnAccount` that extends expiry without regenerating credentials.

**Files:**
- Modify: `backend/src/services/userService.js:201-270`

**Step 1: Read the full createVpnAccount function**

Run: `read_file backend/src/services/userService.js offset=201 limit=70`

**Step 2: Add renew parameter**

Modify the function signature from:
```javascript
async function createVpnAccount(userId, accountNumber, planInterval) {
```
To:
```javascript
async function createVpnAccount(userId, accountNumber, planInterval, { renew = false } = {}) {
```

**Step 3: Add renew branch inside createVpnAccount (after the planId check, before username generation)**

```javascript
  // ── Renewal path: extend expiry on existing VPN account, no new credentials ──
  if (renew) {
    // Look up the existing vpn_accounts row for this user
    const existing = await db.query(
      'SELECT id, purewl_uuid FROM vpn_accounts WHERE user_id = $1',
      [userId]
    );
    if (existing.rows.length > 0) {
      // Extend expiry from current_period_end + 30 days
      const durationDays = resolvePlanDuration(planInterval);
      const newExpiry = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      const newExpiryYmd = newExpiry.toISOString().slice(0, 10);

      await db.query(
        'UPDATE vpn_accounts SET expiry_date = $1, updated_at = NOW() WHERE user_id = $2',
        [newExpiryYmd, userId]
      );

      // Also update expiry on VPN Resellers side so the server recognizes it
      const { purewl_uuid: existingUuid } = existing.rows[0];
      if (existingUuid) {
        try {
          await vpnResellersService.setExpiry(existingUuid, newExpiryYmd);
        } catch (warn) {
          console.warn('Failed to sync VPN Resellers expiry during renewal:', warn.message || warn);
        }
      }

      const updated = await db.query('SELECT * FROM vpn_accounts WHERE user_id = $1', [userId]);
      return {
        username: updated.rows[0]?.purewl_username,
        password: updated.rows[0]?.purewl_password,  // unchanged — kept from original creation
        accountId: existingUuid,
        account: updated.rows[0],
        renewed: true
      };
    }
    // No existing VPN account — fall through to normal creation (renew on first time)
  }
```

**Step 4: Update the module.exports to document the new parameter**

Add JSDoc: `@param {{ renew?: boolean }} options.renew - If true, extends expiry on existing VPN account instead of creating new credentials`

**Step 5: Verify syntax**

Run: `cd backend && node -c src/services/userService.js`

**Step 6: Run userService tests**

Run: `cd backend && npx jest tests/services/userService.test.js --coverage=false`
Expected: All existing tests still pass (no behavior change for non-renew calls).

---

## Task 2: Wire `renew: true` in webhookController authorizeNetWebhook

**Objective:** Change line 557 in webhookController to pass `renew: true`.

**Files:**
- Modify: `backend/src/controllers/webhookController.js:557`

**Step 1: Change the createVpnAccount call**

Replace line 557:
```javascript
const vpnAccount = await createVpnAccount(subscription.user_id, subscription.account_number, planInterval);
```
With:
```javascript
const vpnAccount = await createVpnAccount(subscription.user_id, subscription.account_number, planInterval, { renew: true });
```

**Step 2: Verify syntax**

Run: `cd backend && node -c src/controllers/webhookController.js`

**Step 3: Run webhookController tests**

Run: `cd backend && npx jest tests/controllers/webhookController.test.js --coverage=false`
Expected: All existing tests still pass.

---

## Task 3: Add unit tests for the `renew` path in userService

**Objective:** Test the new `renew: true` branch of `createVpnAccount`.

**Files:**
- Create: `backend/tests/services/userService.renew.test.js`

**Step 1: Write tests**

```javascript
/**
 * userService.createVpnAccount — renew branch tests
 *
 * When createVpnAccount is called with { renew: true }:
 * - If user already has a vpn_accounts row: extends expiry, keeps existing credentials
 * - If no existing row: falls through to normal creation (first-time renewal)
 */

process.env.NODE_ENV = 'test';

const mockDbQuery = jest.fn();
const mockVpnResellersService = {
  createAccount: jest.fn(),
  setExpiry: jest.fn(),
  checkUsername: jest.fn()
};

jest.mock('../../src/config/database', () => ({ query: mockDbQuery }));
jest.mock('../../src/services/vpnResellersService', () => mockVpnResellersService);
jest.mock('../../src/models/userModel', () => ({
  findById: jest.fn().mockResolvedValue({ id: 1, email: 'test@test.com' })
}));

const { createVpnAccount } = require('../../src/services/userService');

beforeEach(() => {
  jest.clearAllMocks();
  mockDbQuery.mockReset();
  mockVpnResellersService.createAccount.mockReset();
  mockVpnResellersService.setExpiry.mockReset();
  mockVpnResellersService.checkUsername.mockReset();
});

describe('createVpnAccount renew:true — existing VPN account', () => {
  test('extends expiry on existing vpn_accounts row without calling VPN Resellers create', async () => {
    // Existing VPN account for user_id=1
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 10, purewl_uuid: 'uuid_123', purewl_username: 'user_abc', purewl_password: 'secret123' }] }) // existing lookup
      .mockResolvedValueOnce({ rows: [{ id: 10, purewl_uuid: 'uuid_123', purewl_username: 'user_abc', purewl_password: 'secret123', expiry_date: '2026-05-19' }] }); // updated row

    const result = await createVpnAccount(1, 'ACC001', 'month', { renew: true });

    // Should NOT call VPN Resellers createAccount — credentials unchanged
    expect(mockVpnResellersService.createAccount).not.toHaveBeenCalled();
    // Should call setExpiry on VPN Resellers with new expiry
    expect(mockVpnResellersService.setExpiry).toHaveBeenCalledWith('uuid_123', expect.stringMatching(/2026/));
    // Should return existing credentials
    expect(result.username).toBe('user_abc');
    expect(result.password).toBe('secret123');
    expect(result.renewed).toBe(true);
  });

  test('falls through to normal creation when no existing vpn_accounts row', async () => {
    // No existing VPN account
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // existing lookup — empty
    // Normal creation path
    mockVpnResellersService.checkUsername.mockResolvedValue({ data: { message: 'Username not taken' } });
    mockVpnResellersService.createAccount.mockResolvedValue({ data: { id: 'new_id', allowed_countries: [] } });
    mockVpnResellersService.setExpiry.mockResolvedValue(undefined);
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 20, purewl_uuid: 'new_id' }] }); // INSERT result

    const result = await createVpnAccount(1, 'ACC002', 'month', { renew: true });

    // Should fall through to normal creation
    expect(mockVpnResellersService.createAccount).toHaveBeenCalled();
    expect(result.renewed).toBeUndefined();
  });
});
```

**Step 2: Run the new tests**

Run: `cd backend && npx jest tests/services/userService.renew.test.js --coverage=false`
Expected: All tests pass.

---

## Task 4: Add integration test for ARB renewal path in webhookController

**Objective:** Verify that authorizeNetWebhook with an existing VPN account calls createVpnAccount with `renew: true`.

**Files:**
- Modify: `backend/tests/controllers/webhookController.test.js`

**Step 1: Find the authorizeNetWebhook test section and add a test**

Add a test case that mocks the subscription as having an existing vpn_accounts row (via `db.query` returning existing row), and verifies that `createVpnAccount` is called with `{ renew: true }`.

**Step 2: Run webhookController tests**

Run: `cd backend && npx jest tests/controllers/webhookController.test.js --coverage=false`
Expected: All tests pass.

---

## Task 5: Final verification — full test suite

**Step 1: Run full backend test suite**

Run: `cd backend && npx jest --coverage=false`
Expected: All 1,168+ tests pass, no regressions.

**Step 2: Commit**

```bash
cd /tmp/Decontaminate
git add -A
git commit -m "fix(webhook): ARB VPN renewal — extend expiry instead of orphaning credentials

- createVpnAccount(userId, accountNumber, planInterval, { renew: true })
  skips VPN Resellers account creation when vpn_accounts row exists;
  instead extends expiry and keeps existing credentials.
- authorizeNetWebhook calls createVpnAccount with { renew: true }
  so monthly ARB charges extend the existing VPN account rather than
  spawning a new sub-account and orphaning the old credentials.
- Add unit tests for renew branch and webhook integration."
```
