const exportController = require('../controllers/exportController');
const AuditLog = require('../models/auditLogModel');
const db = require('../config/database');
const log = require('../utils/logger');

/**
 * Delete user accounts that registered > 30 days ago, never purchased,
 * and are still inactive. These are ghost accounts from abandoned signups.
 *
 * Runs as part of the daily cleanup routine via runAllCleanup().
 */
const cleanupOldAccounts = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const result = await db.query(
      `DELETE FROM users
       WHERE registered_at < $1
         AND (last_purchase_at IS NULL OR last_purchase_at < $1)
         AND is_active = false
       RETURNING id`,
      [cutoffDate]
    );

    if (result.rows.length > 0) {
      log.info('Deleted old ghost accounts', { count: result.rows.length });
    }
  } catch (error) {
    log.error('cleanupOldAccounts error', { error: error.message || error });
  }
};

/**
 * Run cleanup of expired data exports.
 */
const cleanupDataExports = async () => {
  log.debug('Starting cleanup of expired data exports...');
  await exportController.cleanupExpiredExports();
};

/**
 * Delete old audit logs (retention policy).
 */
const cleanupOldAuditLogs = async () => {
  const deletedCount = await AuditLog.deleteOld(365);
  log.info('Deleted old audit logs', { count: deletedCount, retentionDays: 365 });
};

/**
 * Delete old connections (VPN usage logs) — no-logs policy.
 */
const cleanupOldConnections = async () => {
  const result = await db.query(
    `DELETE FROM connections WHERE connected_at < NOW() - INTERVAL '7 days'`
  );
  log.info('Deleted old connection records', { count: result.rowCount });
};

/**
 * Delete abandoned checkout subscriptions (trialing > 3 days, no payment).
 */
const cleanupAbandonedCheckouts = async () => {
  const { cleanupAbandonedCheckouts } = require('./vpnAccountScheduler');
  log.debug('Starting abandoned checkout cleanup...');
  await cleanupAbandonedCheckouts();
};

/**
 * Suspend accounts that have been in trial for 30+ days without payment.
 */
const suspendExpiredTrials = async () => {
  const { suspendExpiredTrials } = require('./vpnAccountScheduler');
  log.debug('Starting expired trial suspension...');
  await suspendExpiredTrials();
};

/**
 * Main cleanup task that runs all cleanup routines.
 */
const runAllCleanup = async () => {
  try {
    await cleanupDataExports();
    await cleanupOldAuditLogs();
    await cleanupOldConnections();
    await cleanupAbandonedCheckouts();
    await suspendExpiredTrials();
    await cleanupOldAccounts();
    log.info('All cleanup tasks completed.');
  } catch (error) {
    log.error('Cleanup task error', { error: error.message || error });
  }
};

module.exports = {
  cleanupDataExports,
  cleanupOldAuditLogs,
  cleanupOldConnections,
  cleanupAbandonedCheckouts,
  suspendExpiredTrials,
  cleanupOldAccounts,
  runAllCleanup,
};
