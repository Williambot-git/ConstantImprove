# Frontend Improvements Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix three targeted frontend quality issues — missing Select focus/blur handlers, Button ghost hover handlers, and an incomplete useEffect dependency.

**Architecture:** Three independent fixes, each with a minimal test to prevent regression.

---

## Task 1: Add missing onFocus/onBlur to Select in Form.jsx

**Objective:** Input and Select should have symmetric focus/blur handlers.

**Files:**
- Modify: `frontend/components/ui/Form.jsx` (lines 24-34)

**Step 1: Add handlers to Select**

```javascript
export function Select({ value, onChange, children, error = false, style = {}, ...props }) {
  return (
    <select value={value} onChange={onChange}
      style={{ width: '100%', padding: '0.625rem 0.875rem', backgroundColor: '#1A1A1A', color: '#F5F5F0', border: error ? '1px solid #EF4444' : '1px solid #2E2E2E', borderRadius: '6px', fontSize: '0.9rem', fontFamily: 'inherit', transition: 'border-color 0.2s ease', outline: 'none', cursor: 'pointer', ...style }}
      onFocus={(e) => { if (!error) { e.target.style.borderColor = '#3B82F6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)'; }}}
      onBlur={(e) => { e.target.style.borderColor = error ? '#EF4444' : '#2E2E2E'; e.target.style.boxShadow = 'none'; }}
      {...props}
    >
      {children}
    </select>
  );
}
```

**Step 2: Run existing tests**

Run: `cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="Form" -v`
Expected: PASS (existing Form tests still pass)

---

## Task 2: Fix Button ghost hover — add onMouseEnter/onMouseLeave

**Objective:** The ghost button variant has onMouseEnter/onMouseLeave handlers (lines 47, 53) but these lines are uncovered in tests. Add test coverage.

**Files:**
- Test: `frontend/tests/button-ghost-hover.test.js` (new)

**Step 1: Create ghost hover test**

```javascript
/**
 * Button ghost hover handlers test
 * =================================
 * Covers onMouseEnter/onMouseLeave on ghost variant (lines 47, 53).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import Button from '../components/ui/Button';

describe('Button ghost hover handlers', () => {
  it('changes borderColor and color on mouseEnter for ghost variant', () => {
    render(<Button variant="ghost">Ghost Button</Button>);
    const button = screen.getByRole('button', { name: 'Ghost Button' });
    // Initial state from ghost variant
    expect(button.style.borderColor).toBe('');
    expect(button.style.color).toBe('');
    // Simulate mouse enter
    fireEvent.mouseEnter(button);
    // After mouse enter: borderColor=#3B82F6, color=#3B82F6
    expect(button.style.borderColor).toBe('rgb(59, 130, 246)');
    expect(button.style.color).toBe('rgb(59, 130, 246)');
  });

  it('reverts borderColor and color on mouseLeave for ghost variant', () => {
    render(<Button variant="ghost">Ghost Button</Button>);
    const button = screen.getByRole('button', { name: 'Ghost Button' });
    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);
    // After mouse leave: borderColor=#2E2E2E, color=#8A8A8A
    expect(button.style.borderColor).toBe('rgb(46, 46, 46)');
    expect(button.style.color).toBe('rgb(138, 138, 138)');
  });

  it('does not apply hover styles when disabled', () => {
    render(<Button variant="ghost" disabled>Disabled Ghost</Button>);
    const button = screen.getByRole('button', { name: 'Disabled Ghost' });
    fireEvent.mouseEnter(button);
    // When disabled, hover styles should NOT change (guard: if (!disabled))
    // The button should keep its original styles (borderColor stays default)
    expect(button.style.borderColor).toBe('');
  });
});
```

**Step 2: Run test to verify pass**

Run: `cd /tmp/Decontaminate/frontend && npm test -- --testPathPattern="button-ghost-hover" -v`
Expected: PASS (3 tests pass)

**Step 3: Commit**

```bash
cd /tmp/Decontaminate
git add frontend/tests/button-ghost-hover.test.js
git commit -m "test(frontend): add Button ghost hover coverage tests"
```

---

## Task 3: Fix incomplete useEffect dependency in OverviewTab.jsx

**Objective:** The "Done" button onClick at line 75 references setRecoveryStep, setRecoveryPassword, setRecoveryCodes but the useEffect watching recoveryCodes only includes setRecoveryStep in its dependency array. This means the effect doesn't clean up the other two states when recoveryCodes changes unexpectedly. Add all three to the dependency array.

**Files:**
- Modify: `frontend/components/affiliate-dashboard/OverviewTab.jsx`

**Step 1: Read the file to find the useEffect**

```bash
grep -n "useEffect\|recoveryCodes\|setRecoveryStep\|setRecoveryPassword\|setRecoveryCodes" /tmp/Decontaminate/frontend/components/affiliate-dashboard/OverviewTab.jsx
```

**Step 2: Fix the dependency array**

Find the useEffect that includes recoveryCodes in its dependency array and add the missing setRecoveryPassword and setRecoveryCodes. The effect should be:

```javascript
useEffect(() => {
  if (recoveryCodes.length > 0) {
    setRecoveryStep(1);
  }
}, [recoveryCodes, setRecoveryStep, setRecoveryPassword, setRecoveryCodes]);
```

**Step 3: Add test to prevent regression**

The useEffect dependency issue is a React stale-closure risk. Add a test in `tests/affiliates-tab.test.jsx` (or OverviewTab test if separate) that verifies:
- When recoveryCodes becomes non-empty, setRecoveryStep(1) is called
- The component doesn't crash with the expanded dependency array

---

## Verification

After all tasks:

```bash
cd /tmp/Decontaminate/frontend && npm test 2>&1 | tail -15
# Expected: all tests pass
cd /tmp/Decontaminate/backend && npm test 2>&1 | tail -10
# Expected: all 1,144 tests pass
```
