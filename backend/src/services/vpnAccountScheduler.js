const db = require('../config/database');
const VpnResellersService = require('./vpnResellersService');
const log = require('../utils/logger');

const vpnResellersService = new VpnResellersService();

async function cleanupExpiredAccounts() {
  const result = await db.query(
    `SELECT id, vpn_uuid, user_id
     FROM vpn_accounts
     WHERE status = 'active' AND expiry_date <= NOW()`
  );

  for (const row of result.rows) {
    try {
      if (row.vpn_uuid) {
        await vpnResellersService.disableAccount(row.vpn_uuid);
      }
    } catch (err) {
      log.warn('Failed to deactivate VPN account', { vpnUuid: row.vpn_uuid, error: err.message });
    }

    try {
      await db.query(
        `UPDATE vpn_accounts
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
    } catch (err) {
      // Swallow UPDATE failures — the row may already be in the desired state
      // or the DB may have already processed it. Don't block other rows.
      log.warn('Failed to update vpn_accounts status', { vpnAccountId: row.id, error: err.message });
    }
  }
}

async function cleanupCanceledSubscriptions() {
  const result = await db.query(
    `SELECT va.id, va.vpn_uuid
     FROM vpn_accounts va
     JOIN subscriptions s ON s.user_id = va.user_id
     WHERE va.status IN ('active')
       AND s.cancel_at_period_end = true
       AND s.current_period_end <= NOW()`
  );

  for (const row of result.rows) {
    try {
      if (row.vpn_uuid) {
        await vpnResellersService.disableAccount(row.vpn_uuid);
      }
    } catch (err) {
      log.warn('Failed to deactivate VPN account (canceled subscription)', { vpnUuid: row.vpn_uuid, error: err.message });
    }

    try {
      await db.query(
        `UPDATE vpn_accounts
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
    } catch (err) {
      // Swallow UPDATE failures — don't let one bad row block others
      log.warn('Failed to update vpn_accounts status', { vpnAccountId: row.id, error: err.message });
    }
  }
}

// Suspend accounts after 30 days of trial without payment
async function suspendExpiredTrials() {
  const result = await db.query(
    `SELECT id, user_id, status, plisio_invoice_id
     FROM subscriptions
     WHERE status = 'trialing'
       AND created_at < NOW() - INTERVAL '30 days'
       AND plisio_invoice_id IS NOT NULL`
  );

  for (const row of result.rows) {
    try {
      // Update subscription to canceled
      await db.query(
        `UPDATE subscriptions
         SET status = 'canceled', updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );

      // Suspend VPN account if exists
      const vpnAccount = await db.query(
        `SELECT id, vpn_uuid FROM vpn_accounts WHERE user_id = $1 AND status = 'active'`,
        [row.user_id]
      );

      if (vpnAccount.rows.length > 0) {
        const va = vpnAccount.rows[0];
        if (va.vpn_uuid) {
          try {
            await vpnResellersService.disableAccount(va.vpn_uuid);
          } catch (err) {
            log.warn('Failed to deactivate VPN account (trial expiry)', { vpnUuid: va.vpn_uuid, error: err.message });
          }
        }
        await db.query(
          `UPDATE vpn_accounts SET status = 'suspended', updated_at = NOW() WHERE id = $1`,
          [va.id]
        );
      }

      // Mark user account inactive
      await db.query(
        `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [row.user_id]
      );

      log.info('Suspended expired trial subscription', { subscriptionId: row.id, userId: row.user_id });
    } catch (err) {
      log.error('Error suspending expired trial', { subscriptionId: row.id, error: err.message });
    }
  }
}

// Delete abandoned checkouts (trialing subscriptions older than 3 days with no payment)
async function cleanupAbandonedCheckouts() {
  const result = await db.query(
    `DELETE FROM subscriptions
     WHERE status = 'trialing'
       AND plisio_invoice_id IS NOT NULL
       AND created_at < NOW() - INTERVAL '3 days'
     RETURNING id, user_id, plisio_invoice_id`
  );

  if (result.rows.length > 0) {
    log.info('Deleted abandoned checkout subscriptions', { count: result.rows.length });

    // Also delete associated pending payments
    for (const sub of result.rows) {
      await db.query(
        `DELETE FROM payments
         WHERE subscription_id = $1 AND status = 'pending'`,
        [sub.id]
      );
    }
  }
}

module.exports = {
  cleanupExpiredAccounts,
  cleanupCanceledSubscriptions,
  suspendExpiredTrials,
  cleanupAbandonedCheckouts
};
