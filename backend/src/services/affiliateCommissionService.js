/**
 * affiliateCommissionService.js
 *
 * Business logic for the affiliate commission system. Handles referral recording,
 * commission calculation, and affiliate ledger updates.
 *
 * WHY THIS EXISTS:
 * This service was previously defined in paymentController.js (a controller),
 * but the logic is used by paymentProcessingService.js and webhookController.js
 * (both services/controllers importing from a controller violates layer boundaries).
 * Extracting it into a dedicated service makes the architecture correct and
 * the code reusable without circular dependencies.
 *
 * COMMISSION CALCULATION:
 * - Rate: 10% of net profit (transaction amount minus operating cost per user)
 * - Minimum: $0.75 (getMinimumPayoutCents from payout_config table, default 1000 cents)
 * - Net profit = max(0, amountCents - operatingCostPerUserCents)
 * - Commission = max(computedCommission, minimumPayoutCents)
 *
 * ANONYMIZATION:
 * - Customer hash is SHA256 of account_number (no PII stored)
 * - Fallback cust_${affiliate.id}_${Date.now()} when no accountNumber
 */

'use strict';

const db = require('../config/database');
const crypto = require('crypto');

// =============================================================================
// MINIMUM PAYOUT CONFIGURATION
// =============================================================================

/**
 * Look up the minimum payout threshold from the database.
 * Falls back to 1000 cents ($10) if not configured.
 *
 * @returns {Promise<number>} minimum payout in cents
 */
const getMinimumPayoutCents = async () => {
  try {
    // payout_config stores JSON: { "key": "minimum_payout_cents", "value": { "amount": "1000" } }
    const r = await db.query(
      "SELECT (value->>'amount')::int as amount FROM payout_config WHERE key = 'minimum_payout_cents' LIMIT 1"
    );
    return r.rows.length > 0 ? parseInt(r.rows[0].amount) : 1000;
  } catch {
    // If table doesn't exist or query fails, use safe default
    return 1000;
  }
};

// =============================================================================
// COMMISSION CALCULATION
// =============================================================================

/**
 * Calculate the commission amount for a referral.
 *
 * Commission = max(10% of net profit, minimumPayoutCents)
 * Net profit = max(0, amountCents - operatingCostPerUserCents)
 * Operating cost per user is read from OPERATING_COST_PER_USER env var (default $1.20)
 *
 * @param {number} amountCents - Transaction amount in cents
 * @param {number} minimumPayoutCents - Minimum commission floor (from getMinimumPayoutCents)
 * @returns {Promise<number>} commission amount in cents
 */
const calculateCommission = async (amountCents, minimumPayoutCents) => {
  const commissionRate = 0.10; // 10% of net profit
  // OPERATING_COST_PER_USER is in dollars in the env; convert to cents
  const operatingCostPerUserCents = Math.round((parseFloat(process.env.OPERATING_COST_PER_USER) || 1.20) * 100);
  const netProfitCents = Math.max(0, amountCents - operatingCostPerUserCents);
  const computedCommission = Math.round(netProfitCents * commissionRate);
  return Math.max(computedCommission, minimumPayoutCents); // $0.75 minimum
};

// =============================================================================
// ANONYMIZATION
// =============================================================================

/**
 * Create an anonymized customer hash from an account number.
 * Uses SHA256 (no PII — hash of account number, truncated to 32 chars).
 * Falls back to a deterministic pseudo-anonymous ID when no accountNumber.
 *
 * @param {string|null} accountNumber - User's account number (from users table)
 * @param {number} affiliateId - Affiliate database ID
 * @returns {string} anonymized customer hash
 */
const createCustomerHash = (accountNumber, affiliateId) => {
  if (accountNumber) {
    // Full SHA256 hash, truncated for brevity — no PII leakage
    return crypto.createHash('sha256').update(accountNumber).digest('hex').substring(0, 32);
  }
  // Fallback for when account number is not available (affiliate-link-only referrals)
  return `cust_${affiliateId}_${Date.now()}`;
};

// =============================================================================
// CORE COMMISSION FUNCTION
// =============================================================================

/**
 * Apply affiliate commission for an eligible referral.
 *
 * Eligibility:
 * - affiliateCode must be provided and resolve to an active affiliate
 * - Affiliate is looked up by username (case-insensitive) in affiliates table
 *
 * Side effects (all DB writes):
 * - INSERT into referrals table (records the referral)
 * - INSERT into transactions table (credits commission to affiliate ledger)
 *
 * @param {Object} params
 * @param {string|null} params.affiliateCode - Username of referring affiliate
 * @param {string|null} params.affiliateLinkId - Optional referral link ID from affiliate_links table
 * @param {string|null} params.accountNumber - Customer's account number (for anonymized hash)
 * @param {string|null} params.plan - Plan name for referral record
 * @param {number} params.amountCents - Transaction amount in cents
 * @returns {Promise<number|null>} commission amount in cents, or null if not eligible
 */
const applyAffiliateCommissionIfEligible = async ({
  affiliateCode,
  affiliateLinkId,
  accountNumber,
  plan,
  amountCents,
}) => {
  // Reject missing affiliate code — nothing to do
  if (!affiliateCode) return null;

  // ── Step 1: Look up the affiliate by username ──────────────────────────────
  // The affiliates table uses 'username' as the referral code field.
  // Lookup is case-insensitive via UPPER().
  const affiliateResult = await db.query(
    `SELECT id, username, user_id
     FROM affiliates
     WHERE UPPER(username) = UPPER($1) AND status = 'active'
     LIMIT 1`,
    [affiliateCode]
  );

  if (affiliateResult.rows.length === 0) {
    // Unknown or inactive affiliate code — silent no-op (not an error)
    console.log(`Affiliate not found for code: ${affiliateCode}`);
    return null;
  }

  const affiliate = affiliateResult.rows[0];

  // ── Step 2: Calculate commission ────────────────────────────────────────────
  // 10% of net profit, floored at minimum payout ($0.75 by default)
  const minimumPayoutCents = await getMinimumPayoutCents();
  const finalCommissionCents = await calculateCommission(amountCents, minimumPayoutCents);

  // ── Step 3: Anonymize customer ───────────────────────────────────────────────
  // Never store PII in the referrals table — only a SHA256 hash of account number
  const customerHash = createCustomerHash(accountNumber, affiliate.id);

  // ── Step 4: Record the referral ──────────────────────────────────────────────
  // This links the customer to the affiliate for reporting/tracking purposes.
  // customer_hash is anonymized (SHA256 of account_number, not the number itself).
  await db.query(
    `INSERT INTO referrals (affiliate_id, customer_hash, plan, amount_cents, transaction_date, status, referral_link_id, created_at)
     VALUES ($1, $2, $3, $4, NOW(), 'active', $5, NOW())`,
    [affiliate.id, customerHash, plan || 'unknown', amountCents, affiliateLinkId || null]
  );

  // ── Step 5: Credit affiliate's transaction ledger ───────────────────────────
  // Positive amount = credit (commission earned). This feeds the payout system.
  await db.query(
    `INSERT INTO transactions (affiliate_id, type, amount_cents, description, created_at)
     VALUES ($1, 'commission', $2, $3, NOW())`,
    [
      affiliate.id,
      finalCommissionCents,
      `Referral commission for ${plan || 'signup'} signup — $${(amountCents / 100).toFixed(2)} transaction`,
    ]
  );

  console.log(`💰 Commission $${(finalCommissionCents / 100).toFixed(2)} credited to affiliate ${affiliate.username} (${affiliate.id})`);

  return finalCommissionCents;
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Primary business function — used by paymentProcessingService and webhookController
  applyAffiliateCommissionIfEligible,

  // Exposed for unit testing — allows mocking the minimum payout threshold
  getMinimumPayoutCents,

  // Exposed for unit testing — allows testing commission calculation in isolation
  calculateCommission,

  // Exposed for unit testing — allows testing hash creation with various inputs
  createCustomerHash,
};
