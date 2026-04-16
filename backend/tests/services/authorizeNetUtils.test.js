/**
 * authorizeNetUtils unit tests
 *
 * Tests standalone functions (getAuthorizeTransactionDetails, cancelArbSubscription)
 * and AuthorizeNetService class methods.
 *
 * IMPORTANT: authorizeNetUtils.js uses global Node.js `fetch` (not node-fetch).
 * We mock it with jest.spyOn(global, 'fetch', mockFn) in each test.
 * jest.mock('node-fetch') is NOT used since the module uses global fetch.
 */

process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
process.env.DEBUG_AUTHORIZE_NET = 'false';

// No jest.mock('node-fetch') — authorizeNetUtils uses global fetch, not node-fetch

const {
  getAuthorizeTransactionDetails,
  cancelArbSubscription,
  AuthorizeNetService
} = require('../../src/services/authorizeNetUtils');

// Build a mock fetch response object (mimics real global fetch Response)
const buildMockResponse = (data, init = {}) => {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    ok: init.status !== undefined ? init.status >= 200 && init.status < 300 : true,
    status: init.status || 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(typeof data === 'string' ? JSON.parse(data) : data)
  };
};

// Spy on global fetch — returns resolved value for each call
const mockFetchOk = (data, init = {}) => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce(buildMockResponse(data, init));
};

// Spy on global fetch — returns rejected value for each call
const mockFetchErr = (error) => {
  jest.spyOn(global, 'fetch').mockRejectedValueOnce(error);
};

// Helper: restore all fetch mocks after each test
afterEach(() => {
  jest.restoreAllMocks();
});

// ─── getAuthorizeTransactionDetails tests ────────────────────────────────────

describe('getAuthorizeTransactionDetails', () => {
  beforeEach(() => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
  });

  it('returns null when transactionId is null', async () => {
    const result = await getAuthorizeTransactionDetails(null);
    expect(result).toBeNull();
  });

  it('returns null when transactionId is empty string', async () => {
    const result = await getAuthorizeTransactionDetails('');
    expect(result).toBeNull();
  });

  it('returns null when apiLoginId is missing', async () => {
    delete process.env.AUTHORIZE_NET_API_LOGIN_ID;
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).toBeNull();
  });

  it('returns null when transactionKey is missing', async () => {
    delete process.env.AUTHORIZE_NET_TRANSACTION_KEY;
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).toBeNull();
  });

  it('returns null when fetch returns non-ok status', async () => {
    mockFetchOk({ messages: { resultCode: 'Error' } }, { status: 503 });
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).toBeNull();
  });

  it('returns null when API returns error resultCode', async () => {
    mockFetchOk({ messages: { resultCode: 'Error' } });
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).toBeNull();
  });

  it('parses successful response — capturedPendingSettlement, responseCode inferred from status', async () => {
    mockFetchOk({
      messages: { resultCode: 'Ok' },
      transaction: {
        responseCode: '',
        transactionStatus: 'capturedPendingSettlement',
        authAmount: '59.99',
        settleAmount: null,
        order: { invoiceNumber: 'INV-001' },
        profile: { customerProfileId: 'CP123', customerPaymentProfileId: 'PP456' }
      }
    });
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).not.toBeNull();
    expect(result.responseCode).toBe('1');  // inferred from capturedPendingSettlement
    expect(result.transactionStatus).toBe('capturedPendingSettlement');
    expect(result.amountRaw).toBe('59.99');
    expect(result.invoiceNumber).toBe('INV-001');
    expect(result.customerProfileId).toBe('CP123');
    expect(result.customerPaymentProfileId).toBe('PP456');
  });

  it('parses successful response — settledSuccessfully with settleAmount', async () => {
    mockFetchOk({
      messages: { resultCode: 'Ok' },
      transaction: {
        responseCode: '1',
        transactionStatus: 'settledSuccessfully',
        authAmount: null,
        settleAmount: '59.99',
        order: { invoice_number: 'INV-002' },
        profile: {}
      }
    });
    const result = await getAuthorizeTransactionDetails('tx456');
    expect(result.responseCode).toBe('1');
    expect(result.transactionStatus).toBe('settledSuccessfully');
    expect(result.amountRaw).toBe('59.99');
    expect(result.invoiceNumber).toBe('INV-002');
  });

  it('handles BOM character at start of JSON response', async () => {
    mockFetchOk(
      '\uFEFF{"messages":{"resultCode":"Ok"},"transaction":{"responseCode":"1","transactionStatus":"authorizedPendingCapture","order":{},"profile":{}}}'
    );
    const result = await getAuthorizeTransactionDetails('tx789');
    expect(result).not.toBeNull();
    expect(result.responseCode).toBe('1');
  });

  it('returns null on fetch throw', async () => {
    mockFetchErr(new Error('ENOTFOUND'));
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result).toBeNull();
  });

  it('handles missing order field gracefully', async () => {
    mockFetchOk({
      messages: { resultCode: 'Ok' },
      transaction: {
        responseCode: '1',
        transactionStatus: 'capturedPendingSettlement',
        profile: {}
      }
    });
    const result = await getAuthorizeTransactionDetails('tx123');
    expect(result.invoiceNumber).toBe('');
  });
});

// ─── cancelArbSubscription tests ────────────────────────────────────────────

describe('cancelArbSubscription', () => {
  beforeEach(() => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
  });

  it('returns error result when subscriptionId is null', async () => {
    const result = await cancelArbSubscription(null);
    expect(result).toEqual({ success: false, message: 'No ARB subscription ID provided' });
  });

  it('returns error result when subscriptionId is undefined', async () => {
    const result = await cancelArbSubscription(undefined);
    expect(result).toEqual({ success: false, message: 'No ARB subscription ID provided' });
  });

  it('throws when apiLoginId is missing', async () => {
    delete process.env.AUTHORIZE_NET_API_LOGIN_ID;
    await expect(cancelArbSubscription('sub123')).rejects
      .toThrow('Authorize.net credentials are missing');
  });

  it('throws when transactionKey is missing', async () => {
    delete process.env.AUTHORIZE_NET_TRANSACTION_KEY;
    await expect(cancelArbSubscription('sub123')).rejects
      .toThrow('Authorize.net credentials are missing');
  });

  it('returns success=false with message when API returns error resultCode', async () => {
    mockFetchOk({ messages: { resultCode: 'Error', message: [{ text: 'Subscription not found' }] } });
    const result = await cancelArbSubscription('sub123');
    expect(result).toEqual({ success: false, message: 'Subscription not found' });
  });

  it('returns success=true with subscriptionId when cancellation succeeds', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' } });
    const result = await cancelArbSubscription('sub123');
    expect(result).toEqual({ success: true, subscriptionId: 'sub123' });
  });

  it('passes correct subscriptionId string to API', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' } });
    await cancelArbSubscription('sub999');
    const callArgs = global.fetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.ARBCancelSubscriptionRequest.subscriptionId).toBe('sub999');
  });

  it('throws on network error', async () => {
    mockFetchErr(new Error('ECONNREFUSED'));
    await expect(cancelArbSubscription('sub123')).rejects.toThrow('ECONNREFUSED');
  });
});

// ─── AuthorizeNetService constructor ───────────────────────────────────────

describe('AuthorizeNetService constructor', () => {
  it('reads apiLoginId and transactionKey from env vars', () => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
    const service = new AuthorizeNetService();
    expect(service.apiLoginId).toBe('testLoginId');
    expect(service.transactionKey).toBe('testTransactionKey');
  });

  it('apiLoginId is undefined when env var is not set', () => {
    delete process.env.AUTHORIZE_NET_API_LOGIN_ID;
    const service = new AuthorizeNetService();
    expect(service.apiLoginId).toBeUndefined();
  });
});

// ─── AuthorizeNetService._makeRequest ───────────────────────────────────────

describe('AuthorizeNetService._makeRequest', () => {
  let service;
  beforeEach(() => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
    service = new AuthorizeNetService();
  });

  it('throws when apiLoginId is null', async () => {
    service.apiLoginId = null;
    await expect(service._makeRequest({})).rejects
      .toThrow('Authorize.net credentials are not configured');
  });

  it('calls global fetch with correct URL, method, headers, and merchantAuthentication', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' } });
    await service._makeRequest({ testRequest: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.authorize.net/xml/v1/request.api');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body.testRequest).toBe(true);
    expect(body.merchantAuthentication.name).toBe('testLoginId');
    expect(body.merchantAuthentication.transactionKey).toBe('testTransactionKey');
  });

  it('strips BOM from response text before JSON.parse', async () => {
    mockFetchOk('\uFEFF{"messages":{"resultCode":"Ok"}}');
    const result = await service._makeRequest({});
    expect(result.messages.resultCode).toBe('Ok');
  });
});

// ─── AuthorizeNetService.getArbSubscription ──────────────────────────────────

describe('AuthorizeNetService.getArbSubscription', () => {
  let service;
  beforeEach(() => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
    service = new AuthorizeNetService();
  });

  it('returns null when API returns error resultCode', async () => {
    mockFetchOk({ messages: { resultCode: 'Error' } });
    const result = await service.getArbSubscription('sub123');
    expect(result).toBeNull();
  });

  it('returns structured subscription data on success', async () => {
    mockFetchOk({
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
    });
    const result = await service.getArbSubscription('sub123');
    expect(result.id).toBe('sub123');
    expect(result.status).toBe('active');
    expect(result.currentBillAmount).toBe('9.99');
    expect(result.lastPaymentAmount).toBe('9.99');
    expect(result.lastPaymentDate).toBe('2026-01-01');
    expect(result.nextBillingDate).toBe('2026-02-01');
    expect(result.currentPeriodEnd).toBe('2026-02-01');
    expect(result.createdDate).toBe('2026-01-01');
    expect(result.firstRenewalDate).toBe('2026-01-15');
  });

  it('returns null on network error', async () => {
    mockFetchErr(new Error('ETIMEDOUT'));
    const result = await service.getArbSubscription('sub123');
    expect(result).toBeNull();
  });

  it('handles missing optional subscription fields gracefully', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' }, subscription: {} });
    const result = await service.getArbSubscription('sub123');
    expect(result.id).toBe('sub123');
    expect(result.status).toBe('unknown');
    expect(result.currentBillAmount).toBe('0.00');
    expect(result.lastPaymentAmount).toBe('0.00');
    expect(result.lastPaymentDate).toBeNull();
  });
});

// ─── AuthorizeNetService.getTransactionDetails ───────────────────────────────

describe('AuthorizeNetService.getTransactionDetails', () => {
  let service;
  beforeEach(() => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
    service = new AuthorizeNetService();
  });

  it('returns null when API returns error resultCode', async () => {
    mockFetchOk({ messages: { resultCode: 'Error' } });
    const result = await service.getTransactionDetails('tx123');
    expect(result).toBeNull();
  });

  it('returns transaction data on success using authAmount', async () => {
    mockFetchOk({
      messages: { resultCode: 'Ok' },
      transaction: {
        responseCode: '1',
        transactionStatus: 'capturedPendingSettlement',
        authAmount: '59.99',
        settleAmount: null
      }
    });
    const result = await service.getTransactionDetails('tx123');
    expect(result.transactionId).toBe('tx123');
    expect(result.responseCode).toBe('1');
    expect(result.transactionStatus).toBe('capturedPendingSettlement');
    expect(result.amount).toBe('59.99');
  });

  it('falls back to settleAmount when authAmount is null', async () => {
    mockFetchOk({
      messages: { resultCode: 'Ok' },
      transaction: {
        responseCode: '1',
        transactionStatus: 'settledSuccessfully',
        authAmount: null,
        settleAmount: '59.99'
      }
    });
    const result = await service.getTransactionDetails('tx123');
    expect(result.amount).toBe('59.99');
  });

  it('returns null on network error', async () => {
    mockFetchErr(new Error('ENOTFOUND'));
    const result = await service.getTransactionDetails('tx123');
    expect(result).toBeNull();
  });
});

// ─── AuthorizeNetService.cancelSubscription ──────────────────────────────────

describe('AuthorizeNetService.cancelSubscription', () => {
  let service;
  beforeEach(() => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
    service = new AuthorizeNetService();
  });

  it('delegates to cancelArbSubscription and returns its result', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' } });
    const result = await service.cancelSubscription('sub123');
    expect(result).toEqual({ success: true, subscriptionId: 'sub123' });
  });
});

// ─── AuthorizeNetService.getApiEndpoint ──────────────────────────────────────

describe('AuthorizeNetService.getApiEndpoint', () => {
  it('returns the AUTHORIZE_API_URL constant', () => {
    const service = new AuthorizeNetService();
    expect(service.getApiEndpoint()).toBe('https://api.authorize.net/xml/v1/request.api');
  });
});

// ─── AuthorizeNetService.getHostedFormUrl ─────────────────────────────────────

describe('AuthorizeNetService.getHostedFormUrl', () => {
  it('returns production URL when environment is production', () => {
    const service = new AuthorizeNetService();
    service.environment = 'production';
    expect(service.getHostedFormUrl()).toBe('https://accept.authorize.net/payment/payment');
  });

  it('returns test URL when environment is development', () => {
    const service = new AuthorizeNetService();
    service.environment = 'development';
    expect(service.getHostedFormUrl()).toBe('https://test.authorize.net/payment/payment');
  });

  it('returns test URL when environment is undefined', () => {
    const service = new AuthorizeNetService();
    expect(service.getHostedFormUrl()).toBe('https://test.authorize.net/payment/payment');
  });
});

// ─── AuthorizeNetService.createHostedPaymentPage ──────────────────────────────

describe('AuthorizeNetService.createHostedPaymentPage', () => {
  let service;
  const validArgs = {
    amount: 59.99,
    invoiceNumber: 'INV-001',
    description: 'AhoyVPN Annual',
    returnUrl: 'https://ahoyvpn.net/checkout',
    cancelUrl: 'https://ahoyvpn.net/checkout?cancel=1',
    email: 'test@example.com'
  };

  beforeEach(() => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
    service = new AuthorizeNetService();
  });

  it('throws when apiLoginId is missing', async () => {
    service.apiLoginId = null;
    await expect(service.createHostedPaymentPage(validArgs)).rejects
      .toThrow('Authorize.net credentials are missing');
  });

  it('returns {token, formUrl} on success', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' }, token: 'hostedPaymentToken123' });
    const result = await service.createHostedPaymentPage(validArgs);
    expect(result.token).toBe('hostedPaymentToken123');
    expect(result.formUrl).toBe('https://test.authorize.net/payment/payment');
  });

  it('throws descriptive error when token is missing in successful response', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' } }); // no token field
    await expect(service.createHostedPaymentPage(validArgs)).rejects
      .toThrow('Failed to create hosted payment token');
  });

  it('throws on non-ok HTTP response', async () => {
    mockFetchOk({ messages: { resultCode: 'Error' } }, { status: 500 });
    await expect(service.createHostedPaymentPage(validArgs)).rejects
      .toThrow('Authorize.net hosted page API error: 500');
  });

  it('throws when JSON is invalid', async () => {
    mockFetchOk('not json at all {{{');
    await expect(service.createHostedPaymentPage(validArgs)).rejects
      .toThrow('Authorize.net hosted page returned invalid JSON');
  });

  it('passes correct hosted payment payload to API', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' }, token: 'tok' });
    await service.createHostedPaymentPage(validArgs);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.getHostedPaymentPageRequest.transactionRequest.amount).toBe('59.99');
    expect(body.getHostedPaymentPageRequest.transactionRequest.order.invoiceNumber).toBe('INV-001');
    expect(body.getHostedPaymentPageRequest.transactionRequest.customer.email).toBe('test@example.com');
  });

  it('throws on network error', async () => {
    mockFetchErr(new Error('ECONNREFUSED'));
    await expect(service.createHostedPaymentPage(validArgs)).rejects.toThrow('ECONNREFUSED');
  });
});

// ─── AuthorizeNetService.createTransaction ───────────────────────────────────

describe('AuthorizeNetService.createTransaction', () => {
  let service;
  const validCardData = {
    number: '4111111111111111',
    expiration: '12/28',
    cvv: '123'
  };
  const validBillingInfo = {
    firstName: 'John',
    lastName: 'Doe',
    address: '123 Main St',
    city: 'Anytown',
    state: 'PA',
    zip: '15417',
    country: 'USA'
  };

  beforeEach(() => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
    service = new AuthorizeNetService();
  });

  it('makes authOnlyTransaction API call with correct payload', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' } });
    await service.createTransaction('59.99', validCardData, validBillingInfo);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.createTransactionRequest.transactionRequest.transactionType).toBe('authOnlyTransaction');
    expect(body.createTransactionRequest.transactionRequest.amount).toBe('59.99');
    expect(body.createTransactionRequest.transactionRequest.payment.creditCard.cardNumber).toBe('4111111111111111');
    expect(body.createTransactionRequest.transactionRequest.billTo.firstName).toBe('John');
  });

  it('throws on HTTP error response', async () => {
    mockFetchOk({ messages: { resultCode: 'Error' } }, { status: 500 });
    await expect(service.createTransaction('59.99', validCardData, validBillingInfo))
      .rejects.toThrow('Authorize.net API error: 500');
  });

  it('throws on network error', async () => {
    mockFetchErr(new Error('ETIMEDOUT'));
    await expect(service.createTransaction('59.99', validCardData, validBillingInfo))
      .rejects.toThrow('ETIMEDOUT');
  });
});

// ─── AuthorizeNetService.createArbSubscription ───────────────────────────────

describe('AuthorizeNetService.createArbSubscription', () => {
  let service;
  const validArgs = {
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
  };

  beforeEach(() => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
    service = new AuthorizeNetService();
  });

  it('returns {subscriptionId, status} on success', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' }, subscriptionId: 'arb123456' });
    const result = await service.createArbSubscription(validArgs);
    expect(result.subscriptionId).toBe('arb123456');
    expect(result.status).toBe('Ok');
  });

  it('passes correct ARB payload to API', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' }, subscriptionId: 'arb1' });
    await service.createArbSubscription(validArgs);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    const arb = body.createSubscriptionRequest;
    expect(arb.subscription.paymentSchedule.interval.length).toBe(1);
    expect(arb.subscription.paymentSchedule.interval.unit).toBe('months');
    expect(arb.subscription.amount).toBe('59.99');
    expect(arb.subscription.payment.creditCard.cardNumber).toBe('4111111111111111');
    expect(arb.subscription.customer.email).toBe('john@example.com');
  });

  it('throws descriptive error when API returns error resultCode', async () => {
    mockFetchOk({ messages: { resultCode: 'Error', message: [{ text: 'Invalid card number' }] } });
    await expect(service.createArbSubscription(validArgs)).rejects.toThrow('Invalid card number');
  });

  it('throws on network error', async () => {
    mockFetchErr(new Error('ECONNREFUSED'));
    await expect(service.createArbSubscription(validArgs)).rejects.toThrow('ECONNREFUSED');
  });

  it('handles missing optional billing address fields gracefully', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' }, subscriptionId: 'arb1' });
    const result = await service.createArbSubscription({ ...validArgs, billingAddress: {} });
    expect(result.subscriptionId).toBe('arb1');
  });
});

// ─── AuthorizeNetService.createArbSubscriptionFromProfile ────────────────────

describe('AuthorizeNetService.createArbSubscriptionFromProfile', () => {
  let service;
  const validArgs = {
    amount: '59.99',
    intervalLength: 1,
    intervalUnit: 'months',
    startDate: '2026-05-01',
    customerProfileId: 'CP123',
    customerPaymentProfileId: 'PP456',
    subscriberEmail: 'john@example.com',
    invoiceNumber: 'INV-001',
    description: 'AhoyVPN Monthly'
  };

  beforeEach(() => {
    process.env.AUTHORIZE_NET_API_LOGIN_ID = 'testLoginId';
    process.env.AUTHORIZE_NET_TRANSACTION_KEY = 'testTransactionKey';
    service = new AuthorizeNetService();
  });

  it('returns {subscriptionId, status} on success', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' }, subscriptionId: 'arb789' });
    const result = await service.createArbSubscriptionFromProfile(validArgs);
    expect(result.subscriptionId).toBe('arb789');
    expect(result.status).toBe('Ok');
  });

  it('passes storedCredentials mandate in payment field', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' }, subscriptionId: 'arb1' });
    await service.createArbSubscriptionFromProfile(validArgs);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    const sub = body.createSubscriptionRequest.subscription;
    expect(sub.payment.storedCredentials.mandate).toBe('recurring');
    expect(sub.customerProfileId).toBe('CP123');
    expect(sub.customerPaymentProfileId).toBe('PP456');
  });

  it('throws descriptive error when API returns error resultCode', async () => {
    mockFetchOk({ messages: { resultCode: 'Error', message: [{ text: 'Profile not found' }] } });
    await expect(service.createArbSubscriptionFromProfile(validArgs))
      .rejects.toThrow('Profile not found');
  });

  it('throws on network error', async () => {
    mockFetchErr(new Error('ECONNREFUSED'));
    await expect(service.createArbSubscriptionFromProfile(validArgs))
      .rejects.toThrow('ECONNREFUSED');
  });

  it('uses ARB- prefix on invoiceNumber in order', async () => {
    mockFetchOk({ messages: { resultCode: 'Ok' }, subscriptionId: 'arb1' });
    await service.createArbSubscriptionFromProfile(validArgs);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.createSubscriptionRequest.subscription.order.invoiceNumber).toBe('ARB-INV-001');
  });
});
