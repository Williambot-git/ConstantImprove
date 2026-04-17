# customerController Unit Tests — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Write unit tests for customerController route handlers to bring coverage from 0% to 60%+.

**Architecture:** customerController exports 16 functions across auth (login, register, logout), credentials (claimCredentials, useRecoveryKit, rotateRecoveryKit), subscription (getProfile, getSubscription, cancelSubscription, changePlan), account (changePassword, deleteAccount), and support (getMessages, createSupportTicket). All handlers use db, bcrypt, uuid, and various services.

**Tech Stack:** Jest with manual mocks for db, bcrypt, uuid, and services (userService, promoService, emailService, vpnResellersService, paymentProcessingService).

---

## Task 1: Scaffold customerController.test.js

**File:** `/tmp/Decontaminate/backend/tests/customerController.test.js`

Mock all dependencies at the top:
- `../src/config/database` → `{ query: jest.fn() }`
- `../src/services/userService` → all exported methods as jest.fn()
- `../src/services/emailService` → `{ sendAccountCreatedEmail: jest.fn(), sendCancellationEmail: jest.fn(), sendRecoveryKitEmail: jest.fn(), sendWelcomeEmail: jest.fn() }`
- `../src/services/vpnResellersService` → `{ createAccount: jest.fn(), deleteAccount: jest.fn(), getAccount: jest.fn() }`
- `../src/services/paymentProcessingService` → `{ cancelSubscription: jest.fn(), changePlan: jest.fn() }`
- `../src/services/promoService` → `{ validatePromoCode: jest.fn(), markPromoCodeUsed: jest.fn() }`
- `bcrypt` → `{ hash: jest.fn(), compare: jest.fn() }`
- `uuid` → `{ v4: jest.fn() }`
- `fs` → manual mock (writeFileSync)

Shared `mockRes`: `{ json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis(), cookie: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis(), setHeader: jest.fn().mockReturnThis() }`

---

## Task 2: Test login

**Function:** `login(email, password)` at line 36

```javascript
describe('login', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return 400 if email missing', async () => {
    const req = { body: { password: 'pass123' } };
    await customerController.login(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should return 401 for non-existent user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = { body: { email: 'nobody@example.com', password: 'pass123' } };
    await customerController.login(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('should return 401 for wrong password', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com', password_hash: 'hash', is_active: true }] });
    bcrypt.compare.mockResolvedValueOnce(false);
    const req = { body: { email: 'a@b.com', password: 'wrong' } };
    await customerController.login(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('should return JWT and set cookie on success', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com', password_hash: 'hash', is_active: true, role: 'customer' }] });
    bcrypt.compare.mockResolvedValueOnce(true);
    const req = { body: { email: 'a@b.com', password: 'correct' } };
    await customerController.login(req, mockRes);
    expect(mockRes.cookie).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
```

---

## Task 3: Test register

**Function:** `register(req, res)` at line 140

```javascript
describe('register', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return 400 if email already exists', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // existing user
    const req = { body: { email: 'existing@example.com', password: 'Pass123!', username: 'test' } };
    await customerController.register(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 if username taken', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })        // email check
      .mockResolvedValueOnce({ rows: [{ id: 2 }] }); // username check
    const req = { body: { email: 'new@example.com', password: 'Pass123!', username: 'taken' } };
    await customerController.register(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should create user and return JWT on success', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })        // email check
      .mockResolvedValueOnce({ rows: [] })        // username check
      .mockResolvedValueOnce({ rows: [] })        // referral lookup
      .mockResolvedValueOnce({ rows: [] });       // INSERT user
    bcrypt.hash.mockResolvedValueOnce('hashed');
    uuid.v4.mockReturnValueOnce('uuid-123');
    const req = {
      body: { email: 'new@example.com', password: 'Pass123!', username: 'newuser', referredBy: null }
    };
    await customerController.register(req, mockRes);
    expect(mockRes.cookie).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('should apply referral bonus if valid referral code', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })        // email check
      .mockResolvedValueOnce({ rows: [] })        // username check
      .mockResolvedValueOnce({ rows: [{ id: 99 }] }) // referral lookup
      .mockResolvedValueOnce({ rows: [] });       // INSERT user
    bcrypt.hash.mockResolvedValueOnce('hashed');
    uuid.v4.mockReturnValue('uuid-123');
    const req = { body: { email: 'new@example.com', password: 'Pass123!', username: 'newuser', referredBy: 'REFCODE' } };
    await customerController.register(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
```

---

## Task 4: Test claimCredentials

**Function:** `claimCredentials(req, res)` at line 217

```javascript
describe('claimCredentials', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return 401 if user not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = { user: { id: 999 }, body: {} };
    await customerController.claimCredentials(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('should return existing VPN credentials', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com' }] })
      .mockResolvedValueOnce({ rows: [{ username: 'vpnuser', password: 'vpnpass', status: 'active' }] });
    const req = { user: { id: 1 }, body: {} };
    await customerController.claimCredentials(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ username: 'vpnuser' }));
  });

  it('should create new VPN account if none exists', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com' }] })
      .mockResolvedValueOnce({ rows: [] })           // no existing VPN account
      .mockResolvedValueOnce({ rows: [{ subscription: { interval: 'month' } }] }) // getUserSubscription
      .mockResolvedValueOnce({ rows: [] });           // INSERT vpn_accounts
    vpnResellersService.createAccount.mockResolvedValueOnce({ username: 'newuser', password: 'newpass' });
    emailService.sendAccountCreatedEmail.mockResolvedValueOnce();
    const req = { user: { id: 1 }, body: {} };
    await customerController.claimCredentials(req, mockRes);
    expect(vpnResellersService.createAccount).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('should return 400 if no active subscription', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com' }] })
      .mockResolvedValueOnce({ rows: [] });  // no VPN account
    db.query.mockImplementation((q) => {
      if (q.includes('getUserSubscription')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });
    const req = { user: { id: 1 }, body: {} };
    await customerController.claimCredentials(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });
});
```

---

## Task 5: Test useRecoveryKit

**Function:** `useRecoveryKit(req, res)` at line 278

```javascript
describe('useRecoveryKit', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return 400 if recoveryKit not provided', async () => {
    const req = { body: {} };
    await customerController.useRecoveryKit(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should return 401 if recovery kit not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = { body: { recoveryKit: 'invalid-kit' } };
    await customerController.useRecoveryKit(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('should return credentials on valid recovery kit', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, recovery_kit_hash: 'hash', username: 'vpnuser', recovery_kit_created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [{ username: 'vpnuser', password: 'vpnpass' }] });
    bcrypt.compare.mockResolvedValueOnce(true);
    const req = { body: { recoveryKit: 'valid-kit' } };
    await customerController.useRecoveryKit(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, username: 'vpnuser' }));
  });
});
```

---

## Task 6: Test rotateRecoveryKit

**Function:** `rotateRecoveryKit(req, res)` at line 374

```javascript
describe('rotateRecoveryKit', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should rotate recovery kit and send email', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com' }] })
      .mockResolvedValueOnce({ rows: [] })  // no existing kit check
      .mockResolvedValueOnce({ rows: [] }); // INSERT new kit
    bcrypt.hash.mockResolvedValueOnce('newhash');
    uuid.v4.mockReturnValueOnce('newkit-uuid');
    emailService.sendRecoveryKitEmail.mockResolvedValueOnce();
    const req = { user: { id: 1 }, body: {} };
    await customerController.rotateRecoveryKit(req, mockRes);
    expect(emailService.sendRecoveryKitEmail).toHaveBeenCalledWith('a@b.com', expect.any(String), expect.any(String));
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
```

---

## Task 7: Test logout

```javascript
describe('logout', () => {
  it('should clear the accessToken cookie', async () => {
    const req = {};
    await customerController.logout(req, mockRes);
    expect(mockRes.cookie).toHaveBeenCalledWith('accessToken', '', expect.objectContaining({ expires: expect.any(Date) }));
    expect(mockRes.json).toHaveBeenCalledWith({ success: true });
  });
});
```

---

## Task 8: Test getProfile

```javascript
describe('getProfile', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return user profile', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com', username: 'test', is_active: true }] });
    const req = { user: { id: 1 } };
    await customerController.getProfile(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ id: 1, email: 'a@b.com' }));
  });

  it('should return 404 if user not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = { user: { id: 999 } };
    await customerController.getProfile(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(404);
  });
});
```

---

## Task 9: Test getSubscription

```javascript
describe('getSubscription', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return active subscription', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'active', plan_id: 1 }] });
    const req = { user: { id: 1 } };
    await customerController.getSubscription(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('should return 404 if no subscription', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = { user: { id: 1 } };
    await customerController.getSubscription(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(404);
  });
});
```

---

## Task 10: Test cancelSubscription

```javascript
describe('cancelSubscription', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should cancel subscription and deactivate VPN', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'active' }] })  // VPN account lookup
      .mockResolvedValueOnce({}); // UPDATE subscription
    vpnResellersService.disableAccount.mockResolvedValueOnce();
    emailService.sendCancellationEmail.mockResolvedValueOnce();
    const req = { user: { id: 1 }, body: {} };
    await customerController.cancelSubscription(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
```

---

## Task 11: Test changePassword

```javascript
describe('changePassword', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return 400 if current password wrong', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: 'oldhash' }] });
    bcrypt.compare.mockResolvedValueOnce(false);
    const req = { user: { id: 1 }, body: { currentPassword: 'wrong', newPassword: 'NewPass123!' } };
    await customerController.changePassword(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should update password on success', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, password_hash: 'oldhash' }] })
      .mockResolvedValueOnce({}); // UPDATE
    bcrypt.compare.mockResolvedValueOnce(true);
    bcrypt.hash.mockResolvedValueOnce('newhash');
    const req = { user: { id: 1 }, body: { currentPassword: 'correct', newPassword: 'NewPass123!' } };
    await customerController.changePassword(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith({ success: true });
  });
});
```

---

## Task 12: Test deleteAccount

```javascript
describe('deleteAccount', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return 401 if wrong password', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: 'hash' }] });
    bcrypt.compare.mockResolvedValueOnce(false);
    const req = { user: { id: 1 }, body: { password: 'wrong' } };
    await customerController.deleteAccount(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('should delete account on correct password', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: 'hash' }] });
    bcrypt.compare.mockResolvedValueOnce(true);
    const req = { user: { id: 1 }, body: { password: 'correct' } };
    await customerController.deleteAccount(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
```

---

## Task 13: Test getMessages and createSupportTicket

```javascript
describe('getMessages', () => {
  it('should return empty array', async () => {
    const req = { user: { id: 1 } };
    await customerController.getMessages(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ messages: [] }));
  });
});

describe('createSupportTicket', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return 400 if message missing', async () => {
    const req = { user: { id: 1 }, body: {} };
    await customerController.createSupportTicket(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should create ticket on success', async () => {
    db.query.mockResolvedValueOnce({}); // INSERT
    const req = { user: { id: 1 }, body: { subject: 'Help', message: 'Need help' } };
    await customerController.createSupportTicket(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
```

---

## Task 14: Run tests, verify, commit

```bash
cd /tmp/Decontaminate/backend
npm test -- tests/customerController.test.js 2>&1 | tail -40

# Fix any failures

git add tests/customerController.test.js
git commit -m "test(backend): add customerController unit tests"
```

---

## Files Summary

| Action | File |
|--------|------|
| **CREATE** | `tests/customerController.test.js` |

## Verification

1. Run: `npm test -- tests/customerController.test.js`
2. Expected: All tests pass
3. Check coverage: `npm test -- --coverage 2>&1 | grep customerController`
4. Target: >60% line coverage on customerController.js

## Risk Assessment

- **Low risk** — pure unit tests, mocks isolate all external dependencies
- Tests verify existing behavior, no new functionality
- No changes to source code
