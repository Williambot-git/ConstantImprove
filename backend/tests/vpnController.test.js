/**
 * vpnController unit tests
 * 
 * Tests all 6 endpoints of vpnController:
 * - getServers - returns mock server list
 * - getWireGuardConfig - generates WireGuard config for authenticated user
 * - getOpenVPNConfig - generates OpenVPN config for authenticated user
 * - connect - stub returning 501
 * - disconnect - stub returning 501
 * - getConnections - stub returning 501
 */

// Create mock getAccount function upfront
const mockGetAccount = jest.fn();

// Mock database
jest.mock('../src/config/database', () => ({
  query: jest.fn()
}));

// Mock vpnResellersService with our pre-created mock
jest.mock('../src/services/vpnResellersService', () => {
  return jest.fn().mockImplementation(() => ({
    getAccount: mockGetAccount
  }));
});

const db = require('../src/config/database');
const vpnController = require('../src/controllers/vpnController');

describe('vpnController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getServers', () => {
    it('should return mock server list with 3 servers', async () => {
      mockReq = {};
      
      await vpnController.getServers(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        servers: expect.arrayContaining([
          expect.objectContaining({ id: 'us-east-1', country: 'US' }),
          expect.objectContaining({ id: 'us-west-1', country: 'US' }),
          expect.objectContaining({ id: 'eu-central-1', country: 'DE' })
        ])
      });
    });

    it('should return servers with correct structure', async () => {
      mockReq = {};
      
      await vpnController.getServers(mockReq, mockRes);
      
      const call = mockRes.json.mock.calls[0][0];
      expect(call.servers).toHaveLength(3);
      call.servers.forEach(server => {
        expect(server).toHaveProperty('id');
        expect(server).toHaveProperty('name');
        expect(server).toHaveProperty('protocol');
        expect(server).toHaveProperty('host');
        expect(server).toHaveProperty('port');
        expect(server).toHaveProperty('publicKey');
        expect(server).toHaveProperty('load');
        expect(server).toHaveProperty('country');
      });
    });
  });

  describe('getWireGuardConfig', () => {
    const mockUser = { id: 1, account_number: 'TEST123' };

    it('should return 401 if no user in request', async () => {
      mockReq = { user: null };
      
      await vpnController.getWireGuardConfig(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 404 if no VPN account found', async () => {
      mockReq = { user: mockUser };
      db.query.mockResolvedValueOnce({ rows: [] });
      
      await vpnController.getWireGuardConfig(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No VPN account found. Please complete payment first.' });
    });

    it('should return WireGuard config on success', async () => {
      mockReq = { user: mockUser };
      const mockDbResult = { rows: [{ vpnresellers_uuid: 'acc-123', vpnresellers_username: 'testuser' }] };
      const mockAccount = {
        server_ip: '1.2.3.4',
        server_host: 'us-east.vpn.example.com',
        server_public_key: 'SERVER_PUBLIC_KEY',
        server_name: 'US East',
        username: 'testuser'
      };
      
      db.query.mockResolvedValueOnce(mockDbResult);
      mockGetAccount.mockResolvedValueOnce(mockAccount);
      
      await vpnController.getWireGuardConfig(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        config: expect.stringContaining('[Interface]'),
        server: 'US East',
        username: 'testuser'
      });
    });

    it('should query database with correct user ID', async () => {
      mockReq = { user: mockUser };
      db.query.mockResolvedValueOnce({ rows: [{ vpnresellers_uuid: 'acc-123' }] });
      mockGetAccount.mockResolvedValueOnce({});
      
      await vpnController.getWireGuardConfig(mockReq, mockRes);
      
      expect(db.query).toHaveBeenCalledWith(
        'SELECT vpnresellers_uuid, vpnresellers_username FROM vpn_accounts WHERE user_id = $1',
        [1]
      );
    });

    it('should return 500 on service error', async () => {
      mockReq = { user: mockUser };
      db.query.mockResolvedValueOnce({ rows: [{ vpnresellers_uuid: 'acc-123' }] });
      mockGetAccount.mockRejectedValueOnce(new Error('API error'));
      
      await vpnController.getWireGuardConfig(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to generate WireGuard config' });
    });
  });

  describe('getOpenVPNConfig', () => {
    const mockUser = { id: 1, account_number: 'TEST123' };

    it('should return 401 if no user in request', async () => {
      mockReq = { user: null };
      
      await vpnController.getOpenVPNConfig(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 404 if no VPN account found', async () => {
      mockReq = { user: mockUser };
      db.query.mockResolvedValueOnce({ rows: [] });
      
      await vpnController.getOpenVPNConfig(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No VPN account found. Please complete payment first.' });
    });

    it('should return OpenVPN config on success', async () => {
      mockReq = { user: mockUser };
      const mockDbResult = { rows: [{ vpnresellers_uuid: 'acc-123', vpnresellers_username: 'testuser' }] };
      const mockAccount = {
        server_ip: '1.2.3.4',
        server_host: 'eu.vpn.example.com',
        server_name: 'EU Central',
        username: 'testuser'
      };
      
      db.query.mockResolvedValueOnce(mockDbResult);
      mockGetAccount.mockResolvedValueOnce(mockAccount);
      
      await vpnController.getOpenVPNConfig(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        config: expect.stringContaining('client'),
        server: 'EU Central'
      });
    });

    it('should return 500 on service error', async () => {
      mockReq = { user: mockUser };
      db.query.mockResolvedValueOnce({ rows: [{ vpnresellers_uuid: 'acc-123' }] });
      mockGetAccount.mockRejectedValueOnce(new Error('API error'));
      
      await vpnController.getOpenVPNConfig(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to generate OpenVPN config' });
    });
  });

  describe('connect', () => {
    it('should return 501 with not implemented error', async () => {
      mockReq = {};
      
      await vpnController.connect(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'VPN connect/disconnect requires daemon integration — not yet implemented',
        note: 'Track your connection in the desktop VPN client instead'
      });
    });
  });

  describe('disconnect', () => {
    it('should return 501 with not implemented error', async () => {
      mockReq = {};
      
      await vpnController.disconnect(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'VPN connect/disconnect requires daemon integration — not yet implemented',
        note: 'Track your connection in the desktop VPN client instead'
      });
    });
  });

  describe('getConnections', () => {
    it('should return 501 with not implemented error', async () => {
      mockReq = {};
      
      await vpnController.getConnections(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'VPN connection tracking requires daemon integration — not yet implemented',
        note: 'Connection state is managed by the desktop VPN client'
      });
    });
  });
});
