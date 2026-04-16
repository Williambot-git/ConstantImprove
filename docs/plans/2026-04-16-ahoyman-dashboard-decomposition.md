# AhoyMan Dashboard Decomposition Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Decompose `pages/ahoyman-dashboard.jsx` (804 lines) into focused sub-components, following the same pattern as the checkout page decomposition.

**Architecture:**
- Extract 5 tab components to `frontend/components/ahoyman-dashboard/` directory
- Each tab becomes a standalone, testable component
- Shared inline styles (`inputStyle`, `thStyle`, `tdStyle`) moved to `styles.js` for DRY reuse
- Main page becomes a thin orchestrator: header, MetricCard grid, tab navigation, active tab rendering

**Tech Stack:** Next.js (Pages Router), React, plain JSX, Jest + RTL

---

## Context

`ahoyman-dashboard.jsx` currently contains:
- 1 main component + 1 MetricCard helper
- 5 tab sub-components (AffiliatesTab, PayoutsTab, CodesTab, SalesTaxTab, SettingsTab) all in the same file
- Shared inline style objects at the bottom of the file

Each tab is 70-200 lines and fully self-contained (own state + API calls + rendering). This is the same pattern successfully applied in the checkout decomposition.

---

## Shared Styles Extraction (Pre-work)

Before extracting tabs, extract the shared inline styles to a constants file so all components can reference them consistently.

### Task 0: Extract Shared Styles

**File:** `frontend/components/ahoyman-dashboard/styles.js`

**Step 1: Create the styles file**

```javascript
// frontend/components/ahoyman-dashboard/styles.js
/**
 * Shared style constants for ahoyman-dashboard sub-components.
 * Extracted from inline style objects in ahoyman-dashboard.jsx to DRY up
 * repeated style definitions across tab components.
 */

export const inputStyle = {
  padding: '0.5rem 0.75rem',
  borderRadius: '6px',
  border: '1px solid #3A3A3A',
  backgroundColor: '#1A1A1A',
  color: '#F0F4F8',
  fontSize: '0.9rem',
  outline: 'none',
};

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
```

**Step 2: Commit**

```bash
git add frontend/components/ahoyman-dashboard/styles.js
git commit -m "refactor(frontend): extract shared styles from ahoyman-dashboard"
```

---

## Task 1: Extract AffiliatesTab Component

**Files:**
- Create: `frontend/components/ahoyman-dashboard/AffiliatesTab.jsx`
- Modify: `frontend/pages/ahoyman-dashboard.jsx`

**Step 1: Write failing test**

```javascript
// frontend/components/ahoyman-dashboard/AffiliatesTab.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AffiliatesTab from './AffiliatesTab';

jest.mock('../../api/client', () => ({
  getAffiliates: jest.fn().mockResolvedValue({ data: { data: [], pagination: {} } }),
  createAffiliate: jest.fn(),
  suspendAffiliate: jest.fn(),
  reactivateAffiliate: jest.fn(),
  archiveAffiliate: jest.fn(),
  deleteAffiliate: jest.fn(),
  regenerateAffiliateKit: jest.fn(),
}));

describe('AffiliatesTab', () => {
  it('renders affiliates tab heading', async () => {
    render(<AffiliatesTab onAction={() => {}} />);
    // Wait for loading to finish
    expect(screen.getByText('All Affiliates')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/ahoyman-dashboard/AffiliatesTab.test.jsx -v`
Expected: FAIL — "Cannot find module './AffiliatesTab'"

**Step 3: Write implementation** (copy the AffiliatesTab function from ahoyman-dashboard.jsx lines 97-298, updating imports to use `styles.js` for style objects)

```javascript
// frontend/components/ahoyman-dashboard/AffiliatesTab.jsx
import { useState, useEffect } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import api from '../../api/client';
import { inputStyle, thStyle, tdStyle } from './styles';

export default function AffiliatesTab({ onAction }) {
  // ... full implementation from lines 97-298
  // Change inputStyle → import from styles
  // Change thStyle → import from styles
  // Change tdStyle → import from styles
}
```

**Step 4: Run test to verify pass**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/ahoyman-dashboard/AffiliatesTab.test.jsx -v`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/components/ahoyman-dashboard/AffiliatesTab.jsx frontend/components/ahoyman-dashboard/AffiliatesTab.test.jsx
git commit -m "feat(frontend): extract AffiliatesTab from ahoyman-dashboard"
```

---

## Task 2: Extract PayoutsTab Component

**Files:**
- Create: `frontend/components/ahoyman-dashboard/PayoutsTab.jsx`
- Modify: `frontend/pages/ahoyman-dashboard.jsx`

Same pattern as Task 1. Copy PayoutsTab (lines 300-425 in original), update imports to use `styles.js`.

---

## Task 3: Extract CodesTab Component

**Files:**
- Create: `frontend/components/ahoyman-dashboard/CodesTab.jsx`
- Modify: `frontend/pages/ahoyman-dashboard.jsx`

Same pattern. Copy CodesTab (lines 427-565), update imports.

---

## Task 4: Extract SalesTaxTab Component

**Files:**
- Create: `frontend/components/ahoyman-dashboard/SalesTaxTab.jsx`
- Modify: `frontend/pages/ahoyman-dashboard.jsx`

Same pattern. Copy SalesTaxTab (lines 567-724), update imports.

---

## Task 5: Extract SettingsTab Component

**Files:**
- Create: `frontend/components/ahoyman-dashboard/SettingsTab.jsx`
- Modify: `frontend/pages/ahoyman-dashboard.jsx`

Same pattern. Copy SettingsTab (lines 726-797), update imports.

---

## Task 6: Refactor ahoyman-dashboard.jsx to Use Extracted Components

**File:** `frontend/pages/ahoyman-dashboard.jsx`

**Changes:**

1. Remove all tab function definitions (AffiliatesTab, PayoutsTab, CodesTab, SalesTaxTab, SettingsTab, MetricCard)
2. Remove inline style objects (inputStyle, thStyle, tdStyle)
3. Add imports for extracted components and shared styles:
   ```javascript
   import AffiliatesTab from '../components/ahoyman-dashboard/AffiliatesTab';
   import PayoutsTab from '../components/ahoyman-dashboard/PayoutsTab';
   import CodesTab from '../components/ahoyman-dashboard/CodesTab';
   import SalesTaxTab from '../components/ahoyman-dashboard/SalesTaxTab';
   import SettingsTab from '../components/ahoyman-dashboard/SettingsTab';
   ```
4. Keep only the main AhoyManDashboard component and MetricCard (MetricCard stays as a trivial helper)
5. Tab rendering lines become:
   ```jsx
   {tab === 'affiliates' && <AffiliatesTab onAction={loadData} />}
   {tab === 'payouts' && <PayoutsTab onAction={loadData} />}
   {tab === 'codes' && <CodesTab />}
   {tab === 'sales-tax' && <SalesTaxTab />}
   {tab === 'settings' && <SettingsTab />}
   ```

**Step 1: Verify existing tests still pass**

Run: `cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="checkout|smoke" -q 2>&1 | tail -5`

**Step 2: Make the refactor changes**

**Step 3: Verify lint still clean**

Run: `cd /tmp/Decontaminate/frontend && npm run lint 2>&1 | grep -E "error|warning" | head -10`

**Step 4: Run all frontend tests**

Run: `cd /tmp/Decontaminate/frontend && npm test -q`
Expected: All 47+ tests pass

**Step 5: Commit**

```bash
git add frontend/pages/ahoyman-dashboard.jsx
git commit -m "refactor(frontend): wire extracted ahoyman-dashboard tab components"
```

---

## Task 7: Add AhoyManDashboard Integration Test

**Files:**
- Create: `frontend/tests/ahoyman-dashboard.test.jsx`

```javascript
// frontend/tests/ahoyman-dashboard.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AhoyManDashboard from '../pages/ahoyman-dashboard';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../api/client', () => ({
  adminMetrics: jest.fn().mockResolvedValue({ data: { data: {} } }),
}));

describe('AhoyManDashboard', () => {
  it('renders manager dashboard heading', () => {
    render(<AhoyManDashboard />);
    expect(screen.getByText('Manager Dashboard')).toBeInTheDocument();
  });
});
```

**Step 1: Run test to verify failure**

Run: `cd /tmp/Decontaminate/frontend && npx jest tests/ahoyman-dashboard.test.jsx -v`
Expected: FAIL (needs more mocking)

**Step 2: Fix and get test passing** — adjust mocks until test passes

**Step 3: Commit**

```bash
git add frontend/tests/ahoyman-dashboard.test.jsx
git commit -m "test(frontend): add ahoyman-dashboard integration test"
```

---

## Verification

After all tasks:
- `cd /tmp/Decontaminate/frontend && npm test -q` → all tests pass (target: 50+)
- `cd /tmp/Decontaminate/frontend && npm run lint` → 0 errors
- `pages/ahoyman-dashboard.jsx` reduced from 804 lines to ~100 lines
- 5 new components in `components/ahoyman-dashboard/` each with unit tests
- 1 new integration test for the main page

---

## Files to Create

| File | Purpose |
|------|---------|
| `frontend/components/ahoyman-dashboard/styles.js` | Shared style constants |
| `frontend/components/ahoyman-dashboard/AffiliatesTab.jsx` | Affiliates tab component |
| `frontend/components/ahoyman-dashboard/AffiliatesTab.test.jsx` | AffiliatesTab unit tests |
| `frontend/components/ahoyman-dashboard/PayoutsTab.jsx` | Payouts tab component |
| `frontend/components/ahoyman-dashboard/PayoutsTab.test.jsx` | PayoutsTab unit tests |
| `frontend/components/ahoyman-dashboard/CodesTab.jsx` | Codes tab component |
| `frontend/components/ahoyman-dashboard/CodesTab.test.jsx` | CodesTab unit tests |
| `frontend/components/ahoyman-dashboard/SalesTaxTab.jsx` | Sales tax tab component |
| `frontend/components/ahoyman-dashboard/SalesTaxTab.test.jsx` | SalesTaxTab unit tests |
| `frontend/components/ahoyman-dashboard/SettingsTab.jsx` | Settings tab component |
| `frontend/components/ahoyman-dashboard/SettingsTab.test.jsx` | SettingsTab unit tests |
| `frontend/tests/ahoyman-dashboard.test.jsx` | Integration test |
