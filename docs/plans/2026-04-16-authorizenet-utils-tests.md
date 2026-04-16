# AuthorizeNetUtils Test Coverage — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add unit tests for `authorizeNetUtils.js` standalone functions and `AuthorizeNetService` class methods, bringing coverage from ~1.73% to 80%+.

**Architecture:** The module exposes standalone functions (`getAuthorizeTransactionDetails`, `cancelArbSubscription`) and an `AuthorizeNetService` class. All API calls go through `fetch` to Authorize.net's API endpoint. Tests mock `global.fetch` since the actual API URLs are behind env vars.

**Tech Stack:** Jest with global `fetch` mock via `jest.mock('node-fetch')` or manual `global.fetch` replacement.

---

## Background Context for Implementer

- File: `backend/src/services/authorizeNetUtils.js` (500 lines)
- Standalone functions: `getAuthorizeTransactionDetails`, `cancelArbSubscription`
- Class: `AuthorizeNetService` with methods: `getApiEndpoint`, `getHostedFormUrl`, `createHostedPaymentPage`, `createTransaction`, `createArbSubscription`, `createArbSubscriptionFromProfile`, `getArbSubscription`, `getTransactionDetails`, `cancelSubscription`
- The class is instantiated once and used by payment controllers
- `AUTHORIZE_API_URL` constant at line 7: `process.env.AUTHORIZE_API_URL || 'https://api.authorize.net/xml/v1/request.api'`
- The `getApiEndpoint()` method on line 209-211 references `paymentConfig.authorizeNet.endpoints.charge` — this needs to be available or mocked
- Tests should go in: `backend/tests/services/authorizeNetUtils.test.js`

---

## Task 1: Create Jest test file and mock setup

**File:** `backend/tests/services/authorizeNetUtils.test.js`

**Step 1: Create the test file with mocks**

```javascript
// Mock node-fetch before requiring the module
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

// Mock paymentConfig
jest.mock('../../src/config/paymentConfig', () => ({
  authorizeNet: {
    endpoints: {
      charge: 'https://api.authorize.net/xml/v1/request.api'
    }
  }
}));

const {
  getAuthorizeTransactionDetails,
  cancelArbSubscription,
  AuthorizeNetService
} = require('../../src/services/authorizeNetUtils');
```

---

## Task 2: Test `getAuthorizeTransactionDetails`

**Step 1: Write failing tests**

```javascript
describe('getAuthorizeTransactionDetails', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
  });

  it('returns null when transactionId is missing', async () => {
    const result = await getAuthorizeTransactionDetails(null);
    expect(result).toBeNull();
  });

  it('returns null when credentials are missing', async () => {
    delete process.env.AUTHORIZE_NET_API_LOGIN_ID;
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).toBeNull();
  });

  it('returns null when fetch fails (non-ok status)', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).toBeNull();
  });

  it('returns null when API returns error resultCode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ messages: { resultCode: 'Error' } }))
    });
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).toBeNull();
  });

  it('parses successful response correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Ok' },
        transaction: {
          responseCode: '1',
          transactionStatus: 'capturedPendingSettlement',
          authAmount: '59.99',
          order: { invoiceNumber: 'INV-001' },
          profile: { customerProfileId: 'CP123', customerPaymentProfileId: 'PP456' }
        }
      }))
    });
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result.responseCode).toBe('1');
    expect(result.amountRaw).toBe('59.99');
    expect(result.invoiceNumber).toBe('INV-001');
    expect(result.customerProfileId).toBe('CP123');
  });

  it('handles BOM character in response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('\uFEFF{"messages":{"resultCode":"Ok"},"transaction":{}}')
    });
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).not.toBeNull();
  });

  it('returns null on fetch throw', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).toBeNull();
  });
});
```

---

## Task 3: Test `cancelArbSubscription`

**Step 1: Write failing tests**

```javascript
describe('cancelArbSubscription', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
  });

  it('returns error when subscriptionId is missing', async () => {
    const result = await cancelArbSubscription(null);
    expect(result).toEqual({ success: false, message: 'No ARB subscription ID provided' });
  });

  it('throws when credentials are missing', async () => {
    delete process.env.AUTHORIZE_NET_API_LOGIN_ID;
    await expect(cancelArbSubscription('sub123')).rejects.toThrow('Authorize.net credentials are missing');
  });

  it('returns success=false when API returns error', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Error', message: [{ text: 'Subscription not found' }] }
      }))
    });
    const result = await cancelArbSubscription('sub123');
    expect(result).toEqual({ success: false, message: 'Subscription not found' });
  });

  it('returns success=true on successful cancellation', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Ok' }
      }))
    });
    const result = await cancelArbSubscription('sub123');
    expect(result).toEqual({ success: true, subscriptionId: 'sub123' });
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValue(new Error('connection refused'));
    await expect(cancelArbSubscription('sub123')).rejects.toThrow('connection refused');
  });
});
```

---

## Task 4: Test `AuthorizeNetService.getArbSubscription`

**Step 1: Write failing tests**

```javascript
describe('AuthorizeNetService.getArbSubscription', () => {
  let service;
  beforeEach(() => {
    mockFetch.mockReset();
    service = new AuthorizeNetService();
  });

  it('returns null when API returns error', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ messages: { resultCode: 'Error' } }))
    });
    const result = await service.getArbSubscription('sub123');
    expect(result).toBeNull();
  });

  it('returns structured subscription data on success', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Ok' },
        subscription: {
          name: 'Test Sub',
          status: 'active',
          currentBillAmount: '9.99',
          lastPaymentAmount: '9.99',
          lastPaymentDate: '2026-01-01',
          nextBillingDate: '2026-02-01',
          createTimeStamp: '2026-01-01',
          firstRenewalDate: '2026-01-15'
        }
      }))
    });
    const result = await service.getArbSubscription('sub123');
    expect(result.status).toBe('active');
    expect(result.currentBillAmount).toBe('9.99');
    expect(result.nextBillingDate).toBe('2026-02-01');
  });

  it('returns null on throw', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const result = await service.getArbSubscription('sub123');
    expect(result).toBeNull();
  });
});
```

---

## Task 5: Test `AuthorizeNetService.getTransactionDetails`

```javascript
describe('AuthorizeNetService.getTransactionDetails', () => {
  let service;
  beforeEach(() => {
    mockFetch.mockReset();
    service = new AuthorizeNetService();
  });

  it('returns null when API returns error', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ messages: { resultCode: 'Error' } }))
    });
    const result = await service.getTransactionDetails('tx123');
    expect(result).toBeNull();
  });

  it('returns transaction data on success', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Ok' },
        transaction: {
          responseCode: '1',
          transactionStatus: 'settledSuccessfully',
          authAmount: '59.99'
        }
      }))
    });
    const result = await service.getTransactionDetails('tx123');
    expect(result.responseCode).toBe('1');
    expect(result.transactionStatus).toBe('settledSuccessfully');
    expect(result.amount).toBe('59.99');
  });

  it('returns null on throw', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const result = await service.getTransactionDetails('tx123');
    expect(result).toBeNull();
  });
});
```

---

## Task 6: Test `AuthorizeNetService.cancelSubscription`

```javascript
describe('AuthorizeNetService.cancelSubscription', () => {
  let service;
  beforeEach(() => {
    mockFetch.mockReset();
    service = new AuthorizeNetService();
  });

  it('calls cancelArbSubscription and returns its result', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ messages: { resultCode: 'Ok' } }))
    });
    const result = await service.cancelSubscription('sub123');
    expect(result).toEqual({ success: true, subscriptionId: 'sub123' });
  });
});
```

---

## Task 7: Test `AuthorizeNetService.getApiEndpoint` and `getHostedFormUrl`

```javascript
describe('AuthorizeNetService.getApiEndpoint', () => {
  it('returns the charge endpoint from paymentConfig', () => {
    const service = new AuthorizeNetService();
    expect(service.getApiEndpoint()).toBe('https://api.authorize.net/xml/v1/request.api');
  });
});

describe('AuthorizeNetService.getHostedFormUrl', () => {
  it('returns production URL when environment is production', () => {
    const service = new AuthorizeNetService();
    service.environment = 'production';
    expect(service.getHostedFormUrl()).toBe('https://accept.authorize.net/payment/payment');
  });

  it('returns test URL when environment is not production', () => {
    const service = new AuthorizeNetService();
    service.environment = 'development';
    expect(service.getHostedFormUrl()).toBe('https://test.authorize.net/payment/payment');
  });
});
```

---

## Task 8: Test `AuthorizeNetService.createHostedPaymentPage`

```javascript
describe('AuthorizeNetService.createHostedPaymentPage', () => {
  let service;
  beforeEach(() => {
    mockFetch.mockReset();
    service = new AuthorizeNetService();
  });

  it('throws when credentials missing', async () => {
    service.apiLoginId = null;
    await expect(service.createHostedPaymentPage({ amount: 10 })).rejects.toThrow('Authorize.net credentials are missing');
  });

  it('returns {token, formUrl} on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Ok' },
        token: 'hostedPaymentToken123'
      }))
    });
    const result = await service.createHostedPaymentPage({
      amount: 59.99,
      invoiceNumber: 'INV-001',
      description: 'AhoyVPN Annual',
      returnUrl: 'https://ahoyvpn.net/checkout',
      cancelUrl: 'https://ahoyvpn.net/checkout?cancel=1',
      email: 'test@example.com'
    });
    expect(result.token).toBe('hostedPaymentToken123');
    expect(result.formUrl).toBe('https://test.authorize.net/payment/payment');
  });

  it('throws descriptive error when token missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Ok' }
      }))
    });
    await expect(service.createHostedPaymentPage({ amount: 10, invoiceNumber: 'X', returnUrl: 'X', cancelUrl: 'X' }))
      .rejects.toThrow('Failed to create hosted payment token');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    });
    await expect(service.createHostedPaymentPage({ amount: 10, invoiceNumber: 'X', returnUrl: 'X', cancelUrl: 'X' }))
      .rejects.toThrow('Authorize.net hosted page API error: 500');
  });

  it('throws on invalid JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('not json at all')
    });
    await expect(service.createHostedPaymentPage({ amount: 10, invoiceNumber: 'X', returnUrl: 'X', cancelUrl: 'X' }))
      .rejects.toThrow('Authorize.net hosted page returned invalid JSON');
  });
});
```

---

## Task 9: Test `AuthorizeNetService.createArbSubscription`

```javascript
describe('AuthorizeNetService.createArbSubscription', () => {
  let service;
  beforeEach(() => {
    mockFetch.mockReset();
    service = new AuthorizeNetService();
  });

  it('creates ARB subscription and returns subscriptionId', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Ok' },
        subscriptionId: 'arb123456'
      }))
    });
    const result = await service.createArbSubscription({
      amount: '59.99',
      intervalLength: 1,
      intervalUnit: 'months',
      startDate: '2026-05-01',
      subscriberName: 'John Doe',
      subscriberEmail: 'john@example.com',
      billingAddress: {
        firstName: 'John',
        lastName: 'Doe',
        address: '123 Main St',
        city: 'Anytown',
        state: 'PA',
        zip: '15417',
        country: 'USA',
        cardNumber: '4111111111111111',
        expirationDate: '12/28',
        cardCode: '123'
      },
      invoiceNumber: 'INV-001',
      description: 'AhoyVPN Monthly'
    });
    expect(result.subscriptionId).toBe('arb123456');
    expect(result.status).toBe('Ok');
  });

  it('throws when API returns error', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Error', message: [{ text: 'Invalid card' }] }
      }))
    });
    await expect(service.createArbSubscription({
      amount: '59.99', intervalLength: 1, intervalUnit: 'months',
      startDate: '2026-05-01', subscriberName: 'J', subscriberEmail: 'x@x.com',
      billingAddress: {}, invoiceNumber: 'X', description: 'X'
    })).rejects.toThrow('Invalid card');
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValue(new Error('connection refused'));
    await expect(service.createArbSubscription({
      amount: '59.99', intervalLength: 1, intervalUnit: 'months',
      startDate: '2026-05-01', subscriberName: 'J', subscriberEmail: 'x@x.com',
      billingAddress: {}, invoiceNumber: 'X', description: 'X'
    })).rejects.toThrow('connection refused');
  });
});
```

---

## Task 10: Test `AuthorizeNetService.createArbSubscriptionFromProfile`

```javascript
describe('AuthorizeNetService.createArbSubscriptionFromProfile', () => {
  let service;
  beforeEach(() => {
    mockFetch.mockReset();
    service = new AuthorizeNetService();
  });

  it('creates ARB from stored profile successfully', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Ok' },
        subscriptionId: 'arb789'
      }))
    });
    const result = await service.createArbSubscriptionFromProfile({
      amount: '59.99',
      intervalLength: 1,
      intervalUnit: 'months',
      startDate: '2026-05-01',
      customerProfileId: 'CP123',
      customerPaymentProfileId: 'PP456',
      subscriberEmail: 'john@example.com',
      invoiceNumber: 'INV-001',
      description: 'AhoyVPN Monthly'
    });
    expect(result.subscriptionId).toBe('arb789');
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({
        messages: { resultCode: 'Error', message: [{ text: 'Profile not found' }] }
      }))
    });
    await expect(service.createArbSubscriptionFromProfile({
      amount: '59.99', intervalLength: 1, intervalUnit: 'months',
      startDate: '2026-05-01', customerProfileId: 'CP123',
      customerPaymentProfileId: 'PP456', subscriberEmail: 'x@x.com',
      invoiceNumber: 'X', description: 'X'
    })).rejects.toThrow('Profile not found');
  });
});
```

---

## Verification

After implementing:

1. **Run tests:** `cd backend && npm test -- tests/services/authorizeNetUtils.test.js`
2. **Check coverage:** `npm test -- --coverage tests/services/authorizeNetUtils.test.js`
3. **Expected:** 40+ tests, 80%+ line coverage
4. **Commit:** `git add -A && git commit -m "test(backend): add authorizeNetUtils unit tests"`

---

## Risk Assessment

- **Low risk** — purely additive test coverage, no production logic changes
- Uses existing Jest infrastructure and `node-fetch` mocking pattern
- No database, network, or external API calls during tests
