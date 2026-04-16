/**
 * ReferralsTab — affiliate dashboard "Referral History" tab.
 *
 * MOVED FROM: affiliate-dashboard.jsx lines 356-414
 * WHY: Already defined as a sub-component function in the original file.
 * Moving it to its own module makes it independently testable.
 */
import { useState, useEffect } from 'react';
import { thStyle, tdStyle } from './styles';
import api from '../../api/client';

export default function ReferralsTab() {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  useEffect(() => { loadReferrals(1); }, []);

  const loadReferrals = async (p) => {
    setLoading(true);
    try {
      const res = await api.getAffiliateReferrals(p);
      setReferrals(res.data.data || []);
      setPagination(res.data.pagination || {});
    } catch {} finally { setLoading(false); }
  };

  if (loading) return <p style={{ color: '#A0AEC0' }}>Loading...</p>;
  if (referrals.length === 0) return <p style={{ color: '#A0AEC0', textAlign: 'center' }}>No referrals yet.</p>;

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#2A2A2A', color: '#1E90FF' }}>
              {['Plan','Amount','Commission Date','Status'].map(h => <th key={h} style={thStyle}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {referrals.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #3A3A3A' }}>
                <td style={tdStyle}>{r.plan || '—'}</td>
                <td style={tdStyle}>{r.amount ? `$${r.amount.toFixed(2)}` : '—'}</td>
                <td style={tdStyle}>{r.transaction_date ? new Date(r.transaction_date).toLocaleDateString() : new Date(r.created_at).toLocaleDateString()}</td>
                <td style={tdStyle}>
                  <span style={{
                    color: r.status === 'active' ? '#10B981' : r.status === 'pending' ? '#FFD93D' : '#A0AEC0',
                  }}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => { setPage(p); loadReferrals(p); }}
              style={{ padding: '0.3rem 0.7rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                backgroundColor: p === page ? '#1E90FF' : '#2A2A2A', color: p === page ? '#fff' : '#A0AEC0' }}>
              {p}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
