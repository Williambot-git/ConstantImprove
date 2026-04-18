/**
 * downloads.jsx — Unit Tests
 * ==========================
 * Tests the VPN client download page (platforms: Windows, macOS, Android, iOS, Firestick).
 *
 * WHY THIS TEST:
 * - Static content page with DOWNLOADS constant array
 * - No auth, no API calls, no complex state
 * - Smoke test ensures page renders all 5 platforms
 * - First line of coverage for this 188-line page
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import DownloadsPage from '../pages/downloads';

describe('downloads.jsx', () => {
  it('renders page title and hero section', () => {
    render(<DownloadsPage />);
    expect(screen.getByText(/Get VPN Client on Every Platform/i)).toBeInTheDocument();
    expect(screen.getByText(/Download VPN Client/i)).toBeInTheDocument();
  });

  it('renders all 5 platform download cards', () => {
    render(<DownloadsPage />);
    // Platform name is in an h3 element inside each Card.
    // There are 6 h3 elements total: 5 for platforms + 1 for "Want a router config?"
    // Filter to only the h3 elements whose text includes an emoji (🪟🍎🤖📺).
    const headings = screen.getAllByRole('heading', { level: 3 });
    const platformNames = headings.map(h => h.textContent).filter(t => /[🪟🍎🤖📺]/.test(t));
    expect(platformNames).toContain('🪟 Windows');
    expect(platformNames).toContain('🍎 macOS');
    expect(platformNames).toContain('🤖 Android');
    expect(platformNames).toContain('📺 Firestick & Android TV');
    expect(platformNames).toContain('🍎 iPhone');
    expect(platformNames.length).toBe(5);
  });

  it('renders download button text for each platform', () => {
    render(<DownloadsPage />);
    // Each button text appears once
    expect(screen.getByText('Download .exe')).toBeInTheDocument();
    expect(screen.getByText('Download .dmg')).toBeInTheDocument();
    expect(screen.getByText('View on Google Play')).toBeInTheDocument();
    expect(screen.getByText('Download APK')).toBeInTheDocument();
    expect(screen.getByText('View on App Store')).toBeInTheDocument();
  });

  it('renders correct href links for each platform', () => {
    render(<DownloadsPage />);
    const links = screen.getAllByRole('link');
    const hrefs = links.map(l => l.getAttribute('href'));
    expect(hrefs).toContain('https://vpnclient.app/current/vpnclient/vpnclient.exe');
    expect(hrefs).toContain('https://vpnclient.app/current/vpnclient/vpnclient.dmg');
    expect(hrefs).toContain('https://play.google.com/store/apps/details?id=com.vpn.client');
    expect(hrefs).toContain('https://vpnclient.app/apk/VPNClient-TV.apk');
    expect(hrefs).toContain('https://apps.apple.com/us/app/vpnclient-secured-vpn/id1506797696');
  });

  it('renders platform detail lists', () => {
    render(<DownloadsPage />);
    // Windows detail — "Automatic updates" appears in the details list
    expect(screen.getAllByText(/Automatic updates/i).length).toBeGreaterThan(0);
    // macOS detail — "Apple silicon & Intel" (note the ampersand)
    expect(screen.getByText(/Apple silicon & Intel/i)).toBeInTheDocument();
    // Android details — "Google Play Store" appears twice (description + details)
    expect(screen.getAllByText(/Google Play Store/i).length).toBeGreaterThan(0);
  });

  it('renders help note at bottom', () => {
    render(<DownloadsPage />);
    expect(screen.getByText(/Need help with installation\?/i)).toBeInTheDocument();
  });
});
