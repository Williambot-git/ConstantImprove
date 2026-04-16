const vpnResellersService = new (require('../services/vpnResellersService'))();
const db = require('../config/database');

/**
 * MOCK_SERVERS — Static server list for development/testing.
 * Replace with a real server inventory API call when VPN provider
 * exposes one. Using static list allows frontend to build UI without
 * waiting for infrastructure.
 */
const MOCK_SERVERS = [
  {
    id: 'us-east-1',
    name: 'US East (New York)',
    protocol: 'wireguard',
    host: 'us-east.vpn.example.com',
    port: 51820,
    publicKey: 'EXAMPLE_US_EAST_PUBLIC_KEY',
    load: 45,
    country: 'US',
  },
  {
    id: 'us-west-1',
    name: 'US West (Los Angeles)',
    protocol: 'wireguard',
    host: 'us-west.vpn.example.com',
    port: 51820,
    publicKey: 'EXAMPLE_US_WEST_PUBLIC_KEY',
    load: 22,
    country: 'US',
  },
  {
    id: 'eu-central-1',
    name: 'EU Central (Frankfurt)',
    protocol: 'wireguard',
    host: 'eu.vpn.example.com',
    port: 51820,
    publicKey: 'EXAMPLE_EU_PUBLIC_KEY',
    load: 61,
    country: 'DE',
  },
];

/**
 * getServers — Return list of available VPN servers.
 * Currently returns static mock data. Replace with real
 * server inventory API when VPN provider exposes it.
 */
const getServers = async (req, res) => {
  res.json({ servers: MOCK_SERVERS });
};

/**
 * getWireGuardConfig — Generate WireGuard config for authenticated user.
 * 
 * Flow:
 * 1. Look up vpn_accounts table for this user (by req.user.id from auth middleware)
 * 2. Call vpnResellersService.getAccount(vpnresellers_uuid) to get live credentials
 * 3. Return WireGuard config text
 */
const getWireGuardConfig = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Look up the user's VPN account in our database
    const result = await db.query(
      'SELECT vpnresellers_uuid, vpnresellers_username FROM vpn_accounts WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No VPN account found. Please complete payment first.' });
    }

    const { vpnresellers_uuid: accountId } = result.rows[0];

    // Fetch live account details from VPN Resellers API
    const account = await vpnResellersService.getAccount(accountId);

    // Build WireGuard config using account credentials
    // The account response from VPN Resellers API contains server_ip, username, password
    const wgConfig = [
      '[Interface]',
      `PrivateKey = <YOUR_PRIVATE_KEY>`,
      `Address = 10.0.0.2/32`,
      'DNS = 1.1.1.1',
      '',
      '[Peer]',
      `PublicKey = ${account.server_public_key || 'SERVER_PUBLIC_KEY'}`,
      `Endpoint = ${account.server_ip || account.server_host}:51820`,
      'AllowedIPs = 0.0.0.0/0',
      'PersistentKeepalive = 25',
    ].join('\n');

    res.json({
      config: wgConfig,
      server: account.server_name || account.server_host,
      username: account.username,
      // Password intentionally omitted from API response for security;
      // user should retrieve it from their dashboard or email
    });
  } catch (err) {
    console.error('getWireGuardConfig error:', err);
    res.status(500).json({ error: 'Failed to generate WireGuard config' });
  }
};

/**
 * getOpenVPNConfig — Generate OpenVPN config for authenticated user.
 * Same pattern as WireGuard but .ovpn format.
 */
const getOpenVPNConfig = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await db.query(
      'SELECT vpnresellers_uuid, vpnresellers_username FROM vpn_accounts WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No VPN account found. Please complete payment first.' });
    }

    const { vpnresellers_uuid: accountId } = result.rows[0];
    const account = await vpnResellersService.getAccount(accountId);

    // Build OpenVPN config
    const ovpnConfig = [
      'client',
      'dev tun',
      'proto udp',
      `remote ${account.server_ip || account.server_host} 1194`,
      'resolv-retry infinite',
      'nobind',
      'persist-key',
      'persist-tun',
      'remote-cert-tls server',
      'cipher AES-256-GCM',
      'auth SHA256',
      'verb 3',
      '',
      '<ca>',
      '-----BEGIN CERTIFICATE-----',
      '...CA_CERT...',
      '-----END CERTIFICATE-----',
      '</ca>',
      '',
      '<cert>',
      '-----BEGIN CERTIFICATE-----',
      '...CLIENT_CERT...',
      '-----END CERTIFICATE-----',
      '</cert>',
      '',
      '<key>',
      '-----BEGIN PRIVATE KEY-----',
      '...CLIENT_KEY...',
      '-----END PRIVATE KEY-----',
      '</key>',
    ].join('\n');

    res.json({
      config: ovpnConfig,
      server: account.server_name || account.server_host,
    });
  } catch (err) {
    console.error('getOpenVPNConfig error:', err);
    res.status(500).json({ error: 'Failed to generate OpenVPN config' });
  }
};

/**
 * connect — Client VPN connection tracking.
 * 
 * Currently a stub. Real implementation requires a VPN daemon running
 * on the server to track active connections. This endpoint exists as a
 * placeholder for when daemon integration is added.
 * 
 * TODO: Integrate with WireGuard/OpenVPN daemon for connection state tracking.
 */
const connect = async (req, res) => {
  res.status(501).json({
    error: 'VPN connect/disconnect requires daemon integration — not yet implemented',
    note: 'Track your connection in the desktop VPN client instead',
  });
};

/**
 * disconnect — Stub for VPN connection termination.
 * @see connect
 */
const disconnect = async (req, res) => {
  res.status(501).json({
    error: 'VPN connect/disconnect requires daemon integration — not yet implemented',
    note: 'Track your connection in the desktop VPN client instead',
  });
};

/**
 * getConnections — Stub for listing active VPN connections.
 * @see connect
 */
const getConnections = async (req, res) => {
  res.status(501).json({
    error: 'VPN connection tracking requires daemon integration — not yet implemented',
    note: 'Connection state is managed by the desktop VPN client',
  });
};

module.exports = {
  getServers,
  getWireGuardConfig,
  getOpenVPNConfig,
  connect,
  disconnect,
  getConnections,
};
