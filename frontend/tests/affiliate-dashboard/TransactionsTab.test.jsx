/**
 * TransactionsTab — unit tests.
 * Tests the affiliate transaction ledger: loading state, empty state,
 * table rendering with commission/payout rows, and error handling.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TransactionsTab from '../../components/affiliate-dashboard/TransactionsTab';

jest.mock('../../api/client', () => ({
  getAffiliateTransactions: jest.fn(),
}));

describe('TransactionsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state while fetching', () => {
    require('../../api/client').getAffiliateTransactions.mockImplementation(
      () => new Promise(() => {})
    );
    render(<TransactionsTab />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders empty state when no transactions', async () => {
    require('../../api/client').getAffiliateTransactions.mockResolvedValue({
      data: { data: [] },
    });
    render(<TransactionsTab />);
    // Must await because mockResolvedValue updates state asynchronously
    expect(await screen.findByText('No transactions yet.')).toBeInTheDocument();
  });

  it('renders transaction table with commission row', async () => {
    const mockTransactions = [
      {
        id: 'txn-1',
        type: 'commission',
        amount: 750, // cents = $7.50
        description: 'Sale: Monthly plan',
        created_at: '2026-04-01T12:00:00Z',
        paid_out_at: null,
      },
    ];
    require('../../api/client').getAffiliateTransactions.mockResolvedValue({
      data: { data: mockTransactions },
    });
    render(<TransactionsTab />);

    // Amount text (e.g. "+$7.50") may be split across elements — use regex
    // toBeInTheDocument() on findByText handles multi-element text automatically
    expect(await screen.findByText(/commission/i)).toBeInTheDocument();
    // Match $7.50 or +$7.50 regardless of surrounding characters
    expect(await screen.findByText(/\+\$\d+\.\d{2}/)).toBeInTheDocument();
    expect(screen.getByText('Sale: Monthly plan')).toBeInTheDocument();
  });

  it('renders transaction table with payout row', async () => {
    const mockTransactions = [
      {
        id: 'txn-2',
        type: 'payout',
        amount: 1500, // cents = $15.00
        description: 'April payout',
        created_at: '2026-04-01T12:00:00Z',
        paid_out_at: '2026-04-15T12:00:00Z',
      },
    ];
    require('../../api/client').getAffiliateTransactions.mockResolvedValue({
      data: { data: mockTransactions },
    });
    render(<TransactionsTab />);

    // Verify the payout row by amount and description (type match is ambiguous as
    // "payout" also appears inside "April payout" description)
    expect(await screen.findByText(/-\$\d+\.\d{2}/)).toBeInTheDocument();
    expect(await screen.findByText(/April payout/)).toBeInTheDocument();
  });

  it('renders multiple transaction rows', async () => {
    const mockTransactions = [
      { id: 'txn-1', type: 'commission', amount: 750, description: 'Sale 1', created_at: '2026-04-01', paid_out_at: null },
      { id: 'txn-2', type: 'commission', amount: 599, description: 'Sale 2', created_at: '2026-04-05', paid_out_at: null },
      { id: 'txn-3', type: 'payout',     amount: 1000, description: 'Payout',  created_at: '2026-04-10', paid_out_at: '2026-04-20' },
    ];
    require('../../api/client').getAffiliateTransactions.mockResolvedValue({
      data: { data: mockTransactions },
    });
    render(<TransactionsTab />);

    expect(await screen.findByText('Sale 1')).toBeInTheDocument();
    expect(screen.getByText('Sale 2')).toBeInTheDocument();
    expect(screen.getByText('Payout')).toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    require('../../api/client').getAffiliateTransactions.mockRejectedValue(
      new Error('Network error')
    );
    render(<TransactionsTab />);
    // Error is caught and loadError is set — component renders error message
    await screen.findByText('Failed to load transactions.');
  });
});
