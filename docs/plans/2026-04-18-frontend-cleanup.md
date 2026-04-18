# Frontend Cleanup & Consolidation — Implementation Plan

> **For Hermes:** Execute tasks directly (subagents can't write to repo). Each task = 2-5 min focused work.

**Goal:** Clean up legacy artifacts, fix accessibility issues, consolidate duplicate pages, improve test coverage.

**Tech Stack:** Next.js 16, React 19, Jest 30, RTL

---

## Task 1: Fix `<a>` → `<Link>` in dns-guide.jsx, affiliate-agreement.jsx, faq.jsx, downloads.jsx, Layout.jsx

**Files:**
- Modify: `frontend/pages/dns-guide.jsx` (lines 291, 298, 313)
- Modify: `frontend/pages/affiliate-agreement.jsx` (lines 150, 194)
- Modify: `frontend/pages/faq.jsx` (line 114)
- Modify: `frontend/pages/downloads.jsx` (line 92)
- Modify: `frontend/components/Layout.jsx` (lines 16, 131)

**Approach:** Replace `<a href="...">` with `<Link href="..."><a>...</a></Link>` for internal links. External mailto/http links stay as `<a>` with `target="_blank" rel="noreferrer"` for accessibility.

**Step 1: Fix dns-guide.jsx**
```diff
- <a href="https://www.cloudflare.com/ssl/encrypted-sni/" style={styles.link}>
+ <a href="https://www.cloudflare.com/ssl/encrypted-sni/" target="_blank" rel="noreferrer" style={styles.link}>
- <a href="https://www.dnsleaktest.com" style={styles.link}>
+ <a href="https://www.dnsleaktest.com" target="_blank" rel="noreferrer" style={styles.link}>
- <a href="mailto:ahoyvpn@ahoyvpn.net" style={styles.link}>
+ <a href="mailto:ahoyvpn@ahoyvpn.net" style={styles.link}>
```

**Step 2: Fix Layout.jsx**
```diff
- <a href="mailto:ahoyvpn@ahoyvpn.net" style={styles.floatingSupportButton}>
+ <a href="mailto:ahoyvpn@ahoyvpn.net" style={styles.floatingSupportButton} aria-label="Contact Support">
```

**Step 3: Fix affiliate-agreement.jsx, faq.jsx, downloads.jsx**
Same pattern — add `target="_blank" rel="noreferrer"` for external http links, `aria-label` for mailto.

**Step 4: Commit**
```bash
git add frontend/pages/dns-guide.jsx frontend/pages/affiliate-agreement.jsx frontend/pages/faq.jsx frontend/pages/downloads.jsx frontend/components/Layout.jsx
git commit -m "fix(frontend): replace bare <a> with accessible external link attributes"
```

---

## Task 2: Delete orphaned legacy `frontend/js/checkout.js` file

**Files:**
- Delete: `frontend/js/checkout.js`

**Step 1: Verify no active imports**
```bash
grep -r "js/checkout" frontend/ --include="*.jsx" --include="*.js" --include="*.html"
```
Expected: No matches (the file was already superseded by `pages/checkout.jsx`).

**Step 2: Delete**
```bash
rm frontend/js/checkout.js
```

**Step 3: Commit**
```bash
git rm frontend/js/checkout.js
git commit -m "chore(frontend): delete orphaned legacy checkout.js (superseded by checkout.jsx)"
```

---

## Task 3: Consolidate duplicate payment-success pages

**Files:**
- Delete: `frontend/pages/payment/success.jsx` (nested route, content identical to root)
- Modify: `frontend/pages/payment-success.jsx` (make it the canonical page, update Layout import path)

**Step 1: Read both files to confirm they're identical**
Both pages return identical content — 60 lines each.

**Step 2: Delete `pages/payment/success.jsx`**
```bash
rm frontend/pages/payment/success.jsx
```

**Step 3: Verify no imports of `pages/payment/success`**
```bash
grep -r "payment/success" frontend/ --include="*.jsx" --include="*.js"
```
Expected: No matches.

**Step 4: Commit**
```bash
git rm frontend/pages/payment/success.jsx
git commit -m "chore(frontend): delete duplicate payment/success page (content was identical to payment-success)"
```

---

## Task 4: Add `admin.jsx` unit tests (16-20 tests)

**Files:**
- Create: `frontend/tests/admin.test.jsx`
- Modify: `frontend/pages/admin.jsx` (may need small refactor for testability)

**Step 1: Identify testable sections**
- KPICard sub-component (pure, easy to test)
- Auth redirect logic (role !== admin → redirect)
- Tab switching (kpis/customers/affiliates)
- `sanitizeText` usage in handleSearchCustomer
- Customer search form submission
- Affiliates table rendering (mock data)
- Export CSV button
- Disable affiliate handler
- Adjust earnings handler

**Step 2: Write tests**
```javascript
// 1. KPICard renders label and value
// 2. KPICard handles different value types (string, number)
// 3. Redirects to /login when not logged in
// 4. Redirects to /dashboard when role is not admin
// 5. Shows loading state while metrics fetch
// 6. Renders KPIs tab with metrics data
// 7. Renders payment split bars
// 8. Customers tab shows search form
// 9. Affiliates tab shows table with data
// 10. Affiliates tab shows empty state when no affiliates
// 11. Disable affiliate calls api and refreshes list
// 12. Adjust earnings shows prompt and calls api
// 13. Export CSV creates and downloads file
// 14. handleSearchCustomer sanitizes input before API call
// 15. Tab switching works (kpis → customers → affiliates)
```

**Step 3: Run tests**
```bash
cd frontend && npm test -- --testPathPattern="admin.test" -q
```

**Step 4: Commit**
```bash
git add frontend/tests/admin.test.jsx
git commit -m "test(frontend): add admin.jsx unit tests (KPICard, auth redirects, tabs, CSV export)"
```

---

## Task 5: Add `ahoyman.jsx` (Partner Portal login) unit tests

**Files:**
- Create: `frontend/tests/ahoyman.test.jsx`

**Step 1: Test surface**
- Renders login form with username/password fields
- Shows error on empty submission
- Calls `/api/auth/ahoyman/login` on submit
- Stores token in localStorage on success
- Redirects to `/ahoyman-dashboard` on success
- Shows loading state during login
- Displays error message on failure
- Sanitizes username input

**Step 2: Write tests (10-14 tests)**
```javascript
// 1. Renders login form
// 2. Shows error on empty username/password
// 3. Calls login API on valid submit
// 4. Stores adminToken in localStorage on success
// 5. Redirects to ahoyman-dashboard on success
// 6. Shows error message on failed login
// 7. Shows loading state during API call
// 8. Sanitizes username input
// 9. Submit button disabled while loading
```

**Step 3: Run tests**
```bash
cd frontend && npm test -- --testPathPattern="ahoyman.test" -q
```

**Step 4: Commit**
```bash
git add frontend/tests/ahoyman.test.jsx
git commit -m "test(frontend): add ahoyman.jsx unit tests (login form, API, redirect)"
```

---

## Task 6: Add `authorize-redirect.jsx` unit tests

**Files:**
- Create: `frontend/tests/authorize-redirect.test.jsx`

**Step 2: Test surface**
- Shows loading text when router not ready
- Shows error when token missing
- Creates form and submits when token present
- Uses correct formUrl from query

**Step 3: Write tests (8-10 tests)**
```javascript
// 1. Shows loading when router not ready
// 2. Shows error when token is missing
// 3. Shows error when token is empty string
// 4. Renders redirect text when token present
// 5. Creates and submits form with token (mock submit)
// 6. Uses correct formUrl (default and from query)
```

**Step 4: Run tests**
```bash
cd frontend && npm test -- --testPathPattern="authorize-redirect.test" -q
```

**Step 5: Commit**
```bash
git add frontend/tests/authorize-redirect.test.jsx
git commit -m "test(frontend): add authorize-redirect.jsx unit tests"
```

---

## Task 7: Update automation-status.md

**Files:**
- Modify: `docs/automation-status.md`

**Add new entries:**
- Task 94: Fix `<a>` → accessible external links in dns-guide, affiliate-agreement, faq, downloads, Layout
- Task 95: Delete orphaned `frontend/js/checkout.js` legacy file
- Task 96: Consolidate duplicate payment-success page (delete `pages/payment/success.jsx`)
- Task 97: `admin.jsx` unit tests
- Task 98: `ahoyman.jsx` unit tests
- Task 99: `authorize-redirect.jsx` unit tests

---

## Verification

```bash
# Run full test suites
cd backend && npm test 2>&1 | tail -5
cd ../frontend && npm test 2>&1 | tail -5
# Expected: all 1,021 backend + 537+ frontend tests pass

# Run lint
cd frontend && npm run lint
# Expected: 0 errors
```

---

## Priority Order
1. Task 1 — Accessibility fix (quick, high impact)
2. Task 2 — Delete legacy file (1 min)
3. Task 3 — Consolidate duplicate pages (1 min)
4. Task 4 — admin.jsx tests (moderate effort, good coverage)
5. Task 5 — ahoyman.jsx tests (moderate effort)
6. Task 6 — authorize-redirect tests (quick)
7. Task 7 — Update status doc
