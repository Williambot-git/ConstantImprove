# Orphan `management/dashboard.jsx` Cleanup — Implementation Plan

> **For Hermes:** Execute task directly. This is a 2-minute cleanup.

**Goal:** Remove the orphaned `frontend/pages/management/dashboard.jsx` file — a duplicate of `admin.jsx` with different import paths that serves no purpose and creates maintenance confusion.

**Why:** `management/dashboard.jsx` (499 lines) is structurally identical to `admin.jsx` (496 lines), just with `../../` import paths instead of `../`. It's not linked from anywhere in the codebase and represents dead weight.

---

## Task 1: Verify `management/dashboard.jsx` is orphaned

**Files:**
- `frontend/pages/management/dashboard.jsx`

**Step 1: Search for any imports or references**

```bash
cd /tmp/Decontaminate
grep -r "management/dashboard" frontend/pages --include="*.jsx" --include="*.js"
grep -r "from.*management/dashboard" frontend/ --include="*.jsx" --include="*.js"
grep -r "import.*management" frontend/pages --include="*.jsx"
```

Expected: No matches (verified earlier — the file has no importers).

**Step 2: Check if the `management/` directory has any other files**

```bash
ls -la frontend/pages/management/
```

Expected: Only `dashboard.jsx` exists. If empty, directory will be removed.

---

## Task 2: Delete the orphan file and empty directory

**Step 1: Delete the file**

```bash
rm frontend/pages/management/dashboard.jsx
rmdir frontend/pages/management/
```

**Step 2: Verify deletion**

```bash
ls frontend/pages/management/ 2>&1
# Expected: No such file or directory
```

---

## Task 3: Verify no regressions

**Step 1: Run frontend tests**

```bash
cd frontend && npm test 2>&1 | tail -10
```

Expected: All 590 tests still pass.

**Step 2: Run lint**

```bash
cd frontend && npm run lint 2>&1 | tail -10
```

Expected: 0 errors, 0 warnings.

---

## Task 4: Commit

```bash
git add -A
git commit -m "chore(frontend): delete orphaned management/dashboard.jsx (duplicate of admin.jsx)"
```

---

## Verification Commands

```bash
# Full test suite
cd backend && npm test 2>&1 | tail -5
cd ../frontend && npm test 2>&1 | tail -5

# Confirm no management/ directory
ls frontend/pages/management/ 2>&1
# Expected: No such file or directory
```
