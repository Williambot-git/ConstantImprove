# VPN Controller Stub Refactor & Service Consolidation Plan

**Date:** 2026-04-16
**Status:** Proposed
**Files in scope:**
- `backend/src/controllers/vpnController.js`
- `backend/src/services/vpnResellersService.js`
- `backend/src/controllers/paymentController.js` (lines 31–143)

---

## Context

### VPN Controller Stubs
`vpnController.js` exports 6 stub functions that all return `501 Not implemented`:
- `getServers` — no mock, no real implementation
- `getWireGuardConfig` — calls `getAccount()` on VPN reseller API for the authenticated user
- `getOpenVPNConfig` — same pattern as wireguard, different response format
- `connect` — no mock, no real implementation
- `disconnect` — no mock, no real implementation
- `getConnections` — no mock, no real implementation

Routes are at `/api/vpn/*` behind auth middleware.

### Inline `VPNResellersService` in paymentController (lines 31–143)
paymentController defines its own inline `VPNResellersService` class with:
- `createAccount(userData)` — calls `${this.apiUrl}/api/v1/accounts`
- `activateAccount(accountId)` — calls `${this.apiUrl}/api/v1/accounts/${accountId}/activate`

This duplicates `vpnResellersService.js` which also wraps the same VPN Resellers API but:
- Uses v2 endpoints (`/v3_2/accounts/*`) from `paymentConfig.vpnResellers.endpoints`
- Has richer methods: `checkUsername`, `createAccount`, `enableAccount`, `disableAccount`, `changePassword`, `setExpiry`, `getAccount`

Both use the same `apiToken` and `apiUrl` from `paymentConfig.vpnResellers`.

---

## Task 1: Replace vpnController Stubs

**Time:** ~3 minutes  
**File:** `backend/src/controllers/vpnController.js`

### Approach

#### Step 1: Add mock server list for `getServers`

`vpnController.js` does not currently import `vpnResellersService`. Use mock data for the server list until a real server inventory API exists.

```js
// Mock server list — replace with real API call when available
const MOCK_SERVERS = [
  { id: 'us-east-1', name: 'US East', protocol: 'wireguard', host: 'us-east.vpn.example.com', port: 51820, publicKey: 'ABC123...', load: 45 },
  { id: 'us-west-1', name: 'US West', protocol: 'wireguard', host: 'us-west.vpn.example.com', port: 51820, publicKey: 'DEF456...', load: 22 },
  { id: 'eu-central-1', name: 'EU Central', protocol: 'wireguard', host: 'eu.vpn.example.com', port: 51820, publicKey: 'GHI789...', load: 61 },
];

const getServers = async (req, res) => {
  res.json({ servers: MOCK_SERVERS });
};
```

#### Step 2: Integrate `vpnResellersService.getAccount()` for config endpoints

For `getWireGuardConfig` and `getOpenVPNConfig`:
1. Import `VpnResellersService` at the top of `vpnController.js`
2. The authenticated user's VPN account ID should come from `req.user` (set by auth middleware — verify this field name against `authMiddleware.protect`).
3. Call `vpnResellersService.getAccount(accountId)` to fetch credentials from the VPN reseller API.
4. Return a formatted config based on the response shape.

```js
const VpnResellersService = require('../services/vpnResellersService');
const vpnResellersService = new VpnResellersService();

const getWireGuardConfig = async (req, res) => {
  try {
    const accountId = req.user?.vpnAccountId; // confirm field name from auth middleware
    if (!accountId) {
      return res.status(400).json({ error: 'No VPN account found for user' });
    }
    const account = await vpnResellersService.getAccount(accountId);
    // Format WireGuard config from account data
    // Expected account response shape: { username, password, server_ip, ... }
    const config = `[Interface]
PrivateKey = <user_private_key>
Address = 10.0.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${account.server_public_key}
Endpoint = ${account.server_host}:51820
AllowedIPs = 0.0.0.0/0`;

    res.json({ config, server: account.server_name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch WireGuard config' });
  }
};
```

Apply the same pattern for `getOpenVPNConfig` with OpenVPN `.ovpn` format.

#### Step 3: Stub connect/disconnect/getConnections

For now, return a 501 or structured mock response indicating these require real VPN daemon integration:

```js
const connect = async (req, res) => {
  res.status(501).json({ error: 'VPN connect requires daemon integration — not yet implemented' });
};
```

Mark these with a comment linking to a follow-up ticket for actual WireGuard/OpenVPN daemon control.

---

## Task 2: Consolidate paymentController Inline Class

**Time:** ~2 minutes  
**File:** `backend/src/controllers/paymentController.js`

### Analysis

| Aspect | Inline class (paymentController) | vpnResellersService.js |
|---|---|---|
| API version | v1 (`/api/v1/accounts`) | v2 (`/v3_2/accounts/*`) |
| Methods | `createAccount`, `activateAccount` | Full suite + same two |
| Config source | `paymentConfig.vpnResellers` | `paymentConfig.vpnResellers` |
| Path template | Hardcoded string | Uses `endpoints` from config |

The inline class is incomplete and inconsistent (v1 vs v2). All calls to the inline `vpnResellersService` in paymentController should be switched to use the exported `vpnResellersService.js`.

### Steps

1. **Find all usages** of the inline class in paymentController:
   ```bash
   grep -n "vpnResellersService" /tmp/Decontaminate/backend/src/controllers/paymentController.js
   ```

2. **Remove the inline class** (lines 31–143 in paymentController).

3. **Add import** at the top of paymentController:
   ```js
   const VpnResellersService = require('../services/vpnResellersService');
   const vpnResellersService = new VpnResellersService();
   ```

4. **Update method calls** — the inline `createAccount` has different request body shape (`username`, `password`, `plan_id`) vs the exported service. Verify the exported `createAccount` payload matches what paymentController expects, or update the call sites to use the correct payload format from `vpnResellersService.js`.

   The exported service's `createAccount` passes `payload` directly, so ensure the callers in paymentController pass `{ username, password, email, plan_id }` — which aligns with the inline class's existing payload.

5. **`activateAccount`** — this method does not exist in `vpnResellersService.js`. Either:
   - Add `activateAccount(accountId)` to `vpnResellersService.js` using the v2 endpoint (`/v3_2/accounts/{accountId}/enable` or `/activate`), OR
   - Update paymentController callers to use `enableAccount(accountId)` from the exported service (maps to the same v2 enable endpoint)

### Risk / Note

The v1 vs v2 endpoint difference is significant. Verify with the VPN Resellers API documentation whether v1 endpoints are deprecated before switching paymentController to v2. If v1 is still active, the consolidation may require keeping v1 compatibility or migrating all callers to v2 in a coordinated deploy.

---

## Verification

- After Task 1: `GET /api/vpn/servers` returns `{ servers: [...] }` with 200 OK
- After Task 1: `GET /api/vpn/config/wireguard` calls `vpnResellersService.getAccount()` and returns a WireGuard config (or 400 if no vpn account on user)
- After Task 2: paymentController creates accounts via `vpnResellersService.js` using v2 endpoints
- Run existing tests to confirm nothing is broken: `npm test --prefix backend`

---

## Files to Modify

| File | Change |
|---|---|
| `backend/src/controllers/vpnController.js` | Add imports, mock data, integrate vpnResellersService for config endpoints |
| `backend/src/controllers/paymentController.js` | Remove inline VPNResellersService class (lines 31–143), use exported vpnResellersService |
| `backend/src/services/vpnResellersService.js` | Potentially add `activateAccount` if needed by paymentController callers |