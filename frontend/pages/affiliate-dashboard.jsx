/**
 * AffiliateDashboard — affiliate-facing dashboard for viewing metrics, managing
 * affiliate links, tracking referrals, and requesting payouts.
 *
 * REFACTORED: Previously 471 lines with inline tab implementations.
 * Tab content extracted into standalone components in `components/affiliate-dashboard/`:
 *   OverviewTab     — Attribution rules + recovery kit generation
 *   LinksTab        — Affiliate link CRUD (create, copy, delete)
 *   ReferralsTab    — Paginated referral history table
 *   TransactionsTab — Transaction ledger
 *   PayoutTab       — Payout request form
 *
 * WHY: The original file had 5 tab sections and 2 sub-component functions all in
 * one file. Extracting them makes each piece independently testable and reduces
 * the main page to a thin orchestrator (tab nav + metric cards + active tab).
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card } from '../components/ui';
import { Button } from '../components/ui';
import api from '../api/client';
import OverviewTab from '../components/affiliate-dashboard/OverviewTab';
import LinksTab from '../components/affiliate-dashboard/LinksTab';
import ReferralsTab from '../components/affiliate-dashboard/ReferralsTab';
import TransactionsTab from '../components/affiliate-dashboard/TransactionsTab';
import PayoutTab from '../components/affiliate-dashboard/PayoutTab';

export default function AffiliateDashboard() {
  const router = useRouter();

  // ── Core dashboard state ────────────────────────────────────────────────
  const [metrics, setMetrics] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Tab navigation ─────────────────────────────────────────────────────
  const [tab, setTab] = useState('overview'); // overview | links | referrals | transactions | payout

  // ── Load initial data (metrics + links) ─────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [metricsRes, linksRes] = await Promise.all([
        api.getAffiliateMetrics(),
        api.getAffiliateLinks(),
      ]);
      setMetrics(metricsRes.data.data);
      setLinks(linksRes.data.data || []);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        router.push('/affiliate');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Logout ──────────────────────────────────────────────────────────────
  const handleAffiliateLogout = async () => {
    await api.affiliateLogout();
    router.push('/affiliate');
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return <p style={{ textAlign: 'center', color: '#A0AEC0' }}>Loading...</p>;

  const m = metrics || {};

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.2rem', color: '#1E90FF', margin: 0 }}>Affiliate Dashboard</h1>
        <Button variant="secondary" size="sm" onClick={handleAffiliateLogout}>Logout</Button>
      </div>

      {/* Metric tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <MetricCard label="Total Signups" value={m.totalSignups ?? 0} />
        <MetricCard label="This Month" value={m.signupsThisMonth ?? 0} color="#10B981" />
        <MetricCard label="Active Referrals" value={m.activeReferrals ?? 0} color="#10B981" />
        <MetricCard label="Total Earned" value={`$${(m.totalEarned ?? 0).toFixed(2)}`} color="#00CED1" />
        <MetricCard label="Pending Payout" value={`$${m.pendingPayout?.toFixed(2) ?? '0.00'}`} color="#FFD93D" />
        <MetricCard label="Available" value={`$${m.availableToCashOut?.toFixed(2) ?? '0.00'}`} color="#1E90FF" />
        <MetricCard label="On Hold" value={`$${m.heldAmount?.toFixed(2) ?? '0.00'}`} color="#A0AEC0" />
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {['overview','links','referrals','transactions','payout'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
            backgroundColor: tab === t ? '#1E90FF' : '#2A2A2A',
            color: tab === t ? '#fff' : '#A0AEC0', fontWeight: tab === t ? 'bold' : 'normal',
          }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'links' && (
        <LinksTab links={links} onAction={loadData} />
      )}
      {tab === 'referrals' && (
        <Card><h3 style={{ color: '#1E90FF', marginBottom: '1.5rem' }}>Referral History</h3><ReferralsTab /></Card>
      )}
      {tab === 'transactions' && (
        <Card><h3 style={{ color: '#1E90FF', marginBottom: '1.5rem' }}>Transaction Ledger</h3><TransactionsTab /></Card>
      )}
      {tab === 'payout' && <PayoutTab metrics={m} />}
    </div>
  );
}

// MetricCard — small reusable component for dashboard metric tiles.
// Renders a labeled value in a Card. Color defaults to brand blue.
function MetricCard({ label, value, color = '#1E90FF' }) {
  return (
    <Card style={{ textAlign: 'center', padding: '1.25rem' }}>
      <p style={{ color: '#A0AEC0', fontSize: '0.85rem', marginBottom: '0.4rem' }}>{label}</p>
      <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color }}>{value}</p>
    </Card>
  );
}
