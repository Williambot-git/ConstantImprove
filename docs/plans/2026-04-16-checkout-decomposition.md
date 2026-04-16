# Checkout Page Decomposition Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Decompose `pages/checkout.jsx` (1161 lines) into reusable components, improving maintainability and testability without changing any behavior.

**Architecture:** Extract inline plan/payment constants and UI sections into dedicated components under `components/checkout/`. The page becomes a orchestrator composing these components.

**Tech Stack:** Next.js (Pages Router), React, plain JSX, Jest + RTL

---

## Task 1: Extract PlanSelector Component

**Objective:** Pull the plan selection UI into a reusable `PlanSelector` component.

**Files:**
- Create: `frontend/components/checkout/PlanSelector.jsx`
- Modify: `frontend/pages/checkout.jsx`

**Step 1: Write failing test**

```javascript
// frontend/components/checkout/PlanSelector.test.jsx
import { render, screen } from '@testing-library/react';
import PlanSelector from './PlanSelector';

const TEST_PLANS = [
  { id: 'monthly', name: 'Monthly', price: '$5.99', period: '/month' },
  { id: 'annual', name: 'Annual', price: '$59.99', period: '/year' },
];

describe('PlanSelector', () => {
  it('renders all plan options', () => {
    render(<PlanSelector plans={TEST_PLANS} selectedPlan="monthly" onSelect={() => {}} />);
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('Annual')).toBeInTheDocument();
  });

  it('calls onSelect when a plan is clicked', () => {
    const onSelect = jest.fn();
    render(<PlanSelector plans={TEST_PLANS} selectedPlan="monthly" onSelect={onSelect} />);
    // Click the annual plan button/card
    const cards = screen.getAllByRole('button');
    cards.find(b => b.textContent.includes('Annual')).click();
    expect(onSelect).toHaveBeenCalledWith('annual');
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/checkout/PlanSelector.test.jsx -v`
Expected: FAIL — "Cannot find module './PlanSelector'"

**Step 3: Write minimal implementation**

```javascript
// frontend/components/checkout/PlanSelector.jsx
import { Card } from '../ui/Card';
import Button from '../ui/Button';

export default function PlanSelector({ plans, selectedPlan, onSelect }) {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {plans.map((plan) => (
        <Card key={plan.id} style={{ cursor: 'pointer' }}>
          <h3>{plan.name}</h3>
          <p>{plan.price}</p>
          <p>{plan.period}</p>
          <Button
            onClick={() => onSelect(plan.id)}
            variant={selectedPlan === plan.id ? 'primary' : 'secondary'}
          >
            {selectedPlan === plan.id ? 'Selected' : 'Select'}
          </Button>
        </Card>
      ))}
    </div>
  );
}
```

**Step 4: Run test to verify pass**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/checkout/PlanSelector.test.jsx -v`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/components/checkout/PlanSelector.jsx frontend/components/checkout/PlanSelector.test.jsx
git commit -m "feat(frontend): extract PlanSelector component from checkout"
```

---

## Task 2: Extract CryptoSelector Component

**Objective:** Pull the cryptocurrency selection UI into a `CryptoSelector` component.

**Files:**
- Create: `frontend/components/checkout/CryptoSelector.jsx`
- Modify: `frontend/pages/checkout.jsx`

**Step 1: Write failing test**

```javascript
// frontend/components/checkout/CryptoSelector.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CryptoSelector from './CryptoSelector';

const TEST_OPTIONS = [
  { code: 'BTC', label: 'Bitcoin' },
  { code: 'ETH', label: 'Ethereum' },
];

describe('CryptoSelector', () => {
  it('renders all crypto options', () => {
    render(<CryptoSelector options={TEST_OPTIONS} selected="BTC" onSelect={() => {}} />);
    expect(screen.getByText('Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
  });

  it('calls onSelect when option changes', async () => {
    const onSelect = jest.fn();
    render(<CryptoSelector options={TEST_OPTIONS} selected="BTC" onSelect={onSelect} />);
    const user = userEvent.setup();
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'ETH');
    expect(onSelect).toHaveBeenCalledWith('ETH');
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/checkout/CryptoSelector.test.jsx -v`
Expected: FAIL — "Cannot find module './CryptoSelector'"

**Step 3: Write minimal implementation**

```javascript
// frontend/components/checkout/CryptoSelector.jsx
export default function CryptoSelector({ options, selected, onSelect }) {
  return (
    <select onChange={(e) => onSelect(e.target.value)} value={selected}>
      {options.map((opt) => (
        <option key={opt.code} value={opt.code}>
          {opt.label} ({opt.code})
        </option>
      ))}
    </select>
  );
}
```

**Step 4: Run test to verify pass**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/checkout/CryptoSelector.test.jsx -v`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/components/checkout/CryptoSelector.jsx frontend/components/checkout/CryptoSelector.test.jsx
git commit -m "feat(frontend): extract CryptoSelector component from checkout"
```

---

## Task 3: Extract PaymentMethodSelector Component

**Objective:** Pull the payment method tab/selector into a `PaymentMethodSelector` component.

**Files:**
- Create: `frontend/components/checkout/PaymentMethodSelector.jsx`
- Modify: `frontend/pages/checkout.jsx`

**Step 1: Write failing test**

```javascript
// frontend/components/checkout/PaymentMethodSelector.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentMethodSelector from './PaymentMethodSelector';

const TEST_METHODS = [
  { id: 'crypto', name: 'Cryptocurrency', provider: 'Plisio' },
  { id: 'card', name: 'Credit Card', provider: 'PaymentsCloud' },
];

describe('PaymentMethodSelector', () => {
  it('renders all payment methods as tabs', () => {
    render(<PaymentMethodSelector methods={TEST_METHODS} selected="crypto" onSelect={() => {}} />);
    expect(screen.getByText('Cryptocurrency')).toBeInTheDocument();
    expect(screen.getByText('Credit Card')).toBeInTheDocument();
  });

  it('calls onSelect with method id when tab clicked', async () => {
    const onSelect = jest.fn();
    render(<PaymentMethodSelector methods={TEST_METHODS} selected="crypto" onSelect={onSelect} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Credit Card'));
    expect(onSelect).toHaveBeenCalledWith('card');
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/checkout/PaymentMethodSelector.test.jsx -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```javascript
// frontend/components/checkout/PaymentMethodSelector.jsx
import styles from './PaymentMethodSelector.module.css';

export default function PaymentMethodSelector({ methods, selected, onSelect }) {
  return (
    <div className={styles.tabs}>
      {methods.map((method) => (
        <button
          key={method.id}
          className={selected === method.id ? styles.activeTab : styles.tab}
          onClick={() => onSelect(method.id)}
        >
          {method.name}
        </button>
      ))}
    </div>
  );
}
```

**Step 4: Run test to verify pass**

Run: `cd /tmp/Decontaminate/frontend && npx jest components/checkout/PaymentMethodSelector.test.jsx -v`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/components/checkout/PaymentMethodSelector.jsx frontend/components/checkout/PaymentMethodSelector.test.jsx
git commit -m "feat(frontend): extract PaymentMethodSelector component from checkout"
```

---

## Task 4: Refactor checkout.jsx to Use Extracted Components

**Objective:** Update checkout.jsx to import and use the three new components, replacing the inline code.

**Files:**
- Modify: `frontend/pages/checkout.jsx`

**Changes (conceptual):**
1. Add imports for `PlanSelector`, `CryptoSelector`, `PaymentMethodSelector`
2. Replace inline `PLANS` and `PAYMENT_METHODS` constants — they remain in the page file (they're page-specific config)
3. Replace inline crypto selector JSX with `<CryptoSelector options={CRYPTO_OPTIONS} selected={selectedCrypto} onSelect={setSelectedCrypto} />`
4. Replace inline payment method tabs with `<PaymentMethodSelector methods={PAYMENT_METHODS} selected={paymentMethod} onSelect={setPaymentMethod} />`
5. Replace inline plan cards with `<PlanSelector plans={PLANS} selectedPlan={selectedPlan} onSelect={setSelectedPlan} />`

**Step 1: Verify existing tests still pass**

Run: `cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="checkout" -q 2>&1 | tail -10`
Note: There may not be checkout-specific tests yet — this is a smoke check.

**Step 2: Make the changes to checkout.jsx**

Replace the inline component JSX with imports. The page logic (state management, API calls, router) remains unchanged — only the inline JSX sections are replaced with component calls.

**Step 3: Verify lint still clean**

Run: `cd /tmp/Decontaminate/frontend && npm run lint 2>&1 | tail -5`

**Step 4: Verify page still works (smoke test)**

Run: `cd /tmp/Decontaminate/frontend && npx jest pages/index.test.jsx -q` (or whatever smoke tests exist)

**Step 5: Commit**

```bash
git add frontend/pages/checkout.jsx
git commit -m "refactor(frontend): use extracted checkout components in checkout.jsx"
```

---

## Task 5: Add Checkout Flow Integration Test

**Objective:** Add a Jest + RTL test that verifies the checkout page composes correctly with all extracted components.

**Files:**
- Create: `frontend/tests/checkout-flow.test.jsx`

**Step 1: Write the integration test**

```javascript
// frontend/tests/checkout-flow.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Checkout from '../pages/checkout';

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Mock the auth context
jest.mock('../pages/_app', () => ({
  AuthContext: { Consumer: ({ children }) => children({ isLoggedIn: true, user: { id: 1 } }) },
}));

// Mock the API client
jest.mock('../api/client', () => ({
  get: jest.fn().mockResolvedValue({ data: { vpn_ready: true } }),
  post: jest.fn().mockResolvedValue({ data: { success: true } }),
}));

describe('Checkout Flow Integration', () => {
  it('renders checkout page with plan selector', () => {
    render(<Checkout />);
    expect(screen.getByText(/Get AHOY VPN/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd /tmp/Decontriminante/frontend && npx jest tests/checkout-flow.test.jsx -v`
Expected: FAIL (may need additional mocks)

**Step 3: Fix and get test passing**

Adjust mocks until test passes.

**Step 4: Commit**

```bash
git add frontend/tests/checkout-flow.test.jsx
git commit -m "test(frontend): add checkout flow integration test"
```

---

## Verification

After all tasks:
- `cd /tmp/Decontaminate/frontend && npm test -q` → all tests pass
- `cd /tmp/Decontaminate/frontend && npm run lint` → 0 errors
- `pages/checkout.jsx` reduced from 1161 lines to ~400 lines
- 3 new components in `components/checkout/` each with unit tests
- 1 new integration test covering the checkout page
