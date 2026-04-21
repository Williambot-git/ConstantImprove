/**
 * NexusTab — Economic Nexus Overview
 *
 * Displays per-state revenue and transaction count from tax_transactions.
 * Economic nexus thresholds (federal standard):
 *   - $100,000 revenue in a state, OR
 *   - 200 transactions in a state
 *
 * tax_transactions is populated by payment webhooks regardless of whether
 * ZipTax is active (tax_amount_cents is 0 now but total_amount_cents = revenue).
 *
 * @module components/ahoyman-dashboard/NexusTab
 */
import { useState, useEffect } from 'react';
import Card from '../ui/Card';
import api from '../../api/client';

export default function NexusTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ startDate: '', endDate: '' });

  useEffect(() => { loadNexusData(); }, []);

  /**
   * loadNexusData — fetches nexus overview from the backend.
   * Sends optional start_date/end_date filters if set by the user.
   */
  const loadNexusData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (filters.startDate) params.start_date = filters.startDate;
      if (filters.endDate) params.end_date = filters.endDate;

      const res = await api.getNexusOverview(params);
      setData(res.data);
    } catch (err) {
      // Log to structured logger in production; user sees the setError message below
      setError('Failed to load nexus data.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = (e) => {
    e.preventDefault();
    loadNexusData();
  };

  const { states = [], totals = {} } = data || {};
  const isEmpty = !loading && states.length === 0;

  return (
    <div>
      {/* Filter bar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleFilter} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ color: '#A0AEC0', fontSize: '0.875rem' }}>
            Start Date:
            <input
              type="date"
              value={filters.startDate}
              onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
              style={{ marginLeft: '0.5rem', background: '#1E1E1E', border: '1px solid #333', borderRadius: '4px', color: '#fff', padding: '0.25rem 0.5rem' }}
            />
          </label>
          <label style={{ color: '#A0AEC0', fontSize: '0.875rem' }}>
            End Date:
            <input
              type="date"
              value={filters.endDate}
              onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
              style={{ marginLeft: '0.5rem', background: '#1E1E1E', border: '1px solid #333', borderRadius: '4px', color: '#fff', padding: '0.25rem 0.5rem' }}
            />
          </label>
          <button
            type="submit"
            style={{ background: '#8B5CF6', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.4rem 1rem', cursor: 'pointer', fontSize: '0.875rem' }}
          >
            Apply Filter
          </button>
          {(filters.startDate || filters.endDate) && (
            <button
              type="button"
              onClick={() => { setFilters({ startDate: '', endDate: '' }); }}
              style={{ background: 'transparent', color: '#A0AEC0', border: '1px solid #333', borderRadius: '6px', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              Clear
            </button>
          )}
        </form>
      </Card>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <MetricCard
          label="Total Revenue"
          value={`$${totals.grand_total_revenue_dollars || '0.00'}`}
          color="#48bb78"
        />
        <MetricCard
          label="Total Transactions"
          value={totals.grand_total_transactions || 0}
          color="#8B5CF6"
        />
        <MetricCard
          label="States Tracked"
          value={states.length}
          color="#1E90FF"
        />
      </div>

      {/* States table */}
      {loading && (
        <p style={{ textAlign: 'center', color: '#A0AEC0' }}>Loading...</p>
      )}

      {error && (
        <p style={{ textAlign: 'center', color: '#fc8181' }}>{error}</p>
      )}

      {isEmpty && !loading && !error && (
        <Card>
          <p style={{ textAlign: 'center', color: '#A0AEC0' }}>
            No transactions recorded yet. Nexus data will appear here once payments come through.
          </p>
        </Card>
      )}

      {!loading && !error && states.length > 0 && (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2A2A' }}>
                  <th style={thStyle}>State</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Transactions</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {states.map(s => (
                  <tr key={s.state} style={{ borderBottom: '1px solid #1E1E1E' }}>
                    <td style={tdStyle}>{s.state}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{s.transaction_count}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#48bb78' }}>
                      ${s.total_revenue_dollars}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Nexus threshold reminder */}
      {!loading && states.length > 0 && (
        <Card style={{ marginTop: '1rem' }}>
          <p style={{ color: '#A0AEC0', fontSize: '0.8rem', margin: 0 }}>
            <strong style={{ color: '#ffd93d' }}>Economic Nexus Thresholds (federal standard):</strong>{' '}
            $100,000 revenue OR 200 transactions per state. Review this data periodically to identify states approaching these thresholds.
          </p>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ label, value, color = '#8B5CF6' }) {
  return (
    <Card style={{ textAlign: 'center', padding: '1.25rem' }}>
      <p style={{ color: '#A0AEC0', fontSize: '0.85rem', marginBottom: '0.4rem' }}>{label}</p>
      <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color }}>{value}</p>
    </Card>
  );
}

// Shared table styles — consistent with other ahoyman dashboard tabs
const thStyle = { padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem', color: '#A0AEC0' };
const tdStyle = { padding: '0.75rem 1rem', color: '#B0C4DE', fontSize: '0.9rem' };
