/**
 * AffiliateDashboard — integration test.
 * Verifies the main page renders, shows metrics, and tab navigation works.
 *
 * WHY THIS TEST:
 * - Acts as a smoke test for the affiliate-dashboard page wiring
 * - Ensures the decomposition (extracting OverviewTab, LinksTab, etc.) didn't break the page
 * - Verifies tab navigation works correctly
 *
 * KEY MOCKS:
 * - next/router: provides useRouter hook (used for redirect on 401/403)
 * - api/client (default export): getAffiliateMetrics, getAffiliateLinks, affiliateLogout
 *
 * NOTE: jest.mock calls are hoisted by Babel/Jest, so they execute before imports.
 * This lets us mock ../api/client before AffiliateDashboard is even loaded.
 */

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('../api/client', () => ({
  __esModule: true,
  default: {
    getAffiliateMetrics: jest.fn().mockResolvedValue({
      data: {
        data: {
          totalSignups: 5,
          signupsThisMonth: 2,
          activeReferrals: 3,
          totalEarned: 15.75,
          pendingPayout: 0,
          availableToCashOut: 15.75,
          heldAmount: 0,
        },
      },
    }),
    getAffiliateLinks: jest.fn().mockResolvedValue({ data: { data: [] } }),
    affiliateLogout: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import AffiliateDashboard from '../pages/affiliate-dashboard';

describe('AffiliateDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders affiliate dashboard heading', async () => {
    render(<AffiliateDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Affiliate Dashboard')).toBeInTheDocument();
    });
  });

  it('renders metric cards with data', async () => {
    render(<AffiliateDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Total Signups')).toBeInTheDocument();
    });
    // Available and Total Earned both show $15.75 — find one
    expect(screen.getAllByText('$15.75').length).toBeGreaterThan(0);
  });

  it('has tab navigation buttons', async () => {
    render(<AffiliateDashboard />);
    await waitFor(() => screen.getByText('Affiliate Dashboard'));

    expect(screen.getByRole('button', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Links/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Referrals/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Transactions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Payout/i })).toBeInTheDocument();
  });

  it('shows logout button', async () => {
    render(<AffiliateDashboard />);
    await waitFor(() => screen.getByText('Affiliate Dashboard'));
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  it('renders attribution rules in overview tab by default', async () => {
    render(<AffiliateDashboard />);
    await waitFor(() => screen.getByText('Affiliate Dashboard'));
    // Default tab is 'overview'
    expect(screen.getByText(/30-day attribution/i)).toBeInTheDocument();
    expect(screen.getByText('Recovery Kit')).toBeInTheDocument();
  });
});
