/**
 * AhoyVPN Frontend — AhoyMan Dashboard Integration Test
 * =====================================================
 * Verifies the Manager Dashboard page renders and composes with its extracted tab components.
 *
 * WHY THIS TEST:
 * - Acts as a smoke test for the ahoyman-dashboard page wiring
 * - Ensures the decomposition (extracting AffiliatesTab, PayoutsTab, etc.) didn't break the page
 * - Verifies tab navigation works correctly
 *
 * KEY MOCKS:
 * - next/router: provides useRouter hook (used for redirect on 401/403)
 * - api/client (default export): adminMetrics for dashboard metrics, ahoymanLogout
 *
 * NOTE: jest.mock calls are hoisted by Babel/Jest, so they execute before imports.
 * This lets us mock ../api/client before AhoyManDashboard is even loaded.
 */

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
    pathname: '/ahoyman-dashboard',
    query: {},
  }),
}));

jest.mock('../api/client', () => ({
  __esModule: true,
  default: {
    adminMetrics: jest.fn().mockResolvedValue({
      data: {
        data: {
          totalAffiliates: 42,
          activeAffiliates: 38,
          totalReferredCustomers: 215,
          activeReferrals: 187,
          totalCommissionsPaid: 5432.50,
          pendingPayouts: 1250.00,
          totalEarned: 12430.75,
        },
      },
    }),
    ahoymanLogout: jest.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import AhoyManDashboard from '../pages/ahoyman-dashboard';

describe('AhoyManDashboard', () => {
  test('renders the Manager Dashboard heading', async () => {
    render(<AhoyManDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Manager Dashboard')).toBeInTheDocument();
    });
  });

  test('renders all six metric cards with data', async () => {
    render(<AhoyManDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Affiliates')).toBeInTheDocument();
      expect(screen.getByText('Active Affiliates')).toBeInTheDocument();
      expect(screen.getByText('Total Referrals')).toBeInTheDocument();
      expect(screen.getByText('Pending Payouts')).toBeInTheDocument();
    });

    // Metric values from the mock data should be visible
    expect(screen.getByText('42')).toBeInTheDocument(); // Total Affiliates
    expect(screen.getByText('38')).toBeInTheDocument(); // Active Affiliates
  });

  test('renders all six tab buttons', async () => {
    render(<AhoyManDashboard />);

    await waitFor(() => screen.getByText('Manager Dashboard'));

    const tabNames = ['Overview', 'Affiliates', 'Codes', 'Payouts', 'Sales-tax', 'Settings'];
    for (const name of tabNames) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
  });

  test('shows overview card by default', async () => {
    render(<AhoyManDashboard />);

    await waitFor(() => screen.getByText('Manager Dashboard'));

    // The overview tab is shown by default — it contains getting started text
    expect(screen.getByText(/affiliates tab/i)).toBeInTheDocument();
  });

  test('switches to Affiliates tab when Affiliates button is clicked', async () => {
    render(<AhoyManDashboard />);

    await waitFor(() => screen.getByText('Manager Dashboard'));

    const affiliatesBtn = screen.getByRole('button', { name: /affiliates/i });
    await userEvent.click(affiliatesBtn);

    // Should render the AffiliatesTab heading
    await waitFor(() => {
      expect(screen.getByText('All Affiliates')).toBeInTheDocument();
    });
  });

  test('switches to Payouts tab when Payouts button is clicked', async () => {
    render(<AhoyManDashboard />);

    await waitFor(() => screen.getByText('Manager Dashboard'));

    const payoutsBtn = screen.getByRole('button', { name: /payouts/i });
    await userEvent.click(payoutsBtn);

    // PayoutsTab renders "Payout Requests" heading
    await waitFor(() => {
      expect(screen.getByText('Payout Requests')).toBeInTheDocument();
    });
  });

  test('switches to Settings tab when Settings button is clicked', async () => {
    render(<AhoyManDashboard />);

    await waitFor(() => screen.getByText('Manager Dashboard'));

    const settingsBtn = screen.getByRole('button', { name: /settings/i });
    await userEvent.click(settingsBtn);

    await waitFor(() => {
      expect(screen.getByText('System Settings')).toBeInTheDocument();
    });
  });

  test('renders Logout button', async () => {
    render(<AhoyManDashboard />);

    await waitFor(() => screen.getByText('Manager Dashboard'));

    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  test('metric card shows correct number format for currency values', async () => {
    render(<AhoyManDashboard />);

    await waitFor(() => screen.getByText('Manager Dashboard'));

    // Pending Payouts is $1,250.00
    expect(screen.getByText(/\$1,?250\.00/)).toBeInTheDocument();
  });
});
