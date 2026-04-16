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
 * Mocks:
 *   - db               (database queries for subscriptions, users, payments, tax_transactions)
 *   - plisioService    (getInvoiceStatus for invoice chain resolution)
 *   - promoService     (markPromoCodeUsed)
 *   - emailService     (sendAccountCreatedEmail)
 *   - userService      (createVpnAccount)
 *   - paymentController (applyAffiliateCommissionIfEligible)
 */

// Set env BEFORE requiring the service
process.env.PLISIO_API_KEY = '***';

jest.mock('../../src/config/database');
jest.mock('../../src/services/plisioService');
jest.mock('../../src/services/promoService');
jest.mock('../../src/services/emailService');
jest.mock('../../src/services/userService');
jest.mock('../../src/controllers/paymentController');

const db = require('../../src/config/database');
const plisioService = require('../../src/services/plisioService');
const promoService = require('../../src/services/promoService');
const emailService = require('../../src/services/emailService');
const { createVpnAccount } = require('../../src/services/userService');
const { applyAffiliateCommissionIfEligible } = require('../../src/controllers/paymentController');
const { processPlisioPaymentAsync } = require('../../src/services/paymentProcessingService');

describe('paymentProcessingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    db.query = jest.fn().mockResolvedValue({ rows: [] });

    await processPlisioPaymentAsync('unknown_invoice', 'tx_001', '49.99', 'USD');

    // Should have queried once for the subscription
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain('plisio_invoice_id');
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
    // Note: VPN creation (createVpnAccount) is an external service call, NOT a DB query
    db.query = jest.fn()
      .mockResolvedValueOnce({ rows: [sub] })                        // 1: SELECT subscription
      .mockResolvedValueOnce({ rows: [] })                          // 2: UPDATE subscription status
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] }) // 3: SELECT user email
      .mockResolvedValueOnce({ rows: [] });                         // 4: INSERT payment

    createVpnAccount.mockResolvedValue({ username: 'vpnuser', password: 'vpnpassword123' });

    await processPlisioPaymentAsync('inv_abc', 'tx_001', '49.99', 'USD');

    // Subscription status updated to active (call #2)
    expect(db.query.mock.calls[1][0]).toContain("status = 'active'");
    expect(db.query.mock.calls[1][1]).toEqual(['sub-1']);

    // VPN account created (external service call — not a DB query)
    expect(createVpnAccount).toHaveBeenCalledWith('user-1', 'ACC123', 'month');

    // Welcome email sent (uses result from call #3)
    expect(emailService.sendAccountCreatedEmail).toHaveBeenCalledWith(
      'user@example.com', 'vpnuser', 'vpnpassword123', expect.any(String)
    );

    // Payment recorded (call #4)
    expect(db.query.mock.calls[3][0]).toContain('INSERT INTO payments');
    expect(db.query.mock.calls[3][1]).toContain('succeeded');
    expect(db.query.mock.calls[3][1]).toContain('plisio');

    // No referral commission (no referral_code)
    expect(applyAffiliateCommissionIfEligible).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Switched invoice — direct query misses, Plisio API resolves chain
  // ─────────────────────────────────────────────────────────────────────────
  it('subscription not found directly — resolves via invoice chain and migrates invoice_id', async () => {
    const sub = mockSubscription();
    // First query: invoice not found
    // Second query (via Plisio API): invoice chain resolves to sub
    db.query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })            // SELECT — not found
      .mockResolvedValueOnce({ rows: [sub] })        // SELECT via switch_id
      .mockResolvedValueOnce({ rows: [] })            // UPDATE subscriptions plisio_invoice_id
      .mockResolvedValueOnce({ rows: [] })            // UPDATE payments
      .mockResolvedValueOnce({ rows: [] })            // UPDATE subscription status
      .mockResolvedValueOnce({ rows: [] })            // INSERT tax_transactions
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [] });           // INSERT payment

    plisioService.getInvoiceStatus.mockResolvedValue({
      invoice: { status: 'completed', switch_id: 'inv_switched' },
      active_invoice_id: 'inv_switched',
    });
    createVpnAccount.mockResolvedValue({ username: 'u', password: 'p' });

    await processPlisioPaymentAsync('inv_original', 'tx_new', '29.99', 'BTC');

    // Plisio API was called to resolve the chain
    expect(plisioService.getInvoiceStatus).toHaveBeenCalledWith('inv_original');

    // Invoice ID was migrated on the subscription
    const updateSubCall = db.query.mock.calls.find(c => c[0].includes('UPDATE subscriptions') && c[0].includes('plisio_invoice_id'));
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
    db.query = jest.fn()
      .mockResolvedValueOnce({ rows: [sub] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [] });

    createVpnAccount.mockResolvedValue({ username: 'u', password: 'p' });

    await processPlisioPaymentAsync('inv_promo', 'tx_promo', '39.99', 'USD');

    expect(promoService.markPromoCodeUsed).toHaveBeenCalledWith('promo-99');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Referral commission is recorded when referral_code exists
  // ─────────────────────────────────────────────────────────────────────────
  it('subscription with referral_code — calls applyAffiliateCommissionIfEligible', async () => {
    const sub = mockSubscription({ referral_code: 'WILLIAM20' });
    db.query = jest.fn()
      .mockResolvedValueOnce({ rows: [sub] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [] });

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
    db.query = jest.fn()
      .mockResolvedValueOnce({ rows: [sub] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })  // tax insert
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [] });

    createVpnAccount.mockResolvedValue({ username: 'u', password: 'p' });

    await processPlisioPaymentAsync('inv_tax', 'tx_tax', '10.86', 'USD');

    const taxCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO tax_transactions'));
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
    // The code first queries with the invoice_id directly (returns empty),
    // then queries with each linkedInvoiceId (active_invoice_id='inv_new', switch_id='inv_new').
    // We need the SECOND plisio_invoice_id query to return the sub.
    // Call sequence:
    // 1=SELECT sub WHERE inv_abc (empty) → 2=Plisio API → 3=SELECT sub WHERE inv_new (FOUND) →
    // 4=UPDATE sub plisio_invoice_id → 5=UPDATE payments → 6=UPDATE status → 7=SELECT email → 8=INSERT payment
    db.query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })                           // 1: SELECT inv_abc — not found
      .mockResolvedValueOnce({ rows: [sub] })                         // 3: SELECT inv_new — FOUND
      .mockResolvedValueOnce({ rows: [] })                           // 4: UPDATE sub plisio_invoice_id
      .mockResolvedValueOnce({ rows: [] })                           // 5: UPDATE payments
      .mockResolvedValueOnce({ rows: [] })                           // 6: UPDATE subscription status
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] }) // 7: SELECT user email
      .mockResolvedValueOnce({ rows: [] });                          // 8: INSERT payment

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

    // Payment recorded with filled amount (call #8)
    const paymentCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO payments'));
    expect(paymentCall[1]).toContain(5999);  // amountCents = Math.round(59.99 * 100)
    expect(paymentCall[1]).toContain('EUR');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: Tax transaction failure is non-blocking — subscription still processes
  // ─────────────────────────────────────────────────────────────────────────
  it('tax transaction insert fails — subscription still activates, VPN account still created', async () => {
    // postal_code IS set → tax INSERT fires → throws → caught → pipeline continues
    const sub = mockSubscription({
      metadata: { postal_code: '90210', country: 'USA', state: 'CA', plan_amount_cents: '999', tax_amount_cents: '0', tax_rate: '0' },
    });
    // Call sequence: 1=SELECT sub → 2=UPDATE status → 3=INSERT tax (THROWS) → 4=SELECT email → 5=INSERT payment
    db.query = jest.fn()
      .mockResolvedValueOnce({ rows: [sub] })                       // 1: SELECT subscription
      .mockResolvedValueOnce({ rows: [] })                          // 2: UPDATE subscription status
      .mockRejectedValueOnce(new Error('DB constraint error'))        // 3: INSERT tax_transactions — throws
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] }) // 4: SELECT user email
      .mockResolvedValueOnce({ rows: [] });                         // 5: INSERT payment

    createVpnAccount.mockResolvedValue({ username: 'vpn', password: 'pw' });

    await processPlisioPaymentAsync('inv_tax_fail', 'tx_fail', '9.99', 'USD');

    // VPN account was still created despite tax failure
    expect(createVpnAccount).toHaveBeenCalled();
    // Welcome email was still sent (the email SELECT and VPN creation succeeded)
    expect(emailService.sendAccountCreatedEmail).toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: Welcome email NOT sent when user has no email on record
  // ─────────────────────────────────────────────────────────────────────────
  it('user has no email on record — welcome email not sent, VPN account still created', async () => {
    const sub = mockSubscription({ promo_code_id: null, referral_code: null });
    db.query = jest.fn()
      .mockResolvedValueOnce({ rows: [sub] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })   // SELECT user — empty email
      .mockResolvedValueOnce({ rows: [] });   // INSERT payment

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
    db.query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })             // SELECT — not found directly
      .mockResolvedValueOnce({ rows: [sub] })          // SELECT via paid_id
      .mockResolvedValueOnce({ rows: [] })             // UPDATE subscriptions
      .mockResolvedValueOnce({ rows: [] })             // UPDATE payments
      .mockResolvedValueOnce({ rows: [] })             // UPDATE subscription status
      .mockResolvedValueOnce({ rows: [] })             // INSERT tax_transactions
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [] });            // INSERT payment

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
