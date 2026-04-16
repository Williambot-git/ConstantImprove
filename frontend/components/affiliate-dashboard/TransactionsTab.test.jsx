/**
 * TransactionsTab — unit tests.
 */
import { render, screen } from '@testing-library/react';
import TransactionsTab from './TransactionsTab';

jest.mock('../../api/client', () => ({
  getAffiliateTransactions: jest.fn(),
}));

describe('TransactionsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when no transactions', () => {
    require('../../api/client').getAffiliateTransactions.mockResolvedValue({ data: { data: [] } });
    render(<TransactionsTab />);
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    require('../../api/client').getAffiliateTransactions.mockImplementation(() => new Promise(() => {}));
    render(<TransactionsTab />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders transaction rows with commission and payout types', async () => {
    const mockTransactions = [
      { id: '1', type: 'commission', amount: 0.75, description: 'Monthly plan', created_at: '2026-04-01', paid_out_at: null },
      { id: '2', type: 'payout', amount: 10.00, description: 'Payout', created_at: '2026-04-10', paid_out_at: '2026-04-12' },
    ];
    require('../../api/client').getAffiliateTransactions.mockResolvedValue({ data: { data: mockTransactions } });
    render(<TransactionsTab />);
    expect(await screen.findByText('commission')).toBeInTheDocument();
    expect(screen.getByText('payout')).toBeInTheDocument();
  });
});
