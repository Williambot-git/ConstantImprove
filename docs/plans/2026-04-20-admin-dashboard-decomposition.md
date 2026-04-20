# Admin Dashboard Decomposition — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Decompose the 496-line `pages/admin.jsx` into focused, testable components using the same tab/section pattern proven in affiliate-dashboard and ahoyman-dashboard decompositions.

**Architecture:** Admin page orchestrates 3 tab sections: System KPIs, Customers, and Affiliates. The KPI tab renders a metrics grid and payment-split bar. The Customers tab renders a search form and result display. The Affiliates tab renders a table with disable/adjust/export actions. Inline styles extracted to a shared `styles.js` module. Each tab becomes a standalone component.

**Tech Stack:** Next.js (Pages Router), React Context, @testing-library/react, plain CSS-in-JS (existing pattern)

---

## Task 1: Write Implementation Plan (this document)

**Status:** ✅ Done

---

## Task 2: Extract shared styles to `components/admin/styles.js`

Extract the inline `styles` object from `admin.jsx` into a separate `styles.js` file so it can be imported by the page and future tab components.

**Files:**
- Create: `frontend/components/admin/styles.js`
- Modify: `frontend/pages/admin.jsx`

**Step 1: Read the full styles object from admin.jsx (lines 250-496)**

```bash
# Extract the styles
cd /tmp/Decontaminate && sed -n '250,496p' frontend/pages/admin.jsx
```

**Step 2: Create the styles file**

```javascript
// frontend/components/admin/styles.js
// Shared styles for admin dashboard page and sub-components.
// Extracted from pages/admin.jsx to enable component decomposition
// and avoid style duplication across admin components.

const styles = {
  // Copy all styles from admin.jsx lines 250-496 here
  // Container, title, tabsContainer, tab, tabActive, content,
  // kpisGrid, paymentSplit, splitItem, splitLabel, splitBar,
  // splitFill, splitPercent, notesList, searchForm, customerGrid,
  // label, value, actionsGrid, affiliatesTable, table, th, td, ...
};

module.exports = styles;
```

**Step 3: Update admin.jsx to import styles**

At the top of admin.jsx (after existing imports), add:
```javascript
const styles = require('../components/admin/styles');
```

Remove the inline `const styles = { ... }` block from the bottom of admin.jsx (lines 250-496).

**Step 4: Verify tests pass**

```bash
cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="admin" 2>&1 | tail -10
```
Expected: All 15 admin tests still pass.

**Step 5: Commit**

```bash
git add frontend/pages/admin.jsx frontend/components/admin/styles.js
git commit -m "refactor(frontend): extract admin styles to components/admin/styles.js"
```

---

## Task 3: Extract `KPICard` sub-component to `components/admin/KPICard.jsx`

The KPICard function (inline in admin.jsx) renders a metric card with label/value. It appears only in the KPI tab.

**Files:**
- Create: `frontend/components/admin/KPICard.jsx`
- Modify: `frontend/pages/admin.jsx`

**Step 1: Find the KPICard function in admin.jsx**

```bash
grep -n "function KPICard\|const KPICard\|<KPICard" frontend/pages/admin.jsx
```

**Step 2: Write the component**

```javascript
// frontend/components/admin/KPICard.jsx
// Reusable KPI metric card — displays a label and formatted value.
// Used exclusively within the admin dashboard KPI tab.
//WHY: Avoids duplicating the card markup across all 3 metric cards.

function KPICard({ label, value }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

module.exports = KPICard;
```

Note: Add `kpiCard` and `kpiLabel`/`kpiValue` to `styles.js` if not already present.

**Step 3: Update admin.jsx import**

Add at top:
```javascript
import KPICard from '../components/admin/KPICard';
```

Replace each `<div style={styles.kpiCard}>` block with `<KPICard label="..." value="..." />`.

**Step 4: Verify tests pass**

```bash
cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="admin" 2>&1 | tail -10
```

**Step 5: Commit**

```bash
git add frontend/pages/admin.jsx frontend/components/admin/KPICard.jsx
git commit -m "refactor(frontend): extract KPICard from admin.jsx"
```

---

## Task 4: Extract `KPITab` component to `components/admin/KPITab.jsx`

The KPI tab section (lines 176-223) renders: 3 KPICards, a payment-split Card, and a system-notes Card.

**Files:**
- Create: `frontend/components/admin/KPITab.jsx`
- Modify: `frontend/pages/admin.jsx`

**Step 1: Write the component**

```javascript
// frontend/components/admin/KPITab.jsx
// KPI tab — renders metrics grid, payment split bar, and system notes.
//WHY: Isolates KPI rendering logic from admin page orchestration.
//     Enables independent testing of KPI display logic.

import Card from '../ui/Card';
import KPICard from './KPICard';
import styles from './styles';

function KPITab({ metrics }) {
  return (
    <div style={styles.content}>
      <div style={styles.kpisGrid}>
        <KPICard label="Total Customers" value={metrics.totalCustomers} />
        <KPICard label="Active Subscriptions" value={metrics.activeSubscriptions} />
        <KPICard label="Monthly Recurring Revenue" value={`$${metrics.mrr.toFixed(2)}`} />
      </div>

      <Card title="Payment Method Split" style={{ marginBottom: '2rem' }}>
        <div style={styles.paymentSplit}>
          <div style={styles.splitItem}>
            <div style={styles.splitLabel}>Cryptocurrency</div>
            <div style={styles.splitBar}>
              <div style={{ ...styles.splitFill, width: `${metrics.cryptoVsFiat.crypto}%` }} />
            </div>
            <div style={styles.splitPercent}>{metrics.cryptoVsFiat.crypto}%</div>
          </div>
          <div style={styles.splitItem}>
            <div style={styles.splitLabel}>Fiat (Credit Card)</div>
            <div style={styles.splitBar}>
              <div style={{ ...styles.splitFill, backgroundColor: '#20B2AA', width: `${metrics.cryptoVsFiat.fiat}%` }} />
            </div>
            <div style={styles.splitPercent}>{metrics.cryptoVsFiat.fiat}%</div>
          </div>
        </div>
      </Card>

      <Card title="System Notes">
        <ul style={styles.notesList}>
          <li>MRR is calculated from active subscriptions only</li>
          <li>Crypto includes Bitcoin and other cryptocurrencies via Plisio</li>
          <li>Fiat includes all credit card payments via PaymentsCloud</li>
          <li>Metrics update in real-time as subscriptions change</li>
        </ul>
      </Card>
    </div>
  );
}

module.exports = KPITab;
```

**Step 2: Wire into admin.jsx**

Replace the entire KPI tab section in admin.jsx (lines 176-223) with:
```javascript
{tab === 'kpis' && <KPITab metrics={metrics} />}
```

**Step 3: Verify tests pass**

```bash
cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="admin" 2>&1 | tail -10
```
Expected: All 15 admin tests pass.

**Step 4: Commit**

```bash
git add frontend/pages/admin.jsx frontend/components/admin/KPITab.jsx
git commit -m "refactor(frontend): extract KPITab from admin.jsx"
```

---

## Task 5: Extract `CustomersTab` component to `components/admin/CustomersTab.jsx`

The Customers tab section (lines 226-~320) renders: a search form with sanitize, a results grid, and action buttons (reset password, rotate recovery kit, deactivate, delete).

**Files:**
- Create: `frontend/components/admin/CustomersTab.jsx`
- Modify: `frontend/pages/admin.jsx`

**Step 1: Write the component**

```javascript
// frontend/components/admin/CustomersTab.jsx
// Customers tab — admin customer search and management.
//WHY: Isolates customer management from admin page orchestration.
//     Enables independent testing of customer search and actions.
// NOTE: Action buttons (reset password, rotate kit, deactivate, delete) call
//       adminController endpoints directly via api.* methods. These are privileged
//       operations that should remain in the admin panel.
import { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { FormGroup, Input } from '../ui/Form';
import api from '../../api/client';
import { sanitizeText } from '../../lib/sanitize';
import styles from './styles';

function CustomersTab() {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerData, setCustomerData] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleSearchCustomer = async (e) => {
    e.preventDefault();
    const sanitizedSearch = sanitizeText(customerSearch);
    if (!sanitizedSearch.trim()) return;
    setSearching(true);
    try {
      const response = await api.searchCustomer(sanitizedSearch);
      setCustomerData(response.data);
    } catch (err) {
      setCustomerData(null);
    } finally {
      setSearching(false);
    }
  };

  // Action handlers call adminController endpoints
  const handleResetPassword = async (id) => { /* ... */ };
  const handleRotateRecoveryKit = async (id) => { /* ... */ };
  const handleDeactivateCustomer = async (id) => { /* ... */ };
  const handleDeleteCustomer = async (id) => { /* ... */ };

  return (
    <div style={styles.content}>
      <Card title="Search Customer">
        <form onSubmit={handleSearchCustomer} style={styles.searchForm}>
          <FormGroup>
            <Input
              placeholder="e.g., 12345678"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
          </FormGroup>
          <Button type="submit" disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </Button>
        </form>
      </Card>

      {customerData && (
        <Card title="Customer Details" style={{ marginTop: '1.5rem' }}>
          {/* render customer data grid + action buttons */}
        </Card>
      )}
    </div>
  );
}

module.exports = CustomersTab;
```

**Step 2: Wire into admin.jsx**

Replace the customers tab section with:
```javascript
{tab === 'customers' && <CustomersTab />}
```

**Step 3: Write unit tests**

```javascript
// frontend/tests/components/admin/CustomersTab.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

// Mock next/router
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Mock api/client
jest.mock('../../api/client', () => ({
  searchCustomer: jest.fn(),
  resetCustomerPassword: jest.fn(),
  rotateCustomerRecoveryKit: jest.fn(),
  deactivateCustomer: jest.fn(),
  deleteCustomer: jest.fn(),
}));

// Mock lib/sanitize
jest.mock('../../lib/sanitize', () => ({
  sanitizeText: jest.fn((t) => t.trim()),
}));

import CustomersTab from '../../../components/admin/CustomersTab';

describe('CustomersTab', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders search form', () => {
    render(<CustomersTab />);
    expect(screen.getByPlaceholderText('e.g., 12345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search/i })).toBeInTheDocument();
  });

  it('calls sanitizeText before API search', async () => {
    const api = require('../../api/client');
    const sanitize = require('../../lib/sanitize').sanitizeText;
    api.searchCustomer.mockResolvedValue({ data: null });

    render(<CustomersTab />);
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), '  12345678  ');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));

    await waitFor(() => expect(sanitize).toHaveBeenCalledWith('  12345678  '));
  });

  it('disables search button while loading', async () => {
    const api = require('../../api/client');
    api.searchCustomer.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: null }), 100))
    );

    render(<CustomersTab />);
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Search/i })).toBeDisabled());
  });

  // ... more tests for action handlers
});
```

**Step 4: Run tests**

```bash
cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="CustomersTab" 2>&1 | tail -15
```

**Step 5: Commit**

```bash
git add frontend/pages/admin.jsx frontend/components/admin/CustomersTab.jsx frontend/tests/components/admin/CustomersTab.test.jsx
git commit -m "refactor(frontend): extract CustomersTab from admin.jsx"
```

---

## Task 6: Extract `AffiliatesTab` component to `components/admin/AffiliatesTab.jsx`

The Affiliates tab section renders: a data table with affiliate info, disable/adjust action buttons, and an Export CSV button.

**Files:**
- Create: `frontend/components/admin/AffiliatesTab.jsx`
- Modify: `frontend/pages/admin.jsx`

**Step 1: Write the component**

```javascript
// frontend/components/admin/AffiliatesTab.jsx
// Affiliates management tab — renders affiliate table, disable/adjust actions, CSV export.
//WHY: Isolates affiliate management from admin page orchestration.
//     CSV export logic tested here rather than in page-level tests.
import { useState } from 'react';
import Button from '../ui/Button';
import api from '../../api/client';
import styles from './styles';

function AffiliatesTab({ affiliates: initialAffiliates }) {
  const [affiliates, setAffiliates] = useState(initialAffiliates || []);

  const handleDisableAffiliate = async (id) => { /* ... */ };
  const handleAdjustEarnings = async (id) => { /* ... */ };
  const handleExportCSV = () => {
    // Full CSV export logic moved here (lines 115-139 of admin.jsx)
    const headers = ['Account', 'Code', 'Active Referrals', ...];
    // ... blob creation and download
  };

  return (
    <div style={styles.content}>
      {/* Render affiliates table */}
      {/* Render Export CSV button */}
    </div>
  );
}

module.exports = AffiliatesTab;
```

**Step 2: Wire into admin.jsx**

Replace the affiliates tab section with:
```javascript
{tab === 'affiliates' && <AffiliatesTab affiliates={affiliates} />}
```

**Step 3: Write unit tests**

Similar pattern to CustomersTab — test disable, adjust, cancel, and CSV export.

**Step 4: Run tests**

```bash
cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="AffiliatesTab" 2>&1 | tail -15
```

**Step 5: Commit**

```bash
git add frontend/pages/admin.jsx frontend/components/admin/AffiliatesTab.jsx frontend/tests/components/admin/AffiliatesTab.test.jsx
git commit -m "refactor(frontend): extract AffiliatesTab from admin.jsx"
```

---

## Task 7: Final integration verification

**Step 1: Run full test suite**

```bash
cd /tmp/Decontaminate/frontend && npm test 2>&1 | tail -10
```
Expected: All 885+ frontend tests pass (including new component tests).

**Step 2: Run linter**

```bash
cd /tmp/Decontaminate/frontend && npm run lint 2>&1
```
Expected: 0 errors.

**Step 3: Verify admin.jsx line count reduced**

```bash
wc -l frontend/pages/admin.jsx
```
Expected: ~120 lines or fewer (down from 496).

**Step 4: Final commit**

```bash
git add -A && git commit -m "feat(frontend): complete admin dashboard decomposition"
```

---

## Verification Checklist

- [ ] `components/admin/` directory created with:
  - [ ] `styles.js`
  - [ ] `KPICard.jsx`
  - [ ] `KPITab.jsx`
  - [ ] `CustomersTab.jsx`
  - [ ] `AffiliatesTab.jsx`
- [ ] `pages/admin.jsx` reduced from 496 lines to ~120 lines
- [ ] Each new component has unit tests
- [ ] Admin page integration tests pass (admin.test.jsx)
- [ ] All 885+ frontend tests passing
- [ ] Lint clean (0 errors)
- [ ] Backend tests unchanged (2,098 total)
