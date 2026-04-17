/**
 * exportController unit tests
 *
 * Tests all 3 exported functions from exportController.js:
 *   createExport, downloadExport, cleanupExpiredExports
 *
 * Dependencies mocked:
 *   - db.query                  — all database operations
 *   - exportService              — gatherUserData, redactSensitiveFields
 *   - AuditLog.create            — audit logging (fire-and-forget, errors suppressed)
 *   - fs.promises                — access, writeFile, unlink, mkdir
 *   - archiver                   — ZIP archive creation
 *
 * Mock strategy (same pattern as affiliateAuthController.test.js):
 *   - mockReset() + mockImplementation(() => default) in beforeEach
 *   - mockResolvedValueOnce() per test for specific query responses
 */

process.env.NODE_ENV = 'test';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockDbQuery = jest.fn();
jest.mock('../src/config/database', () => ({ query: mockDbQuery }));

jest.mock('../src/services/exportService', () => ({
  gatherUserData: jest.fn(),
  redactSensitiveFields: jest.fn()
}));

jest.mock('../src/models/auditLogModel', () => ({
  create: jest.fn()
}));

const mockFsAccess = jest.fn();
const mockFsWriteFile = jest.fn();
const mockFsUnlink = jest.fn();
const mockFsMkdir = jest.fn();
jest.mock('fs', () => ({
  promises: {
    access: mockFsAccess,
    writeFile: mockFsWriteFile,
    unlink: mockFsUnlink,
    mkdir: mockFsMkdir
  }
}));

const mockArchivePipe = jest.fn();
const mockArchiveFile = jest.fn();
const mockArchiveFinalize = jest.fn();
jest.mock('archiver', () => jest.fn(() => ({
  pipe: mockArchivePipe,
  file: mockArchiveFile,
  finalize: mockArchiveFinalize
})));

// ─── Imports after mocks ───────────────────────────────────────────────────────

const exportService = require('../src/services/exportService');
const AuditLog = require('../src/models/auditLogModel');

const {
  createExport,
  downloadExport,
  cleanupExpiredExports
} = require('../src/controllers/exportController');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    sendFile: jest.fn().mockReturnThis()
  };
}

function mockReq(overrides = {}) {
  return {
    user: null,        // req.user is set by auth middleware
    params: {},
    query: {},
    ip: '127.0.0.1',
    ...overrides
  };
}

// ─── Global beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // db.query default: empty rows
  mockDbQuery.mockReset();
  mockDbQuery.mockImplementation(() => Promise.resolve({ rows: [] }));

  // exportService
  exportService.gatherUserData.mockReset();
  exportService.gatherUserData.mockImplementation(() => Promise.resolve({}));
  exportService.redactSensitiveFields.mockReset();
  exportService.redactSensitiveFields.mockImplementation((data) => data);

  // AuditLog — must return a Promise so .catch() chaining works in the controller
  AuditLog.create.mockReset();
  AuditLog.create.mockImplementation(() => Promise.resolve());

  // fs.promises
  mockFsAccess.mockReset();
  mockFsAccess.mockImplementation(() => Promise.resolve());
  mockFsWriteFile.mockReset();
  mockFsWriteFile.mockImplementation(() => Promise.resolve());
  mockFsUnlink.mockReset();
  mockFsUnlink.mockImplementation(() => Promise.resolve());
  mockFsMkdir.mockReset();
  mockFsMkdir.mockImplementation(() => Promise.resolve());

  // archiver
  mockArchivePipe.mockReset();
  mockArchivePipe.mockImplementation(function() { return this; });
  mockArchiveFile.mockReset();
  mockArchiveFile.mockImplementation(function() { return this; });
  mockArchiveFinalize.mockReset();
  mockArchiveFinalize.mockImplementation(() => Promise.resolve());
});

// ════════════════════════════════════════════════════════════════════════════════
// createExport
// ════════════════════════════════════════════════════════════════════════════════

describe('createExport', () => {
  const USER_ID = 'user-uuid-123';

  test('401 — no userId (unauthenticated)', async () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    await createExport(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
  });

  test('429 — existing active export already exists', async () => {
    const existingExport = {
      token: 'existing-token',
      expires_at: new Date(Date.now() + 86400000),
      status: 'generated'
    };
    mockDbQuery.mockResolvedValueOnce({ rows: [existingExport] });

    const req = mockReq({ user: { id: USER_ID } });
    const res = mockRes();
    await createExport(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'You already have an active export request',
      token: 'existing-token'
    }));
  });

  test('202 — success generates file and returns token', async () => {
    // No recent export found
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT returning
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        token: 'new-export-token',
        expires_at: new Date(Date.now() + 86400000),
        created_at: new Date()
      }]
    });
    // UPDATE status to 'generated'
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    exportService.gatherUserData.mockResolvedValueOnce({ user: { email: 'test@test.com' } });
    exportService.redactSensitiveFields.mockImplementation((data) => ({ ...data, redacted: true }));

    const req = mockReq({ user: { id: USER_ID }, ip: '10.0.0.1' });
    const res = mockRes();
    await createExport(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Data export generated successfully',
      token: 'new-export-token',
      downloadUrl: '/api/user/export/new-export-token'
    }));

    // File written to disk
    expect(mockFsWriteFile).toHaveBeenCalled();
    // Audit log for request
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      action: 'data_export_requested'
    }));
    // Audit log for generation success
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      action: 'data_export_generated'
    }));
  });

  test('500 — gatherUserData throws, status set to failed and 500 returned', async () => {
    // No recent export
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        token: 'fail-token',
        expires_at: new Date(Date.now() + 86400000),
        created_at: new Date()
      }]
    });
    // UPDATE to failed
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    exportService.gatherUserData.mockRejectedValueOnce(new Error('Data gathering failed'));

    const req = mockReq({ user: { id: USER_ID } });
    const res = mockRes();
    await createExport(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate export' });

    // File unlinked after failure
    expect(mockFsUnlink).toHaveBeenCalled();
    // Failed audit logged
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'data_export_failed'
    }));
  });

  test('500 — fs.writeFile throws, status set to failed and 500 returned', async () => {
    // No recent export
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        token: 'write-fail-token',
        expires_at: new Date(Date.now() + 86400000),
        created_at: new Date()
      }]
    });
    // UPDATE to failed
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    exportService.gatherUserData.mockResolvedValueOnce({});
    exportService.redactSensitiveFields.mockImplementation((data) => data);
    mockFsWriteFile.mockRejectedValueOnce(new Error('Disk full'));

    const req = mockReq({ user: { id: USER_ID } });
    const res = mockRes();
    await createExport(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate export' });
  });

  test('500 — database error during recent export check', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB connection failed'));

    const req = mockReq({ user: { id: USER_ID } });
    const res = mockRes();
    await createExport(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// downloadExport
// ════════════════════════════════════════════════════════════════════════════════

describe('downloadExport', () => {
  const USER_ID = 'user-uuid-123';
  const TOKEN = 'valid-token-abc';

  test('404 — token not found in database', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ params: { token: TOKEN }, user: { id: USER_ID } });
    const res = mockRes();
    await downloadExport(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Export not found, expired, or already downloaded' });
  });

  test('404 — export is expired (expires_at in the past)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // query returns empty because expires_at > NOW()

    const req = mockReq({ params: { token: TOKEN }, user: { id: USER_ID } });
    const res = mockRes();
    await downloadExport(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('403 — userId does not match export owner', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        token: TOKEN,
        user_id: 'other-user-uuid',  // different user
        file_path: '/tmp/exports/token.txt',
        status: 'generated',
        expires_at: new Date(Date.now() + 86400000)
      }]
    });

    const req = mockReq({ params: { token: TOKEN }, user: { id: USER_ID } });
    const res = mockRes();
    await downloadExport(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
  });

  test('404 — file missing on disk (fs.access fails)', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        token: TOKEN,
        user_id: USER_ID,
        file_path: '/tmp/exports/token.txt',
        status: 'generated',
        expires_at: new Date(Date.now() + 86400000)
      }]
    });
    mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));

    const req = mockReq({ params: { token: TOKEN }, user: { id: USER_ID } });
    const res = mockRes();
    await downloadExport(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Export file missing' });
  });

  test('200 — JSON download (default format) serves file with correct headers', async () => {
    const mockFilePath = '/tmp/exports/token.txt';
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          token: TOKEN,
          user_id: USER_ID,
          file_path: mockFilePath,
          status: 'generated',
          expires_at: new Date(Date.now() + 86400000)
        }]
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE downloaded_at

    mockFsAccess.mockResolvedValueOnce(); // file exists

    const req = mockReq({ params: { token: TOKEN }, query: {}, user: { id: USER_ID } });
    const res = mockRes();
    await downloadExport(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', `attachment; filename="ahoyvpn-data-${TOKEN}.txt"`);
    expect(res.sendFile).toHaveBeenCalledWith(mockFilePath);

    // Audit logged
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      action: 'data_export_downloaded',
      metadata: expect.objectContaining({ token: TOKEN, format: 'json' })
    }));
  });

  test('200 — ZIP download when format=zip, archiver called with correct file', async () => {
    const mockFilePath = '/tmp/exports/token.txt';
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          token: TOKEN,
          user_id: USER_ID,
          file_path: mockFilePath,
          status: 'generated',
          expires_at: new Date(Date.now() + 86400000)
        }]
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE downloaded_at

    mockFsAccess.mockResolvedValueOnce(); // file exists

    const req = mockReq({ params: { token: TOKEN }, query: { format: 'zip' }, user: { id: USER_ID } });
    const res = mockRes();
    await downloadExport(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', `attachment; filename="ahoyvpn-data-${TOKEN}.zip"`);

    // archiver used for ZIP
    expect(mockArchivePipe).toHaveBeenCalledWith(res);
    expect(mockArchiveFile).toHaveBeenCalledWith(mockFilePath, { name: `ahoyvpn-data-${TOKEN}.txt` });
    expect(mockArchiveFinalize).toHaveBeenCalled();

    // Audit logged with format: zip
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      action: 'data_export_downloaded',
      metadata: expect.objectContaining({ token: TOKEN, format: 'zip' })
    }));
  });

  test('500 — database error during export lookup', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

    const req = mockReq({ params: { token: TOKEN }, user: { id: USER_ID } });
    const res = mockRes();
    await downloadExport(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  test('500 — database error when updating downloaded_at', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          token: TOKEN,
          user_id: USER_ID,
          file_path: '/tmp/exports/token.txt',
          status: 'generated',
          expires_at: new Date(Date.now() + 86400000)
        }]
      })
      .mockRejectedValueOnce(new Error('DB update failed'));

    mockFsAccess.mockResolvedValueOnce();

    const req = mockReq({ params: { token: TOKEN }, query: {}, user: { id: USER_ID } });
    const res = mockRes();
    await downloadExport(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// cleanupExpiredExports
// ════════════════════════════════════════════════════════════════════════════════

describe('cleanupExpiredExports', () => {
  test('deletes file via fs.unlink and updates status to expired for each record', async () => {
    const expiredExports = [
      { id: 1, token: 'expired-token-1', file_path: '/tmp/exports/expired1.txt' },
      { id: 2, token: 'expired-token-2', file_path: '/tmp/exports/expired2.txt' }
    ];
    mockDbQuery.mockResolvedValueOnce({ rows: expiredExports });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE first
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE second

    await cleanupExpiredExports();

    expect(mockFsUnlink).toHaveBeenCalledTimes(2);
    expect(mockFsUnlink).toHaveBeenCalledWith('/tmp/exports/expired1.txt');
    expect(mockFsUnlink).toHaveBeenCalledWith('/tmp/exports/expired2.txt');

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE data_exports SET status = 'expired'"),
      [1]
    );
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE data_exports SET status = 'expired'"),
      [2]
    );
  });

  test('handles missing files gracefully (fs.unlink throws)', async () => {
    const expiredExports = [
      { id: 1, token: 'missing-file', file_path: '/tmp/exports/already-deleted.txt' }
    ];
    mockDbQuery.mockResolvedValueOnce({ rows: expiredExports });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE
    mockFsUnlink.mockRejectedValueOnce(new Error('ENOENT')); // file already gone

    // Should not throw — error is caught internally
    await expect(cleanupExpiredExports()).resolves.toBeUndefined();

    // Status still updated even if unlink failed
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE data_exports SET status = 'expired'"),
      [1]
    );
  });

  test('does nothing when no expired exports exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await cleanupExpiredExports();

    expect(mockFsUnlink).not.toHaveBeenCalled();
  });

  test('handles database error gracefully (logs but does not throw)', async () => {
    mockDbQuery.mockRejectedValueOnce(new Error('DB error'));

    // Should not throw — error is caught internally
    await expect(cleanupExpiredExports()).resolves.toBeUndefined();
  });
});
