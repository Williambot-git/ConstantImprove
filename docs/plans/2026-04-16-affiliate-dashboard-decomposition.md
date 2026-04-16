# Affiliate Dashboard Decomposition Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Decompose `pages/affiliate-dashboard.jsx` (471 lines) into focused sub-components, following the same pattern as the ahoyman-dashboard decomposition.

**Architecture:**
- Extract 5 tab components to `frontend/components/affiliate-dashboard/` directory
- MetricCard helper stays in main page (trivial component)
- Main page becomes thin orchestrator: header, MetricCard grid, tab navigation, active tab rendering
- Shared inline styles extracted to `styles.js` for DRY reuse

**Tech Stack:** Next.js (Pages Router), React, plain JSX, Jest + RTL

---

## Context

`affiliate-dashboard.jsx` currently contains:
- 1 main component (AffiliateDashboard) + 1 MetricCard helper
- 5 tab sub-sections (overview, links, referrals, transactions, payout)
- 2 already-defined sub-components: `ReferralsTab()` (line 356) and `TransactionsTab()` (line 416)
- 3 inline tab sections: overview, links, payout
- Inline tab button styles at bottom of file

Each tab is self-contained with own state + API calls + rendering. This is the same pattern successfully applied in ahoyman-dashboard decomposition.

---

## Shared Styles Extraction (Pre-work)

### Task 0: Extract Shared Styles

**File:** `frontend/components/affiliate-dashboard/styles.js`

**Step 1: Create the styles file**

```javascript
// frontend/components/affiliate-dashboard/styles.js
/**
 * Shared style constants for affiliate-dashboard sub-components.
 * Extracted from inline style objects in affiliate-dashboard.jsx to DRY up
 * repeated style definitions across tab components.
 */

export const thStyle = {
  padding: '0.75rem 1rem',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.85rem',
};

export const tdStyle = {
  padding: '0.75rem 1rem',
  color: '#B0C4DE',
  fontSize: '0.9rem',
};

export const inputStyle = {
  padding: '0.5rem 0.75rem',
  borderRadius: '6px',
  border: '1px solid #3A3A3A',
  backgroundColor: '#1A1A1A',
  color: '#F0F4F8',
  fontSize: '0.9rem',
  outline: 'none',
};
```

**Step 2: Commit**

```bash
git add frontend/components/affiliate-dashboard/styles.js
git commit -m "refactor(frontend): extract shared styles from affiliate-dashboard"
```

---

## Task 1: Extract OverviewTab Component

**Files:**
- Create: `frontend/components/affiliate-dashboard/OverviewTab.jsx`
- Modify: `frontend/pages/affiliate-dashboard.jsx`

**Step 1: Write failing test**

```javascript
// frontend/components/affiliate-dashboard/OverviewTab.test.jsx
import { render, screen } from '@testing-library/react';
import OverviewTab from './OverviewTab';

jest.mock('../../api/client', () => ({
  getAffiliateMetrics: jest.fn().mockResolvedValue({ data: { data: {} } }),
  getAffiliateLinks: jest.fn().mockResolvedValue({ data: { data: [] } }),
}));

describe('OverviewTab', () => {
  it('renders overview tab content', async () => {
    render(<OverviewTab metrics={{}} links={[]} />);
    // Overview tab shows welcome/instructions content
    expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/affiliate-dashboard/OverviewTab.test.jsx -v`
Expected: FAIL — "Cannot find module './OverviewTab'"

**Step 3: Write implementation** — Copy the overview tab rendering (lines 174-217 in original), importing MetricCard from the main page, updating styles to use `styles.js`.

**Step 4: Run test to verify pass**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/affiliate-dashboard/OverviewTab.test.jsx -v`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/components/affiliate-dashboard/OverviewTab.jsx frontend/components/affiliate-dashboard/OverviewTab.test.jsx
git commit -m "feat(frontend): extract OverviewTab from affiliate-dashboard"
```

---

## Task 2: Extract LinksTab Component

**Files:**
- Create: `frontend/components/affiliate-dashboard/LinksTab.jsx`
- Modify: `frontend/pages/affiliate-dashboard.jsx`

**Step 1: Write failing test**

```javascript
// frontend/components/affiliate-dashboard/LinksTab.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinksTab from './LinksTab';

jest.mock('../../api/client', () => ({
  generateAffiliateLink: jest.fn().mockResolvedValue({ data: { data: {} } }),
  createAffiliateLinkWithCode: jest.fn().mockResolvedValue({ data: { data: {} } }),
  deleteAffiliateLink: jest.fn().mockResolvedValue({ data: {} }),
  getAffiliateLinks: jest.fn().mockResolvedValue({ data: { data: [] } }),
}));

describe('LinksTab', () => {
  it('renders links tab heading', async () => {
    render(<LinksTab links={[]} onAction={() => {}} />);
    expect(screen.getByText('Your Affiliate Links')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/affiliate-dashboard/LinksTab.test.jsx -v`
Expected: FAIL — "Cannot find module './LinksTab'"

**Step 3: Write implementation** — Copy the links tab content (lines 218-302), extracting `handleGenerateLink`, `handleCreateCustomCode`, `handleDeleteLink`, `handleCopyLink` into the component. Update imports to use `styles.js` for style objects. Props: `{ links, onAction }`.

**Step 4: Run test to verify pass**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/affiliate-dashboard/LinksTab.test.jsx -v`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/components/affiliate-dashboard/LinksTab.jsx frontend/components/affiliate-dashboard/LinksTab.test.jsx
git commit -m "feat(frontend): extract LinksTab from affiliate-dashboard"
```

---

## Task 3: Extract Existing ReferralsTab Component

**Files:**
- Create: `frontend/components/affiliate-dashboard/ReferralsTab.jsx` (already exists as function at line 356)
- Modify: `frontend/pages/affiliate-dashboard.jsx`

The ReferralsTab already exists as a function definition at line 356. Move it to its own file, update imports to use `styles.js`, and add a test.

**Step 1: Create the component file**

```javascript
// frontend/components/affiliate-dashboard/ReferralsTab.jsx
// Moved from affiliate-dashboard.jsx lines 356-414
import { thStyle, tdStyle } from './styles';

export default function ReferralsTab() {
  // ... content from lines 356-414 of affiliate-dashboard.jsx
}
```

**Step 2: Create test file**

```javascript
// frontend/components/affiliate-dashboard/ReferralsTab.test.jsx
import { render, screen } from '@testing-library/react';
import ReferralsTab from './ReferralsTab';

describe('ReferralsTab', () => {
  it('renders referrals tab heading', () => {
    render(<ReferralsTab />);
    expect(screen.getByText('Your Referrals')).toBeInTheDocument();
  });
});
```

**Step 3: Run tests**
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/components/affiliate-dashboard/ReferralsTab.jsx frontend/components/affiliate-dashboard/ReferralsTab.test.jsx
git commit -m "feat(frontend): extract ReferralsTab from affiliate-dashboard"
```

---

## Task 4: Extract Existing TransactionsTab Component

**Files:**
- Create: `frontend/components/affiliate-dashboard/TransactionsTab.jsx` (already exists as function at line 416)
- Modify: `frontend/pages/affiliate-dashboard.jsx`

Same pattern as Task 3. Move function from line 416, update imports to use `styles.js`, add test.

---

## Task 5: Extract PayoutTab Component

**Files:**
- Create: `frontend/components/affiliate-dashboard/PayoutTab.jsx`
- Modify: `frontend/pages/affiliate-dashboard.jsx`

**Step 1: Write failing test**

```javascript
// frontend/components/affiliate-dashboard/PayoutTab.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PayoutTab from './PayoutTab';

jest.mock('../../api/client', () => ({
  requestPayout: jest.fn().mockResolvedValue({ data: {} }),
}));

describe('PayoutTab', () => {
  it('renders payout tab heading', async () => {
    render(<PayoutTab />);
    expect(screen.getByText('Request a Payout')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify failure**
Expected: FAIL — "Cannot find module './PayoutTab'"

**Step 3: Write implementation** — Copy payout tab content (lines 319-345), extracting `handlePayoutRequest`. Props: `{ metrics }` (for balance display). Update imports to use `styles.js`.

**Step 4: Run test to verify pass**
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/components/affiliate-dashboard/PayoutTab.jsx frontend/components/affiliate-dashboard/PayoutTab.test.jsx
git commit -m "feat(frontend): extract PayoutTab from affiliate-dashboard"
```

---

## Task 6: Refactor affiliate-dashboard.jsx to Use Extracted Components

**File:** `frontend/pages/affiliate-dashboard.jsx`

**Changes:**

1. Remove `ReferralsTab` function definition (was lines 356-414)
2. Remove `TransactionsTab` function definition (was lines 416-470)
3. Add imports for all 5 extracted tab components and shared styles:
   ```javascript
   import OverviewTab from '../components/affiliate-dashboard/OverviewTab';
   import LinksTab from '../components/affiliate-dashboard/LinksTab';
   import ReferralsTab from '../components/affiliate-dashboard/ReferralsTab';
   import TransactionsTab from '../components/affiliate-dashboard/TransactionsTab';
   import PayoutTab from '../components/affiliate-dashboard/PayoutTab';
   ```
4. Remove inline styles that are now in `styles.js`
5. Tab rendering lines become:
   ```jsx
   {tab === 'overview' && <OverviewTab metrics={metrics} links={links} />}
   {tab === 'links' && <LinksTab links={links} onAction={loadData} />}
   {tab === 'referrals' && <ReferralsTab />}
   {tab === 'transactions' && <TransactionsTab />}
   {tab === 'payout' && <PayoutTab metrics={metrics} />}
   ```

**Step 1: Verify existing tests still pass**

Run: `cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="checkout|smoke" -q 2>&1 | tail -5`

**Step 2: Make the refactor changes**

**Step 3: Verify lint still clean**

Run: `cd /tmp/Decontaminate/frontend && npm run lint 2>&1 | grep -E "error|warning" | head -10`

**Step 4: Run all frontend tests**

Run: `cd /tmp/Decontaminate/frontend && npm test -q`
Expected: All tests pass (target: 110+)

**Step 5: Commit**

```bash
git add frontend/pages/affiliate-dashboard.jsx
git commit -m "refactor(frontend): wire extracted affiliate-dashboard tab components"
```

---

## Task 7: Add AffiliateDashboard Integration Test

**Files:**
- Create: `frontend/tests/affiliate-dashboard.test.jsx`

```javascript
// frontend/tests/affiliate-dashboard.test.jsx
import { render, screen } from '@testing-library/react';
import AffiliateDashboard from '../pages/affiliate-dashboard';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../api/client', () => ({
  getAffiliateMetrics: jest.fn().mockResolvedValue({ data: { data: {} } }),
  getAffiliateLinks: jest.fn().mockResolvedValue({ data: { data: [] } }),
}));

describe('AffiliateDashboard', () => {
  it('renders affiliate dashboard heading', async () => {
    render(<AffiliateDashboard />);
    expect(screen.getByText('Affiliate Dashboard')).toBeInTheDocument();
  });
});
```

**Step 1: Run test to verify failure**

Run: `cd /tmp/Decontaminate/frontend && npx jest tests/affiliate-dashboard.test.jsx -v`
Expected: FAIL (needs more mocking)

**Step 2: Fix and get test passing** — adjust mocks until test passes

**Step 3: Commit**

```bash
git add frontend/tests/affiliate-dashboard.test.jsx
git commit -m "test(frontend): add affiliate-dashboard integration test"
```

---

## Verification

After all tasks:
- `cd /tmp/Decontaminate/frontend && npm test -q` → all tests pass (target: 110+)
- `cd /tmp/Decontaminate/frontend && npm run lint` → 0 errors
- `pages/affiliate-dashboard.jsx` reduced from 471 lines to ~120 lines
- 5 new components in `components/affiliate-dashboard/` each with unit tests
- 1 new integration test for the main page

---

## Files to Create

| File | Purpose |
|------|---------|
| `frontend/components/affiliate-dashboard/styles.js` | Shared style constants |
| `frontend/components/affiliate-dashboard/OverviewTab.jsx` | Overview tab component |
| `frontend/components/affiliate-dashboard/OverviewTab.test.jsx` | OverviewTab unit tests |
| `frontend/components/affiliate-dashboard/LinksTab.jsx` | Links tab component |
| `frontend/components/affiliate-dashboard/LinksTab.test.jsx` | LinksTab unit tests |
| `frontend/components/affiliate-dashboard/ReferralsTab.jsx` | Referrals tab component (moved) |
| `frontend/components/affiliate-dashboard/ReferralsTab.test.jsx` | ReferralsTab unit tests |
| `frontend/components/affiliate-dashboard/TransactionsTab.jsx` | Transactions tab component (moved) |
| `frontend/components/affiliate-dashboard/TransactionsTab.test.jsx` | TransactionsTab unit tests |
| `frontend/components/affiliate-dashboard/PayoutTab.jsx` | Payout tab component |
| `frontend/components/affiliate-dashboard/PayoutTab.test.jsx` | PayoutTab unit tests |
| `frontend/tests/affiliate-dashboard.test.jsx` | Integration test |
