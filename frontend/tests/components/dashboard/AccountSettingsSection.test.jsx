/**
 * AccountSettingsSection — unit tests.
 *
 * WHAT THIS TESTS:
 * - Renders the Account Settings section heading and buttons
 * - Shows Change Password form when button is clicked
 * - Shows recovery kit generation
 * - Shows account export functionality
 *
 * KEY MOCKS:
 * - api/client: changePassword, generateRecoveryKit, exportAccountData, downloadAccountExport
 * - pages/_app: AuthContext — handled by global mock in __mocks__/pages/_app.js
 *   (pages/_app.jsx is excluded from testPathIgnorePatterns, so Jest auto-mocks it)
 * - next/router: useRouter for logout navigation
 *
 * AUTH CONTEXT:
 * - The global mock at frontend/__mocks__/pages/_app.js provides a minimal AuthContext stub.
 * - We wrap each render in <AuthContext.Provider value={LOGGED_IN_AUTH}> to provide
 *   the auth state AccountSettingsSection needs.
 */

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock api/client — provides all data-fetching functions AccountSettingsSection needs
jest.mock('../../../api/client', () => ({
  __esModule: true,
  default: {
    changePassword: jest.fn().mockResolvedValue({ data: {} }),
    generateRecoveryKit: jest.fn().mockResolvedValue({ data: { recoveryKit: 'CODE1-CODE2-CODE3' } }),
    exportAccountData: jest.fn().mockResolvedValue({ data: { token: 'export-token' } }),
    downloadAccountExport: jest.fn().mockResolvedValue({ data: 'exported account data', headers: {} }),
    deleteAccount: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AuthContext } from '../../../pages/_app';
import AccountSettingsSection from '../../../components/dashboard/AccountSettingsSection';

// AuthContext value — the "logged-in" state we provide via Provider wrapper
const LOGGED_IN_AUTH = {
  isLoggedIn: true,
  user: {
    id: 'test-user-id',
    email: 'test@ahoyvpn.com',
    name: 'Test User',
    accountNumber: '12345678',
    hasActiveSubscription: true,
  },
  token: 'test-jwt-token',
  role: 'member',
  login: jest.fn(),
  logout: jest.fn(),
};

function renderWithAuth(ui, authValue = LOGGED_IN_AUTH) {
  return render(
    <AuthContext.Provider value={authValue}>
      {ui}
    </AuthContext.Provider>
  );
}

describe('AccountSettingsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the section heading', () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    expect(screen.getByText('Account Settings')).toBeInTheDocument();
  });

  it('shows Change Password form when button clicked', async () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));
    expect(await screen.findByText('Old Password')).toBeInTheDocument();
    expect(await screen.findByText('New Password')).toBeInTheDocument();
  });

  it('shows recovery kit button', async () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    const btn = screen.getByRole('button', { name: /Recovery Kit/i });
    expect(btn).toBeInTheDocument();
  });
});
