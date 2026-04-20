# Checkout Wiring + US States Extraction Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Wire `CryptoSelector` into `checkout.jsx` (replace inline crypto text with the component) and extract the `US_STATES` constant into a shared module.

**Architecture:** Two small refactors that improve DRY and reuse existing component infrastructure:
1. Extract `US_STATES` to `frontend/lib/us-states.js` — eliminates 55-line inline constant duplication if other pages use it, and makes the data testable/stubbable
2. Replace the inline crypto help-text block in `checkout.jsx` (lines 419-426) with the already-built `CryptoSelector` component, passing `CRYPTO_OPTIONS` and `cryptoCurrency`/`setCryptoCurrency`

**Tech Stack:** Next.js, React, existing `CryptoSelector` component in `frontend/components/checkout/`

---

## Task 1: Extract US_STATES to shared module

**Objective:** Move the `US_STATES` constant from `checkout.jsx` to `frontend/lib/us-states.js` so it's reusable and independently testable.

**Files:**
- Create: `frontend/lib/us-states.js`
- Modify: `frontend/pages/checkout.jsx:725-790` (remove inline constant, import from lib)

**Step 1: Read current US_STATES from checkout.jsx**

Run: `grep -n "const US_STATES" frontend/pages/checkout.jsx`  
Expected: Line 725

Run: `sed -n '725,790p' frontend/pages/checkout.jsx`  
Expected: 55-entry US_STATES array

**Step 2: Create frontend/lib/us-states.js**

```javascript
/**
 * Canonical US states list — used for billing address forms.
 * Extracted from checkout.jsx to enable reuse and independent testing.
 * Source: https://en.wikipedia.org/wiki/List_of_U.S._states
 */
const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  // ... (all 55 entries)
];

module.exports = US_STATES;
```

**Step 3: Update checkout.jsx import**

Replace line 725 (`const US_STATES = [...]`) with:
```javascript
const US_STATES = require('../lib/us-states');
```

**Step 4: Verify tests still pass**

Run: `cd frontend && npx jest --config jest.config.cjs --testPathPatterns="checkout" --coverage=false --no-cache 2>&1 | tail -5`
Expected: All checkout tests pass

**Step 5: Commit**

```bash
git add frontend/lib/us-states.js frontend/pages/checkout.jsx
git commit -m "refactor(frontend): extract US_STATES to shared frontend/lib/us-states.js"
```

---

## Task 2: Wire CryptoSelector into checkout.jsx payment step

**Objective:** Replace the static inline crypto help text (lines 419-426 of checkout.jsx) with the `CryptoSelector` component that was already built but never wired.

**Files:**
- Modify: `frontend/pages/checkout.jsx:419-426` (replace inline text with CryptoSelector)
- Modify: `frontend/pages/checkout.jsx:10` (add CryptoSelector import)

**Step 1: Read current state of the payment step**

Run: `sed -n '405,430p' frontend/pages/checkout.jsx`
Expected: PaymentMethodSelector block followed by inline crypto text div

**Step 2: Update imports**

Add to import block (line ~10):
```javascript
import CryptoSelector from '../components/checkout/CryptoSelector';
```

**Step 3: Replace inline crypto div with CryptoSelector component**

Replace lines 419-426:
```javascript
          {selectedPayment === 'crypto' && (
            <div style={styles.cryptoSelector}>
              <p style={styles.cryptoSelectorLabel}>
                Cryptocurrency payments are processed by Plisio. You will choose your coin (BTC, ETH, USDC, etc.) on the
                Plisio invoice page.
              </p>
            </div>
          )}
```

With:
```javascript
          {selectedPayment === 'crypto' && (
            <CryptoSelector
              options={CRYPTO_OPTIONS}
              selected={cryptoCurrency}
              onSelect={setCryptoCurrency}
            />
          )}
```

**Step 4: Verify tests still pass**

Run: `cd frontend && npx jest --config jest.config.cjs --testPathPatterns="checkout" --coverage=false --no-cache 2>&1 | tail -5`
Expected: All checkout tests pass (PlanSelector, PaymentMethodSelector, checkout-flow)

**Step 5: Commit**

```bash
git add frontend/pages/checkout.jsx
git commit -m "feat(checkout): wire CryptoSelector into payment step — replaces inline crypto text with coin picker"
```

---

## Verification

After both tasks:
- Run full frontend test suite: `cd frontend && npx jest --config jest.config.cjs --coverage=false --no-cache`
- Expected: All passing (817+ tests)
- Expected: checkout.jsx line count reduced by ~8 lines (inline div → component call)
- Expected: US_STATES now in shared lib
