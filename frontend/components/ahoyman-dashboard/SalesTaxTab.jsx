import { useState, useEffect } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import api from '../../api/client';
import { inputStyle, thStyle, tdStyle } from './styles';

export default function SalesTaxTab() {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ state: '', startDate: '', endDate: '' });

  useEffect(() => { loadTaxData(); }, [page]);

  const loadTaxData = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filters.state) params.state = filters.state;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const [txRes, sumRes] = await Promise.all([
        api.getTaxTransactions(params),
        api.getTaxSummary(params),
      ]);
      setTransactions(txRes.data.data || []);
      setTotal(txRes.data.pagination?.total || 0);
      setSummary(sumRes.data.data || null);
    } catch (err) {
      console.error('Tax data error:', err);
    } finally { setLoading(false); }
  };

  const handleFilter = (e) => {
    e.preventDefault();
    setPage(1);
    loadTaxData();
  };

  const handleExport = async () => {
    try {
      const params = {};
      if (filters.state) params.state = filters.state;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const res = await api.exportTaxCSV(params);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-transactions-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <Card>
      <h3 style={{ color: '#8B5CF6', marginTop: 0, marginBottom: '1rem' }}>Sales Tax Center</h3>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ background: '#1A1A1A', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
            <p style={{ color: '#A0AEC0', fontSize: '0.8rem', marginBottom: '0.3rem' }}>Total Tax Collected</p>
            <p style={{ color: '#10B981', fontSize: '1.5rem', fontWeight: 'bold' }}>${((summary.totalTaxCents || 0) / 100).toFixed(2)}</p>
          </div>
          <div style={{ background: '#1A1A1A', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
            <p style={{ color: '#A0AEC0', fontSize: '0.8rem', marginBottom: '0.3rem' }}>Transactions</p>
            <p style={{ color: '#1E90FF', fontSize: '1.5rem', fontWeight: 'bold' }}>{summary.totalTransactions || 0}</p>
          </div>
          <div style={{ background: '#1A1A1A', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
            <p style={{ color: '#A0AEC0', fontSize: '0.8rem', marginBottom: '0.3rem' }}>States</p>
            <p style={{ color: '#FFD93D', fontSize: '1.5rem', fontWeight: 'bold' }}>{summary.byState?.length || 0}</p>
          </div>
        </div>
      )}

      {/* State breakdown */}
      {summary?.byState && summary.byState.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ color: '#B0C4DE', marginBottom: '0.75rem' }}>Tax by State</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
            {summary.byState.map(s => (
              <div key={s.state} style={{ background: '#1A1A1A', borderRadius: '6px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#B0C4DE', fontWeight: 600 }}>{s.state}</span>
                <span style={{ color: '#10B981' }}>${(Number(s.total_tax_cents || 0) / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <form onSubmit={handleFilter} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ color: '#A0AEC0', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>State</label>
          <input value={filters.state} onChange={e => setFilters({...filters, state: e.target.value})} placeholder="e.g. PA" style={{...inputStyle, width: '80px'}} />
        </div>
        <div>
          <label style={{ color: '#A0AEC0', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>From</label>
          <input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} style={{...inputStyle, width: '140px'}} />
        </div>
        <div>
          <label style={{ color: '#A0AEC0', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>To</label>
          <input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} style={{...inputStyle, width: '140px'}} />
        </div>
        <Button type="submit" style={{ height: '36px' }}>Filter</Button>
        <Button type="button" onClick={handleExport} style={{ height: '36px', backgroundColor: '#10B981' }}>Export CSV</Button>
      </form>

      {/* Transactions table */}
      {loading ? <p style={{ color: '#A0AEC0', textAlign: 'center' }}>Loading...</p> : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #3A3A3A' }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>State</th>
                  <th style={thStyle}>Zip</th>
                  <th style={thStyle}>Subtotal</th>
                  <th style={thStyle}>Tax Rate</th>
                  <th style={thStyle}>Tax</th>
                  <th style={thStyle}>Total</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center' }}>No tax transactions found</td></tr>
                ) : transactions.map((tx, i) => (
                  <tr key={tx.id || i} style={{ borderBottom: '1px solid #2A2A2A' }}>
                    <td style={tdStyle}>{new Date(tx.created_at || tx.transaction_date).toLocaleDateString()}</td>
                    <td style={tdStyle}>{tx.state || '—'}</td>
                    <td style={tdStyle}>{tx.postal_code || tx.zip || '—'}</td>
                    <td style={tdStyle}>${((tx.subtotal_cents || 0) / 100).toFixed(2)}</td>
                    <td style={tdStyle}>{tx.tax_rate ? (tx.tax_rate * 100).toFixed(2) + '%' : '—'}</td>
                    <td style={{ ...tdStyle, color: '#10B981', fontWeight: 600 }}>${((tx.tax_amount_cents || 0) / 100).toFixed(2)}</td>
                    <td style={tdStyle}>${(((tx.subtotal_cents || 0) + (tx.tax_amount_cents || 0)) / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              <Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
              <span style={{ color: '#A0AEC0', padding: '0.5rem' }}>Page {page} of {totalPages}</span>
              <Button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
