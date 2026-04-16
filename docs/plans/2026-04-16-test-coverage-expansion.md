# Backend Test Coverage Expansion Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Expand backend Jest test coverage to userService and emailService, following the pattern established by promoService.test.js.

**Architecture:** Unit tests using Jest with mocked database (pg mock) and nodemailer. Tests are database-independent and run in CI without a live Postgres instance.

**Tech Stack:** Jest 30.x, @jest/globals, jest mocking

---

## Context from Automation Status

- promoService has 10 passing tests as the reference implementation
- userService: complex, many DB queries — good integration test targets
- emailService: requires nodemailer stubbing
- Next candidates after these: paymentController routes (requires supertest)

---

## Task 1: Write userService unit tests (userService.test.js)

**Objective:** Add comprehensive unit tests for userService CRUD operations and VPN account creation.

**Files:**
- Create: `backend/tests/services/userService.test.js`
- Dependencies mocked: `backend/src/config/database`, `backend/src/models/userModel`, `backend/src/services/vpnResellersService`, `backend/src/config/paymentConfig`

**Step 1: Create test file with mocks and describe blocks**

```javascript
/**
 * userService unit tests
 * 
 * Tests userService methods with mocked database and external services.
 * Uses the same pattern as promoService.test.js for consistency.
 */

const { describe, it, expect, beforeEach, jest } = require('@jest/globals');

// Mock all dependencies BEFORE requiring userService
jest.unstable_mockModule('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.unstable_mockModule('../../src/models/userModel', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  createNumericAccount: jest.fn(),
  create: jest.fn()
}));

jest.unstable_mockModule('../../src/services/vpnResellersService', () => ({
  default: jest.fn().mockImplementation(() => ({
    checkUsername: jest.fn(),
    createAccount: jest.fn(),
    setExpiry: jest.fn()
  }))
}));

jest.unstable_mockModule('../../src/config/paymentConfig', () => ({
  vpnResellers: { planIds: { month: 'plan_month', quarter: 'plan_quarter', semi_annual: 'plan_semi', year: 'plan_year' } }
}));

// Now import the service
const userService = require('../../src/services/userService');
const db = require('../../src/config/database');
const User = require('../../src/models/userModel');
const VpnResellersService = require('../../src/services/vpnResellersService');

describe('userService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
```

**Step 2: Write tests for createUser**

```javascript
  describe('createUser', () => {
    it('should create a numeric account when email is not provided', async () => {
      const mockUser = { id: 'uuid-123', account_number: 12345, trial_ends_at: expect.any(Date) };
      User.createNumericAccount.mockResolvedValueOnce(mockUser);
      
      const result = await userService.createUser();
      
      expect(User.createNumericAccount).toHaveBeenCalledWith(expect.objectContaining({ trialEndsAt: expect.any(Date) }));
      expect(result).toEqual(mockUser);
    });

    it('should throw when email already exists', async () => {
      User.findByEmail.mockResolvedValueOnce({ id: 'existing' });
      
      await expect(userService.createUser('test@example.com')).rejects.toThrow('Email already in use');
    });

    it('should create user with email when not duplicate', async () => {
      User.findByEmail.mockResolvedValueOnce(null);
      const mockUser = { id: 'uuid-new', email: 'test@example.com' };
      User.createNumericAccount.mockResolvedValueOnce(mockUser);
      
      const result = await userService.createUser('test@example.com');
      
      expect(result).toEqual(mockUser);
    });
  });
```

**Step 3: Write tests for createUserWithPassword**

```javascript
  describe('createUserWithPassword', () => {
    it('should throw when email is missing', async () => {
      await expect(userService.createUserWithPassword(null, 'password123')).rejects.toThrow('Email is required');
    });

    it('should throw when email already exists', async () => {
      User.findByEmail.mockResolvedValueOnce({ id: 'existing' });
      
      await expect(userService.createUserWithPassword('test@example.com', 'password123')).rejects.toThrow('Email already in use');
    });

    it('should throw when password fails complexity validation', async () => {
      User.findByEmail.mockResolvedValueOnce(null);
      
      await expect(userService.createUserWithPassword('test@example.com', 'weak')).rejects.toThrow(/Password validation failed/);
    });

    it('should create user with valid email and password', async () => {
      User.findByEmail.mockResolvedValueOnce(null);
      const mockUser = { id: 'uuid-new', email: 'test@example.com' };
      User.create.mockResolvedValueOnce(mockUser);
      
      const result = await userService.createUserWithPassword('test@example.com', 'Complex!Pass123');
      
      expect(result).toEqual(mockUser);
    });
  });
```

**Step 4: Write tests for createVpnAccount**

```javascript
  describe('createVpnAccount', () => {
    it('should throw when user not found', async () => {
      User.findById.mockResolvedValueOnce(null);
      
      await expect(userService.createVpnAccount('bad-uuid', 'ACC123', 'month')).rejects.toThrow('User not found');
    });

    it('should throw when plan ID is not configured', async () => {
      User.findById.mockResolvedValueOnce({ id: 'uuid-123' });
      
      await expect(userService.createVpnAccount('uuid-123', 'ACC123', 'invalid_plan')).rejects.toThrow(/not configured/);
    });

    it('should create VPN account successfully', async () => {
      User.findById.mockResolvedValueOnce({ id: 'uuid-123' });
      const vpnServiceInstance = new VpnResellersService();
      vpnServiceInstance.checkUsername.mockResolvedValueOnce({ data: { message: 'Username is not taken' } });
      vpnServiceInstance.createAccount.mockResolvedValueOnce({ data: { id: 'vpnsrv-456', allowed_countries: ['US'] } });
      vpnServiceInstance.setExpiry.mockResolvedValueOnce({});
      
      db.query.mockResolvedValueOnce({ rows: [{ id: 'db-account-row' }] });
      
      const result = await userService.createVpnAccount('uuid-123', 'ACC123', 'month');
      
      expect(result.username).toMatch(/^user_ACC123/);
      expect(result.password).toHaveLength(12);
      expect(result.accountId).toBe('vpnsrv-456');
    });
  });
```

**Step 5: Write tests for getUserSubscription**

```javascript
  describe('getUserSubscription', () => {
    it('should return null when user has no subscription', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      
      const result = await userService.getUserSubscription('uuid-123');
      
      expect(result).toBeNull();
    });

    it('should return subscription with plan_key mapped', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'sub-1', interval: 'month', plan_key: 'monthly' }] });
      
      const result = await userService.getUserSubscription('uuid-123');
      
      expect(result.plan_key).toBe('monthly');
      expect(result.planKey).toBe('monthly');
    });
  });
```

**Step 6: Run tests**

Run: `cd backend && npx jest tests/services/userService.test.js -v`
Expected: All tests pass (should be 8-10 tests)

**Step 7: Commit**

```bash
git add backend/tests/services/userService.test.js
git commit -m "test: add userService unit tests with mocked DB and VPN service"
```

---

## Task 2: Write emailService unit tests (emailService.test.js)

**Objective:** Add unit tests for emailService with mocked nodemailer transporter.

**Files:**
- Create: `backend/tests/services/emailService.test.js`
- Mock: `nodemailer` (transporter.sendMail)

**Step 1: Create test file**

```javascript
/**
 * emailService unit tests
 * 
 * Tests emailService methods with mocked nodemailer transporter.
 * Validates email sending logic, template loading, and placeholder replacement.
 */

const { describe, it, expect, beforeEach, jest } = require('@jest/globals');

// Mock nodemailer BEFORE requiring emailService
jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn().mockReturnValue({
      sendMail: jest.fn()
    })
  }
}));

// Mock fs for template loading
jest.unstable_mockModule('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('<html>{{name}} - {{content}}</html>')
}));

// Mock path
jest.unstable_mockModule('path', () => ({
  join: jest.fn().mockReturnValue('/mock/templates/welcome.html')
}));

const nodemailer = require('nodemailer');
const EmailService = require('../../../src/services/emailService');
const fs = require('fs');
const path = require('path');

describe('emailService', () => {
  let mockTransporter;

  beforeEach(() => {
    jest.clearAllMocks();
    // Get reference to the mocked transporter
    mockTransporter = nodemailer.createTransport();
  });
```

**Step 2: Write tests for sendTransactional**

```javascript
  describe('sendTransactional', () => {
    it('should send email with correct options', async () => {
      mockTransporter.sendMail.mockResolvedValueOnce({ messageId: 'msg-123' });
      
      // Access the sendTransactional method via the instance
      const result = await EmailService.sendTransactional(
        'test@example.com',
        'Test Subject',
        'welcome',
        { name: 'John', content: 'Test content' }
      );
      
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.any(String),
          to: 'test@example.com',
          subject: 'Test Subject',
          html: expect.stringContaining('John')
        })
      );
    });

    it('should throw when template not found', async () => {
      // Override template for this test
      EmailService.templates.nonexistent = undefined;
      
      await expect(
        EmailService.sendTransactional('test@example.com', 'Subject', 'nonexistent', {})
      ).rejects.toThrow(/not found/);
    });
  });
```

**Step 3: Write tests for convenience methods**

```javascript
  describe('sendWelcomeEmail', () => {
    it('should send welcome email with correct template and data', async () => {
      mockTransporter.sendMail.mockResolvedValueOnce({ messageId: 'msg-welcome' });
      
      await EmailService.sendWelcomeEmail('user@example.com', 'John Doe');
      
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Welcome'),
        })
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset with reset link', async () => {
      mockTransporter.sendMail.mockResolvedValueOnce({ messageId: 'msg-reset' });
      
      await EmailService.sendPasswordResetEmail('user@example.com', 'https://reset.link');
      
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Password Reset'),
          html: expect.stringContaining('https://reset.link')
        })
      );
    });
  });

  describe('getSupportEmail', () => {
    it('should return the support email address', () => {
      expect(EmailService.getSupportEmail()).toBe('William@ahoyvpn.com');
    });
  });
```

**Step 4: Run tests**

Run: `cd backend && npx jest tests/services/emailService.test.js -v`
Expected: All tests pass (should be 5-6 tests)

**Step 5: Commit**

```bash
git add backend/tests/services/emailService.test.js
git commit -m "test: add emailService unit tests with mocked nodemailer"
```

---

## Task 3: Run full backend test suite and verify coverage

**Step 1: Run all tests**

Run: `cd backend && npm test`
Expected: All tests pass, coverage report shows improvement

**Step 2: Check coverage report**

```
services/emailService.js    |    xx.xx |    xx.xx |    xx.xx |   xx.xx |
services/userService.js     |    xx.xx |    xx.xx |    xx.xx |   xx.xx |
```

**Step 3: Commit full test suite**

```bash
git add backend/tests/
git commit -m "test: complete backend service test suite — userService and emailService"
```

---

## Task 4: Clean up orphaned backend diagnostic scripts

**Objective:** Remove the orphaned `check_*.js` one-off diagnostic scripts that are not imported anywhere and create noise.

**Files to remove (confirmed orphan - never imported in src/):**
- `backend/check_account.js`
- `backend/check_admins.js`
- `backend/check_affiliate_flow.js`
- `backend/check_affiliate_pass.js`
- `backend/check_affiliate_schema.js`
- `backend/check_cols.js`
- `backend/check_columns.js`
- `backend/check_env.js`
- `backend/check_kit.js`
- `backend/check_pass.js`
- `backend/check_paying2.js`
- `backend/check_paying_customers.js`
- `backend/check_payout.js`
- `backend/check_promo2.js`
- `backend/check_promo.js`
- `backend/check_referrals.js`
- `backend/check_register.js`
- `backend/check_schema2.js`
- `backend/check_tx.js`
- `backend/check_user2.js`
- `backend/check_user.js`

**Step 1: Verify none are imported**

Run: `grep -r "check_account\|check_admins\|check_affiliate_flow\|check_cols\|check_columns" backend/src/`
Expected: No output (confirming all are orphans)

**Step 2: Remove files**

```bash
cd backend && rm -f check_account.js check_admins.js check_affiliate_flow.js check_affiliate_pass.js check_affiliate_schema.js check_cols.js check_columns.js check_env.js check_kit.js check_pass.js check_paying2.js check_paying_customers.js check_payout.js check_promo2.js check_promo.js check_referrals.js check_register.js check_schema2.js check_tx.js check_user2.js check_user.js
```

**Step 3: Verify deletion**

```bash
ls backend/*.js | grep check_
```
Expected: No output

**Step 4: Commit**

```bash
git add -A
git commit -m "cleanup: remove 21 orphaned check_*.js diagnostic scripts"
```

---

## Verification Commands

```bash
# Run full test suite
cd backend && npm test

# Verify no orphaned scripts remain
ls backend/check_*.js 2>/dev/null | wc -l  # Should be 0

# Verify test files exist
ls backend/tests/services/
```

---

## Notes

- The check_*.js files were one-off diagnostic/verification scripts that were never part of the application. They query the database directly to check specific conditions. They should be replaced by proper integration tests if needed.
- The vpnAccountScheduler.js has `cleanupAbandonedCheckouts` and `suspendExpiredTrials` referenced by cleanupService.js but the functions themselves appear to be stubs — good candidates for future work but not in this sprint.
