import { useState, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import { AuthContext } from './_app';
import api from '../api/client';
import KPITab from '../components/admin/KPITab';
import CustomersTab from '../components/admin/CustomersTab';
import AffiliatesTab from '../components/admin/AffiliatesTab';

import styles from '../components/admin/styles';

export default function Admin() {
  const router = useRouter();
  const auth = useContext(AuthContext);

  // Redirect if not admin
  useEffect(() => {
    if (!auth?.isLoggedIn) {
      router.push('/login');
    }
    if (auth?.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [auth, router]);

  const [tab, setTab] = useState('kpis'); // kpis, customers, affiliates
  const [metrics, setMetrics] = useState(null);
  const [affiliates, setAffiliates] = useState([]);
  const [affiliatesLoading, setAffiliatesLoading] = useState(false);

  // Load metrics on mount (only when admin role confirmed)
  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const response = await api.adminMetrics();
        setMetrics(response.data);
      } catch (err) {
        console.error('Failed to load metrics');
      }
    };
    if (auth?.role === 'admin') {
      loadMetrics();
    }
  }, [auth]);

  // Load affiliates when switching to affiliates tab
  const loadAffiliates = async () => {
    setAffiliatesLoading(true);
    try {
      const response = await api.getAffiliates();
      setAffiliates(response.data || []);
    } catch (err) {
      console.error('Failed to load affiliates');
      setAffiliates([]);
    } finally {
      setAffiliatesLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'affiliates' && auth?.role === 'admin') {
      loadAffiliates();
    }
  }, [tab, auth]);

  if (auth?.role !== 'admin') {
    return <p>Redirecting...</p>;
  }

  if (!metrics) {
    return <p style={{ textAlign: 'center' }}>Loading admin dashboard...</p>;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Admin Dashboard</h1>

      {/* Tab Navigation */}
      <div style={styles.tabsContainer}>
        <button
          onClick={() => setTab('kpis')}
          style={{ ...styles.tab, ...(tab === 'kpis' && styles.tabActive) }}
        >
          System KPIs
        </button>
        <button
          onClick={() => setTab('customers')}
          style={{ ...styles.tab, ...(tab === 'customers' && styles.tabActive) }}
        >
          Customers
        </button>
        <button
          onClick={() => setTab('affiliates')}
          style={{ ...styles.tab, ...(tab === 'affiliates' && styles.tabActive) }}
        >
          Affiliates
        </button>
      </div>

      {/* Tab Content */}
      {tab === 'kpis' && <KPITab metrics={metrics} />}
      {tab === 'customers' && <CustomersTab />}
      {tab === 'affiliates' && (
        <AffiliatesTab
          affiliates={affiliates}
          onRefresh={loadAffiliates}
          loading={affiliatesLoading}
        />
      )}
    </div>
  );
}


