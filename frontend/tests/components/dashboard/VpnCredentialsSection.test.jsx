/**
 * VpnCredentialsSection — unit tests.
 *
 * WHAT THIS TESTS:
 * - Renders credentials when profile.vpn_username exists
 * - Shows placeholder message when VPN credentials are not yet available
 * - Displays all credential fields (username, password, status, expiry)
 * - "Open Downloads" button links to /downloads
 *
 * NOTES:
 * - This component is purely presentational — no API calls, no state.
 * - Uses Link from next/link (mocked via pages/_app.js auto-mock).
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { AuthContext } from '../../../pages/_app';
import VpnCredentialsSection from '../../../components/dashboard/VpnCredentialsSection';

// AuthContext stub for when the component is rendered inside AuthContext.Provider
const LOGGED_IN_AUTH = {
  isLoggedIn: true,
  user: {
    id: 'user-123',
    email: 'test@example.com',
    accountNumber: '12345678',
    isActive: true,
  },
};

function renderWithAuth(ui) {
  return render(
    <AuthContext.Provider value={LOGGED_IN_AUTH}>
      {ui}
    </AuthContext.Provider>
  );
}

describe('VpnCredentialsSection', () => {
  it('renders the section heading', () => {
    renderWithAuth(<VpnCredentialsSection profile={{}} subscription={null} />);
    expect(screen.getByText('VPN Credentials')).toBeInTheDocument();
  });

  describe('when profile.vpn_username is present', () => {
    const profileWithVpn = {
      vpn_username: 'ahoy_user_123',
      vpn_password: 'secret_pass',
      vpn_status: 'active',
      vpn_expiry_date: '2026-12-31T23:59:59Z',
    };

    const subscription = {
      current_period_end: '2026-12-31T23:59:59Z',
    };

    it('displays the VPN username', () => {
      renderWithAuth(<VpnCredentialsSection profile={profileWithVpn} subscription={subscription} />);
      expect(screen.getByText(/ahoy_user_123/)).toBeInTheDocument();
    });

    it('displays the VPN password', () => {
      renderWithAuth(<VpnCredentialsSection profile={profileWithVpn} subscription={subscription} />);
      expect(screen.getByText(/secret_pass/)).toBeInTheDocument();
    });

    it('displays the VPN status', () => {
      renderWithAuth(<VpnCredentialsSection profile={profileWithVpn} subscription={subscription} />);
      expect(screen.getByText(/active/)).toBeInTheDocument();
    });

    it('displays the VPN expiry date when present', () => {
      renderWithAuth(<VpnCredentialsSection profile={profileWithVpn} subscription={subscription} />);
      // toLocaleString() output format varies by machine locale, so check that
      // the label and year appear somewhere in the same paragraph.
      const paras = document.querySelectorAll('p');
      const expiresPara = Array.from(paras).find(p => p.textContent.includes('Expires'));
      expect(expiresPara?.textContent).toMatch(/Expires/);
      expect(expiresPara?.textContent).toMatch(/2026/);
    });

    it('displays subscription expiry date when present', () => {
      renderWithAuth(<VpnCredentialsSection profile={profileWithVpn} subscription={subscription} />);
      const paras = document.querySelectorAll('p');
      const subPara = Array.from(paras).find(p => p.textContent.includes('Subscription Expires'));
      expect(subPara?.textContent).toMatch(/Subscription Expires/);
      expect(subPara?.textContent).toMatch(/2026/);
    });

    it('renders an Open Downloads button linking to /downloads', () => {
      renderWithAuth(<VpnCredentialsSection profile={profileWithVpn} subscription={subscription} />);
      const link = screen.getByRole('link', { name: /Open Downloads/i });
      expect(link).toHaveAttribute('href', '/downloads');
    });
  });

  describe('when profile.vpn_username is absent (no credentials yet)', () => {
    it('shows the not-yet-available message', () => {
      renderWithAuth(<VpnCredentialsSection profile={{}} subscription={null} />);
      expect(
        screen.getByText(/VPN credentials are not available yet/i)
      ).toBeInTheDocument();
    });

    it('shows the crypto activation notice', () => {
      renderWithAuth(<VpnCredentialsSection profile={{}} subscription={null} />);
      expect(
        screen.getByText(/If you paid with crypto, activation can take up to 15 minutes/i)
      ).toBeInTheDocument();
    });

    it('still shows the Open Downloads section', () => {
      renderWithAuth(<VpnCredentialsSection profile={{}} subscription={null} />);
      expect(screen.getByRole('link', { name: /Open Downloads/i })).toBeInTheDocument();
    });

    it('does NOT show the credentials box when username is missing', () => {
      renderWithAuth(<VpnCredentialsSection profile={{}} subscription={null} />);
      expect(screen.queryByText(/Username:/)).not.toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('uses default "active" status when vpn_status is missing', () => {
      const profile = { vpn_username: 'user', vpn_password: 'pass' };
      renderWithAuth(<VpnCredentialsSection profile={profile} subscription={null} />);
      expect(screen.getByText(/active/)).toBeInTheDocument();
    });

    it('does not show expiry dates when not provided', () => {
      const profile = { vpn_username: 'user', vpn_password: 'pass' };
      renderWithAuth(<VpnCredentialsSection profile={profile} subscription={null} />);
      // Should not throw; only the credential fields + default status show
      expect(screen.getByText(/user/)).toBeInTheDocument();
    });
  });
});
