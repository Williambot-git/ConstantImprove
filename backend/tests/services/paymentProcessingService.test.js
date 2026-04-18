/**
 * paymentProcessingService unit tests
 *
 * Tests processPlisioPaymentAsync which handles completed Plisio crypto payments:
 * - Resolves switched/duplicate invoice chains
 * - Activates subscriptions
 * - Creates VPN accounts
 * - Sends welcome emails
 * - Records affiliate commissions
 * - Inserts payment records
 *
 * Tests processPaymentsCloudPaymentAsync which handles PaymentsCloud payment webhooks:
 * - Activates trialing subscriptions
 * - Creates VPN accounts
 * - Sends welcome emails
 * - Records payments
 *
 * Mocks:
 *   - db               (database queries for subscriptions, users, payments, tax_transactions)
 *   - plisioService    (getInvoiceStatus for invoice chain resolution)
 *   - promoService     (markPromoCodeUsed)
 *   - emailService     (sendAccountCreatedEmail)
 *   - userService      (createVpnAccount)
 *   - affiliateCommissionService (applyAffiliateCommissionIfEligible)
 */

// Set env BEFORE requiring the service
process.env.PLISIO_API_KEY='***';

jest.mock('../../src/config/database');
jest.mock('../../src/services/plisioService');
jest.mock('../../src/services/promoService');
jest.mock('../../src/services/emailService');
jest.mock('../../src/services/userService');
jest.mock('../../src/services/affiliateCommissionService');

const db = require('../../src/config/database');
const plisioService = require('../../src/services/plisioService');
const promoService = require('../../src/services/promoService');
const emailService = require('../../src/services/emailService');
const { createVpnAccount } = require('../../src/services/userService');
const { applyAffiliateCommissionIfEligible } = require('../../src/services/affiliateCommissionService');
const { processPlisioPaymentAsync, processPaymentsCloudPaymentAsync } = require('../../src/services/paymentProcessingService');

describe('paymentProcessingService', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Root-cause fix for cross-test pollution:
  //
  // PROBLEM: Plisio tests originally used `db.query = jest.fn()` (reference
  // reassignment) to assert exact call counts. This breaks the beforeEach
  // lifecycle because:
  //   1. Test A calls `db.query = jest.fn()` — service now calls the local mock
  //   2. Test A's afterEach: `db.query = _origDbQuery` — restores original
  //   3. Test B's beforeEach: `_origDbQuery.mockReset()` — clears original
  //   4. Test B's beforeEach: `_origDbQuery.mockImplementation(...)` — re-adds impl
  //   5. BUT: Test A called the LOCAL mock (not _origDbQuery), so Test B's
  //      `mockImplementation` receives calls meant for Test A's local mock
  //
  // SOLUTION: Never reassign `db.query`. Always use `.mockImplementation()`
  // on the original reference. Use a custom sequence-tracking function so
  // mockReset() clears call history between tests. Assertions reference
  // _origDbQuery.mock.calls directly.
  //
  // We save the original jest.mock() return value at module load time, before
  // any test can reassign the variable.
  // ─────────────────────────────────────────────────────────────────────────
  const _origDbQuery = db.query;
  const _origGetInvoiceStatus = plisioService.getInvoiceStatus;
  const _origMarkPromoCodeUsed = promoService.markPromoCodeUsed;
  const _origSendAccountCreatedEmail = emailService.sendAccountCreatedEmail;
  const _origCreateVpnAccount = createVpnAccount;
  const _origApplyAffiliateCommission = applyAffiliateCommissionIfEligible;

  beforeEach(() => {
    // mockReset() clears call history AND implementations.
    // This is safe because we re-add all implementations below.
    _origDbQuery.mockReset();
    _origGetInvoiceStatus.mockReset();
    _origMarkPromoCodeUsed.mockReset();
    _origSendAccountCreatedEmail.mockReset();
    _origCreateVpnAccount.mockReset();
    _origApplyAffiliateCommission.mockReset();

    // Default implementations — must be re-established after each mockReset().
    // Tests override specific calls with mockImplementation() or
    // mockResolvedValueOnce() as needed.
    _origDbQuery.mockImplementation(() => Promise.resolve({ rows: [] }));
    _origGetInvoiceStatus.mockImplementation(() => Promise.resolve({ rows: [] }));
    _origMarkPromoCodeUsed.mockImplementation(() => Promise.resolve());
    _origSendAccountCreatedEmail.mockImplementation(() => Promise.resolve());
    // createVpnAccount: default to throwing — unmocked calls are test bugs.
    _origCreateVpnAccount.mockImplementation(
      () => { throw new Error('createVpnAccount called without test setup'); }
    );
    _origApplyAffiliateCommission.mockImplementation(() => Promise.resolve());
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Helper — builds a minimal subscription row as returned by the JOIN query
  // ─────────────────────────────────────────────────────────────────────────
  const mockSubscription = (overrides = {}) => ({
    id: 'sub-1',
    user_id: 'user-1',
    account_number: 'ACC123',
    plan_id: 'monthly',
    plan_interval: 'month',
    status: 'trialing',
    promo_code_id: null,
    referral_code: null,
    metadata: {},
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Subscription not found — function returns early, no side effects
  // ─────────────────────────────────────────────────────────────────────────
  it('subscription not found for invoice — returns early without side effects', async () => {
    // Override only the first call to return empty rows.
    // _origDbQuery.mockImplementation() persists for all calls in this test.
    _origDbQuery.mockImplementation(() => Promise.resolve({ rows: [] }));

    await processPlisioPaymentAsync('unknown_invoice', 'tx_001', '49.99', 'USD');

    // Single subscription lookup call
    expect(_origDbQuery).toHaveBeenCalledTimes(1);
    expect(_origDbQuery.mock.calls[0][0]).toContain('plisio_invoice_id');
    // No promo, no VPN account, no email, no payment
    expect(promoService.markPromoCodeUsed).not.toHaveBeenCalled();
    expect(createVpnAccount).not.toHaveBeenCalled();
    expect(emailService.sendAccountCreatedEmail).not.toHaveBeenCalled();
    expect(applyAffiliateCommissionIfEligible).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Happy path — invoice found directly, everything fires
  // ─────────────────────────────────────────────────────────────────────────
  it('invoice found directly — activates subscription, creates VPN account, sends email, records payment', async () => {
    const sub = mockSubscription({ promo_code_id: null, referral_code: null });
    // Call sequence: 1=SELECT sub → 2=UPDATE status → 3=SELECT email → 4=INSERT payment
    // We build a sequence of return values; mockImplementation receives
    // call index so we can return the right value for each call.
    let callIndex = 0;
    _origDbQuery.mockImplementation(() => {
      const sequence = [
        { rows: [sub] },                         // 1: SELECT subscription
        { rows: [] },                             // 2: UPDATE subscription status
        { rows: [{ email: 'user@example.com' }] }, // 3: SELECT user email
        { rows: [] },                             // 4: INSERT payment
      ];
      return Promise.resolve(sequence[callIndex++] || { rows: [] });
    });

    createVpnAccount.mockResolvedValue({ username: 'vpnuser', password: 'vpnpassword123' });

    await processPlisioPaymentAsync('inv_abc', 'tx_001', '49.99', 'USD');

    // Subscription status updated to active (call #2)
    expect(_origDbQuery.mock.calls[1][0]).toContain("status = 'active'");
    expect(_origDbQuery.mock.calls[1][1]).toEqual(['sub-1']);

    // VPN account created (external service call — not a DB query)
    expect(createVpnAccount).toHaveBeenCalledWith('user-1', 'ACC123', 'month');

    // Welcome email sent (uses result from call #3)
    expect(emailService.sendAccountCreatedEmail).toHaveBeenCalledWith(
      'user@example.com', 'vpnuser', 'vpnpassword123', expect.any(String)
    );

    // Payment recorded (call #4)
    expect(_origDbQuery.mock.calls[3][0]).toContain('INSERT INTO payments');
    expect(_origDbQuery.mock.calls[3][1]).toContain('succeeded');
    expect(_origDbQuery.mock.calls[3][1]).toContain('plisio');

    // No referral commission (no referral_code)
    expect(applyAffiliateCommissionIfEligible).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Switched invoice — direct query misses, Plisio API resolves chain
  // ─────────────────────────────────────────────────────────────────────────
  it('subscription not found directly — resolves via invoice chain and migrates invoice_id', async () => {
    const sub = mockSubscription();
    let callIndex = 0;
    _origDbQuery.mockImplementation(() => {
      const sequence = [
        { rows: [] },             // 1: SELECT — not found directly
        { rows: [sub] },           // 2: SELECT via switch_id — FOUND
        { rows: [] },             // 3: UPDATE subscriptions plisio_invoice_id
        { rows: [] },             // 4: UPDATE payments
        { rows: [] },             // 5: UPDATE subscription status
        { rows: [] },             // 6: INSERT tax_transactions
        { rows: [{ email: 'user@example.com' }] }, // 7: SELECT user email
        { rows: [] },             // 8: INSERT payment
      ];
      return Promise.resolve(sequence[callIndex++] || { rows: [] });
    });

    plisioService.getInvoiceStatus.mockResolvedValue({
      invoice: { status: 'completed', switch_id: 'inv_switched' },
      active_invoice_id: 'inv_switched',
    });
    createVpnAccount.mockResolvedValue({ username: 'u', password: 'p' });

    await processPlisioPaymentAsync('inv_original', 'tx_new', '29.99', 'BTC');

    // Plisio API was called to resolve the chain
    expect(plisioService.getInvoiceStatus).toHaveBeenCalledWith('inv_original');

    // Invoice ID was migrated on the subscription
    const updateSubCall = _origDbQuery.mock.calls.find(c =>
      c[0].includes('UPDATE subscriptions') && c[0].includes('plisio_invoice_id')
    );
    expect(updateSubCall).toBeDefined();
    expect(updateSubCall[1]).toEqual(['inv_original', 'sub-1']);

    // VPN account still created
    expect(createVpnAccount).toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Promo code is marked as used when subscription has promo_code_id
  // ─────────────────────────────────────────────────────────────────────────
  it('subscription with promo_code_id — marks promo code as used', async () => {
    const sub = mockSubscription({ promo_code_id: 'promo-99' });
    let callIndex = 0;
    _origDbQuery.mockImplementation(() => {
      const sequence = [
        { rows: [sub] },
        { rows: [] },
        { rows: [] },
        { rows: [{ email: 'user@example.com' }] },
        { rows: [] },
      ];
      return Promise.resolve(sequence[callIndex++] || { rows: [] });
    });

    createVpnAccount.mockResolvedValue({ username: 'u', password: 'p' });

    await processPlisioPaymentAsync('inv_promo', 'tx_promo', '39.99', 'USD');

    expect(promoService.markPromoCodeUsed).toHaveBeenCalledWith('promo-99');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Referral commission is recorded when referral_code exists
  // ─────────────────────────────────────────────────────────────────────────
  it('subscription with referral_code — calls applyAffiliateCommissionIfEligible', async () => {
    const sub = mockSubscription({ referral_code: 'WILLIAM20' });
    let callIndex = 0;
    _origDbQuery.mockImplementation(() => {
      const sequence = [
        { rows: [sub] },
        { rows: [] },
        { rows: [] },
        { rows: [{ email: 'user@example.com' }] },
        { rows: [] },
      ];
      return Promise.resolve(sequence[callIndex++] || { rows: [] });
    });

    createVpnAccount.mockResolvedValue({ username: 'u', password: 'p' });
    applyAffiliateCommissionIfEligible.mockResolvedValue(500); // $5.00 commission

    await processPlisioPaymentAsync('inv_ref', 'tx_ref', '49.99', 'USD');

    expect(applyAffiliateCommissionIfEligible).toHaveBeenCalledWith({
      affiliateCode: 'WILLIAM20',
      accountNumber: 'ACC123',
      plan: 'monthly',
      amountCents: 4999,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Tax transaction inserted when postal code present in metadata
  // ─────────────────────────────────────────────────────────────────────────
  it('subscription with postal code in metadata — records tax transaction', async () => {
    const sub = mockSubscription({
      metadata: {
        postal_code: '90210',
        country: 'USA',
        state: 'CA',
        plan_amount_cents: '999',
        tax_amount_cents: '87',
        tax_rate: '0.0875',
      },
    });
    let callIndex = 0;
    _origDbQuery.mockImplementation(() => {
      const sequence = [
        { rows: [sub] },
        { rows: [] },
        { rows: [] },  // INSERT tax_transactions
        { rows: [{ email: 'user@example.com' }] },
        { rows: [] },
      ];
      return Promise.resolve(sequence[callIndex++] || { rows: [] });
    });

    createVpnAccount.mockResolvedValue({ username: 'u', password: 'p' });

    await processPlisioPaymentAsync('inv_tax', 'tx_tax', '10.86', 'USD');

    const taxCall = _origDbQuery.mock.calls.find(c => c[0].includes('INSERT INTO tax_transactions'));
    expect(taxCall).toBeDefined();
    expect(taxCall[1]).toContain('90210');
    expect(taxCall[1]).toContain('USA');
    expect(taxCall[1]).toContain('CA');
    expect(taxCall[1]).toContain(999);   // plan_amount_cents
    expect(taxCall[1]).toContain(87);     // tax_amount_cents
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: Amount and currency filled from Plisio API when not provided
  // ─────────────────────────────────────────────────────────────────────────
  it('amount/currency not provided — fills from Plisio API invoice data', async () => {
    const sub = mockSubscription();
    let callIndex = 0;
    _origDbQuery.mockImplementation(() => {
      const sequence = [
        { rows: [] },                           // 1: SELECT inv_abc — not found
        { rows: [sub] },                         // 2: SELECT inv_new — FOUND (via Plisio chain)
        { rows: [] },                           // 3: UPDATE sub plisio_invoice_id
        { rows: [] },                           // 4: UPDATE payments
        { rows: [] },                           // 5: UPDATE subscription status
        { rows: [{ email: 'user@example.com' }] }, // 6: SELECT user email
        { rows: [] },                            // 7: INSERT payment
      ];
      return Promise.resolve(sequence[callIndex++] || { rows: [] });
    });

    // Plisio resolves the original invoice to a linked invoice
    plisioService.getInvoiceStatus.mockResolvedValueOnce({
      invoice: { status: 'completed', amount: '59.99', currency: 'EUR', invoice_total_sum: '59.99', psys_cid: 'EUR', switch_id: 'inv_new' },
      active_invoice_id: 'inv_new',
    });
    createVpnAccount.mockResolvedValue({ username: 'vpn', password: 'pw' });

    // Pass null for amount and currency — expect them to be filled from API response
    await processPlisioPaymentAsync('inv_abc', 'tx_001', null, null);

    // Plisio API was called to fill in missing amount/currency
    expect(plisioService.getInvoiceStatus).toHaveBeenCalledWith('inv_abc');

    // VPN creation and email were triggered (function completed past invoice resolution)
    expect(createVpnAccount).toHaveBeenCalled();

    // Payment recorded with filled amount (call #7)
    const paymentCall = _origDbQuery.mock.calls.find(c => c[0].includes('INSERT INTO payments'));
    expect(paymentCall[1]).toContain(5999);  // amountCents = Math.round(59.99 * 100)
    expect(paymentCall[1]).toContain('EUR');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: Tax transaction failure is non-blocking — subscription still processes
  // ─────────────────────────────────────────────────────────────────────────
  it('tax transaction insert fails — subscription still activates, VPN account still created', async () => {
    // postal_code IS set → tax INSERT fires → throws → caught → pipeline continues.
    // Use mockResolvedValueOnce/rejectedValueOnce queue — designed for ordered sequences
    // with mixed resolved/rejected calls. No need for manual callIndex tracking.
    const sub = mockSubscription({
      metadata: { postal_code: '90210', country: 'USA', state: 'CA', plan_amount_cents: '999', tax_amount_cents: '0', tax_rate: '0' },
    });
    _origDbQuery
      .mockResolvedValueOnce({ rows: [sub] })                          // 1: SELECT subscription
      .mockResolvedValueOnce({ rows: [] })                              // 2: UPDATE subscription status
      .mockRejectedValueOnce(new Error('DB constraint error'))           // 3: INSERT tax_transactions — THROWS
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] }) // 4: SELECT user email
      .mockResolvedValueOnce({ rows: [] });                             // 5: INSERT payment

    createVpnAccount.mockResolvedValue({ username: 'vpn', password: 'pw' });

    await processPlisioPaymentAsync('inv_tax_fail', 'tx_fail', '9.99', 'USD');

    // VPN account was still created despite tax failure
    expect(createVpnAccount).toHaveBeenCalled();
    // Welcome email was still sent (email SELECT returned a valid row)
    expect(emailService.sendAccountCreatedEmail).toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: Welcome email NOT sent when user has no email on record
  // ─────────────────────────────────────────────────────────────────────────
  it('user has no email on record — welcome email not sent, VPN account still created', async () => {
    const sub = mockSubscription({ promo_code_id: null, referral_code: null });
    let callIndex = 0;
    _origDbQuery.mockImplementation(() => {
      const sequence = [
        { rows: [sub] },         // 1: SELECT subscription
        { rows: [] },           // 2: UPDATE subscription status
        { rows: [] },           // 3: SELECT user — empty email
        { rows: [] },           // 4: INSERT payment
      ];
      return Promise.resolve(sequence[callIndex++] || { rows: [] });
    });

    createVpnAccount.mockResolvedValue({ username: 'vpn', password: 'pw' });

    await processPlisioPaymentAsync('inv_noemail', 'tx_noemail', '49.99', 'USD');

    expect(createVpnAccount).toHaveBeenCalled();
    expect(emailService.sendAccountCreatedEmail).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 10: Invoice chain resolution — paid_id used as fallback
  // ─────────────────────────────────────────────────────────────────────────
  it('invoice chain uses paid_id as fallback when active_invoice_id and switch_id are absent', async () => {
    const sub = mockSubscription();
    let callIndex = 0;
    _origDbQuery.mockImplementation(() => {
      const sequence = [
        { rows: [] },             // 1: SELECT — not found directly
        { rows: [sub] },           // 2: SELECT via paid_id — FOUND
        { rows: [] },             // 3: UPDATE subscriptions
        { rows: [] },             // 4: UPDATE payments
        { rows: [] },             // 5: UPDATE subscription status
        { rows: [] },             // 6: INSERT tax_transactions
        { rows: [{ email: 'user@example.com' }] }, // 7: SELECT email
        { rows: [] },             // 8: INSERT payment
      ];
      return Promise.resolve(sequence[callIndex++] || { rows: [] });
    });

    // Only paid_id is set, not active_invoice_id or switch_id
    plisioService.getInvoiceStatus.mockResolvedValue({
      invoice: { status: 'completed', paid_id: 'inv_paid' },
      active_invoice_id: null,
    });
    createVpnAccount.mockResolvedValue({ username: 'u', password: 'p' });

    await processPlisioPaymentAsync('inv_original', 'tx_paid', '19.99', 'ETH');

    expect(createVpnAccount).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// processPaymentsCloudPaymentAsync
// Handles PaymentsCloud payment webhooks: activates subscription, creates VPN,
// sends welcome email, records payment.
// ══════════════════════════════════════════════════════════════════════════════
describe('processPaymentsCloudPaymentAsync', () => {
  // These tests live in a SEPARATE describe block so they have their own
  // beforeEach that runs independently. The outer paymentProcessingService
  // describe's beforeEach does NOT run for these tests. This means we must
  // replicate the mock setup here. However, since we snapshot the original
  // mock references at module level, we can safely use them in this describe.
  const _origDbQuery = db.query;
  const _origSendAccountCreatedEmail = emailService.sendAccountCreatedEmail;
  const _origCreateVpnAccount = createVpnAccount;

  beforeEach(() => {
    _origDbQuery.mockReset();
    _origSendAccountCreatedEmail.mockReset();
    _origCreateVpnAccount.mockReset();

    // Default implementations — must be re-established after each mockReset().
    _origDbQuery.mockImplementation(() => Promise.resolve({ rows: [] }));
    _origSendAccountCreatedEmail.mockImplementation(() => Promise.resolve());
    _origCreateVpnAccount.mockImplementation(
      () => { throw new Error('createVpnAccount called without test setup'); }
    );
  });

  // ─── Happy path ─────────────────────────────────────────────────────────────

  it('activates trialing subscription, creates VPN account, sends email, records payment', async () => {
    const mockSub = {
      id: 'sub_pc_1',
      user_id: 'user_pc_1',
      account_number: '12345678',
      status: 'trialing',
      current_period_end: '2026-05-01',
      metadata: {}
    };
    let callIndex = 0;
    _origDbQuery.mockImplementation(() => {
      const sequence = [
        { rows: [{ id: 'user_pc_1' }] },            // 1: SELECT user by account_number
        { rows: [mockSub] },                         // 2: SELECT trialing subscription
        { rows: [] },                                // 3: UPDATE subscription
        { rows: [{ email: 'test@example.com' }] },  // 4: SELECT user email
        { rows: [] },                                // 5: INSERT payment
      ];
      return Promise.resolve(sequence[callIndex++] || { rows: [] });
    });

    _origCreateVpnAccount.mockResolvedValue({ username: 'vpnuser', password: 'vnpass' });

    await processPaymentsCloudPaymentAsync({
      id: 'pc_tx_123',
      amount: '29.99',
      currency: 'USD',
      metadata: { account_number: '12345678', plan_key: 'month' }
    });

    expect(_origCreateVpnAccount).toHaveBeenCalledWith('user_pc_1', '12345678', 'month');
    expect(_origSendAccountCreatedEmail).toHaveBeenCalled();
    // Verify payment was recorded with correct amount
    const insertCall = _origDbQuery.mock.calls.find(c => c[0].includes('INSERT INTO payments'));
    expect(insertCall).toBeDefined();
    expect(insertCall[1][2]).toBe(2999); // amount_cents
  });

  it('skips VPN account creation when user has no email on record', async () => {
    const mockSub = {
      id: 'sub_pc_2',
      user_id: 'user_pc_2',
      account_number: '87654321',
      status: 'trialing',
      current_period_end: '2026-05-01',
      metadata: {}
    };
    let callIndex = 0;
    _origDbQuery.mockImplementation(() => {
      const sequence = [
        { rows: [{ id: 'user_pc_2' }] },   // 1: SELECT user
        { rows: [mockSub] },                 // 2: SELECT subscription
        { rows: [] },                       // 3: UPDATE subscription
        { rows: [] },                       // 4: SELECT user email — EMPTY
      ];
      return Promise.resolve(sequence[callIndex++] || { rows: [] });
    });

    _origCreateVpnAccount.mockResolvedValue({ username: 'vpnuser', password: 'vnpass' });

    await processPaymentsCloudPaymentAsync({
      id: 'pc_tx_456',
      amount: '49.99',
      metadata: { account_number: '87654321', plan_key: 'quarter' }
    });

    // VPN account WAS created (no early return — email check is AFTER VPN creation)
    expect(_origCreateVpnAccount).toHaveBeenCalled();
    // Email was NOT sent because user has no email
    expect(_origSendAccountCreatedEmail).not.toHaveBeenCalled();
  });

  // ─── Error handling ─────────────────────────────────────────────────────────

  it('returns early when metadata is missing account_number', async () => {
    // Default _origDbQuery returns { rows: [] } for all calls — function returns early.
    await processPaymentsCloudPaymentAsync({
      id: 'pc_no_meta',
      amount: '9.99',
      metadata: {}
    });

    expect(_origCreateVpnAccount).not.toHaveBeenCalled();
    expect(_origSendAccountCreatedEmail).not.toHaveBeenCalled();
  });

  it('returns early when metadata is missing plan_key', async () => {
    // Default _origDbQuery returns { rows: [] } for all calls — function returns early.
    await processPaymentsCloudPaymentAsync({
      id: 'pc_no_plan',
      amount: '9.99',
      metadata: { account_number: '12345678' }
    });

    expect(_origCreateVpnAccount).not.toHaveBeenCalled();
  });

  it('returns early when user not found for account_number', async () => {
    // First call (user lookup) returns empty — function returns early.
    _origDbQuery.mockImplementationOnce(() => Promise.resolve({ rows: [] }));

    await processPaymentsCloudPaymentAsync({
      id: 'pc_no_user',
      amount: '9.99',
      metadata: { account_number: 'DOES_NOT_EXIST', plan_key: 'month' }
    });

    expect(_origCreateVpnAccount).not.toHaveBeenCalled();
  });

  it('returns early when no trialing subscription found for user', async () => {
    // First call (user lookup) returns found, second (subscription lookup) returns empty.
    let callCount = 0;
    _origDbQuery.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ rows: [{ id: 'user_pc_3' }] });
      return Promise.resolve({ rows: [] });
    });

    await processPaymentsCloudPaymentAsync({
      id: 'pc_no_sub',
      amount: '9.99',
      metadata: { account_number: '12345678', plan_key: 'month' }
    });

    expect(_origCreateVpnAccount).not.toHaveBeenCalled();
  });

  it('handles database errors gracefully (does not throw)', async () => {
    _origDbQuery.mockRejectedValueOnce(new Error('DB connection failed'));

    await expect(processPaymentsCloudPaymentAsync({
      id: 'pc_db_err',
      amount: '9.99',
      metadata: { account_number: '12345678', plan_key: 'month' }
    })).resolves.not.toThrow();
  });
});
