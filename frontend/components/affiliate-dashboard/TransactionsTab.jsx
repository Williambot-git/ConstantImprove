/**
 * TransactionsTab — affiliate dashboard "Transaction Ledger" tab.
 *
 * MOVED FROM: affiliate-dashboard.jsx lines 416-463
 * WHY: Already defined as a sub-component function in the original file.
 * Moving it to its own module makes it independently testable.
 */
import { useState, useEffect } from 'react';
import { thStyle, tdStyle } from './styles';
import api from '../../api/client';

export default function TransactionsTab() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTransactions(); }, []);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.getAffiliateTransactions();
      setTransactions(res.data.data || []);
    } catch {} finally { setLoading(false); }
  };

  if (loading) return <p style={{ color: '#A0AEC0' }}>Loading...</p>;
  if (transactions.length === 0) return <p style={{ color: '#A0AEC0', textAlign: 'center' }}>No transactions yet.</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#2A2A2A', color: '#1E90FF' }}>
            {['Type','Amount','Description','Date','Paid Out'].map(h => <th key={h} style={thStyle}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {transactions.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid #3A3A3A' }}>
              <td style={tdStyle}>
                <span style={{ color: t.type === 'commission' ? '#10B981' : '#00CED1', fontWeight: 'bold', textTransform: 'capitalize' }}>
                  {t.type}
                </span>
              </td>
              <td style={tdStyle}>
                <span style={{ color: t.type === 'payout' ? '#FF6B6B' : '#10B981' }}>
                  {t.type === 'payout' ? '-' : '+'}${Math.abs(t.amount).toFixed(2)}
                </span>
              </td>
              <td style={tdStyle}>{t.description || '—'}</td>
              <td style={tdStyle}>{new Date(t.created_at).toLocaleDateString()}</td>
              <td style={tdStyle}>{t.paid_out_at ? new Date(t.paid_out_at).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
