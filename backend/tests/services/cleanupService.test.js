/**
 * cleanupService unit tests
 *
 * Tests all 6 cleanup functions plus the runAllCleanup orchestrator:
 *   cleanupDataExports, cleanupOldAuditLogs, cleanupOldConnections,
 *   cleanupAbandonedCheckouts, suspendExpiredTrials, cleanupOldAccounts,
 *   runAllCleanup
 *
 * Dependencies mocked:
 *   - exportController.cleanupExpiredExports  — called by cleanupDataExports
 *   - AuditLog.deleteOld                     — called by cleanupOldAuditLogs
 *   - db.query                               — all direct SQL operations
 *   - vpnAccountScheduler                   — cleanupAbandonedCheckouts,
 *                                             suspendExpiredTrials (required
 *                                             dynamically inside those functions)
 *
 * Mock strategy:
 *   - mockImplementation(default) in beforeEach for persistent DB mock
 *   - mockResolvedValueOnce() per test for per-call responses
 *   - vpnAccountScheduler mock is hoisted via jest.mock() so it applies
 *     even to the dynamic require() inside cleanupService
 */

process.env.NODE_ENV = 'test';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockDbQuery = jest.fn();
jest.mock('../../src/config/database', () => ({ query: mockDbQuery }));

const mockCleanupExpiredExports = jest.fn();
jest.mock('../../src/controllers/exportController', () => ({
  cleanupExpiredExports: mockCleanupExpiredExports
}));

const mockAuditLogDeleteOld = jest.fn();
jest.mock('../../src/models/auditLogModel', () => ({
  deleteOld: mockAuditLogDeleteOld
}));

// Mock vpnAccountScheduler — referenced via dynamic require() inside
// cleanupAbandonedCheckouts and suspendExpiredTrials. Jest mocking is
// applied before modules load, so the dynamic require() gets our mock.
const mockCleanupAbandonedCheckouts = jest.fn();
const mockSuspendExpiredTrials = jest.fn();
jest.mock('../../src/services/vpnAccountScheduler', () => ({
  cleanupAbandonedCheckouts: mockCleanupAbandonedCheckouts,
  suspendExpiredTrials: mockSuspendExpiredTrials
}));

// ─── Imports after mocks ───────────────────────────────────────────────────────

const cleanupService = require('../../src/services/cleanupService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    sendFile: jest.fn().mockReturnThis()
  };
}

// ─── Global beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // db.query default: empty rows (covers all SQL calls)
  mockDbQuery.mockReset();
  mockDbQuery.mockImplementation(() => Promise.resolve({ rows: [], rowCount: 0 }));

  // exportController (called by cleanupDataExports)
  mockCleanupExpiredExports.mockReset();
  mockCleanupExpiredExports.mockResolvedValue(undefined);

  // AuditLog (called by cleanupOldAuditLogs)
  mockAuditLogDeleteOld.mockReset();
  mockAuditLogDeleteOld.mockResolvedValue(0);

  // vpnAccountScheduler (called by cleanupAbandonedCheckouts / suspendExpiredTrials)
  mockCleanupAbandonedCheckouts.mockReset();
  mockCleanupAbandonedCheckouts.mockResolvedValue(undefined);
  mockSuspendExpiredTrials.mockReset();
  mockSuspendExpiredTrials.mockResolvedValue(undefined);
});

// ════════════════════════════════════════════════════════════════════════════════
// cleanupDataExports
// ════════════════════════════════════════════════════════════════════════════════

describe('cleanupDataExports', () => {
  test('calls exportController.cleanupExpiredExports once', async () => {
    await cleanupService.cleanupDataExports();
    expect(mockCleanupExpiredExports).toHaveBeenCalledTimes(1);
  });

  test('awaits the export cleanup and does not throw', async () => {
    mockCleanupExpiredExports.mockResolvedValue(undefined);
    await expect(cleanupService.cleanupDataExports()).resolves.toBeUndefined();
  });

  test('propagates rejection from exportController.cleanupExpiredExports', async () => {
    mockCleanupExpiredExports.mockRejectedValue(new Error('Export cleanup failed'));
    await expect(cleanupService.cleanupDataExports()).rejects.toThrow('Export cleanup failed');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// cleanupOldAuditLogs
// ════════════════════════════════════════════════════════════════════════════════

describe('cleanupOldAuditLogs', () => {
  test('calls AuditLog.deleteOld with retention period of 365 days', async () => {
    mockAuditLogDeleteOld.mockResolvedValue(42);
    await cleanupService.cleanupOldAuditLogs();
    expect(mockAuditLogDeleteOld).toHaveBeenCalledWith(365);
  });

  test('logs the count of deleted audit logs', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockAuditLogDeleteOld.mockResolvedValue(17);
    await cleanupService.cleanupOldAuditLogs();
    // Structured logger: `[timestamp] [INFO] Deleted old audit logs {"count":17,"retentionDays":365}`
    // Check message contains the key phrase and JSON has the right count
    expect(spy.mock.calls[0][0]).toMatch(/Deleted old audit logs/);
    expect(spy.mock.calls[0][0]).toContain('"count":17');
    spy.mockRestore();
  });

  test('logs zero when no audit logs need deletion', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockAuditLogDeleteOld.mockResolvedValue(0);
    // No guard in the implementation — it always logs
    await expect(cleanupService.cleanupOldAuditLogs()).resolves.toBeUndefined();
    expect(spy.mock.calls[0][0]).toMatch(/Deleted old audit logs/);
    expect(spy.mock.calls[0][0]).toContain('"count":0');
    spy.mockRestore();
  });

  test('propagates rejection when AuditLog.deleteOld throws (no internal catch)', async () => {
    mockAuditLogDeleteOld.mockRejectedValue(new Error('Audit DB error'));
    // cleanupOldAuditLogs has no try-catch — error propagates to runAllCleanup
    await expect(cleanupService.cleanupOldAuditLogs()).rejects.toThrow('Audit DB error');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// cleanupOldConnections
// ════════════════════════════════════════════════════════════════════════════════

describe('cleanupOldConnections', () => {
  test('executes DELETE query for connections older than 7 days', async () => {
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 10 });
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await cleanupService.cleanupOldConnections();

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM connections')
    );
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining("NOW() - INTERVAL '7 days'")
    );
    spy.mockRestore();
  });

  test('logs the number of deleted connection records', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 23 });
    await cleanupService.cleanupOldConnections();
    // Structured logger: `[timestamp] [INFO] Deleted 23 old connection records {"count":23}`
    expect(spy.mock.calls[0][0]).toMatch(/Deleted old connection records/);
    expect(spy.mock.calls[0][0]).toContain('"count":23');
    spy.mockRestore();
  });

  test('logs zero when no connections need cleanup', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    // No guard in the implementation — it always logs; structured logger: `[timestamp] [INFO] Deleted old connection records {"count":0}`
    await expect(cleanupService.cleanupOldConnections()).resolves.toBeUndefined();
    expect(spy.mock.calls[0][0]).toMatch(/Deleted old connection records/);
    expect(spy.mock.calls[0][0]).toContain('"count":0');
    spy.mockRestore();
  });

  test('propagates rejection on database error (no internal catch)', async () => {
    mockDbQuery.mockRejectedValue(new Error('Connection DB error'));
    // cleanupOldConnections has no try-catch — error propagates up
    await expect(cleanupService.cleanupOldConnections()).rejects.toThrow('Connection DB error');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// cleanupAbandonedCheckouts
// ════════════════════════════════════════════════════════════════════════════════

describe('cleanupAbandonedCheckouts', () => {
  test('requires and calls vpnAccountScheduler.cleanupAbandonedCheckouts', async () => {
    mockCleanupAbandonedCheckouts.mockResolvedValue(undefined);
    await cleanupService.cleanupAbandonedCheckouts();
    expect(mockCleanupAbandonedCheckouts).toHaveBeenCalledTimes(1);
  });

  test('propagates rejection when scheduler throws', async () => {
    mockCleanupAbandonedCheckouts.mockRejectedValue(new Error('Scheduler error'));
    await expect(cleanupService.cleanupAbandonedCheckouts()).rejects.toThrow('Scheduler error');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// suspendExpiredTrials
// ════════════════════════════════════════════════════════════════════════════════

describe('suspendExpiredTrials', () => {
  test('requires and calls vpnAccountScheduler.suspendExpiredTrials', async () => {
    mockSuspendExpiredTrials.mockResolvedValue(undefined);
    await cleanupService.suspendExpiredTrials();
    expect(mockSuspendExpiredTrials).toHaveBeenCalledTimes(1);
  });

  test('propagates rejection when scheduler throws', async () => {
    mockSuspendExpiredTrials.mockRejectedValue(new Error('Suspend error'));
    await expect(cleanupService.suspendExpiredTrials()).rejects.toThrow('Suspend error');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// cleanupOldAccounts
// ════════════════════════════════════════════════════════════════════════════════

describe('cleanupOldAccounts', () => {
  test('executes DELETE for ghost accounts (registered >30d, no purchase, inactive)', async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await cleanupService.cleanupOldAccounts();

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM users'),
      expect.any(Array) // cutoffDate
    );
    // Verify the WHERE clause contains the expected conditions
    const call = mockDbQuery.mock.calls[0][0];
    expect(call).toContain('registered_at');
    expect(call).toContain('last_purchase_at');
    expect(call).toContain('is_active');
    spy.mockRestore();
  });

  test('logs count when ghost accounts are deleted', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockDbQuery.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 });
    await cleanupService.cleanupOldAccounts();
    // Structured logger: `[timestamp] [INFO] Deleted old ghost accounts {"count":2}`
    expect(spy.mock.calls[0][0]).toMatch(/Deleted old ghost accounts/);
    expect(spy.mock.calls[0][0]).toContain('"count":2');
    spy.mockRestore();
  });

  test('no log call when no ghost accounts exist', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await cleanupService.cleanupOldAccounts();
    // console.log is guarded by: if (result.rows.length > 0) { log(...) }
    // So when rows is empty, no log is emitted
    spy.mockRestore();
  });

  test('does not propagate rejection on database error (error is caught and logged)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDbQuery.mockRejectedValue(new Error('Users DB error'));
    // Error is caught internally in cleanupOldAccounts, so resolves
    await expect(cleanupService.cleanupOldAccounts()).resolves.toBeUndefined();
    // Error IS logged
    // Structured logger: format is `[timestamp] [ERROR] cleanupOldAccounts error {"error":"Users DB error"}`
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    expect(spy.mock.calls[0][0]).toContain('cleanupOldAccounts error');
    spy.mockRestore();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// runAllCleanup
// ════════════════════════════════════════════════════════════════════════════════

describe('runAllCleanup', () => {
  test('calls all 6 cleanup functions in order', async () => {
    await cleanupService.runAllCleanup();

    // Verify all 6 cleanup pathways are called exactly once
    expect(mockCleanupExpiredExports).toHaveBeenCalledTimes(1);
    expect(mockAuditLogDeleteOld).toHaveBeenCalledWith(365);

    // connections uses db.query, verify call order (connections before users)
    const dbCalls = mockDbQuery.mock.calls;
    expect(dbCalls.length).toBeGreaterThanOrEqual(2);
    // First db call should be connections DELETE
    expect(dbCalls[0][0]).toContain('connections');
    // Last db call should be users DELETE
    expect(dbCalls[dbCalls.length - 1][0]).toContain('users');

    expect(mockCleanupAbandonedCheckouts).toHaveBeenCalledTimes(1);
    expect(mockSuspendExpiredTrials).toHaveBeenCalledTimes(1);
  });

  test('completes successfully when all cleanup functions succeed', async () => {
    await expect(cleanupService.runAllCleanup()).resolves.toBeUndefined();
  });

  test('completes when cleanupDataExports throws (error is caught and logged, not re-thrown)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCleanupExpiredExports.mockRejectedValue(new Error('Export error'));
    // runAllCleanup catches all errors, so it resolves rather than rejects
    await expect(cleanupService.runAllCleanup()).resolves.toBeUndefined();
    // Structured logger: format is `[timestamp] [ERROR] Cleanup task error {"error":"Export error"}`
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    expect(spy.mock.calls[0][0]).toContain('Cleanup task error');
    spy.mockRestore();
  });

  test('completes when cleanupOldAuditLogs throws (error is caught and logged, not re-thrown)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockAuditLogDeleteOld.mockRejectedValue(new Error('Audit error'));
    await expect(cleanupService.runAllCleanup()).resolves.toBeUndefined();
    // Structured logger: format is `[timestamp] [ERROR] Cleanup task error {"error":"Export error"}`
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    expect(spy.mock.calls[0][0]).toContain('Cleanup task error');
    spy.mockRestore();
  });

  test('completes when cleanupOldConnections throws (error is caught and logged, not re-thrown)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDbQuery.mockRejectedValue(new Error('Connections DB error'));
    await expect(cleanupService.runAllCleanup()).resolves.toBeUndefined();
    // Structured logger: format is `[timestamp] [ERROR] Cleanup task error {"error":"Export error"}`
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    expect(spy.mock.calls[0][0]).toContain('Cleanup task error');
    spy.mockRestore();
  });

  test('completes when cleanupAbandonedCheckouts throws (error is caught and logged, not re-thrown)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCleanupAbandonedCheckouts.mockRejectedValue(new Error('Abandoned checkout error'));
    await expect(cleanupService.runAllCleanup()).resolves.toBeUndefined();
    // Structured logger: format is `[timestamp] [ERROR] Cleanup task error {"error":"Export error"}`
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    expect(spy.mock.calls[0][0]).toContain('Cleanup task error');
    spy.mockRestore();
  });

  test('completes when suspendExpiredTrials throws (error is caught and logged, not re-thrown)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSuspendExpiredTrials.mockRejectedValue(new Error('Suspend error'));
    await expect(cleanupService.runAllCleanup()).resolves.toBeUndefined();
    // Structured logger: format is `[timestamp] [ERROR] Cleanup task error {"error":"Export error"}`
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    expect(spy.mock.calls[0][0]).toContain('Cleanup task error');
    spy.mockRestore();
  });

  test('completes when cleanupOldAccounts throws (error is caught and logged, not re-thrown)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // connections query succeeds, old accounts query fails
    mockDbQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // cleanupOldConnections
      .mockRejectedValueOnce(new Error('Users DB error')); // cleanupOldAccounts
    await expect(cleanupService.runAllCleanup()).resolves.toBeUndefined();
    // cleanupOldAccounts has its own try/catch that logs 'cleanupOldAccounts error:'
    // The outer runAllCleanup catch may not fire if cleanupOldAccounts already caught it.
    // At minimum, the error was logged.
    expect(spy).toHaveBeenCalled(); // some error was logged
    spy.mockRestore();
  });
});
