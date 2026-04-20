// frontend/components/admin/CustomersTab.jsx
// Customers tab — admin customer search and management.
//
// WHY THIS EXISTS:
// Isolates customer search and management from the admin page orchestration.
// Enables independent testing of customer search and action handlers.
//
// NOTE: The action buttons (Reset Password, Issue Recovery Kit, Deactivate, Delete)
// currently render but are NOT wired to API calls. They are visual-only in the
// original admin.jsx. The search and sanitize integration is the tested behavior.

import React, { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { FormGroup, Input } from '../ui/Form';
import api from '../../api/client';
import { sanitizeText } from '../../lib/sanitize';
import styles from './styles';

export default function CustomersTab() {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerData, setCustomerData] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleSearchCustomer = async (e) => {
    e.preventDefault();
    const sanitizedSearch = sanitizeText(customerSearch);
    if (!sanitizedSearch.trim()) return;

    setSearching(true);
    try {
      const response = await api.searchCustomer(sanitizedSearch);
      setCustomerData(response.data);
    } catch (err) {
      setCustomerData(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div style={styles.content}>
      {/* Search Form */}
      <Card title="Search Customer" style={{ marginBottom: '2rem' }}>
        <form onSubmit={handleSearchCustomer} style={styles.searchForm}>
          <FormGroup label="Customer User ID">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Input
                type="text"
                placeholder="e.g., 12345678"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                disabled={searching}
              />
              <Button type="submit" disabled={searching}>
                {searching ? 'Searching...' : 'Search'}
              </Button>
            </div>
          </FormGroup>
        </form>
      </Card>

      {/* Search Results */}
      {customerData && (
        <Card title="Customer Details" style={{ marginBottom: '2rem' }}>
          <div style={styles.customerGrid}>
            <div>
              <p style={styles.label}>User ID</p>
              <p style={styles.value}>{customerData.id}</p>
            </div>
            <div>
              <p style={styles.label}>Plan</p>
              <p style={styles.value}>{customerData.subscription?.plan || 'N/A'}</p>
            </div>
            <div>
              <p style={styles.label}>Status</p>
              <p
                style={{
                  ...styles.value,
                  color:
                    customerData.subscription?.status === 'active'
                      ? '#00CED1'
                      : '#FF6B6B',
                }}
              >
                {customerData.subscription?.status || 'N/A'}
              </p>
            </div>
          </div>

          {/* Admin Actions — visual only, not wired to API in original */}
          <div style={{ marginTop: '1.5rem' }}>
            <h4 style={{ color: '#1E90FF', marginBottom: '1rem' }}>Admin Actions</h4>
            <div style={styles.actionsGrid}>
              <Button variant="secondary">Reset Password</Button>
              <Button variant="secondary">Issue Recovery Kit</Button>
              <Button variant="secondary">Deactivate</Button>
              <Button variant="danger">Delete Account</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
