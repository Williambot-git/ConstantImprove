/**
 * OverviewTab — affiliate dashboard "Attribution & Payout Rules" and Recovery Kit.
 *
 * EXTRACTED FROM: affiliate-dashboard.jsx lines 174-215
 * WHY: The overview tab is a self-contained section of the affiliate dashboard
 * with its own recovery-kit state machine (step 0 = idle, 1 = confirming, 2 = showing codes).
 * Extracting it lets us test recovery-kit generation in isolation.
 */
import { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import api from '../../api/client';

// inputStyle shared with LinksTab/PayoutTab — imported from styles.js
import { inputStyle } from './styles';

export default function OverviewTab() {
  const [recoveryStep, setRecoveryStep] = useState(0);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const handleGenerateRecoveryKit = async (e) => {
    e.preventDefault();
    setRecoveryError('');
    if (!recoveryPassword) { setRecoveryError('Enter your password to generate a recovery kit.'); return; }
    setRecoveryLoading(true);
    try {
      const res = await api.affiliateRegenerateKit(recoveryPassword);
      setRecoveryCodes(res.data.recoveryCodes || []);
      setRecoveryStep(2);
    } catch (err) {
      setRecoveryError(err.response?.data?.error || 'Failed to generate recovery kit.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <>
      <Card title="Attribution & Payout Rules" style={{ marginBottom: '1.5rem' }}>
        <ul style={{ color: '#B0C4DE', lineHeight: 2, paddingLeft: '1.5rem' }}>
          <li><strong>30-day attribution:</strong> Signups within 30 days of referral click are credited to you</li>
          <li><strong>Lifetime commissions:</strong> Earn on every payment for the lifetime of each referred account</li>
          <li><strong>30-day hold:</strong> Commissions held for 30 days before becoming available for payout</li>
          <li><strong>Minimum payout:</strong> $10 — request payout and email Ahoyvpn@ahoyvpn.net to complete</li>
          <li><strong>Recovery kit:</strong> Generate your recovery kit below — keep it safe to avoid being locked out</li>
        </ul>
      </Card>
      <Card title="Recovery Kit">
        <p style={{ color: '#A0AEC0', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Your recovery kit contains one-time codes you can use to reset your password if you&apos;re locked out. Each code can only be used once.
        </p>
        {recoveryStep === 0 && (
          <form onSubmit={handleGenerateRecoveryKit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ color: '#A0AEC0', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>Confirm your password</label>
              <input type="password" placeholder="Your current password" value={recoveryPassword} onChange={e => setRecoveryPassword(e.target.value)} required style={inputStyle} />
            </div>
            <Button type="submit" disabled={recoveryLoading}>{recoveryLoading ? 'Generating...' : 'Generate Recovery Kit'}</Button>
          </form>
        )}
        {recoveryStep === 2 && recoveryCodes.length > 0 && (
          <div>
            <p style={{ color: '#FFD93D', fontWeight: 'bold', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              Save these codes now — they will not be shown again.
            </p>
            <div style={{ backgroundColor: '#1A1A1A', border: '1px solid #3A3A3A', borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
              {recoveryCodes.map((code, i) => (
                <p key={i} style={{ color: '#00CED1', fontFamily: 'monospace', fontSize: '1.1rem', margin: '0.25rem 0', fontWeight: 'bold' }}>{code}</p>
              ))}
            </div>
            <p style={{ color: '#A0AEC0', fontSize: '0.85rem' }}>Store these somewhere safe. If you lose your password, click &quot;Forgot Password?&quot; on the affiliate login page.</p>
            <Button variant="secondary" onClick={() => { setRecoveryStep(0); setRecoveryPassword(''); setRecoveryCodes([]); }} style={{ marginTop: '0.75rem' }}>Done</Button>
          </div>
        )}
        {recoveryError && <p style={{ color: '#FF6B6B', marginTop: '0.5rem' }}>{recoveryError}</p>}
      </Card>
    </>
  );
}
