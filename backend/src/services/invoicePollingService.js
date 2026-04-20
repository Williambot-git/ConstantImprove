const db = require('../config/database');
const plisioService = require('./plisioService');
const VpnResellersService = require('./vpnResellersService');
const { processPlisioPaymentAsync } = require('./paymentProcessingService');
const log = require('../utils/logger');

const vpnResellersService = new VpnResellersService();

const CHECKPOINT_MINUTES = [15, 30, 45];

function getAttempts(metadata) {
  const attempts = Number(metadata?.poll_attempts || 0);
  return Number.isFinite(attempts) && attempts >= 0 ? attempts : 0;
}

function mergeMetadata(existing, patch) {
  return { ...(existing || {}), ...patch };
}

async function updateMetadata(subscriptionId, metadata) {
  await db.query(
    `UPDATE subscriptions
     SET metadata = $1::jsonb,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(metadata || {}), subscriptionId]
  );
}

async function runOnce() {
  const { rows } = await db.query(`
    SELECT id, user_id, status, plisio_invoice_id, metadata, created_at
    FROM subscriptions
    WHERE status = 'trialing'
      AND plisio_invoice_id IS NOT NULL
      AND created_at > NOW() - INTERVAL '3 days'
    ORDER BY created_at ASC
    LIMIT 100
  `);

  try {
    for (const sub of rows) {
      try {
        const metadata = sub.metadata || {};
        const attempts = getAttempts(metadata);
        if (attempts >= CHECKPOINT_MINUTES.length) {
          continue;
        }

        const ageMinutes = Math.floor((Date.now() - new Date(sub.created_at).getTime()) / 60000);
        const nextCheckpoint = CHECKPOINT_MINUTES[attempts];
        if (ageMinutes < nextCheckpoint) {
          continue;
        }

        const statusResp = await plisioService.getInvoiceStatus(sub.plisio_invoice_id);
        const invoice = statusResp?.invoice || statusResp || {};
        const invoiceStatus = String(invoice.status || '').toLowerCase();
        const activeInvoiceId = statusResp?.active_invoice_id || invoice?.paid_id || invoice?.switch_id || null;

        const baseMeta = mergeMetadata(metadata, {
          last_poll_at: new Date().toISOString(),
          poll_attempts: attempts + 1,
          last_polled_invoice_id: sub.plisio_invoice_id,
          last_polled_status: invoice.status || null
        });

        if (invoiceStatus === 'completed') {
          await processPlisioPaymentAsync(
            sub.plisio_invoice_id,
            (invoice.tx_id && invoice.tx_id[0]) || invoice.txid || null,
            invoice.amount || invoice.invoice_total_sum || null,
            invoice.currency || invoice.psys_cid || null
          );

          await updateMetadata(sub.id, mergeMetadata(baseMeta, {
            poll_result: 'completed',
            completed_at: new Date().toISOString()
          }));
          continue;
        }

        if (invoiceStatus.startsWith('cancelled duplicate') && activeInvoiceId) {
          await processPlisioPaymentAsync(
            activeInvoiceId,
            (invoice.tx_id && invoice.tx_id[0]) || invoice.txid || null,
            invoice.amount || invoice.invoice_total_sum || null,
            invoice.currency || invoice.psys_cid || null
          );

          await updateMetadata(sub.id, mergeMetadata(baseMeta, {
            poll_result: 'completed_via_active_invoice',
            switched_to_invoice_id: activeInvoiceId,
            completed_at: new Date().toISOString()
          }));
          continue;
        }

        if (attempts + 1 >= CHECKPOINT_MINUTES.length) {
          await updateMetadata(sub.id, mergeMetadata(baseMeta, {
            poll_result: 'timeout_no_payment',
            polling_stopped_at: new Date().toISOString()
          }));
        } else {
          await updateMetadata(sub.id, baseMeta);
        }
      } catch (error) {
        // Inner catch: one bad subscription doesn't stop the polling run.
        // Log and continue to next subscription.
        log.error('Invoice polling error for subscription', { subscriptionId: sub.id, error: error.message || error });
      }
    }
  } catch (error) {
    // Outer catch: catastrophic failure (DB error, logger crash, unhandled rejection).
    // Re-throw so the scheduler can retry the entire run.
    log.error('Invoice polling run failed catastrophically', { error: error.message || error });
    throw error;
  }
}

// AuthorizeNetService instance — hoisted to module level so tests can inject a mock.
// Accepts an optional injectable for testing; falls back to creating a real instance.
// This avoids an inner require() that would create a fresh mock on every call.
let _authorizeService = null;
function _getAuthorizeService() {
  if (!_authorizeService) {
    const { AuthorizeNetService } = require('./authorizeNetUtils');
    _authorizeService = new AuthorizeNetService();
  }
  return _authorizeService;
}

/**
 * Reset the cached AuthorizeNetService instance.
 * CRITICAL FOR TESTS: Call this in beforeEach to ensure each test gets a fresh
 * instance with the correct mock setup. Without this, the first test to call
 * _getAuthorizeService caches an instance that subsequent tests can't override.
 */
function _resetAuthorizeService() {
  _authorizeService = null;
}

/**
 * Poll Authorize.net ARB subscriptions for payment status.
 * @param {object} opts - Optional overrides for testing
 * @param {object} opts.authorizeService - Injectable AuthorizeNetService instance
 */
async function pollArbSubscriptions(opts = {}) {
  const authorizeService = opts.authorizeService || _getAuthorizeService();

  // Find ARB subscriptions that are active/trialing and poll their status
  const { rows: subs } = await db.query(`
    SELECT s.id, s.user_id, s.status, s.metadata, s.current_period_end,
           p.interval as plan_interval, p.amount_cents
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.status IN ('trialing', 'active')
      AND s.metadata->>'arb_subscription_id' IS NOT NULL
      AND s.updated_at < NOW() - INTERVAL '5 minutes'
    LIMIT 50
  `);

  try {
    for (const sub of subs) {
      try {
        const arbId = sub.metadata?.arb_subscription_id;
        if (!arbId) continue;

        const arbSub = await authorizeService.getArbSubscription(arbId);
        if (!arbSub) continue;

        const arbStatus = String(arbSub.status || '').toLowerCase();
        const paymentStatus = arbSub.paymentStatus || '';

        log.info('ARB poll', { subscriptionId: sub.id, arbId, status: arbStatus, payment: paymentStatus });

        // If ARB is suspended/canceled but subscription is still active → suspend VPN
        if (arbStatus === 'suspended' || arbStatus === 'canceled' || paymentStatus === 'suspended') {
          await db.query(
            `UPDATE subscriptions SET status = 'canceled', updated_at = NOW() WHERE id = $1`,
            [sub.id]
          );

          const vpnAccount = await db.query(
            `SELECT id, purewl_uuid FROM vpn_accounts WHERE user_id = $1 AND status = 'active'`,
            [sub.user_id]
          );

          if (vpnAccount.rows.length > 0) {
            const va = vpnAccount.rows[0];
            if (va.purewl_uuid) {
              try {
                await vpnResellersService.deactivateAccount({ account_id: va.purewl_uuid });
              } catch (err) {
                log.warn('Failed to deactivate VPN on ARB cancel', { purewlUuid: va.purewl_uuid, error: err.message });
              }
            }
            await db.query(
              `UPDATE vpn_accounts SET status = 'suspended', updated_at = NOW() WHERE id = $1`,
              [va.id]
            );
          }

          await db.query(
            `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`,
            [sub.user_id]
          );

          log.info('ARB subscription canceled', { arbId });
        }

        // If ARB is active and payment came through → activate subscription
        if ((arbStatus === 'active' || arbStatus === 'trial') && paymentStatus === 'settledSuccessfully') {
          await db.query(
            `UPDATE subscriptions SET status = 'active', updated_at = NOW() WHERE id = $1`,
            [sub.id]
          );
          await db.query(
            `UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1`,
            [sub.user_id]
          );
          log.info('ARB payment confirmed, subscription activated', { arbId });
        }
      } catch (error) {
        // Inner catch: one bad subscription doesn't stop the polling run.
        log.error('ARB polling error for subscription', { subscriptionId: sub.id, error: error.message || error });
      }
    }
  } catch (error) {
    // Outer catch: catastrophic failure. Re-throw so scheduler can retry.
    log.error('ARB polling run failed catastrophically', { error: error.message || error });
    throw error;
  }
}

module.exports = {
  runOnce,
  pollArbSubscriptions,
  CHECKPOINT_MINUTES,
  _resetAuthorizeService
};
