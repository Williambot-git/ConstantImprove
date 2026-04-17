# Route Overlap: ahoymanRoutes vs adminRoutes — Architecture Decision

**Date:** 2026-04-17
**Status:** DOCUMENTED — No immediate action required

---

## What Exists

Two separate route files serve overlapping affiliate/admin functionality:

### `ahoymanRoutes.js` (`/api/auth/ahoyman/*`)
- **Prefix:** `/api/auth/ahoyman`
- **Controller:** `ahoymanController.js` (969 lines, 25 functions)
- **Auth:** `protectAdmin` middleware
- **Used by:** Frontend Ahoyman dashboard (`frontend/api/client.js:130` — `adminMetrics` calls `/auth/ahoyman/metrics`)

### `adminRoutes.js` (`/api/*`)
- **Prefix:** `/api` (routes then include `/auth/admin/...`, `/admin/...`)
- **Controller:** `adminController.js` (937 lines, 22 functions)
- **Auth:** `protectAdmin` middleware
- **Used by:** Admin panel JS client directly

---

## Key Functional Overlap

| Function | ahoymanRoutes | adminRoutes |
|----------|--------------|-------------|
| GET /metrics | ✅ `/auth/ahoyman/metrics` | ✅ `/admin/metrics` |
| GET affiliates | ✅ `/admin/affiliates` | ✅ `/admin/affiliates` |
| POST affiliate | ✅ `/admin/affiliates` | ✅ `/admin/affiliates` |
| PUT suspend | ✅ `/admin/affiliates/:id/suspend` | ❌ |
| PUT reactivate | ✅ `/admin/affiliates/:id/reactivate` | ❌ |
| PUT archive | ✅ `/admin/affiliates/:id/archive` | ❌ |
| DELETE | ✅ `/admin/affiliates/:id` | ❌ |
| GET KPIs | ❌ | ✅ `/admin/kpis` |
| GET /tax-transactions | ✅ `/admin/tax-transactions` | ❌ |
| GET /tax-summary | ✅ `/admin/tax-transactions/summary` | ❌ |
| CSV export tax | ✅ `/admin/tax-transactions/export/csv` | ❌ |
| GET affiliate codes | ✅ `/admin/affiliate-codes` | ❌ |
| POST affiliate code | ✅ `/admin/affiliate-codes` | ❌ |
| PUT affiliate code discount | ✅ `/admin/affiliate-codes/:id/discount` | ❌ |
| GET referral tracking | ✅ `/admin/referrals` | ✅ `/admin/referrals` |
| GET payout requests | ✅ `/admin/payout-requests` | ❌ |
| PUT approve payout | ✅ `/admin/payout-requests/:id/approve` | ❌ |
| PUT reject payout | ✅ `/admin/payout-requests/:id/reject` | ❌ |
| POST manual payout | ✅ `/admin/payouts/manual` | ❌ |
| GET settings | ✅ `/admin/settings` | ✅ `/admin/settings` |
| PUT settings | ✅ `/admin/settings` | ✅ `/admin/settings` |

---

## Current Usage

- **Frontend Ahoyman dashboard** uses `ahoymanRoutes` exclusively (`/auth/ahoyman/*`)
- **Admin panel JS client** (static HTML) uses `adminRoutes` (`/admin/*`)
- Both are protected by the same `protectAdmin` middleware
- Both are served under the same domain with HTTPS

---

## Why This Exists

The Ahoyman dashboard was likely built as a React SPA (frontend) while the admin panel was a separate static HTML interface. They share similar data needs but were built independently, resulting in two route prefixes serving equivalent admin data.

---

## Decision: Keep As-Is

**Rationale for no immediate consolidation:**
1. **Frontend is already wired to ahoymanRoutes** — changing would require frontend changes
2. **Both controllers are now well-tested** — 64 tests for ahoymanController, 40 for adminController
3. **Admin panel is static HTML** — may not be actively maintained, but still functional
4. **No customer-facing bug** — both routes work correctly for their respective frontends
5. **Risk of breaking live admin functionality** — without staging environment

**If consolidation were desired someday:**
1. Migrate all `/admin/*` calls in admin panel HTML to `/auth/ahoyman/*`
2. Move remaining unique functions from ahoymanController into adminController
3. Archive ahoymanRoutes and ahoymanController once admin panel uses ahoymanRoutes

**Criteria for when to consolidate:**
- Admin panel HTML is retired in favor of React dashboard
- Or: Ahoyman dashboard takes over all admin functionality

---

## Verification Points

- [ ] `frontend/api/client.js:130` — `adminMetrics` points to `/auth/ahoyman/metrics` ✅
- [ ] Ahoyman dashboard loads metrics on mount ✅ (from CHECK_EVERYTHING.md Phase 7)
- [ ] Error interceptor routes to React `/ahoyman` not `.html` ✅ (Phase 7 regression)
