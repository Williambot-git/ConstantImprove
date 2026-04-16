# Auth Middleware Consolidation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Consolidate onto `authMiddleware_new.js` as the single canonical auth middleware, removing `authMiddleware.js`.

**Architecture:**
- `authMiddleware_new.js` (347 lines) becomes the single auth middleware — PostgreSQL-native, CSRF, rate limiting, 2FA, account lockout
- `authMiddleware.js` (138 lines) is removed after all consumers migrate
- 4 routes currently have dual imports (both files) — these get simplified to single import

**Key Finding:** The audit doc incorrectly called this a "MongoDB vs PostgreSQL" issue. `authMiddleware.js` uses `User.findById()` which is PostgreSQL-based (userModel.js uses `db.query`). Both middlewares are PostgreSQL. This makes consolidation straightforward.

**Tech Stack:** Express.js middleware, JWT, bcrypt, PostgreSQL

---

## Pre-flight: Understand the Dual-Import Pattern

Run this to see all routes with dual imports:
```bash
grep -l "authMiddleware" /tmp/Decontaminate/backend/src/routes/*.js
```

Routes using BOTH files (dual import — most complex):
- `subscriptionRoutes.js` — `authMiddleware.protect` + `authMiddleware_new.csrfProtection`
- `supportRoutes.js` — same pattern
- `vpnRoutes.js` — same pattern
- `userRoutes.js` — `authMiddleware.protect` + `authMiddleware_new.require2FA` + `csrfProtection`

Routes using ONLY original (`authMiddleware.js`):
- `authRoutes.js` — `protect` only
- `paymentRoutes.js` — `allowInactive` only

---

## Task 1: Migrate authRoutes.js — Simplest Single Import

**Objective:** Change `authRoutes.js` from original `protect` to new `protect`.

**File:** `backend/src/routes/authRoutes.js`

**Step 1: Read the current file**

Run: `head -20 /tmp/Decontaminate/backend/src/routes/authRoutes.js`

**Step 2: Change the import**

Find:
```js
const { protect } = require('../middleware/authMiddleware');
```

Replace with:
```js
const { protect } = require('../middleware/authMiddleware_new');
```

**Step 3: Verify no other references**

Run: `grep -n "authMiddleware" /tmp/Decontaminate/backend/src/routes/authRoutes.js`
Expected: Only the one import line

**Step 4: Commit**

```bash
cd /tmp/Decontaminate && git add backend/src/routes/authRoutes.js
git commit -m "refactor(auth): migrate authRoutes to authMiddleware_new"
```

---

## Task 2: Migrate vpnRoutes.js — Dual Import Cleanup

**Objective:** Remove dual import, use only `authMiddleware_new`.

**File:** `backend/src/routes/vpnRoutes.js`

**Step 1: Read current imports**

Run: `head -20 /tmp/Decontaminate/backend/src/routes/vpnRoutes.js`

**Step 2: Replace dual import with single import**

Find:
```js
const authMiddleware = require('../middleware/authMiddleware');
const { csrfProtection, setCsrfToken } = require('../middleware/authMiddleware_new');
```

Replace with:
```js
const { protect, csrfProtection, setCsrfToken } = require('../middleware/authMiddleware_new');
```

**Step 3: Update usage — replace `authMiddleware.protect` with `protect`**

Find: `router.use(authMiddleware.protect);`
Replace with: `router.use(protect);`

**Step 4: Verify no remaining references to original authMiddleware**

Run: `grep -n "authMiddleware" /tmp/Decontaminate/backend/src/routes/vpnRoutes.js`
Expected: 0 results

**Step 5: Commit**

```bash
cd /tmp/Decontaminate && git add backend/src/routes/vpnRoutes.js
git commit -m "refactor(auth): migrate vpnRoutes to authMiddleware_new"
```

---

## Task 3: Migrate subscriptionRoutes.js — Dual Import Cleanup

**Objective:** Same pattern as vpnRoutes.

**File:** `backend/src/routes/subscriptionRoutes.js`

**Step 1: Read current imports**

**Step 2: Replace dual import**

Find:
```js
const authMiddleware = require('../middleware/authMiddleware');
const { csrfProtection, setCsrfToken } = require('../middleware/authMiddleware_new');
```

Replace with:
```js
const { protect, csrfProtection, setCsrfToken } = require('../middleware/authMiddleware_new');
```

**Step 3: Replace usage**

Find: `router.use(authMiddleware.protect);`
Replace with: `router.use(protect);`

**Step 4: Verify clean**

Run: `grep -n "authMiddleware" /tmp/Decontaminate/backend/src/routes/subscriptionRoutes.js`
Expected: 0 results

**Step 5: Commit**

```bash
cd /tmp/Decontaminate && git add backend/src/routes/subscriptionRoutes.js
git commit -m "refactor(auth): migrate subscriptionRoutes to authMiddleware_new"
```

---

## Task 4: Migrate supportRoutes.js — Dual Import Cleanup

**File:** `backend/src/routes/supportRoutes.js`

**Step 1: Read current imports**

**Step 2: Replace dual import**

Find:
```js
const authMiddleware = require('../middleware/authMiddleware');
const { csrfProtection, setCsrfToken } = require('../middleware/authMiddleware_new');
```

Replace with:
```js
const { protect, csrfProtection, setCsrfToken } = require('../middleware/authMiddleware_new');
```

**Step 3: Replace usage**

Find: `router.use(authMiddleware.protect);`
Replace with: `router.use(protect);`

**Step 4: Verify clean**

Run: `grep -n "authMiddleware" /tmp/Decontaminate/backend/src/routes/supportRoutes.js`
Expected: 0 results

**Step 5: Commit**

```bash
cd /tmp/Decontaminate && git add backend/src/routes/supportRoutes.js
git commit -m "refactor(auth): migrate supportRoutes to authMiddleware_new"
```

---

## Task 5: Migrate userRoutes.js — Most Complex Dual Import

**File:** `backend/src/routes/userRoutes.js`

**Step 1: Read current imports and usage**

Run: `head -30 /tmp/Decontaminate/backend/src/routes/userRoutes.js`
Note: This file uses `authMiddleware.require2FA` AND `authMiddleware_new.require2FA` — need to check which one is actually used in routes

**Step 2: Replace dual import**

Find:
```js
const authMiddleware = require('../middleware/authMiddleware');
const { csrfProtection, setCsrfToken } = require('../middleware/authMiddleware_new');
```

Replace with:
```js
const { protect, csrfProtection, setCsrfToken, require2FA } = require('../middleware/authMiddleware_new');
```

**Step 3: Check require2FA usage**

Run: `grep -n "require2FA" /tmp/Decontaminate/backend/src/routes/userRoutes.js`

If routes use `authMiddleware.require2FA`, replace with `require2FA` (from new file).

**Step 4: Replace authMiddleware.protect with protect**

Find: `router.use(authMiddleware.protect);`
Replace with: `router.use(protect);`

**Step 5: Verify no remaining references**

Run: `grep -n "authMiddleware" /tmp/Decontaminate/backend/src/routes/userRoutes.js`
Expected: 0 results

**Step 6: Commit**

```bash
cd /tmp/Decontaminate && git add backend/src/routes/userRoutes.js
git commit -m "refactor(auth): migrate userRoutes to authMiddleware_new"
```

---

## Task 6: Handle paymentRoutes.js — allowInactive Porting

**File:** `backend/src/routes/paymentRoutes.js`

**Step 1: Read current allowInactive usage**

Run: `grep -n "allowInactive\|allow_inactive" /tmp/Decontaminate/backend/src/routes/paymentRoutes.js`
Run: `grep -n "allowInactive" /tmp/Decontaminate/backend/src/middleware/authMiddleware.js`

**Step 2: Understand allowInactive purpose**

`allowInactive` in original middleware:
- Skips the active-user check
- Used for routes that need auth but allow inactive users (e.g., plans endpoint)
- Original: calls `User.findById(tokenUserId)` then `req.user = user` (doesn't check `is_active`)

The `authMiddleware_new.protect` doesn't set `req.user` to a full user object — it sets `{ id, role, type }`. It doesn't check `is_active` at all.

**Step 3: Decision — port allowInactive to authMiddleware_new**

Since `authMiddleware_new.protect` doesn't check `is_active` at all, `allowInactive` is likely redundant after migration. Verify by checking what routes use `allowInactive`:

Run: `grep -n "allowInactive" /tmp/Decontaminate/backend/src/routes/paymentRoutes.js`

**Step 4: If still needed, add to authMiddleware_new**

If `allowInactive` is needed for specific routes, add a simplified version to `authMiddleware_new.js`:

```js
// Middleware that allows inactive users for specific routes
// Used for payment/subscription flows where inactive users still need access
const allowInactive = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;
    
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id || decoded.adminId || decoded.affiliateId;
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    req.user = { id: userId, role: decoded.role, type: decoded.type || decoded.affiliateType };
    if (decoded.affiliateId) req.user.affiliateId = decoded.affiliateId;
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
```

**Step 5: If not needed, replace with protect**

Most likely, `allowInactive` was a workaround that's no longer needed. Replace:
- Import: `const { protect, allowInactive } = require('../middleware/authMiddleware_new');` (if added) or just `protect`
- Usage: `allowInactive` → `protect`

**Step 6: Commit**

```bash
cd /tmp/Decontaminate && git add backend/src/routes/paymentRoutes.js
git add backend/src/middleware/authMiddleware_new.js  # if modified
git commit -m "refactor(auth): migrate paymentRoutes to authMiddleware_new"
```

---

## Task 7: Remove authMiddleware.js

**File:** `backend/src/middleware/authMiddleware.js`

**Step 1: Final verification — ensure no remaining imports**

Run: `grep -rn "require.*authMiddleware['\"]" /tmp/Decontaminate/backend/src/`
If any results remain (besides the file itself), do NOT delete yet.

**Step 2: Delete the file**

```bash
cd /tmp/Decontaminate && rm backend/src/middleware/authMiddleware.js
```

**Step 3: Commit**

```bash
git add -A && git commit -m "refactor(auth): remove deprecated authMiddleware.js after full migration"
```

---

## Task 8: Final Verification

**Step 1: Run tests**

```bash
cd /tmp/Decontaminate/backend && npx jest --passWithNoTests
```

**Step 2: Verify lint**

```bash
cd /tmp/Decontaminate/backend && npx eslint src/routes/*.js --no-error-on-unmatched-pattern
```

**Step 3: Verify no remaining references to old middleware**

```bash
grep -rn "authMiddleware['\"]" /tmp/Decontaminate/backend/src/
```
Expected: Only `authMiddleware_new.js` itself

**Step 4: Manual smoke test (if env available)**

```bash
# Verify routes load without errors
node -e "require('./src/routes/authRoutes')" 2>&1 | grep -i error
node -e "require('./src/routes/vpnRoutes')" 2>&1 | grep -i error
```

---

## Rollback Plan (If Issues Found)

If any step fails:

1. **Revert the route file change**:
   ```bash
   git checkout HEAD~1 -- backend/src/routes/[filename].js
   ```

2. **Do NOT proceed** to next task until issue is diagnosed with systematic-debugging skill.

3. **If auth is completely broken**, re-add the original import temporarily:
   ```js
   const authMiddleware = require('../middleware/authMiddleware');
   ```

---

## Files Summary

| File | Change |
|------|--------|
| `backend/src/routes/authRoutes.js` | Import `protect` from `authMiddleware_new` |
| `backend/src/routes/vpnRoutes.js` | Remove dual import, use `protect` + `csrfProtection` from new |
| `backend/src/routes/subscriptionRoutes.js` | Same as vpnRoutes |
| `backend/src/routes/supportRoutes.js` | Same as vpnRoutes |
| `backend/src/routes/userRoutes.js` | Same as vpnRoutes + check `require2FA` usage |
| `backend/src/routes/paymentRoutes.js` | Replace `allowInactive` — port or remove |
| `backend/src/middleware/authMiddleware_new.js` | Add `allowInactive` if needed |
| `backend/src/middleware/authMiddleware.js` | **DELETE** after all consumers migrated |

---

*Last updated: 2026-04-16*
