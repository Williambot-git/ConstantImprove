# Frontend Component Testing — 2026-04-16

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Expand frontend unit test coverage to untested components, prioritizing critical routing infrastructure and UI primitives that other components depend on.

**Architecture:** Each task is a self-contained unit test file. Tests follow RTL (React Testing Library) patterns established in existing tests. No architectural changes.

**Tech Stack:** Next.js frontend, Jest + @testing-library/react for testing.

---

## Context from Gap Analysis

**Frontend components WITHOUT unit tests:**
- `components/ProtectedRoute.jsx` — 56 lines, critical auth routing guard
- `components/ui/` — Alert, Button, Card, Form, Modal, Spinner (UI primitives)
- `components/dashboard/` — CancelModal, DeleteModal, PlanCard, VpnCredentialsSection
- `components/affiliate-dashboard/` — TransactionsTab, LinksTab, OverviewTab, PayoutTab, ReferralsTab

**Existing test files:**
- `tests/affiliate-dashboard.test.jsx` — integration-level test (not tab-level)
- `tests/ahoyman-dashboard.test.jsx` — integration-level test
- `tests/dashboard.test.jsx` — integration-level test
- `tests/checkout-flow.test.jsx` — integration test

**Established patterns from existing tests:**
- `@testing-library/jest-dom` matchers must be imported per file
- Mock AuthContext via `jest.mock('../../pages/_app')`
- React must be required inside jest.mock factory
- `renderWithAuth()` helper pattern for auth-state testing
- `fireEvent.change()` for number inputs (not `userEvent`)

---

## Task 1: Add ProtectedRoute unit tests

**Objective:** Test the critical auth routing guard component.

**Files:**
- Create: `frontend/tests/components/ProtectedRoute.test.jsx`
- Source: `frontend/components/ProtectedRoute.jsx`

**ProtectedRoute behavior to test:**
- When `auth.isLoggedIn = false` → redirects to `/login`
- When `auth.isLoggedIn = true` but wrong role → redirects to `/`
- When `auth.isLoggedIn = true` and correct role → renders children
- When `requiredRole = null` (any logged-in user) → renders for any role
- Loading state when `auth` is null → shows "Checking access..."
- Role matching: `requiredRole = 'customer'`, `auth.role = 'customer'` → authorized
- Role matching: `requiredRole = 'customer'`, `auth.role = 'affiliate'` → denied

**Mock pattern:**
```javascript
// Mock AuthContext
jest.mock('../../pages/_app', () => {
  const React = require('react');
  return {
    AuthContext: React.createContext(null),
  };
});

// Mock useRouter
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
```

**Step 1: Create failing test file with all test cases**
**Step 2: Run `cd frontend && npm test -- tests/components/ProtectedRoute.test.jsx -v` — verify FAIL**
**Step 3: Verify test file matches component behavior**
**Step 4: Run full frontend suite — verify no regressions**
**Step 5: Commit**

---

## Task 2: Add UI primitive unit tests (Alert, Button, Card, Form, Modal, Spinner)

**Objective:** Test the base UI primitives that other components depend on.

**Files:**
- Create: `frontend/tests/components/ui/Alert.test.jsx`
- Create: `frontend/tests/components/ui/Button.test.jsx`
- Create: `frontend/tests/components/ui/Card.test.jsx`
- Create: `frontend/tests/components/ui/Form.test.jsx`
- Create: `frontend/tests/components/ui/Modal.test.jsx`
- Create: `frontend/tests/components/ui/Spinner.test.jsx`

**Source files:** `frontend/components/ui/{Alert,Button,Card,Form,Modal,Spinner}.jsx`

**Test focus per component:**
- **Alert:** renders with different severity variants (info, success, warning, error)
- **Button:** renders with different sizes (sm, md, lg), onClick is called when clicked, disabled state prevents click
- **Card:** renders children, applies padding and border styling
- **Form:** renders children, calls onSubmit when submitted
- **Modal:** renders open/closed states, renders children, has close mechanism
- **Spinner:** renders and applies size/animation styles

**Step 1: Create all 6 test files with minimal failing tests**
**Step 2: Run `cd frontend && npm test -- tests/components/ui/ -v` — verify FAILs**
**Step 3: Write minimal implementations to pass tests**
**Step 4: Run full frontend suite — verify no regressions**
**Step 5: Commit each test file**

---

## Task 3: Add CancelModal and DeleteModal unit tests

**Objective:** Test the customer dashboard modal components.

**Files:**
- Create: `frontend/tests/components/dashboard/CancelModal.test.jsx`
- Create: `frontend/tests/components/dashboard/DeleteModal.test.jsx`

**Source files:** `frontend/components/dashboard/{CancelModal,DeleteModal}.jsx`

**Modal behavior to test:**
- Modal opens when `isOpen = true`
- Modal is hidden when `isOpen = false`
- Cancel/confirm buttons are present
- onClose is called when cancel button is clicked
- onConfirm is called when confirm button is clicked

**Step 1: Create failing tests**
**Step 2: Run tests — verify FAIL**
**Step 3: Write implementations to pass**
**Step 4: Run full frontend suite — verify no regressions**
**Step 5: Commit**

---

## Task 4: Add PlanCard unit tests

**Objective:** Test the plan display card component.

**Files:**
- Create: `frontend/tests/components/dashboard/PlanCard.test.jsx`

**Source:** `frontend/components/dashboard/PlanCard.jsx`

**PlanCard behavior to test:**
- Renders plan name and price
- Renders plan features list
- Selected state is visually distinct
- onSelect is called when clicked

**Step 1: Create failing test**
**Step 2: Run test — verify FAIL**
**Step 3: Write implementation to pass**
**Step 4: Run full frontend suite — verify no regressions**
**Step 5: Commit**

---

## Task 5: Update automation-status.md

**Files:**
- Modify: `docs/automation-status.md`

Add completed tasks to the Current Session Progress table:
```
| 44 | Frontend ProtectedRoute unit tests | **DONE** |
| 45 | Frontend UI primitive tests (Alert, Button, Card, Form, Modal, Spinner) | **DONE** |
| 46 | Frontend CancelModal + DeleteModal tests | **DONE** |
| 47 | Frontend PlanCard tests | **DONE** |
```

---

## Verification Commands

After all tasks complete:

```bash
# Frontend test suite — should be 140+ tests (was 118)
cd frontend && npm test -- --coverage --silent

# Verify ProtectedRoute specifically
cd frontend && npm test -- tests/components/ProtectedRoute.test.jsx -v

# Verify UI tests
cd frontend && npm test -- tests/components/ui/ -v
```

Expected: All new tests pass, frontend total > 140 tests.

---

## Risk Assessment

- **Low risk** — purely adding test files
- No changes to source files unless tests reveal actual bugs
- Existing 118 tests all continue to pass
- Test patterns follow established conventions in codebase
