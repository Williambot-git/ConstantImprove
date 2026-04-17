const exportController = require('../controllers/exportController');
const AuditLog = require('../models/auditLogModel');
const db = require('../config/database');

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
      console.log(`Deleted ${result.rows.length} old ghost accounts`);
    }
  } catch (error) {
    console.error('cleanupOldAccounts error:', error);
  }
};

/**
 * Run cleanup of expired data exports.
 */
const cleanupDataExports = async () => {
  console.log('Starting cleanup of expired data exports...');
  await exportController.cleanupExpiredExports();
};

/**
 * Delete old audit logs (retention policy).
 */
const cleanupOldAuditLogs = async () => {
  const deletedCount = await AuditLog.deleteOld(365);
  console.log(`Deleted ${deletedCount} old audit logs`);
};

/**
 * Delete old connections (VPN usage logs) — no-logs policy.
 */
const cleanupOldConnections = async () => {
  const result = await db.query(
    `DELETE FROM connections WHERE connected_at < NOW() - INTERVAL '7 days'`
  );
  console.log(`Deleted ${result.rowCount} old connection records`);
};

/**
 * Delete abandoned checkout subscriptions (trialing > 3 days, no payment).
 */
const cleanupAbandonedCheckouts = async () => {
  const { cleanupAbandonedCheckouts } = require('./vpnAccountScheduler');
  console.log('Starting abandoned checkout cleanup...');
  await cleanupAbandonedCheckouts();
};

/**
 * Suspend accounts that have been in trial for 30+ days without payment.
 */
const suspendExpiredTrials = async () => {
  const { suspendExpiredTrials } = require('./vpnAccountScheduler');
  console.log('Starting expired trial suspension...');
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
    console.log('All cleanup tasks completed.');
  } catch (error) {
    console.error('Cleanup task error:', error);
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
