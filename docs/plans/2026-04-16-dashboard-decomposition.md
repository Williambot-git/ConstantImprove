# Dashboard.jsx Decomposition — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Decompose the 659-line customer dashboard page into focused, testable components using the same tab/section pattern proven in affiliate-dashboard and ahoyman-dashboard decompositions.

**Architecture:** Dashboard page orchestrates 3 data sections: subscription status, account settings, and VPN credentials. Each section becomes a standalone component. Modals (cancel subscription, delete account) also become components. Shared styles extracted to a styles.js module.

**Tech Stack:** Next.js (Pages Router), React Context, @testing-library/react, plain CSS-in-JS (existing pattern)

---

## Task 1: Write Implementation Plan (this document)

**Status:** ✅ Done

---

## Task 2: Extract shared styles to `components/dashboard/styles.js`

Extract the inline `styles` object from `dashboard.jsx` into a separate `styles.js` file so it can be imported by both the page and future tab components. This avoids duplicating the style object and makes it reusable.

**Files:**
- Create: `frontend/components/dashboard/styles.js`
- Modify: `frontend/pages/dashboard.jsx`

**Step 1: Create the styles file**

```javascript
// frontend/components/dashboard/styles.js
// Shared styles for dashboard page and sub-components.
// Extracted from dashboard.jsx to enable component decomposition
// and avoid style duplication across dashboard components.

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem',
  },
  title: {
    marginBottom: '2rem',
  },
  card: {
    marginBottom: '2rem',
    padding: '2rem',
  },
  // ... (copy all styles from dashboard.jsx lines 500-659)
};

module.exports = styles;
```

**Step 2: Update dashboard.jsx import**

Add at top of dashboard.jsx:
```javascript
const styles = require('../components/dashboard/styles');
```

Remove the inline `const styles = {...}` at bottom of dashboard.jsx.

**Step 3: Verify no changes to rendered output**

```bash
cd /tmp/Decontaminate/frontend && npm test 2>&1 | tail -10
```
Expected: All 105 tests still pass.

**Step 4: Commit**

```bash
cd /tmp/Decontaminate && git add frontend/pages/dashboard.jsx frontend/components/dashboard/styles.js
git commit -m "refactor(frontend): extract shared styles from dashboard"
```

---

## Task 3: Extract `PlanCard` sub-component to `components/dashboard/PlanCard.jsx`

The `PlanCard` function (lines 469-496) is a reusable plan display component used in the subscription upgrade section.

**Files:**
- Create: `frontend/components/dashboard/PlanCard.jsx`
- Modify: `frontend/pages/dashboard.jsx`

**Step 1: Write the component**

```javascript
// frontend/components/dashboard/PlanCard.jsx
import Card from '../ui/Card';
import Button from '../ui/Button';

function PlanCard({ plan, onSelect, selected }) {
  return (
    <Card style={{
      ...styles.planCard,
      ...(selected && styles.planCardSelected),
      ...(plan.highlight && styles.planCardHighlighted)
    }}>
      <h3>{plan.name}</h3>
      <div style={styles.planPrice}>
        <span style={styles.priceAmount}>{plan.price}</span>
        <span style={styles.pricePeriod}>{plan.period}</span>
      </div>
      <p style={styles.planDescription}>{plan.description}</p>
      <ul style={styles.planFeatures}>
        {plan.features.map((feature, i) => (
          <li key={i}>{feature}</li>
        ))}
      </ul>
      {plan.cryptoOnly && (
        <p style={styles.cryptoOnly}>Crypto payment only</p>
      )}
      <Button onClick={onSelect} style={styles.selectButton}>
        Select Plan
      </Button>
    </Card>
  );
}

module.exports = PlanCard;
```

**Step 2: Import in dashboard.jsx**

Replace the inline `function PlanCard(...)` with:
```javascript
import PlanCard from '../components/dashboard/PlanCard';
```

**Step 3: Verify tests pass**

```bash
cd /tmp/Decontaminate/frontend && npm test 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add frontend/pages/dashboard.jsx frontend/components/dashboard/PlanCard.jsx
git commit -m "refactor(frontend): extract PlanCard from dashboard"
```

---

## Task 4: Extract `SubscriptionSection` component

The subscription status card (lines 283-309) shows either active subscription details or plan selection if no subscription. It contains the `PLANS` constant and `PlanCard` usage.

**Files:**
- Create: `frontend/components/dashboard/SubscriptionSection.jsx`
- Modify: `frontend/pages/dashboard.jsx`

**Step 1: Write the component**

```javascript
// frontend/components/dashboard/SubscriptionSection.jsx
import { useState } from 'react';
import { useRouter } from 'next/router';
import Card from '../ui/Card';
import Button from '../ui/Button';
import PlanCard from './PlanCard';
import styles from './styles';

// Plans data — mirrors the plans from backend /api/payment/plans
// Kept in sync with backend plans:
//   monthly: $5.99/mo, quarterly: $16.99/3mo, semi-annual: $31.99/6mo, annual: $59.99/yr
const PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$5.99',
    period: '/month + tax',
    description: 'Perfect for trying AHOY VPN',
    features: ['10 simultaneous connections', '50+ server locations', '24/7 support'],
    cryptoOnly: false,
  },
  {
    id: 'quarterly',
    name: 'Quarterly',
    price: '$16.99',
    period: '/3 months + tax',
    description: 'Great value, save a bit',
    features: ['10 simultaneous connections', '50+ server locations', '24/7 support', 'Save 5%'],
    highlight: true,
    cryptoOnly: false,
  },
  {
    id: 'semiannual',
    name: 'Semi-Annual',
    price: '$31.99',
    period: '/6 months + tax',
    description: 'Best savings',
    features: ['10 simultaneous connections', '50+ server locations', '24/7 support', 'Save 10%'],
    cryptoOnly: true,
  },
  {
    id: 'annual',
    name: 'Annual',
    price: '$59.99',
    period: '/year + tax',
    description: 'Ultimate savings',
    features: ['10 simultaneous connections', '50+ server locations', '24/7 support', 'Save 15%'],
    cryptoOnly: true,
  },
];

function SubscriptionSection({ subscription, paymentMethod }) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState(null);

  const handlePurchase = (plan) => {
    setSelectedPlan(plan);
    router.push(`/checkout?plan=${plan.id}&method=${paymentMethod}`);
  };

  if (subscription) {
    return (
      <Card style={styles.card}>
        <h2>Subscription Status</h2>
        <p><strong>Plan:</strong> {subscription.planName}</p>
        <p><strong>Status:</strong> {subscription.status}</p>
        <p><strong>Next Billing:</strong> {subscription.nextBilling}</p>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <h2>Subscription Status</h2>
      <p style={{ marginBottom: '1rem' }}>No active subscription. Choose a plan below to get started.</p>
      <div style={styles.plansGrid}>
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onSelect={() => handlePurchase(plan)}
            selected={selectedPlan?.id === plan.id}
          />
        ))}
      </div>
    </Card>
  );
}

module.exports = SubscriptionSection;
```

**Step 2: Wire into dashboard.jsx**

Replace the subscription section in dashboard.jsx with:
```javascript
<SubscriptionSection
  subscription={subscription}
  paymentMethod={paymentMethod}
/>
```

Keep `paymentMethod` state in dashboard.jsx (it's also used by handlePurchase).

**Step 3: Write unit test**

```javascript
// frontend/tests/components/dashboard/SubscriptionSection.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubscriptionSection from '../../../components/dashboard/SubscriptionSection';

// Mock useRouter
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('SubscriptionSection', () => {
  it('renders active subscription details when subscription provided', () => {
    const sub = { planName: 'Monthly', status: 'active', nextBilling: '2026-05-16' };
    render(<SubscriptionSection subscription={sub} paymentMethod="crypto" />);
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('renders plan selection when no subscription', () => {
    render(<SubscriptionSection subscription={null} paymentMethod="crypto" />);
    expect(screen.getByText('No active subscription')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('$5.99')).toBeInTheDocument();
  });

  it('navigates to checkout on plan select', async () => {
    const push = jest.fn();
    jest.spyOn(require('next/router'), 'useRouter').mockReturnValue({ push });
    render(<SubscriptionSection subscription={null} paymentMethod="crypto" />);
    await userEvent.click(screen.getAllByText('Select Plan')[0]);
    expect(push).toHaveBeenCalledWith(expect.stringContaining('/checkout?plan='));
  });
});
```

**Step 4: Run tests**

```bash
cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="SubscriptionSection" 2>&1 | tail -15
```

**Step 5: Commit**

```bash
git add frontend/pages/dashboard.jsx frontend/components/dashboard/SubscriptionSection.jsx frontend/tests/components/dashboard/SubscriptionSection.test.jsx
git commit -m "refactor(frontend): extract SubscriptionSection from dashboard"
```

---

## Task 5: Extract `AccountSettingsSection` component

The account settings card (lines 311-397) handles: password change form, recovery kit generation, data export request, and delete account.

**Files:**
- Create: `frontend/components/dashboard/AccountSettingsSection.jsx`
- Modify: `frontend/pages/dashboard.jsx`

**Step 1: Write the component**

Key pieces to extract:
- `showPasswordForm`, `showNewKit`, `showDeleteModal` state
- `oldPassword`, `newPassword`, `confirmPassword` state
- `passwordLoading`, `passwordError`, `passwordSuccess` state
- `handleChangePassword` function
- `handleGenerateKit` function
- `handleCopyKit` function
- `handleRequestDataExport` function
- `handleDeleteAccount` function
- The entire settings card JSX

```javascript
// frontend/components/dashboard/AccountSettingsSection.jsx
import { useState } from 'react';
import { useRouter } from 'next/router';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { FormGroup, Input } from '../ui/Form';
import api from '../../api/client';
import { AuthContext } from '../../pages/_app';
import { useContext } from 'react';
import styles from './styles';

function AccountSettingsSection({ profile }) {
  const auth = useContext(AuthContext);
  const router = useRouter();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showNewKit, setShowNewKit] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [newRecoveryKit, setNewRecoveryKit] = useState('');
  const [kitCopied, setKitCopied] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [exportToken, setExportToken] = useState('');
  const [exportError, setExportError] = useState('');

  // ... (implement all handlers and render JSX)
}

module.exports = AccountSettingsSection;
```

**Step 2: Wire into dashboard.jsx**

**Step 3: Write unit test**

**Step 4: Commit**

---

## Task 6: Extract modals to `components/dashboard/CancelModal.jsx` and `DeleteModal.jsx`

**Files:**
- Create: `frontend/components/dashboard/CancelModal.jsx`
- Create: `frontend/components/dashboard/DeleteModal.jsx`
- Modify: `frontend/pages/dashboard.jsx`

**Step 1-4: Same pattern as above**

---

## Task 7: Extract `VpnCredentialsSection` component

The VPN credentials card (lines 399-429).

**Files:**
- Create: `frontend/components/dashboard/VpnCredentialsSection.jsx`
- Modify: `frontend/pages/dashboard.jsx`

---

## Task 8: Write dashboard page integration test

```javascript
// frontend/tests/dashboard.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../pages/dashboard';

// Mock api client
jest.mock('../api/client', () => ({
  getUser: jest.fn(),
  getSubscription: jest.fn(),
  changePassword: jest.fn(),
  generateRecoveryKit: jest.fn(),
  exportAccountData: jest.fn(),
  cancelSubscription: jest.fn(),
  deleteAccount: jest.fn(),
}));

// Mock auth context
const mockAuth = {
  isLoggedIn: true,
  user: { accountNumber: '12345678' },
  logout: jest.fn(),
};

jest.mock('../pages/_app', () => ({
  AuthContext: React.createContext(mockAuth),
}));

describe('Dashboard Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dashboard when logged in', async () => {
    api.getUser.mockResolvedValue({ data: { data: { account_number: '12345678' } } });
    api.getSubscription.mockResolvedValue({ data: { data: null } });
    render(<Dashboard />);
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('shows subscription section with plans when no subscription', async () => {
    api.getUser.mockResolvedValue({ data: { data: {} } });
    api.getSubscription.mockResolvedValue({ data: { data: null } });
    render(<Dashboard />);
    expect(await screen.findByText('No active subscription')).toBeInTheDocument();
  });

  it('shows VPN credentials when available', async () => {
    api.getUser.mockResolvedValue({ data: { data: { vpn_username: 'testuser', vpn_password: 'testpass' } } });
    api.getSubscription.mockResolvedValue({ data: { data: null } });
    render(<Dashboard />);
    expect(await screen.findByText('testuser')).toBeInTheDocument();
  });
});
```

---

## Task 9: Final integration verification

```bash
cd /tmp/Decontaminate/frontend && npm test 2>&1 | tail -15
# Expected: all tests pass (should be ~110+ with new tests)
```

Run linter:
```bash
cd /tmp/Decontaminate/frontend && npm run lint 2>&1
# Expected: 0 errors
```

Final commit:
```bash
git add -A && git commit -m "feat(frontend): complete dashboard decomposition (tasks 1-9)"
```

---

## Verification Checklist

- [ ] `components/dashboard/` directory created with:
  - `styles.js`
  - `PlanCard.jsx`
  - `SubscriptionSection.jsx`
  - `AccountSettingsSection.jsx`
  - `VpnCredentialsSection.jsx`
  - `CancelModal.jsx`
  - `DeleteModal.jsx`
- [ ] `dashboard.jsx` reduced from 659 lines to ~100 lines
- [ ] All new components have unit tests
- [ ] Dashboard page integration test added
- [ ] All 105+ frontend tests passing
- [ ] Lint clean (0 errors)
- [ ] No regressions in backend tests
