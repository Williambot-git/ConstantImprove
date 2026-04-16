// VpnCredentialsSection component - displays VPN account credentials after payment.
// Extracted from dashboard.jsx to enable component decomposition.
import Link from 'next/link';
import Card from '../ui/Card';
import Button from '../ui/Button';
import styles from './styles';

function VpnCredentialsSection({ profile, subscription }) {
  return (
    <Card style={styles.card}>
      <h2>VPN Credentials</h2>
      {profile?.vpn_username ? (
        <div style={styles.vpnCredsBox}>
          <p><strong>Username:</strong> <code>{profile.vpn_username}</code></p>
          <p><strong>Password:</strong> <code>{profile.vpn_password}</code></p>
          <p><strong>Status:</strong> {profile?.vpn_status || 'active'}</p>
          {profile?.vpn_expiry_date && (
            <p><strong>Expires:</strong> {new Date(profile.vpn_expiry_date).toLocaleString()}</p>
          )}
          {subscription?.current_period_end && (
            <p><strong>Subscription Expires:</strong> {new Date(subscription.current_period_end).toLocaleDateString()}</p>
          )}
        </div>
      ) : (
        <p style={{ marginBottom: '1rem' }}>
          VPN credentials are not available yet. If you paid with crypto, activation can take up to 15 minutes.
        </p>
      )}

      <p style={{ marginTop: '0.75rem' }}>
        After payment, download a client from{' '}
        <Link href="/downloads" style={{ color: '#1E90FF' }}>https://ahoyvpn.net/downloads</Link>
        {' '}and sign in with these credentials.
      </p>

      <Link href="/downloads">
        <Button>Open Downloads</Button>
      </Link>
    </Card>
  );
}

module.exports = VpnCredentialsSection;
