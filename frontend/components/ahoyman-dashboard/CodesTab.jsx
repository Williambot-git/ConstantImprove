import React, { useState, useEffect } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import api from '../../api/client';
import { inputStyle, thStyle, tdStyle } from './styles';

export default function CodesTab() {
  const [codes, setCodes] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ affiliateId: '', code: '', discountCents: '0' });
  const [msg, setMsg] = useState('');
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [editDiscountVal, setEditDiscountVal] = useState('');

  useEffect(() => { loadCodes(); loadAffiliatesList(); }, []);

  const loadCodes = async () => {
    setLoading(true);
    try {
      const res = await api.getAffiliateCodes();
      setCodes(res.data.data || []);
    } catch {} finally { setLoading(false); }
  };

  const loadAffiliatesList = async () => {
    try {
      const res = await api.getAffiliates();
      setAffiliates(res.data.data || []);
    } catch {}
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.affiliateId || !form.code) { setMsg('Affiliate and code are required'); return; }
    setCreating(true); setMsg('');
    try {
      await api.createAffiliateCode(form.affiliateId, form.code, parseInt(form.discountCents) || 0);
      setMsg('Code created!');
      setForm({ affiliateId: '', code: '', discountCents: '0' });
      loadCodes();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to create code');
    } finally { setCreating(false); }
  };

  const handleUpdateDiscount = async (codeId) => {
    try {
      await api.updateAffiliateCodeDiscount(codeId, parseInt(editDiscountVal) || 0);
      setEditingDiscount(null);
      loadCodes();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update discount');
    }
  };

  return (
    <Card>
      <h3 style={{ color: '#8B5CF6', marginTop: 0, marginBottom: '1rem' }}>Affiliate Codes</h3>

      {/* Create new code */}
      <div style={{ background: '#1A1A1A', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h4 style={{ color: '#B0C4DE', marginBottom: '0.75rem', marginTop: 0 }}>Create New Code</h4>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ color: '#A0AEC0', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>Affiliate</label>
            <select value={form.affiliateId} onChange={e => setForm({...form, affiliateId: e.target.value})}
              style={{ ...inputStyle, width: '180px' }}>
              <option value="">Select affiliate...</option>
              {affiliates.map(a => <option key={a.id} value={a.id}>{a.username}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#A0AEC0', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>Code</label>
            <input value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})}
              placeholder="e.g. SUMMER50" style={{ ...inputStyle, width: '140px' }} />
          </div>
          <div>
            <label style={{ color: '#A0AEC0', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>Discount (cents)</label>
            <input type="number" min="0" value={form.discountCents}
              onChange={e => setForm({...form, discountCents: e.target.value})}
              placeholder="0" style={{ ...inputStyle, width: '100px' }} />
          </div>
          <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create Code'}</Button>
        </form>
        {form.discountCents > 0 && <p style={{ color: '#10B981', fontSize: '0.85rem', marginTop: '0.5rem' }}>Discount: ${(form.discountCents / 100).toFixed(2)} off per purchase</p>}
        {msg && <p style={{ marginTop: '0.5rem', color: msg.includes('created') ? '#10B981' : '#FF6B6B', fontSize: '0.85rem' }}>{msg}</p>}
      </div>

      {/* Codes table */}
      {loading ? <p style={{ color: '#A0AEC0', textAlign: 'center' }}>Loading...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #3A3A3A' }}>
                <th style={thStyle}>Code</th>
                <th style={thStyle}>Affiliate</th>
                <th style={thStyle}>Clicks</th>
                <th style={thStyle}>Discount</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 ? (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center' }}>No codes yet</td></tr>
              ) : codes.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #2A2A2A' }}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600, color: '#1E90FF' }}>{c.code}</td>
                  <td style={tdStyle}>{c.affiliate_username}</td>
                  <td style={tdStyle}>{c.clicks}</td>
                  <td style={tdStyle}>
                    {editingDiscount === c.id ? (
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <input type="number" min="0" value={editDiscountVal}
                          onChange={e => setEditDiscountVal(e.target.value)}
                          style={{ ...inputStyle, width: '70px', padding: '0.3rem' }} />
                        <Button onClick={() => handleUpdateDiscount(c.id)} style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}>Save</Button>
                        <Button onClick={() => setEditingDiscount(null)} style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', backgroundColor: '#3A3A3A' }}>X</Button>
                      </div>
                    ) : (
                      <span style={{ color: c.discount_cents > 0 ? '#10B981' : '#A0AEC0' }}>
                        {c.discount_cents > 0 ? `$${(c.discount_cents / 100).toFixed(2)}` : 'None'}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: c.active ? '#10B981' : '#FF6B6B' }}>{c.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td style={tdStyle}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    <Button onClick={() => { setEditingDiscount(c.id); setEditDiscountVal(c.discount_cents || 0); }}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>Edit Discount</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
