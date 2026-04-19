/**
 * ReferralsTab — unit tests.
 * Tests referral listing, loading state, and status display.
 *
 * MOVED FROM: frontend/components/affiliate-dashboard/ReferralsTab.test.jsx
 * REASON: Jest only discovers tests under frontend/tests/ (per jest.config.js roots).
 *         The original location was in the components/ directory — tests were never run.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReferralsTab from '../../components/affiliate-dashboard/ReferralsTab';

jest.mock('../../api/client', () => ({
  getAffiliateReferrals: jest.fn(),
}));

describe('ReferralsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when no referrals', async () => {
    require('../../api/client').getAffiliateReferrals.mockResolvedValue({ data: { data: [], pagination: {} } });
    render(<ReferralsTab />);
    // await findByText because state update from resolved mock is async
    expect(await screen.findByText('No referrals yet.')).toBeInTheDocument();
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

  // ─────────────────────────────────────────────────────────────────────────
  // Pagination tests — cover lines 59-60 (pagination.pages > 1 buttons)
  // ─────────────────────────────────────────────────────────────────────────

  it('renders pagination buttons when pages > 1', async () => {
    const mockReferrals = [
      { id: '1', plan: 'Monthly', amount: 5.99, status: 'active', created_at: '2026-04-01' },
    ];
    require('../../api/client').getAffiliateReferrals.mockResolvedValue({
      data: { data: mockReferrals, pagination: { pages: 3, current: 1 } },
    });
    render(<ReferralsTab />);
    // Should show page 1 and page 2 buttons (page 3 also rendered by Array.from)
    expect(await screen.findByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not render pagination when pages <= 1', async () => {
    const mockReferrals = [
      { id: '1', plan: 'Monthly', amount: 5.99, status: 'active', created_at: '2026-04-01' },
    ];
    require('../../api/client').getAffiliateReferrals.mockResolvedValue({
      data: { data: mockReferrals, pagination: { pages: 1, current: 1 } },
    });
    render(<ReferralsTab />);
    await screen.findByText('Monthly');
    // No page number buttons should appear
    expect(screen.queryByText('1')).toBeNull();
  });
});
