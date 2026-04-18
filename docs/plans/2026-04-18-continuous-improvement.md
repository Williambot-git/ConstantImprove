# Continuous Improvement — 2026-04-18 Session
> **For Hermes:** Use subagent-driven-development skill to implement task-by-task.

**Goal:** Incrementally improve test coverage and code quality across frontend/backend.

**Architecture:** Small focused PRs per logical unit, each with tests before implementation.

**Tech Stack:** Node.js backend, Next.js frontend, Jest + RTL for testing.

---

## Task 1: frontend/components/affiliate-dashboard/LinksTab.jsx unit tests

**Objective:** Add missing unit tests for LinksTab.jsx to improve line coverage from 57.77%.

**Files:**
- Create: `frontend/tests/links-tab.test.jsx`
- Modify: `frontend/components/affiliate-dashboard/LinksTab.jsx`

**Step 1: Write failing tests**

```javascript
// frontend/tests/links-tab.test.jsx
// Test state: default values, handleToggleActive, handleDeleteLink, handleCreateCustomCode, handleGenerateLink, copy-to-clipboard

describe('LinksTab', () => {
  // Default state tests
  it('renders empty state when links is empty array', () => { ... })
  it('renders "No links yet" message when no links', () => { ... })
  it('has default actionLoading state as empty object', () => { ... })

  // Link table rendering
  it('renders table with correct columns', () => { ... })
  it('renders link URL in copy-enabled input', () => { ... })
  it('renders discount_cents as formatted currency', () => { ... })
  it('renders CLICKS and SIGNUPS counts', () => { ... })

  // Actions
  it('handleCopyLink sets linkCopied[id] to true then false after timeout', async () => { ... })
  it('handleToggleActive calls onUpdateLinks when toggle clicked', () => { ... })
  it('handleDeleteLink calls onUpdateLinks when delete clicked', () => { ... })
  it('handleCreateCustomCode calls onCreateCustomCode with code and discount', () => { ... })
  it('handleGenerateLink calls onGenerateLink', () => { ... })

  // Create custom code form
  it('shows create-code form when showCreateCustomCode is true', () => { ... })
  it('hides create-code form when showCreateCustomCode is false', () => { ... })
  it('customCode state starts empty', () => { ... })
  it('customDiscount state starts empty', () => { ... })
  it('createCustomCode error shows error message', () => { ... })

  // Generate link form
  it('shows generate-link form when showGenerateLink is true', () => { ... })
  it('generateLink error shows error message', () => { ... })

  // actionLoading scoping (REGRESSION TEST — task 22 from automation-status)
  it('each link has independent actionLoading state', () => { ... })
})
```

**Step 2: Run tests to verify failure**

Run: `cd /tmp/Decontaminate/frontend && npx jest tests/links-tab.test.jsx -v`
Expected: FAIL — file does not exist yet

**Step 3: Write minimal LinksTab tests**

Implement the test file using RTL/Jest patterns matching existing test files (e.g., `affiliate-dashboard.test.jsx`).

**Step 4: Run tests to verify pass**

Run: `cd /tmp/Decontaminate/frontend && npx jest tests/links-tab.test.jsx -v`
Expected: PASS — all tests pass

**Step 5: Verify coverage improvement**

Run: `cd /tmp/Decontaminate/frontend && npx jest --coverage tests/links-tab.test.jsx 2>&1 | grep LinksTab`
Expected: Line coverage > 85%

**Step 6: Commit**

```bash
cd /tmp/Decontaminate && git add frontend/tests/links-tab.test.jsx && git commit -m "test(frontend): add LinksTab unit tests"
```

---

## Task 2: frontend/api/client.js unit tests

**Objective:** Add tests for api/client.js to improve line coverage from 76.33%.

**Files:**
- Create: `frontend/tests/client.test.js`
- Modify: `frontend/api/client.js`

**Step 1: Write failing tests**

```javascript
// frontend/tests/client.test.js
// api/client.js has functions: getAdmin, postAdmin, getTaxTransactions, getTaxSummary
// All currently uncovered lines (13-15, 19-26, 30-55, 138-141) need coverage

describe('api/client', () => {
  // Tax transactions
  it('getTaxTransactions calls correct endpoint with params', () => { ... })
  it('getTaxTransactions handles missing token gracefully', () => { ... })
  it('getTaxSummary calls correct endpoint', () => { ... })
  it('getTaxSummary handles error response', () => { ... })

  // Admin endpoints
  it('getAdmin calls /api/admin/* with auth', () => { ... })
  it('postAdmin calls /api/admin/* with auth and body', () => { ... })
  it('getAdmin falls back to accessToken cookie if no Authorization header', () => { ... })
  it('postAdmin falls back to accessToken cookie if no Authorization header', () => { ... })

  // Full request interceptor behavior
  it('request interceptor adds auth header from accessToken cookie', () => { ... })
  it('request interceptor adds Content-Type application/json', () => { ... })
  it('response interceptor returns data on success', () => { ... })
  it('response interceptor throws on 401', () => { ... })
})
```

**Step 2: Run tests to verify failure**

Run: `cd /tmp/Decontaminate/frontend && npx jest tests/client.test.js -v`
Expected: FAIL — file does not exist yet

**Step 3: Write minimal client tests**

**Step 4: Run tests to verify pass**

Run: `cd /tmp/Decontaminate/frontend && npx jest tests/client.test.js -v`
Expected: PASS

**Step 5: Verify coverage improvement**

Run: `cd /tmp/Decontaminate/frontend && npx jest --coverage tests/client.test.js 2>&1 | grep client`
Expected: Line coverage > 90%

**Step 6: Commit**

```bash
cd /tmp/Decontaminate && git add frontend/tests/client.test.js && git commit -m "test(frontend): add api/client.js unit tests"
```

---

## Task 3: vpnController branch coverage improvement

**Objective:** Add branch coverage tests for vpnController.js to cover lines 138-169 (connect/disconnect/getConnections stubs).

**Files:**
- Modify: `backend/tests/controllers/vpnController.test.js`

**Step 1: Add missing branch tests**

```javascript
// In vpnController.test.js, add tests for the 138-169 uncovered lines:
// connect, disconnect, getConnections return 501 with descriptive message

describe('VPN daemon endpoints (501 stubs)', () => {
  it('POST /api/vpn/connect returns 501 with not implemented message', async () => { ... })
  it('POST /api/vpn/disconnect returns 501 with not implemented message', async () => { ... })
  it('GET /api/vpn/connections returns 501 with not implemented message', async () => { ... })
  it('501 message explains daemon integration is required', () => { ... })
})
```

**Step 2: Run tests to verify pass**

Run: `cd /tmp/Decontaminate/backend && npx jest tests/controllers/vpnController.test.js -v`
Expected: PASS

**Step 3: Run full coverage**

Run: `cd /tmp/Decontaminate/backend && npx jest --coverage tests/controllers/vpnController.test.js 2>&1 | grep vpnController`
Expected: Branch coverage > 95%

**Step 4: Commit**

```bash
cd /tmp/Decontaminate && git add backend/tests/controllers/vpnController.test.js && git commit -m "test(vpnController): add 501-stub branch coverage tests"
```

---

## Task 4: frontend AffiliatesTab.jsx unit tests (coverage 64.91%)

**Objective:** Add tests for AffiliatesTab.jsx to improve line coverage from 64.91%.

**Files:**
- Modify: `frontend/tests/ahoyman-dashboard.test.jsx` (or create AffiliatesTab-specific tests)

**Step 1: Analyze uncovered lines**

AffiliatesTab uncovered: 63, 68-78, 83-92, 99, 104-109, 182-195

**Step 2: Write failing tests**

```javascript
// Add to ahoyman-dashboard.test.jsx or create affiliates-tab.test.jsx

describe('AffiliatesTab', () => {
  // Commission rate formatting
  it('renders commission rate as percentage', () => { ... })
  it('renders N/A when commission rate is null', () => { ... })

  // Status badges
  it('renders active status badge in green', () => { ... })
  it('renders suspended status badge in red', () => { ... })
  it('renders pending status badge in yellow', () => { ... })

  // Action buttons
  it('suspend button calls handleSuspend affiliate', () => { ... })
  it('reactivate button calls handleReactivate affiliate', () => { ... })
  it('regenerate recovery kit button present for suspended affiliates', () => { ... })
  it('suspend button disabled when actionLoading[affiliate.id] is true', () => { ... })

  // Referral link copy
  it('copy referral link copies correct URL to clipboard', () => { ... })

  // Pagination
  it('renders pagination when affiliates.length > pageSize', () => { ... })
  it('clicking page number calls onPageChange', () => { ... })
  it('previous button disabled on page 1', () => { ... })
  it('next button disabled on last page', () => { ... })

  // Search/filter
  it('search input filters affiliates by username', () => { ... })
  it('status filter dropdown filters by status', () => { ... })
  it('filter reset returns to page 1', () => { ... })
})
```

**Step 3: Run tests**

Run: `cd /tmp/Decontaminate/frontend && npx jest tests/ahoyman-dashboard.test.jsx -v`
Expected: PASS

**Step 4: Verify coverage**

Run: `cd /tmp/Decontaminate/frontend && npx jest --coverage tests/ahoyman-dashboard.test.jsx 2>&1 | grep AffiliatesTab`
Expected: Line coverage > 80%

**Step 5: Commit**

```bash
cd /tmp/Decontaminate && git add frontend/tests/ahoyman-dashboard.test.jsx && git commit -m "test(frontend): expand AffiliatesTab coverage tests"
```

---

## Task 5: Final verification

**Step 1: Run full backend test suite**

```bash
cd /tmp/Decontaminate/backend && npx jest --coverage -q 2>&1 | tail -10
```

**Step 2: Run full frontend test suite**

```bash
cd /tmp/Decontaminate/frontend && npx jest --coverage -q 2>&1 | tail -10
```

**Step 3: Update automation-status.md**

```bash
cd /tmp/Decontaminate && $EDITOR docs/automation-status.md
```

**Step 4: Final commit**

```bash
cd /tmp/Decontaminate && git add -A && git commit -m "chore: continuous improvement session — test coverage improvements"
```
