/**
 * Dashboard — integration test.
 * Verifies the main customer dashboard page renders all sections correctly.
 *
 * WHY THIS TEST:
 * - Acts as a smoke test for the dashboard page wiring
 * - Ensures the decomposition (extracting SubscriptionSection, AccountSettingsSection,
 *   VpnCredentialsSection, CancelModal, DeleteModal) didn't break the page
 * - Verifies all three sections render and respond to auth state
 *
 * KEY MOCKS:
 * - next/router: provides useRouter hook (used for redirect on logout)
 * - api/client (default export): getUser, getSubscription, cancelSubscription, deleteAccount
 * - pages/_app (auto-mocked via __mocks__/pages/_app.js): AuthContext
 *
 * AUTH CONTEXT MOCKING:
 * - pages/_app.jsx is excluded from Jest's test path (testPathIgnorePatterns: ['/pages/_']).
 * - The __mocks__/pages/_app.js file provides a minimal AuthContext stub.
 * - We wrap each render in <AuthContext.Provider value={LOGGED_IN_AUTH}> to
 *   provide the auth state Dashboard needs.
 */

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock api/client — provides all data-fetching functions Dashboard needs
jest.mock('../api/client', () => ({
  __esModule: true,
  default: {
    getUser: jest.fn().mockResolvedValue({
      data: {
        data: {
          account_number: '12345678',
          is_active: true,
          vpn_username: 'testuser',
          vpn_password: 'testpass',
          vpn_status: 'active',
        },
      },
    }),
    getSubscription: jest.fn().mockResolvedValue({
      data: {
        data: {
          planName: 'Monthly',
          status: 'active',
          nextBilling: '2026-05-16',
          current_period_end: '2026-05-16',
        },
      },
    }),
    changePassword: jest.fn().mockResolvedValue({ data: {} }),
    generateRecoveryKit: jest.fn().mockResolvedValue({ data: { recoveryKit: 'CODE1-CODE2-CODE3' } }),
    exportAccountData: jest.fn().mockResolvedValue({ data: { token: 'export-token' } }),
    downloadAccountExport: jest.fn().mockResolvedValue({ data: 'export data', headers: {} }),
    cancelSubscription: jest.fn().mockResolvedValue({ data: {} }),
    deleteAccount: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AuthContext } from '../pages/_app';
import Dashboard from '../pages/dashboard';

// ---------------------------------------------------------------------------
// Auth state — the "logged-in" value we provide via AuthContext.Provider
// ---------------------------------------------------------------------------
const LOGGED_IN_AUTH = {
  isLoggedIn: true,
  user: {
    id: 'test-user-id',
    email: 'test@ahoyvpn.com',
    name: 'Test User',
    hasActiveSubscription: true,
    subscriptionPlan: 'premium',
  },
  token: 'test-jwt-token',
  role: 'member',
  login: jest.fn(),
  logout: jest.fn(),
};

// ---------------------------------------------------------------------------
// renderWithAuth — wraps Dashboard in AuthContext.Provider
// ---------------------------------------------------------------------------
function renderWithAuth(ui, authValue = LOGGED_IN_AUTH) {
  return render(
    <AuthContext.Provider value={authValue}>
      {ui}
    </AuthContext.Provider>
  );
}

describe('Dashboard Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dashboard title when logged in', async () => {
    renderWithAuth(<Dashboard />);
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('renders subscription section when logged in', async () => {
    renderWithAuth(<Dashboard />);
    expect(await screen.findByText('Subscription Status')).toBeInTheDocument();
  });

  it('renders account settings section when logged in', async () => {
    renderWithAuth(<Dashboard />);
    expect(await screen.findByText('Account Settings')).toBeInTheDocument();
  });

  it('renders VPN credentials section when logged in', async () => {
    renderWithAuth(<Dashboard />);
    expect(await screen.findByText('VPN Credentials')).toBeInTheDocument();
  });

  it('shows cancel modal when Cancel Subscription clicked', async () => {
    renderWithAuth(<Dashboard />);
    await screen.findByText('Subscription Status');
    await userEvent.click(screen.getByRole('button', { name: /Cancel Subscription/i }));
    expect(await screen.findByText('Are you sure you want to cancel your subscription?')).toBeInTheDocument();
  });

  it('shows delete modal when Delete Account clicked', async () => {
    renderWithAuth(<Dashboard />);
    await screen.findByText('Account Settings');
    await userEvent.click(screen.getByRole('button', { name: /Delete Account/i }));
    expect(await screen.findByText(/delete your account/i)).toBeInTheDocument();
  });

  it('shows Change Password form when button clicked', async () => {
    renderWithAuth(<Dashboard />);
    await screen.findByText('Account Settings');
    await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));
    expect(await screen.findByText('Old Password')).toBeInTheDocument();
    expect(await screen.findByText('New Password')).toBeInTheDocument();
  });
});
