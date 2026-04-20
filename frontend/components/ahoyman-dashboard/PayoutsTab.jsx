import React, { useState, useEffect } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import api from '../../api/client';
import { inputStyle, thStyle, tdStyle } from './styles';

export default function PayoutsTab({ onAction }) {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [manualAffiliate, setManualAffiliate] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualMsg, setManualMsg] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => { loadPayouts(); }, []);

  const loadPayouts = async (status) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (status) params.status = status;
      const res = await api.getPayoutRequests(params);
      setPayouts(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load payouts.');
      setPayouts([]);
    } finally { setLoading(false); }
  };

  const handleApprove = async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await api.approvePayout(id);
      onAction();
      loadPayouts(statusFilter);
    } catch { alert('Failed to approve.'); }
    finally { setActionLoading(prev => ({ ...prev, [id]: false })); }
  };

  const handleReject = async (id) => {
    const notes = prompt('Reason for rejection (optional):') || '';
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await api.rejectPayout(id, notes);
      loadPayouts(statusFilter);
    } catch { alert('Failed to reject.'); }
    finally { setActionLoading(prev => ({ ...prev, [id]: false })); }
  };

  const handleManualPayout = async (e) => {
    e.preventDefault();
    setManualLoading(true);
    try {
      await api.logManualPayout(manualAffiliate, parseFloat(manualAmount), manualNotes);
      setManualMsg('Manual payout logged successfully.');
      setManualAffiliate('');
      setManualAmount('');
      setManualNotes('');
      onAction();
      loadPayouts(statusFilter);
    } catch (err) {
      setManualMsg(err.response?.data?.error || 'Failed to log payout.');
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <>
      <Card style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ color: '#8B5CF6', marginTop: 0 }}>Log Manual Payment</h4>
        <form onSubmit={handleManualPayout} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Affiliate username" value={manualAffiliate} onChange={e => setManualAffiliate(e.target.value)} required style={inputStyle} />
          <span style={{ color: '#A0AEC0' }}>$</span>
          <input type="number" step="0.01" min="0.01" placeholder="0.00" value={manualAmount} onChange={e => setManualAmount(e.target.value)} required style={{ ...inputStyle, width: '100px' }} />
          <input placeholder="Notes (optional)" value={manualNotes} onChange={e => setManualNotes(e.target.value)} style={inputStyle} />
          <Button type="submit" disabled={manualLoading}>{manualLoading ? 'Logging...' : 'Log Payment'}</Button>
        </form>
        {manualMsg && <p style={{ marginTop: '0.5rem', color: manualMsg.includes('success') ? '#10B981' : '#FF6B6B' }}>{manualMsg}</p>}
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ color: '#8B5CF6', margin: 0 }}>Payout Requests</h3>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); loadPayouts(e.target.value); }}
            style={{ ...inputStyle, width: 'auto' }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="processed">Processed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        {loading ? <p style={{ color: '#A0AEC0' }}>Loading...</p> : error ? (
          <p style={{ color: '#FF6B6B', textAlign: 'center' }}>{error}</p>
        ) : payouts.length === 0 ? (
          <p style={{ color: '#A0AEC0', textAlign: 'center' }}>No payout requests.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#2A2A2A', color: '#8B5CF6' }}>
                  {['Affiliate','Amount','Requested','Status','Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {payouts.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #3A3A3A' }}>
                    <td style={tdStyle}>{p.affiliate_username}</td>
                    <td style={tdStyle}>${(p.amount ?? 0).toFixed(2)}</td>
                    <td style={tdStyle}>{new Date(p.requested_at).toLocaleDateString()}</td>
                    <td style={tdStyle}>
                      <span style={{
                        color: p.status === 'pending' ? '#FFD93D' : p.status === 'processed' ? '#10B981' : '#FF6B6B',
                        fontWeight: 'bold',
                      }}>{p.status}</span>
                    </td>
                    <td style={tdStyle}>
                      {p.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <Button variant="success" size="xs" onClick={() => handleApprove(p.id)} disabled={actionLoading[p.id]}>Approve</Button>
                          <Button variant="danger" size="xs" onClick={() => handleReject(p.id)} disabled={actionLoading[p.id]}>Reject</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
