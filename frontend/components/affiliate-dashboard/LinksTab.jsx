/**
 * LinksTab — affiliate dashboard "Your Affiliate Links" tab.
 *
 * EXTRACTED FROM: affiliate-dashboard.jsx lines 218-300
 * WHY: The links tab is a self-contained section managing affiliate link creation,
 * display, copy, and deletion. Extracting it enables isolated testing of link CRUD.
 *
 * PROPS:
 *   links      — array of affiliate link objects from API
 *   onAction   — callback to invoke after create/delete so parent can refresh links
 */
import { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { inputStyle, thStyle, tdStyle } from './styles';
import api from '../../api/client';

export default function LinksTab({ links = [], onAction }) {
  const [newCode, setNewCode] = useState('');
  const [newDiscount, setNewDiscount] = useState('0');
  const [actionLoading, setActionLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(null);

  const handleGenerateLink = async () => {
    setActionLoading(true);
    try {
      await api.generateAffiliateLink();
      onAction && onAction();
    } catch {
      alert('Failed to generate link');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateCustomCode = async (e) => {
    e.preventDefault();
    if (!newCode.trim()) { alert('Enter a code'); return; }
    setActionLoading(true);
    try {
      await api.createAffiliateLinkWithCode(newCode.toUpperCase(), parseInt(newDiscount) || 0);
      onAction && onAction();
      setNewCode('');
      setNewDiscount('0');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create code');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteLink = async (linkId) => {
    if (!confirm('Delete this link? This cannot be undone.')) return;
    try {
      await api.deleteAffiliateLink(linkId);
      onAction && onAction();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete link');
    }
  };

  const handleCopyLink = (link) => {
    const url = link?.url || (link?.code ? 'https://ahoyvpn.net/affiliate/' + link.code : '');
    if (url) {
      navigator.clipboard.writeText(url);
      setLinkCopied(link?.id);
      setTimeout(() => setLinkCopied(null), 2000);
    } else {
      alert('Link URL not available yet. Try refreshing.');
    }
  };

  return (
    <>
      {/* Create custom code */}
      <Card title="Create Affiliate Code" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleCreateCustomCode} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ color: '#A0AEC0', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>Code</label>
            <input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())}
              placeholder="e.g. SUMMER50" style={{ ...inputStyle, width: '150px' }} />
          </div>
          <div>
            <label style={{ color: '#A0AEC0', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>Discount</label>
            <select value={newDiscount} onChange={e => setNewDiscount(e.target.value)}
              style={{ ...inputStyle, width: '150px' }}>
              <option value="0">None</option>
              <option value="25">$0.25 off</option>
              <option value="50">$0.50 off</option>
            </select>
          </div>
          <Button type="submit" disabled={actionLoading}>
            {actionLoading ? 'Creating...' : 'Create Code'}
          </Button>
          <span style={{ color: '#555', fontSize: '0.85rem', alignSelf: 'center' }}>or</span>
          <Button variant="secondary" onClick={handleGenerateLink} disabled={actionLoading}>
            Auto-Generate
          </Button>
        </form>
      </Card>

      {/* Links table */}
      <Card>
        <h3 style={{ color: '#1E90FF', margin: '0 0 1rem 0' }}>Your Affiliate Links</h3>
        {links.length === 0 ? (
          <p style={{ color: '#A0AEC0', textAlign: 'center', padding: '2rem' }}>No links yet. Create one above to start earning.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#2A2A2A', color: '#1E90FF' }}>
                  <th style={thStyle}>Code</th>
                  <th style={thStyle}>URL</th>
                  <th style={thStyle}>Clicks</th>
                  <th style={thStyle}>Signups</th>
                  <th style={thStyle}>Discount</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {links.map(link => (
                  <tr key={link.id} style={{ borderBottom: '1px solid #3A3A3A' }}>
                    <td style={tdStyle}><code style={{ color: '#00CED1' }}>{link.code}</code></td>
                    <td style={tdStyle}><code style={{ color: '#888', fontSize: '0.8rem' }}>{link.url}</code></td>
                    <td style={tdStyle}>{link.clicks ?? 0}</td>
                    <td style={tdStyle}>{link.signups ?? 0}</td>
                    <td style={tdStyle}>
                      <span style={{ color: link.discount_cents > 0 ? '#10B981' : '#A0AEC0' }}>
                        {link.discount_cents > 0 ? `$${(link.discount_cents / 100).toFixed(2)} off` : 'None'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: link.active !== false ? '#10B981' : '#FF6B6B' }}>
                        {link.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <Button variant="secondary" size="sm" onClick={() => handleCopyLink(link)}>
                          {linkCopied === link.id ? '✓ Copied' : 'Copy'}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDeleteLink(link.id)}>
                          Delete
                        </Button>
                      </div>
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
