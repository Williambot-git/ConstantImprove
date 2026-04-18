import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import api from '../api/client';
import AffiliatesTab from '../components/ahoyman-dashboard/AffiliatesTab';
import PayoutsTab from '../components/ahoyman-dashboard/PayoutsTab';
import CodesTab from '../components/ahoyman-dashboard/CodesTab';
import SalesTaxTab from '../components/ahoyman-dashboard/SalesTaxTab';
import SettingsTab from '../components/ahoyman-dashboard/SettingsTab';
import NexusTab from '../components/ahoyman-dashboard/NexusTab';

export default function AhoyManDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.adminMetrics();
      setMetrics(res.data.data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) router.push('/ahoyman');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await api.ahoymanLogout();
    router.push('/ahoyman');
  };

  if (loading) return <p style={{ textAlign: 'center', color: '#A0AEC0' }}>Loading...</p>;

  const m = metrics || {};

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.2rem', color: '#8B5CF6', margin: 0 }}>Manager Dashboard</h1>
        <Button variant="secondary" size="sm" onClick={handleLogout}>Logout</Button>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <MetricCard label="Total Affiliates" value={m.totalAffiliates ?? 0} color="#8B5CF6" />
        <MetricCard label="Active Affiliates" value={m.activeAffiliates ?? 0} color="#10B981" />
        <MetricCard label="Total Referrals" value={m.totalReferredCustomers ?? 0} color="#1E90FF" />
        <MetricCard label="Active Referrals" value={m.activeReferrals ?? 0} color="#10B981" />
        <MetricCard label="Commissions Paid" value={`$${(m.totalCommissionsPaid ?? 0).toFixed(2)}`} color="#00CED1" />
        <MetricCard label="Pending Payouts" value={`$${(m.pendingPayouts ?? 0).toFixed(2)}`} color="#FFD93D" />
        <MetricCard label="Total Earned" value={`$${(m.totalEarned ?? 0).toFixed(2)}`} color="#1E90FF" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {['overview','affiliates','codes','payouts','sales-tax','nexus','settings'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
            backgroundColor: tab === t ? '#8B5CF6' : '#2A2A2A',
            color: tab === t ? '#fff' : '#A0AEC0', fontWeight: tab === t ? 'bold' : 'normal',
          }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <Card title="Getting Started">
          <ul style={{ color: '#B0C4DE', lineHeight: 2, paddingLeft: '1.5rem' }}>
            <li><strong>Affiliates tab:</strong> Create affiliate accounts, view performance, suspend/reactivate accounts</li>
            <li><strong>Payouts tab:</strong> Review and approve payout requests, log manual payments</li>
            <li><strong>Sales Tax tab:</strong> View collected tax by state, filter by date, export CSV for filing</li>
            <li><strong>Settings tab:</strong> Configure commission rates, minimum payout, and hold period</li>
            <li><strong>Recovery kits:</strong> When creating an affiliate, give them the recovery codes shown — they need these to reset their password</li>
            <li><strong>Contact:</strong> Payouts are completed manually — affiliates email ahoyvpn@ahoyvpn.net</li>
          </ul>
        </Card>
      )}

      {tab === 'affiliates' && <AffiliatesTab onAction={loadData} />}
      {tab === 'payouts' && <PayoutsTab onAction={loadData} />}
      {tab === 'codes' && <CodesTab />}
      {tab === 'sales-tax' && <SalesTaxTab />}
      {tab === 'nexus' && <NexusTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

// MetricCard — small reusable component for dashboard metric tiles.
// Renders a labeled value in a Card. Color defaults to brand purple.
function MetricCard({ label, value, color = '#8B5CF6' }) {
  return (
    <Card style={{ textAlign: 'center', padding: '1.25rem' }}>
      <p style={{ color: '#A0AEC0', fontSize: '0.85rem', marginBottom: '0.4rem' }}>{label}</p>
      <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color }}>{value}</p>
    </Card>
  );
}
