# PaymentController Route Tests — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Write unit tests for paymentController route handlers (excluding webhook endpoints) to bring coverage from ~9% to 60%+.

**Architecture:** paymentController handles: (1) getPlans — returns plan list (public), (2) createCheckout — creates payment session (auth), (3) hostedRedirectBridge — proxy for Authorize.Net hosted page (public), (4) authorizeRelayResponse — handles return from Authorize.Net (public), (5) getInvoiceStatus — returns invoice state (public), (6) deleteOldAccounts — cron job (no route), (7) applyAffiliateCommissionIfEligible — internal helper.

**Tech Stack:** Jest with manual mocks for db, services (plisioService, authorizeNetUtils, zipTaxService, paymentProcessingService, vpnResellersService), and Express res mock.

---

## Task 1: Scaffold paymentController.test.js

**File:** `/tmp/Decontaminate/backend/tests/paymentController.test.js`

Mock all dependencies at the top of the file:
- `../src/config/database` → `{ query: jest.fn() }`
- `../src/services/plisioService` → all exported methods as jest.fn()
- `../src/services/authorizeNetUtils` → `{ getAuthorizeTransactionDetails: jest.fn(), AuthorizeNetService: { createHostedPaymentPage: jest.fn() } }`
- `../src/services/ziptaxService` → `{ getTaxRate: jest.fn() }`
- `../src/services/paymentProcessingService` → `{ processPlisioPaymentAsync: jest.fn() }`
- `../src/services/vpnResellersService` → all exported methods as jest.fn()
- `../src/services/userService` → `{ createVpnAccount: jest.fn() }`
- `../src/services/vpnAccountScheduler` → all exported methods as jest.fn()
- `../src/config/paymentConfig` → `{}`
- `fs` → manual mock (mkdirSync, appendFileSync)
- `node-fetch` → `jest.fn()`

Shared mockRes: `{ json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis(), cookie: jest.fn().mockReturnThis(), redirect: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() }`

---

## Task 2: Test getPlans

**Route:** GET /payment/plans (authenticated via subscriptionRoutes — but getPlans is also here)

```javascript
describe('getPlans', () => {
  it('should return 4 plans', async () => {
    const req = {};
    await paymentController.getPlans(req, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'monthly', name: 'Monthly', price: 9.99 }),
        expect.objectContaining({ id: 'quarterly', name: 'Quarterly', price: 24.99 }),
        expect.objectContaining({ id: 'semiAnnual', name: 'Semi-Annual', price: 44.99 }),
        expect.objectContaining({ id: 'annual', name: 'Annual', price: 79.99 })
      ])
    });
  });
});
```

---

## Task 3: Test hostedRedirectBridge (success)

**Route:** GET /payment/hosted-redirect?token=X&formUrl=Y

Tests the `hostedRedirectBridge` function which calls `authorizeNetService.createHostedPaymentPage()` then redirects to the frontend checkout with the token. 

```javascript
describe('hostedRedirectBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should redirect with token and formUrl on success', async () => {
    const req = {
      query: {
        token: 'authnet-token-123',
        formUrl: 'https://accept.authorize.net/payment/page?id=abc'
      }
    };
    const mockHosted = { token: 'authnet-token-123', formUrl: 'https://accept.authorize.net/payment/page?id=abc' };
    AuthorizeNetService.createHostedPaymentPage.mockResolvedValueOnce(mockHosted);
    
    await paymentController.hostedRedirectBridge(req, mockRes);
    
    expect(mockRes.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/checkout?payment=hosted&token=authnet-token-123')
    );
  });

  it('should redirect to cancel if no token', async () => {
    const req = { query: {} };
    await paymentController.hostedRedirectBridge(req, mockRes);
    expect(mockRes.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/checkout?payment=cancel')
    );
  });

  it('should handle Authorize.Net errors gracefully', async () => {
    const req = { query: { token: 'bad', formUrl: 'http://evil.com' } };
    AuthorizeNetService.createHostedPaymentPage.mockRejectedValueOnce(new Error('API error'));
    
    await paymentController.hostedRedirectBridge(req, mockRes);
    
    expect(mockRes.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/checkout?payment=cancel&reason=processing_error')
    );
  });
});
```

---

## Task 4: Test authorizeRelayResponse

**Route:** GET/POST /payment/authorize/relay

This handles the return from Authorize.Net hosted payment page. It looks up transaction details and redirects accordingly.

```javascript
describe('authorizeRelayResponse', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should redirect to success for settled transaction', async () => {
    const req = {
      query: { transId: 'txn-123', RESULT_CODE: '0' },
      get: jest.fn((h) => {
        if (h === 'Origin') return 'https://app.ahoyvpn.com';
        return '';
      })
    };
    getAuthorizeTransactionDetails.mockResolvedValueOnce({
      transactionStatus: 'settled',
      orderDescription: 'AhoyVPN Monthly'
    });
    
    await paymentController.authorizeRelayResponse(req, mockRes);
    
    expect(mockRes.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/checkout?payment=success&transId=txn-123')
    );
  });

  it('should redirect to cancel for declined transaction', async () => {
    const req = {
      query: { transId: 'txn-123', RESULT_CODE: '2' },
      get: jest.fn((h) => {
        if (h === 'Origin') return 'https://app.ahoyvpn.com';
        return '';
      })
    };
    
    await paymentController.authorizeRelayResponse(req, mockRes);
    
    expect(mockRes.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/checkout?payment=cancel&reason=declined')
    );
  });

  it('should redirect to cancel for held for review transaction', async () => {
    const req = {
      query: { transId: 'txn-123', RESULT_CODE: '4' },
      get: jest.fn((h) => {
        if (h === 'Origin') return 'https://app.ahoyvpn.com';
        return '';
      })
    };
    
    await paymentController.authorizeRelayResponse(req, mockRes);
    
    expect(mockRes.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/checkout?payment=cancel&reason=held_for_review')
    );
  });

  it('should log relay data', async () => {
    const req = {
      query: { transId: 'txn-123' },
      get: jest.fn((h) => {
        if (h === 'Origin') return 'https://app.ahoyvpn.com';
        return '';
      })
    };
    getAuthorizeTransactionDetails.mockResolvedValueOnce({ transactionStatus: 'settled' });
    jest.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    
    await paymentController.authorizeRelayResponse(req, mockRes);
    
    expect(fs.appendFileSync).toHaveBeenCalled();
  });

  it('should handle missing transId gracefully', async () => {
    const req = {
      query: {},
      get: jest.fn((h) => {
        if (h === 'Origin') return 'https://app.ahoyvpn.com';
        return '';
      })
    };
    
    await paymentController.authorizeRelayResponse(req, mockRes);
    
    expect(mockRes.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/checkout?payment=cancel')
    );
  });
});
```

---

## Task 5: Test getInvoiceStatus

**Route:** GET /payment/invoice/:invoiceId/status

```javascript
describe('getInvoiceStatus', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return invoice status from Plisio', async () => {
    const req = { params: { invoiceId: 'inv-123' } };
    plisioService.getInvoiceStatus.mockResolvedValueOnce({
      status: 'pending',
      amount: '9.99',
      currency: 'USD'
    });
    
    await paymentController.getInvoiceStatus(req, mockRes);
    
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ status: 'pending' })
    });
  });

  it('should return 404 if invoice not found', async () => {
    const req = { params: { invoiceId: 'invalid' } };
    plisioService.getInvoiceStatus.mockResolvedValueOnce(null);
    
    await paymentController.getInvoiceStatus(req, mockRes);
    
    expect(mockRes.status).toHaveBeenCalledWith(404);
  });

  it('should handle Plisio API errors', async () => {
    const req = { params: { invoiceId: 'inv-err' } };
    plisioService.getInvoiceStatus.mockRejectedValueOnce(new Error('API timeout'));
    
    await paymentController.getInvoiceStatus(req, mockRes);
    
    expect(mockRes.status).toHaveBeenCalledWith(500);
  });
});
```

---

## Task 6: Test createCheckout (card flow — auth)

**Route:** POST /payment/checkout (authenticated)

This is the most complex function. We test the card (Authorize.Net) payment path.

```javascript
describe('createCheckout', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  const mockUser = { id: 1, email: 'test@example.com', username: 'testuser', referred_by: null };
  const mockPlan = {
    id: 'monthly', name: 'Monthly', plan_key: 'monthly',
    amount_cents: 999, currency: 'USD', interval_count: 1, interval_unit: 'month'
  };

  it('should return 400 if no paymentMethod', async () => {
    const req = { user: mockUser, body: {} };
    await paymentController.createCheckout(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid request: missing payment method' });
  });

  it('should return 400 for unknown payment method', async () => {
    const req = { user: mockUser, body: { paymentMethod: 'paypal' } };
    await paymentController.createCheckout(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for invalid plan', async () => {
    const req = { user: mockUser, body: { paymentMethod: 'card', planKey: 'invalid' } };
    await paymentController.createCheckout(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should return 401 if user not found', async () => {
    const req = { user: mockUser, body: { paymentMethod: 'card', planKey: 'monthly' } };
    db.query.mockResolvedValueOnce({ rows: [] }); // user lookup
    
    await paymentController.createCheckout(req, mockRes);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('should create Authorize.Net hosted payment page for card method', async () => {
    const req = {
      user: mockUser,
      body: { paymentMethod: 'card', planKey: 'monthly', billingZip: '90210' },
      get: jest.fn((h) => h === 'origin' ? 'https://app.ahoyvpn.com' : ''),
      cookies: { accessToken: 'jwt-token' }
    };
    db.query
      .mockResolvedValueOnce({ rows: [{ ...mockUser, password_hash: 'x' }] }) // user lookup
      .mockResolvedValueOnce({ rows: [{ ...mockPlan, is_active: true }] })      // plan lookup
      .mockResolvedValueOnce({ rows: [] });                                       // existing sub check
    zipTaxService.getTaxRate.mockResolvedValueOnce({ taxRate: 0.08, taxAmountCents: 80 });
    authorizeNetUtils.getAuthorizeTransactionDetails = jest.fn();
    AuthorizeNetService.createHostedPaymentPage.mockResolvedValueOnce({
      token: 'hosted-token-abc',
      formUrl: 'https://accept.authorize.net/payment/page?id=xyz'
    });
    
    await paymentController.createCheckout(req, mockRes);
    
    expect(AuthorizeNetService.createHostedPaymentPage).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: 'card',
        flow: 'redirect',
        redirectUrl: expect.stringContaining('token=hosted-token-abc')
      })
    );
  });
});
```

---

## Task 7: Test createCheckout (crypto flow)

```javascript
  it('should create Plisio invoice for crypto method', async () => {
    const req = {
      user: mockUser,
      body: { paymentMethod: 'crypto', planKey: 'monthly', cryptoCurrency: 'BTC' },
      get: jest.fn((h) => h === 'origin' ? 'https://app.ahoyvpn.com' : ''),
      cookies: {}
    };
    db.query
      .mockResolvedValueOnce({ rows: [{ ...mockUser, password_hash: 'x' }] })
      .mockResolvedValueOnce({ rows: [{ ...mockPlan, is_active: true }] })
      .mockResolvedValueOnce({ rows: [] });
    zipTaxService.getTaxRate.mockResolvedValueOnce({ taxRate: 0, taxAmountCents: 0 });
    plisioService.createInvoice.mockResolvedValueOnce({
      invoice_id: 'plisio-inv-123',
      invoice_url: 'https://plisio.net/invoice/abc',
      total_amount: '9.99',
      currency: 'BTC'
    });
    
    await paymentController.createCheckout(req, mockRes);
    
    expect(plisioService.createInvoice).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: 'crypto',
        flow: 'redirect',
        redirectUrl: 'https://plisio.net/invoice/abc'
      })
    );
  });

  it('should return 400 for unsupported crypto currency', async () => {
    const req = {
      user: mockUser,
      body: { paymentMethod: 'crypto', planKey: 'monthly', cryptoCurrency: 'DOGE' },
      get: jest.fn(() => ''),
      cookies: {}
    };
    db.query
      .mockResolvedValueOnce({ rows: [{ ...mockUser, password_hash: 'x' }] })
      .mockResolvedValueOnce({ rows: [{ ...mockPlan, is_active: true }] })
      .mockResolvedValueOnce({ rows: [] });
    zipTaxService.getTaxRate.mockResolvedValueOnce({ taxRate: 0, taxAmountCents: 0 });
    
    await paymentController.createCheckout(req, mockRes);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Unsupported cryptocurrency') })
    );
  });
```

---

## Task 8: Run tests, verify, commit

```bash
cd /tmp/Decontaminate/backend
npm test -- tests/paymentController.test.js 2>&1 | tail -40

# Fix any failures

git add tests/paymentController.test.js
git commit -m "test(backend): add paymentController unit tests"
```

---

## Files Summary

| Action | File |
|--------|------|
| **CREATE** | `tests/paymentController.test.js` |
| **MODIFY** | None |

## Verification

1. Run: `npm test -- tests/paymentController.test.js`
2. Expected: All tests pass
3. Check coverage: `npm test -- --coverage 2>&1 | grep paymentController`
4. Target: >60% line coverage on paymentController.js

## Risk Assessment

- **Low risk** — pure unit tests, no database, no network
- Mocks isolate all external dependencies (db, plisioService, authorizeNetUtils, zipTaxService)
- Tests verify existing behavior, not new functionality
- No changes to source code
