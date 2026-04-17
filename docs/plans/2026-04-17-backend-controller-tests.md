# Backend Controller Tests — authController_csrf, supportController, userController

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add unit tests for 3 backend controllers that currently have 0% coverage, targeting authController_csrf (231 lines), supportController (4 stub 501 functions), and userController (7 functions with mock data).

**Architecture:** Express controller pattern — each controller function receives (req, res, next), uses userModel/db for data, returns JSON responses. Tests use Jest with db.query mocking via jest.mock('../config/database').

**Tech Stack:** Jest, supertest-style mocking, bcrypt for password hashing tests.

---

## Task 1: authController_csrf Unit Tests

**Objective:** Write 20+ unit tests covering all 4 exported functions in authController_csrf.js

**Files:**
- Create: `backend/tests/controllers/authController_csrf.test.js`
- Test subject: `backend/src/controllers/authController_csrf.js`

**Step 1: Explore the code**

Read `backend/src/controllers/authController_csrf.js` completely. It exports:
- `register` (array: [passwordValidationMiddleware, register] — the actual fn is index 1)
- `login`
- `logout`
- `refreshToken`

**Step 2: Write tests**

```javascript
// Pattern for each function:
// Mock dependencies: User model, jwt utils, bcrypt, db, authMiddleware_new
// Mock req.body, req.user as needed
// Call controller function directly, assert res.json/res.status calls
```

Cover:
- `register`: success (201), password mismatch (400), weak password (400), email taken (500)
- `login`: success (200 + tokens), invalid account (401), wrong password (401), inactive account (200 + grace period message), expired account (403)
- `logout`: success (clears cookies)
- `refreshToken`: success (new tokens), invalid/missing token (401)

**Step 3: Run tests**

Run: `cd backend && npx jest tests/controllers/authController_csrf.test.js -v`
Expected: All tests pass

**Step 4: Check coverage**

Run: `cd backend && npx jest tests/controllers/authController_csrf.test.js --coverage`
Expected: >80% line coverage

**Step 5: Commit**

```bash
cd backend
git add tests/controllers/authController_csrf.test.js
git commit -m "test(backend): add authController_csrf unit tests (20+ cases)"
```

---

## Task 2: supportController Unit Tests

**Objective:** Write unit tests for the 4 stub functions that currently return 501

**Files:**
- Create: `backend/tests/controllers/supportController.test.js`
- Test subject: `backend/src/controllers/supportController.js`

**Note:** These are 501 stubs. Tests document expected behavior. After tests are written and failing (because the code returns 501), implement the minimal real code so tests pass.

**Step 1: Write tests for expected behavior**

```javascript
// createTicket: POST /tickets → 201 with ticket object
// getTickets: GET /tickets → 200 with array
// replyToTicket: POST /tickets/:id/reply → 200
// getKnowledgeBase: GET /kb → 200 with KB array
```

**Step 2: Run tests (expect FAIL — 501 responses)**

Run: `cd backend && npx jest tests/controllers/supportController.test.js -v`
Expected: FAIL — all routes return 501

**Step 3: Implement minimal real code**

For each function, write minimal implementation:
```javascript
const createTicket = async (req, res) => {
  try {
    const { subject, message, priority } = req.body;
    const userId = req.user.id;
    const result = await db.query(
      `INSERT INTO support_tickets (user_id, subject, message, priority, status, created_at)
       VALUES ($1, $2, $3, $4, 'open', NOW()) RETURNING *`,
      [userId, subject, message, priority || 'medium']
    );
    res.status(201).json({ success: true, ticket: result.rows[0] });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
};
```

Do the same pattern for getTickets, replyToTicket, getKnowledgeBase.

**Step 4: Run tests again**

Expected: PASS

**Step 5: Commit**

```bash
cd backend
git add tests/controllers/supportController.test.js src/controllers/supportController.js
git commit -m "feat(backend): implement supportController + tests"
```

---

## Task 3: userController Unit Tests

**Objective:** Write unit tests for 7 userController functions (getProfile, updateProfile, getDevices, revokeDevice, getActivity, getUsage, deleteAccount)

**Files:**
- Create: `backend/tests/controllers/userController.test.js`
- Test subject: `backend/src/controllers/userController.js`

**Step 1: Write tests**

Mock `req.user` with a full user object. Mock `db.query` to return appropriate data per test.

Tests:
- `getProfile`: returns user fields (200), uses req.user from middleware
- `updateProfile`: success updates email (200), password change (200), email conflict (400), missing currentPassword for password change (400)
- `getDevices`: returns mock devices array (200)
- `revokeDevice`: success (200), device not found handling
- `getActivity`: returns activity array sorted by timestamp (200)
- `getUsage`: returns mock usage data (200)
- `deleteAccount`: deletes user (200), error case (500)

**Step 2: Run tests**

Run: `cd backend && npx jest tests/controllers/userController.test.js -v`
Expected: All pass

**Step 3: Commit**

```bash
cd backend
git add tests/controllers/userController.test.js
git commit -m "test(backend): add userController unit tests"
```

---

## Task 4: Remove Orphaned Frontend Test File

**Objective:** Remove the orphaned `TransactionsTab.test.jsx` from `components/affiliate-dashboard/` — the real tests are in `frontend/tests/affiliate-dashboard/`

**Step 1: Delete the orphaned file**

```bash
rm /tmp/Decontaminate/frontend/components/affiliate-dashboard/TransactionsTab.test.jsx
```

**Step 2: Verify tests still pass**

```bash
cd frontend && npx jest --silent
```

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove orphaned TransactionsTab.test.jsx from components/"
```

---

## Verification

After all tasks:
```bash
cd backend && npm test -- --coverage --silent 2>&1 | tail -20
cd frontend && npm test -- --silent
```

Expected:
- Backend: 870+ tests passing, authController_csrf >80%, supportController >70%, userController >70%
- Frontend: 522 tests passing
