// frontend/components/admin/AffiliatesTab.jsx
// Affiliates management tab — renders affiliate table, disable/adjust actions, CSV export.
//
// WHY THIS EXISTS:
// Isolates affiliate management from admin page orchestration.
// CSV export and table rendering logic tested here rather than in page-level tests.
//
// PROPS:
//   - affiliates: array of affiliate objects from api.getAffiliates()
//   - onDisable: callback(id) — calls api.disableAffiliate then refreshes
//   - onAdjust: callback(id) — shows prompt for amount/reason then calls api
//   - onRefresh: callback() — reloads the affiliates list
//   - loading: boolean — shows loading state while fetching

import React, { useCallback } from 'react';
import Button from '../ui/Button';
import Card from '../ui/Card';
import api from '../../api/client';
import styles from './styles';

export default function AffiliatesTab({ affiliates = [], onRefresh, loading = false }) {
  // Handler: disable affiliate (with confirm dialog)
  const handleDisableAffiliate = useCallback(
    async (id) => {
      if (
        !confirm(
          'Are you sure you want to disable this affiliate? They will no longer earn commissions.'
        )
      )
        return;
      try {
        await api.disableAffiliate(id);
        if (onRefresh) onRefresh();
      } catch (err) {
        alert(err?.response?.data?.error || 'Failed to disable affiliate. Please try again.');
      }
    },
    [onRefresh]
  );

  // Handler: adjust affiliate earnings (with prompt dialogs)
  const handleAdjustEarnings = useCallback(
    async (id) => {
      const amount = prompt(
        'Enter adjustment amount in cents (positive to add, negative to deduct):'
      );
      if (amount === null || amount.trim() === '') return;
      const amountCents = parseInt(amount, 10);
      if (isNaN(amountCents)) {
        alert('Invalid amount');
        return;
      }
      const reason = prompt('Reason for adjustment:');
      if (reason === null) return;
      try {
        await api.adjustAffiliateEarnings(id, amountCents, reason);
        if (onRefresh) onRefresh();
      } catch (err) {
        alert(err?.response?.data?.error || 'Failed to adjust earnings. Please try again.');
      }
    },
    [onRefresh]
  );

  // Handler: export affiliates to CSV
  const handleExportCSV = useCallback(() => {
    const headers = [
      'Account',
      'Code',
      'Active Referrals',
      'Total Commission',
      'Pending Payout',
      'Status',
    ];
    const rows = affiliates.map((aff) => [
      aff.account_number,
      aff.code,
      aff.active_referrals || 0,
      `$${((aff.total_commission_cents || 0) / 100).toFixed(2)}`,
      `$${((aff.pending_payout_cents || 0) / 100).toFixed(2)}`,
      aff.is_active ? 'Active' : 'Disabled',
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliates-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [affiliates]);

  return (
    <div style={styles.content}>
      <Card title="Affiliate Management">
        {loading ? (
          <p style={{ color: '#B0C4DE', textAlign: 'center' }}>Loading affiliates...</p>
        ) : affiliates.length === 0 ? (
          <p style={{ color: '#A0AEC0', textAlign: 'center' }}>No affiliates found.</p>
        ) : (
          <div style={styles.affiliatesTable}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#2A2A2A' }}>
                  <th style={styles.tableHeader}>Account</th>
                  <th style={styles.tableHeader}>Code</th>
                  <th style={styles.tableHeader}>Active Referrals</th>
                  <th style={styles.tableHeader}>Total Commission</th>
                  <th style={styles.tableHeader}>Pending Payout</th>
                  <th style={styles.tableHeader}>Status</th>
                  <th style={styles.tableHeader}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map((aff) => (
                  <tr key={aff.id} style={{ borderBottom: '1px solid #3A3A3A' }}>
                    <td style={styles.tableCell}>{aff.account_number}</td>
                    <td style={styles.tableCell}>
                      <code>{aff.code}</code>
                    </td>
                    <td style={styles.tableCell}>{aff.active_referrals || 0}</td>
                    <td style={styles.tableCell}>
                      ${((aff.total_commission_cents || 0) / 100).toFixed(2)}
                    </td>
                    <td style={styles.tableCell}>
                      ${((aff.pending_payout_cents || 0) / 100).toFixed(2)}
                    </td>
                    <td style={styles.tableCell}>
                      <span style={{ color: aff.is_active ? '#00CED1' : '#FF6B6B' }}>
                        {aff.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={styles.tableCell}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDisableAffiliate(aff.id)}
                        disabled={!aff.is_active}
                      >
                        Disable
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleAdjustEarnings(aff.id)}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        Adjust
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Action buttons — always shown below table */}
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="secondary" onClick={handleExportCSV}>
            Export CSV
          </Button>
          <Button variant="secondary" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </Card>
    </div>
  );
}
