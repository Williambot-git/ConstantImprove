# Checkout Component Unit Tests Implementation Plan

> **For Hermes:** Execute directly in controller session (subagent filesystem isolation prevents subagents from writing to repo).

**Goal:** Add unit tests for 3 uncovered checkout components (PlanSelector, CryptoSelector, PaymentMethodSelector) — 0% coverage each.

**Architecture:** Pure React presentational components with no hooks or context. Test with shallow Enzyme rendering.

**Tech Stack:** Jest + Enzyme (RTL pattern already established in frontend/tests/setup.js)

---

## Task 1: PlanSelector unit tests

**Objective:** Add tests for PlanSelector.jsx component

**Files:**
- Create: `frontend/tests/components/checkout/PlanSelector.test.jsx`
- Source: `frontend/components/checkout/PlanSelector.jsx`

**Step 1: Write failing test**

```jsx
// PlanSelector.test.jsx
import { shallow } from 'enzyme';
import React from 'react';
import PlanSelector from '../../components/checkout/PlanSelector';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

describe('PlanSelector', () => {
  const mockPlans = [
    { id: 'monthly', name: 'Monthly Plan', price: '$5.99', period: '/month' },
    { id: 'annual', name: 'Annual Plan', price: '$59.99', period: '/year', cryptoOnly: true },
  ];

  it('renders all plans as Card components', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<PlanSelector plans={mockPlans} selectedPlan={null} onSelect={onSelect} />);
    expect(wrapper.find(Card)).toHaveLength(2);
  });

  it('renders plan name, price, and period', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<PlanSelector plans={mockPlans} selectedPlan={null} onSelect={onSelect} />);
    expect(wrapper.html()).toContain('Monthly Plan');
    expect(wrapper.html()).toContain('$5.99');
    expect(wrapper.html()).toContain('/month');
  });

  it('marks selected plan with primary button variant', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<PlanSelector plans={mockPlans} selectedPlan="monthly" onSelect={onSelect} />);
    const buttons = wrapper.find(Button);
    // First button (monthly) should be 'primary', second (annual) 'secondary'
    expect(buttons.at(0).prop('variant')).toBe('primary');
    expect(buttons.at(1).prop('variant')).toBe('secondary');
  });

  it('calls onSelect with plan id when button clicked', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<PlanSelector plans={mockPlans} selectedPlan={null} onSelect={onSelect} />);
    wrapper.find(Button).at(1).simulate('click');
    expect(onSelect).toHaveBeenCalledWith('annual');
  });

  it('renders crypto-only badge for cryptoOnly plans', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<PlanSelector plans={mockPlans} selectedPlan={null} onSelect={onSelect} />);
    expect(wrapper.html()).toContain('Crypto only');
  });

  it('renders Selected text for selected plan button', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<PlanSelector plans={mockPlans} selectedPlan="monthly" onSelect={onSelect} />);
    expect(wrapper.find(Button).at(0).prop('children')).toContain('Selected');
  });

  it('renders Select text for non-selected plan button', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<PlanSelector plans={mockPlans} selectedPlan={null} onSelect={onSelect} />);
    expect(wrapper.find(Button).at(0).prop('children')).toContain('Select');
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd frontend && npm test -- --testPathPatterns="PlanSelector" --coverage`
Expected: FAIL — file not found

**Step 3: Create test file**

Write the file above to `frontend/tests/components/checkout/PlanSelector.test.jsx`

**Step 4: Run test to verify pass**

Run: `cd frontend && npm test -- --testPathPatterns="PlanSelector"`
Expected: PASS — 7 tests passing

**Step 5: Commit**

```bash
git add frontend/tests/components/checkout/PlanSelector.test.jsx
git commit -m "test(frontend): add PlanSelector unit tests (7 cases)"
```

---

## Task 2: CryptoSelector unit tests

**Objective:** Add tests for CryptoSelector.jsx component

**Files:**
- Create: `frontend/tests/components/checkout/CryptoSelector.test.jsx`
- Source: `frontend/components/checkout/CryptoSelector.jsx`

**Step 1: Write failing test**

```jsx
import { shallow } from 'enzyme';
import React from 'react';
import CryptoSelector from '../../components/checkout/CryptoSelector';

describe('CryptoSelector', () => {
  const mockOptions = [
    { code: 'BTC', label: 'Bitcoin' },
    { code: 'ETH', label: 'Ethereum' },
    { code: 'USDT', label: 'Tether' },
  ];

  it('renders a select element', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<CryptoSelector options={mockOptions} selected="" onSelect={onSelect} />);
    expect(wrapper.find('select')).toHaveLength(1);
  });

  it('renders all crypto options', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<CryptoSelector options={mockOptions} selected="" onSelect={onSelect} />);
    expect(wrapper.find('option')).toHaveLength(3 + 1); // +1 for placeholder
  });

  it('has placeholder option disabled', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<CryptoSelector options={mockOptions} selected="" onSelect={onSelect} />);
    const placeholder = wrapper.find('option').first();
    expect(placeholder.prop('disabled')).toBe(true);
    expect(placeholder.text()).toContain('Select Cryptocurrency');
  });

  it('calls onSelect with option code when changed', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<CryptoSelector options={mockOptions} selected="" onSelect={onSelect} />);
    wrapper.find('select').simulate('change', { target: { value: 'ETH' } });
    expect(onSelect).toHaveBeenCalledWith('ETH');
  });

  it('sets selected value on the select element', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<CryptoSelector options={mockOptions} selected="BTC" onSelect={onSelect} />);
    expect(wrapper.find('select').prop('value')).toBe('BTC');
  });

  it('displays label and code in each option', () => {
    const onSelect = jest.fn();
    const wrapper = shallow(<CryptoSelector options={mockOptions} selected="" onSelect={onSelect} />);
    const options = wrapper.find('option');
    expect(options.at(1).text()).toContain('Bitcoin');
    expect(options.at(1).text()).toContain('BTC');
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd frontend && npm test -- --testPathPatterns="CryptoSelector"`
Expected: FAIL

**Step 3: Create test file**

Write the file above to `frontend/tests/components/checkout/CryptoSelector.test.jsx`

**Step 4: Run test to verify pass**

Expected: PASS — 6 tests passing

**Step 5: Commit**

```bash
git add frontend/tests/components/checkout/CryptoSelector.test.jsx
git commit -m "test(frontend): add CryptoSelector unit tests (6 cases)"
```

---

## Task 3: PaymentMethodSelector unit tests

**Objective:** Add tests for PaymentMethodSelector.jsx component

**Files:**
- Create: `frontend/tests/components/checkout/PaymentMethodSelector.test.jsx`
- Source: `frontend/components/checkout/PaymentMethodSelector.jsx`

**Step 1: Read the source file first**

```jsx
// Read frontend/components/checkout/PaymentMethodSelector.jsx to understand structure
```

**Step 2: Write failing test**

```jsx
import { shallow } from 'enzyme';
import React from 'react';
import PaymentMethodSelector from '../../components/checkout/PaymentMethodSelector';
```

**Step 3: Create test file** following the same pattern

**Step 4: Run test to verify pass**

**Step 5: Commit**

---

## Verification

```bash
cd frontend && npm test -- --testPathPatterns="components/checkout" --coverage
```

Expected: All tests pass, new files covered.
