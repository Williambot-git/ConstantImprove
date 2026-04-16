import React, { useState, useEffect } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import api from '../../api/client';
import { inputStyle, thStyle, tdStyle } from './styles';

export default function AffiliatesTab({ onAction }) {
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState({});
  const [pagination, setPagination] = useState({});
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createMsg, setCreateMsg] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState(null);

  useEffect(() => { loadAffiliates(1); }, []);

  const loadAffiliates = async (p, s) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (s) params.search = s;
      const res = await api.getAffiliates(params);
      setAffiliates(res.data.data || []);
      setPagination(res.data.pagination || {});
    } catch {} finally { setLoading(false); }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadAffiliates(1, search);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const res = await api.createAffiliate(newUsername, newPassword);
      setNewRecoveryCodes(res.data.data?.recoveryCodes || []);
      setCreateMsg('Affiliate created successfully!');
      setNewUsername('');
      setNewPassword('');
      onAction();
      loadAffiliates(page, search);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create affiliate.');
    } finally {
      setCreating(false);
    }
  };

  const handleSuspend = async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try { await api.suspendAffiliate(id); onAction(); loadAffiliates(page, search); }
    catch { alert('Failed to suspend.'); }
    finally { setActionLoading(prev => ({ ...prev, [id]: false })); }
  };

  const handleDelete = async (id) => {
    if (!confirm('This will PERMANENTLY DELETE this affiliate. This cannot be undone. Are you sure?')) return;
    if (!confirm('FINAL CONFIRM: Click OK to delete forever.')) return;
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await api.deleteAffiliate(id);
      onAction();
      loadAffiliates(page, search);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete affiliate.');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleArchive = async (id) => {
    if (!confirm('Archive this affiliate? They will be hidden from the active list but all data is preserved.')) return;
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await api.archiveAffiliate(id);
      onAction();
      loadAffiliates(page, search);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to archive affiliate.');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleReactivate = async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try { await api.reactivateAffiliate(id); onAction(); loadAffiliates(page, search); }
    catch { alert('Failed to reactivate.'); }
    finally { setActionLoading(prev => ({ ...prev, [id]: false })); }
  };

  const handleRegenerateKit = async (id) => {
    try {
      const res = await api.regenerateAffiliateKit(id);
      const codes = res.data.data?.recoveryCodes || [];
      const affiliate = affiliates.find(a => a.id === id);
      alert(`New recovery codes for ${affiliate?.username}:\n\n${codes.join('\n')}\n\nGive these to the affiliate. Old codes are invalidated.`);
    } catch { alert('Failed to regenerate kit.'); }
  };

  return (
    <>
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search username..."
              style={inputStyle} />
            <Button type="submit" variant="secondary" size="sm">Search</Button>
          </form>
          <Button onClick={() => setShowCreate(!showCreate)} size="sm">
            {showCreate ? 'Cancel' : '+ New Affiliate'}
          </Button>
        </div>

        {showCreate && (
          <div style={{ backgroundColor: '#1A1A1A', border: '1px solid #3A3A3A', borderRadius: '8px', padding: '1.5rem', marginBottom: '1rem' }}>
            <h4 style={{ color: '#8B5CF6', marginTop: 0 }}>Create New Affiliate</h4>
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input placeholder="Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} required style={inputStyle} />
              <input type="password" placeholder="Password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={inputStyle} />
              <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create'}</Button>
            </form>
            {createError && <p style={{ color: '#FF6B6B', marginTop: '0.5rem' }}>{createError}</p>}
            {newRecoveryCodes && (
              <div style={{ marginTop: '1rem', backgroundColor: '#1A1A1A', border: '1px solid #10B981', borderRadius: '6px', padding: '1rem' }}>
                <p style={{ color: '#10B981', fontWeight: 'bold', marginBottom: '0.5rem' }}>Recovery codes — give these to the affiliate:</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                  {newRecoveryCodes.map((code, i) => (
                    <code key={i} style={{ color: '#00CED1', backgroundColor: '#252525', padding: '0.25rem 0.5rem', borderRadius: '4px', textAlign: 'center', fontFamily: 'monospace' }}>{code}</code>
                  ))}
                </div>
                <p style={{ color: '#A0AEC0', fontSize: '0.8rem', marginTop: '0.5rem' }}>Write these down. They can only be used once.</p>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ color: '#8B5CF6', marginBottom: '1.5rem' }}>All Affiliates</h3>
        {loading ? <p style={{ color: '#A0AEC0' }}>Loading...</p> : affiliates.length === 0 ? (
          <p style={{ color: '#A0AEC0', textAlign: 'center' }}>No affiliates found.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#2A2A2A', color: '#8B5CF6' }}>
                    {['Username','Status','Total Earned','Paid Out','Pending','Referrals','Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {affiliates.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #3A3A3A' }}>
                      <td style={tdStyle}>{a.username}</td>
                      <td style={tdStyle}>
                        <span style={{ color: a.status === 'active' ? '#10B981' : '#FF6B6B', fontWeight: 'bold' }}>{a.status}</span>
                      </td>
                      <td style={tdStyle}>${(a.totalEarned ?? 0).toFixed(2)}</td>
                      <td style={tdStyle}>${(a.totalPaid ?? 0).toFixed(2)}</td>
                      <td style={tdStyle}><span style={{ color: '#FFD93D' }}>${(a.pendingBalance ?? 0).toFixed(2)}</span></td>
                      <td style={tdStyle}>{a.totalReferrals ?? 0} <span style={{ color: '#10B981' }}>({a.activeReferrals ?? 0} active)</span></td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {a.status === 'active'
                            ? <Button variant="danger" size="xs" onClick={() => handleSuspend(a.id)} disabled={actionLoading[a.id]}>Suspend</Button>
                            : a.status === 'suspended'
                            ? <Button variant="secondary" size="xs" onClick={() => handleReactivate(a.id)} disabled={actionLoading[a.id]}>Reactivate</Button>
                            : null
                          }
                          <Button variant="secondary" size="xs" onClick={() => handleRegenerateKit(a.id)}>New Kit</Button>
                          <Button variant="secondary" size="xs" onClick={() => handleArchive(a.id)} disabled={actionLoading[a.id]} style={{ color: '#FFD93D' }}>Archive</Button>
                          <Button variant="danger" size="xs" onClick={() => handleDelete(a.id)} disabled={actionLoading[a.id]}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination.pages > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
                {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => { setPage(p); loadAffiliates(p, search); }}
                    style={{ padding: '0.3rem 0.7rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                      backgroundColor: p === page ? '#8B5CF6' : '#2A2A2A', color: p === page ? '#fff' : '#A0AEC0' }}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
