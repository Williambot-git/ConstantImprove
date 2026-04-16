/**
 * PayoutTab — affiliate dashboard "Request Payout" tab.
 *
 * EXTRACTED FROM: affiliate-dashboard.jsx lines 319-342
 * WHY: The payout tab is a self-contained section with its own form state
 * (payoutAmount, payoutMsg, actionLoading). Extracting it enables isolated testing.
 *
 * PROPS:
 *   metrics — affiliate metrics object with availableToCashOut, pendingPayout, etc.
 *             Passed from parent so this tab can display the current balance.
 */
import { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { inputStyle } from './styles';

export default function PayoutTab({ metrics = {} }) {
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMsg, setPayoutMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const m = metrics || {};
  const available = m.availableToCashOut ?? 0;
  const canPayout = available >= 10;

  const handleRequestPayout = async (e) => {
    e.preventDefault();
    setPayoutMsg('');
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) { setPayoutMsg('Enter a valid amount.'); return; }
    setActionLoading(true);
    try {
      await require('../../api/client').requestAffiliatePayout(amount);
      setPayoutMsg(`$${amount.toFixed(2)} payout request submitted. Email Ahoyvpn@ahoyvpn.net to complete.`);
      setPayoutAmount('');
    } catch (err) {
      setPayoutMsg(err.response?.data?.error || 'Payout request failed.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Card title="Request Payout">
      <p style={{ color: '#A0AEC0', marginBottom: '1.5rem' }}>
        Available balance: <strong style={{ color: '#00CED1' }}>${available.toFixed(2)}</strong>
        {' '}— Minimum: <strong>$10.00</strong>
      </p>
      <form onSubmit={handleRequestPayout} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#A0AEC0' }}>$</span>
        <input
          type="number" step="0.01" min="10" max={available.toFixed(2)}
          placeholder="10.00"
          value={payoutAmount}
          onChange={e => setPayoutAmount(e.target.value)}
          required
          style={{ ...inputStyle, width: '120px' }}
        />
        <Button type="submit" disabled={actionLoading || !canPayout}>
          {actionLoading ? 'Submitting...' : 'Request Payout'}
        </Button>
      </form>
      {payoutMsg && (
        <p style={{ marginTop: '1rem', color: payoutMsg.includes('submitted') ? '#10B981' : '#FF6B6B' }}>
          {payoutMsg}
        </p>
      )}
      <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '1rem' }}>
        After requesting, email <strong>Ahoyvpn@ahoyvpn.net</strong> with your username and amount to complete the payout.
      </p>
    </Card>
  );
}
