/**
 * exportService unit tests
 *
 * Test GDPR data export service functions: sanitizeForUserExport, gatherUserData, redactSensitiveFields.
 * Uses Jest mocks for the database module.
 */

// Mock database before requiring the service
jest.mock('../src/config/database', () => ({
  query: jest.fn()
}));

const exportService = require('../src/services/exportService');
const { sanitizeForUserExport, gatherUserData, redactSensitiveFields } = exportService;
const db = require('../src/config/database');

describe('exportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // sanitizeForUserExport
  // ============================================================
  describe('sanitizeForUserExport', () => {
    it('should return string unchanged', () => {
      expect(sanitizeForUserExport('string')).toBe('string');
    });

    it('should return number unchanged', () => {
      expect(sanitizeForUserExport(123)).toBe(123);
    });

    it('should remove password_hash from object', () => {
      const input = { name: 'John', email: 'john@test.com', password_hash: 'secret' };
      const expected = { name: 'John', email: 'john@test.com' };
      expect(sanitizeForUserExport(input)).toEqual(expected);
    });

    it('should remove ip field (exact match)', () => {
      const input = { ip: '1.2.3.4' };
      expect(sanitizeForUserExport(input)).toEqual({});
    });

    it('should remove token-like fields (token, access_token)', () => {
      const input = { token: 'abc', access_token: 'xyz' };
      expect(sanitizeForUserExport(input)).toEqual({});
    });

    it('should filter array items, removing password fields', () => {
      const input = [
        { name: 'John', password: 'secret' },
        { name: 'Jane', hash: 'xxx' }
      ];
      const expected = [{ name: 'John' }, { name: 'Jane' }];
      expect(sanitizeForUserExport(input)).toEqual(expected);
    });

    it('should sanitize nested objects', () => {
      const input = { nested: { password: 'secret', name: 'John' } };
      const expected = { nested: { name: 'John' } };
      expect(sanitizeForUserExport(input)).toEqual(expected);
    });

    it('should return null unchanged', () => {
      expect(sanitizeForUserExport(null)).toBeNull();
    });

    it('should return undefined unchanged', () => {
      expect(sanitizeForUserExport(undefined)).toBeUndefined();
    });
  });

  // ============================================================
  // gatherUserData
  // ============================================================
  describe('gatherUserData', () => {
    it('should throw "Invalid user ID" when userId is null', async () => {
      await expect(gatherUserData(null)).rejects.toThrow('Invalid user ID');
    });

    it('should throw "Invalid user ID" when userId is a number', async () => {
      await expect(gatherUserData(123)).rejects.toThrow('Invalid user ID');
    });

    it('should return full user data structure with all keys', async () => {
      // Mock all db.query calls
      db.query
        .mockResolvedValueOnce({ rows: [{ account_number: 'A001', email: 'test@test.com' }] }) // user
        .mockResolvedValueOnce({ rows: [{ id: 'sub-1', plan_id: 'plan-1' }] }) // subscriptions
        .mockResolvedValueOnce({ rows: [{ id: 'pay-1', amount_cents: 599 }] }) // payments
        .mockResolvedValueOnce({ rows: [{ username: 'vpnuser' }] }) // vpnAccount
        .mockResolvedValueOnce({ rows: [] }) // devices
        .mockResolvedValueOnce({ rows: [] }) // connections
        .mockResolvedValueOnce({ rows: [{ id: 'aff-1' }] }) // affiliate
        .mockResolvedValueOnce({ rows: [{ id: 'ref-1' }] }) // referralsAsAffiliate
        .mockResolvedValueOnce({ rows: [] }) // referralAsReferred
        .mockResolvedValueOnce({ rows: [] }) // supportTickets
        .mockResolvedValueOnce({ rows: [{ action: 'login', created_at: '2026-01-01' }] }); // auditLogs

      const result = await gatherUserData('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('subscriptions');
      expect(result).toHaveProperty('payments');
      expect(result).toHaveProperty('vpnAccount');
      expect(result).toHaveProperty('devices');
      expect(result).toHaveProperty('connections');
      expect(result).toHaveProperty('affiliate');
      expect(result).toHaveProperty('referralsAsAffiliate');
      expect(result).toHaveProperty('referralAsReferred');
      expect(result).toHaveProperty('supportTickets');
      expect(result).toHaveProperty('auditLogs');
      expect(result).toHaveProperty('exportDate');
      expect(result).toHaveProperty('exportVersion', '1.0');

      expect(result.user).toEqual({ account_number: 'A001', email: 'test@test.com' });
      expect(result.subscriptions).toEqual([{ id: 'sub-1', plan_id: 'plan-1' }]);
      expect(result.payments).toEqual([{ id: 'pay-1', amount_cents: 599 }]);
      expect(result.vpnAccount).toEqual([{ username: 'vpnuser' }]);
      expect(result.devices).toEqual([]);
      expect(result.connections).toEqual([]);
      expect(result.affiliate).toEqual([{ id: 'aff-1' }]);
      expect(result.referralsAsAffiliate).toEqual([{ id: 'ref-1' }]);
      expect(result.referralAsReferred).toEqual([]);
      expect(result.supportTickets).toEqual([]);
      expect(result.auditLogs).toEqual([{ action: 'login', created_at: '2026-01-01' }]);
    });

    it('should use exact query count (10 queries when no affiliate, 11 when affiliate exists)', async () => {
      // With no affiliate, referralsAsAffiliate query is skipped
      db.query
        .mockResolvedValueOnce({ rows: [{}] }) // user
        .mockResolvedValueOnce({ rows: [] }) // subscriptions
        .mockResolvedValueOnce({ rows: [] }) // payments
        .mockResolvedValueOnce({ rows: [] }) // vpnAccount
        .mockResolvedValueOnce({ rows: [] }) // devices
        .mockResolvedValueOnce({ rows: [] }) // connections
        .mockResolvedValueOnce({ rows: [] }) // affiliate (empty → skips referralsAsAffiliate)
        .mockResolvedValueOnce({ rows: [] }) // referralAsReferred
        .mockResolvedValueOnce({ rows: [] }) // supportTickets
        .mockResolvedValueOnce({ rows: [] }); // auditLogs

      await gatherUserData('550e8400-e29b-41d4-a716-446655440000');

      expect(db.query).toHaveBeenCalledTimes(10);
    });
  });

  // ============================================================
  // redactSensitiveFields
  // ============================================================
  describe('redactSensitiveFields', () => {
    it('should strip sensitive fields from realistic user data', () => {
      const input = {
        user: {
          account_number: 'A001',
          email: 'test@test.com',
          password_hash: 'should-be-removed',
          refresh_token: 'should-be-removed'
        },
        subscriptions: [{ id: 'sub-1', plan_id: 'plan-1' }],
        payments: [{ id: 'pay-1', amount_cents: 599 }],
        vpnAccount: [{ username: 'vpnuser' }],
        devices: [],
        connections: [],
        affiliate: [{ id: 'aff-1' }],
        referralsAsAffiliate: [{ id: 'ref-1' }],
        referralAsReferred: [],
        supportTickets: [],
        auditLogs: [{ action: 'login', created_at: '2026-01-01', metadata: { ip: '1.2.3.4' } }],
        exportDate: '2026-01-01T00:00:00.000Z',
        exportVersion: '1.0'
      };

      const result = redactSensitiveFields(input);

      expect(result.user).not.toHaveProperty('password_hash');
      expect(result.user).not.toHaveProperty('refresh_token');
      expect(result.user).toHaveProperty('account_number', 'A001');
      expect(result.user).toHaveProperty('email', 'test@test.com');
    });

    it('should reduce auditLogs to action, created_at, metadata only', () => {
      const input = {
        user: {},
        subscriptions: [],
        payments: [],
        vpnAccount: [],
        devices: [],
        connections: [],
        affiliate: [],
        referralsAsAffiliate: [],
        referralAsReferred: [],
        supportTickets: [],
        auditLogs: [
          {
            action: 'login',
            created_at: '2026-01-01',
            metadata: { ip: '1.2.3.4', user_agent: 'Mozilla' }
          }
        ],
        exportDate: '2026-01-01T00:00:00.000Z',
        exportVersion: '1.0'
      };

      const result = redactSensitiveFields(input);

      expect(result.auditLogs[0]).toHaveProperty('action', 'login');
      expect(result.auditLogs[0]).toHaveProperty('created_at', '2026-01-01');
      expect(result.auditLogs[0]).toHaveProperty('metadata');
      // Note: sanitizeForUserExport removes 'ip' from nested metadata since it matches /^ip$/i
      expect(result.auditLogs[0].metadata).toEqual({ user_agent: 'Mozilla' });
    });

    it('should bump exportVersion to 1.1', () => {
      const input = {
        user: {},
        subscriptions: [],
        payments: [],
        vpnAccount: [],
        devices: [],
        connections: [],
        affiliate: [],
        referralsAsAffiliate: [],
        referralAsReferred: [],
        supportTickets: [],
        auditLogs: [],
        exportDate: '2026-01-01T00:00:00.000Z',
        exportVersion: '1.0'
      };

      const result = redactSensitiveFields(input);

      expect(result.exportVersion).toBe('1.1');
    });

    it('should not mutate the original object', () => {
      const input = {
        user: { email: 'test@test.com', password_hash: 'secret' },
        subscriptions: [],
        payments: [],
        vpnAccount: [],
        devices: [],
        connections: [],
        affiliate: [],
        referralsAsAffiliate: [],
        referralAsReferred: [],
        supportTickets: [],
        auditLogs: [],
        exportDate: '2026-01-01T00:00:00.000Z',
        exportVersion: '1.0'
      };

      redactSensitiveFields(input);

      // Original should be unchanged
      expect(input.user).toHaveProperty('password_hash', 'secret');
      expect(input.exportVersion).toBe('1.0');
    });
  });
});
