const db = require('../config/database');
const plisioService = require('./plisioService');
const promoService = require('./promoService');
const emailService = require('./emailService');
const { createVpnAccount } = require('./userService');
const { applyAffiliateCommissionIfEligible } = require('../controllers/paymentController');

/**
 * Process a completed Plisio payment asynchronously.
 * Handles invoice chain resolution (switched/duplicate invoices), activates
 * subscriptions, creates VPN accounts, sends welcome emails, and records payments.
 *
 * @param {string} invoice_id - Plisio invoice ID or order number
 * @param {string|null} tx_id - Transaction ID from Plisio
 * @param {string|null} amount - Payment amount
 * @param {string|null} currency - Currency code
 */
async function processPlisioPaymentAsync(invoice_id, tx_id, amount, currency) {
  try {
    // Find subscription by invoice ID (handle Plisio switched invoices)
    const subQuery = `
      SELECT s.*, u.id as user_id, u.account_number, p.interval as plan_interval
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE s.plisio_invoice_id = $1
    `;

    let effectiveInvoiceId = invoice_id;
    let subResult = await db.query(subQuery, [effectiveInvoiceId]);

    // If not found directly, try resolving switch/duplicate invoice chains
    if (subResult.rows.length === 0) {
      try {
        const invoiceStatus = await plisioService.getInvoiceStatus(invoice_id);
        const invoiceData = invoiceStatus?.invoice || invoiceStatus || {};
        const linkedInvoiceIds = [
          invoiceStatus?.active_invoice_id,
          invoiceData?.switch_id,
          invoiceData?.paid_id
        ].filter(Boolean);

        for (const candidateId of linkedInvoiceIds) {
          const candidate = await db.query(subQuery, [candidateId]);
          if (candidate.rows.length > 0) {
            subResult = candidate;
            // Subscription was tied to an older switched invoice - migrate linkage
            await db.query(
              `UPDATE subscriptions
               SET plisio_invoice_id = $1, updated_at = NOW()
               WHERE id = $2`,
              [invoice_id, candidate.rows[0].id]
            );

            await db.query(
              `UPDATE payments
               SET payment_intent_id = $1,
                   invoice_url = COALESCE($2, invoice_url),
                   updated_at = NOW()
               WHERE user_id = $3 AND payment_intent_id = $4`,
              [invoice_id, `https://plisio.net/invoice/${invoice_id}`, candidate.rows[0].user_id, candidateId]
            );

            effectiveInvoiceId = invoice_id;
            break;
          }
        }

        // Fill missing webhook values from Plisio API response
        amount = amount || invoiceData?.amount || invoiceData?.invoice_total_sum || null;
        currency = currency || invoiceData?.currency || invoiceData?.psys_cid || null;
      } catch (error) {
        console.error(`Failed resolving switched invoice chain for ${invoice_id}:`, error.message || error);
      }
    }

    if (subResult.rows.length === 0) {
      console.error(`Subscription not found for invoice ${invoice_id}`);
      return;
    }

    const subscription = subResult.rows[0];
    const userId = subscription.user_id;
    const planInterval = subscription.plan_interval || subscription?.metadata?.plan_interval || 'month';

    // Mark promo code as used if applicable
    if (subscription.promo_code_id) {
      await promoService.markPromoCodeUsed(subscription.promo_code_id);
      console.log(`Promo code ${subscription.promo_code_id} marked as used`);
    }

    // Update subscription status to active
    const updateSubQuery = `
      UPDATE subscriptions 
      SET status = 'active', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    await db.query(updateSubQuery, [subscription.id]);

    // Record tax transaction (non-blocking — failure here does not affect payment)
    try {
      const meta = subscription.metadata || {};
      const baseCents  = parseInt(meta.plan_amount_cents, 10) || 0;
      const taxCents   = parseInt(meta.tax_amount_cents, 10) || 0;
      const totalCents = baseCents + taxCents;
      const postalCode = (meta.postal_code || '').trim();

      if (postalCode && baseCents > 0) {
        await db.query(
          `INSERT INTO tax_transactions (
             transaction_date, postal_code, country, state,
             base_charge_cents, tax_rate, tax_amount_cents, total_amount_cents,
             invoice_number, subscription_id, user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            new Date(),
            postalCode,
            (meta.country || 'USA').trim(),
            (meta.state || '').trim(),
            baseCents,
            parseFloat(meta.tax_rate || 0),
            taxCents,
            totalCents,
            effectiveInvoiceId || null,
            subscription.id,
            userId
          ]
        );
      }
    } catch (taxErr) {
      console.error('Failed to record tax_transaction (Plisio):', taxErr.message);
    }

    // Create VPN account via VPN Resellers
    const vpnAccount = await createVpnAccount(userId, subscription.account_number, planInterval);

    // Send welcome email with VPN credentials (if email exists)
    const userResult = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
    const userEmail = userResult.rows[0]?.email;

    if (userEmail) {
      const expiryDate = new Date(subscription.current_period_end).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      await emailService.sendAccountCreatedEmail(userEmail, vpnAccount.username, vpnAccount.password, expiryDate);
    }

    // Compute amount in cents for payment and commission
    const amountCents = Math.round(parseFloat(amount) * 100);

    // Process referral commission if referral code exists
    if (subscription.referral_code) {
      console.log(`Referral code found: ${subscription.referral_code}`);
      const commissionCents = await applyAffiliateCommissionIfEligible({
        affiliateCode: subscription.referral_code,
        accountNumber: subscription.account_number,
        plan: subscription.plan_id,
        amountCents: amountCents
      });
      if (commissionCents) {
        console.log(`💰 Commission $${(commissionCents / 100).toFixed(2)} credited for referral`);
      }
    }

    // Create payment record
    const paymentQuery = `
      INSERT INTO payments (user_id, subscription_id, amount_cents, currency, status, payment_method, payment_intent_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `;
    await db.query(paymentQuery, [
      userId,
      subscription.id,
      amountCents,
      currency,
      'succeeded',
      'plisio',
      tx_id || effectiveInvoiceId
    ]);

    console.log(`✅ Payment processed for user ${userId}, subscription ${subscription.id}`);
  } catch (error) {
    console.error('Async Plisio payment processing error:', error);
  }
}

module.exports = {
  processPlisioPaymentAsync
};
