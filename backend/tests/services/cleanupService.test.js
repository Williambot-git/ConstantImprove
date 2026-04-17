/**
 * cleanupService unit tests
 *
 * Tests the 7 cleanup service functions with mocked database and external dependencies.
 * These functions are critical for production maintenance (audit log retention,
 * no-logs policy, subscription lifecycle, abandoned checkout cleanup, ghost account removal).
 *
 * Pattern: Uses jest.mock() (synchronous hoisting) like promoService.test.js
 * instead of jest.unstable_mockModule() to avoid async module-loading issues.
 */

// Jest globals are automatically available in test files — no need to import them.
// We import only the modules under test and set up mocks before requiring the service.

// Mock database
jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
}));

// Mock exportController
jest.mock('../../src/controllers/exportController', () => ({
  cleanupExpiredExports: jest.fn(),
}));

// Mock AuditLog model
jest.mock('../../src/models/auditLogModel', () => ({
  deleteOld: jest.fn(),
}));

// Mock vpnAccountScheduler (cleanupService delegates to these)
jest.mock('../../src/services/vpnAccountScheduler', () => ({
  cleanupAbandonedCheckouts: jest.fn(),
  suspendExpiredTrials: jest.fn(),
}));

// ─── Now import modules (mocks are ready) ────────────────────────────────────
const cleanupService = require('../../src/services/cleanupService');
const exportController = require('../../src/controllers/exportController');
const AuditLog = require('../../src/models/auditLogModel');
const vpnAccountScheduler = require('../../src/services/vpnAccountScheduler');
const db = require('../../src/config/database');

describe('cleanupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────
  // cleanupDataExports
  // Calls exportController.cleanupExpiredExports() and logs result.
  // Simple delegation — verify it calls through and doesn't swallow errors.
  // ─────────────────────────────────────────────────────────────────
  describe('cleanupDataExports', () => {
    it('should call exportController.cleanupExpiredExports', async () => {
      exportController.cleanupExpiredExports.mockResolvedValueOnce(undefined);

      await cleanupService.cleanupDataExports();

      expect(exportController.cleanupExpiredExports).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from exportController', async () => {
      const err = new Error('Export cleanup failed');
      exportController.cleanupExpiredExports.mockRejectedValueOnce(err);

      await expect(cleanupService.cleanupDataExports()).rejects.toThrow('Export cleanup failed');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // cleanupOldAuditLogs
  // Deletes audit logs older than 365 days. Verifies AuditLog.deleteOld is called.
  // ─────────────────────────────────────────────────────────────────
  describe('cleanupOldAuditLogs', () => {
    it('should call AuditLog.deleteOld with retention days', async () => {
      AuditLog.deleteOld.mockResolvedValueOnce(42);

      await cleanupService.cleanupOldAuditLogs();

      expect(AuditLog.deleteOld).toHaveBeenCalledWith(365);
    });

    it('should propagate errors from AuditLog.deleteOld', async () => {
      const err = new Error('AuditLog DB error');
      AuditLog.deleteOld.mockRejectedValueOnce(err);

      await expect(cleanupService.cleanupOldAuditLogs()).rejects.toThrow('AuditLog DB error');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // cleanupOldConnections
  // Implements no-logs policy: deletes VPN connection records older than 7 days.
  // This is important for GDPR/data privacy compliance.
  // ─────────────────────────────────────────────────────────────────
  describe('cleanupOldConnections', () => {
    it('should delete connections older than 7 days', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 153 });

      await cleanupService.cleanupOldConnections();

      // Verify the DELETE query targets connections table with 7-day interval
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM connections')
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("NOW() - INTERVAL '7 days'")
      );
    });

    it('should handle zero deletions gracefully (no throw)', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 0 });

      await expect(cleanupService.cleanupOldConnections()).resolves.toBeUndefined();
    });

    it('should propagate database errors', async () => {
      db.query.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(cleanupService.cleanupOldConnections()).rejects.toThrow('DB connection lost');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // cleanupAbandonedCheckouts
  // Delegates to vpnAccountScheduler.cleanupAbandonedCheckouts().
  // Those subscriptions have been in trial > 3 days with no payment — clean them up.
  // ─────────────────────────────────────────────────────────────────
  describe('cleanupAbandonedCheckouts', () => {
    it('should delegate to vpnAccountScheduler.cleanupAbandonedCheckouts', async () => {
      vpnAccountScheduler.cleanupAbandonedCheckouts.mockResolvedValueOnce(undefined);

      await cleanupService.cleanupAbandonedCheckouts();

      expect(vpnAccountScheduler.cleanupAbandonedCheckouts).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // suspendExpiredTrials
  // Suspends accounts in trial > 30 days without payment.
  // Delegates to vpnAccountScheduler.suspendExpiredTrials().
  // ─────────────────────────────────────────────────────────────────
  describe('suspendExpiredTrials', () => {
    it('should delegate to vpnAccountScheduler.suspendExpiredTrials', async () => {
      vpnAccountScheduler.suspendExpiredTrials.mockResolvedValueOnce(undefined);

      await cleanupService.suspendExpiredTrials();

      expect(vpnAccountScheduler.suspendExpiredTrials).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // cleanupOldAccounts
  // Deletes user accounts that registered > 30 days ago, never purchased,
  // and are still inactive. These are ghost accounts from abandoned signups.
  // ─────────────────────────────────────────────────────────────────
  describe('cleanupOldAccounts', () => {
    it('should delete ghost accounts older than 30 days with no purchases', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 3 });

      await cleanupService.cleanupOldAccounts();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM users'),
        expect.any(Array)
      );
    });

    it('should handle zero deletions gracefully (no throw)', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 0 });

      await expect(cleanupService.cleanupOldAccounts()).resolves.toBeUndefined();
    });

    it('should log but not throw database errors (per-function try/catch)', async () => {
      // Matches cleanupOldConnections pattern: error is caught and logged, not propagated
      db.query.mockRejectedValueOnce(new Error('DB connection lost'));

      // Should NOT throw — error is caught internally
      await expect(cleanupService.cleanupOldAccounts()).resolves.toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // runAllCleanup
  // Orchestrates all 6 cleanup functions. Per-function try/catch means
  // a failure in one doesn't block the others from running.
  // ─────────────────────────────────────────────────────────────────
  describe('runAllCleanup', () => {
    it('should call all 6 cleanup functions sequentially', async () => {
      exportController.cleanupExpiredExports.mockResolvedValueOnce(undefined);
      AuditLog.deleteOld.mockResolvedValueOnce(10);
      db.query
        .mockResolvedValueOnce({ rowCount: 5 })   // cleanupOldConnections
        .mockResolvedValueOnce({ rowCount: 3 });  // cleanupOldAccounts
      vpnAccountScheduler.cleanupAbandonedCheckouts.mockResolvedValueOnce(undefined);
      vpnAccountScheduler.suspendExpiredTrials.mockResolvedValueOnce(undefined);

      await cleanupService.runAllCleanup();

      expect(exportController.cleanupExpiredExports).toHaveBeenCalledTimes(1);
      expect(AuditLog.deleteOld).toHaveBeenCalledTimes(1);
      expect(db.query).toHaveBeenCalledTimes(2); // cleanupOldConnections + cleanupOldAccounts
      expect(vpnAccountScheduler.cleanupAbandonedCheckouts).toHaveBeenCalledTimes(1);
      expect(vpnAccountScheduler.suspendExpiredTrials).toHaveBeenCalledTimes(1);
    });

    it('should complete even if one cleanup function throws (per-function try/catch)', async () => {
      // cleanupDataExports throws but runAllCleanup catches it internally
      exportController.cleanupExpiredExports.mockRejectedValueOnce(new Error('export error'));
      AuditLog.deleteOld.mockResolvedValueOnce(5);
      db.query
        .mockResolvedValueOnce({ rowCount: 3 })   // cleanupOldConnections
        .mockResolvedValueOnce({ rowCount: 0 });  // cleanupOldAccounts
      vpnAccountScheduler.cleanupAbandonedCheckouts.mockResolvedValueOnce(undefined);
      vpnAccountScheduler.suspendExpiredTrials.mockResolvedValueOnce(undefined);

      // Should NOT throw — each cleanup has its own try/catch inside runAllCleanup
      await expect(cleanupService.runAllCleanup()).resolves.toBeUndefined();
    });
  });
});
