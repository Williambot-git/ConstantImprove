/**
 * ReferralsTab — unit tests.
 */
import { render, screen } from '@testing-library/react';
import ReferralsTab from './ReferralsTab';

jest.mock('../../api/client', () => ({
  getAffiliateReferrals: jest.fn(),
}));

describe('ReferralsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders referrals tab heading', () => {
    require('../../api/client').getAffiliateReferrals.mockResolvedValue({ data: { data: [], pagination: {} } });
    render(<ReferralsTab />);
    // The component shows "No referrals yet." when empty
    expect(screen.getByText('No referrals yet.')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    require('../../api/client').getAffiliateReferrals.mockImplementation(() => new Promise(() => {}));
    render(<ReferralsTab />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders referral table with data', async () => {
    const mockReferrals = [
      { id: '1', plan: 'Monthly', amount: 5.99, status: 'active', created_at: '2026-04-01' },
    ];
    require('../../api/client').getAffiliateReferrals.mockResolvedValue({ data: { data: mockReferrals, pagination: {} } });
    render(<ReferralsTab />);
    expect(await screen.findByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('$5.99')).toBeInTheDocument();
  });

  it('shows active status in green, pending in yellow', async () => {
    const mockReferrals = [
      { id: '1', plan: 'Monthly', amount: 5.99, status: 'active', created_at: '2026-04-01' },
      { id: '2', plan: 'Annual', amount: 59.99, status: 'pending', created_at: '2026-04-02' },
    ];
    require('../../api/client').getAffiliateReferrals.mockResolvedValue({ data: { data: mockReferrals, pagination: {} } });
    render(<ReferralsTab />);
    const activeSpan = await screen.findByText('active');
    expect(activeSpan).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });
});
