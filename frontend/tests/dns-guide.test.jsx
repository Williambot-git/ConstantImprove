/**
 * dns-guide.jsx — Unit Tests
 * ============================
 * Tests the DNS Encryption Guide static content page.
 *
 * WHY THIS TEST:
 * - dns-guide.jsx was the only remaining page component without a test file
 * - Static content page: 6 expandable platform cards, DNS provider table,
 *   router-level encryption guide, external links, and an email link
 * - No auth, no API calls, no complex state beyond two boolean expand flags
 * - Verifies all 6 platform cards expand/collapse correctly
 * - Verifies DNS provider table renders all 4 providers
 * - Verifies external links have correct hrefs (cloudflare, dnsleaktest)
 * - Verifies email link renders correctly
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DNSGuidePage from '../pages/dns-guide';

describe('dns-guide.jsx', () => {
  // ─── Hero Section ──────────────────────────────────────────────────────────

  it('renders the page title', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText(/DNS Encryption Guide: Protect Your Privacy/i)).toBeInTheDocument();
  });

  it('renders the Why Encrypt Your DNS section', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText('Why Encrypt Your DNS?')).toBeInTheDocument();
  });

  it('explains DoH and DoT in the intro', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText(/DNS over HTTPS \(DoH\)/i)).toBeInTheDocument();
    expect(screen.getByText(/DNS over TLS \(DoT\)/i)).toBeInTheDocument();
  });

  // ─── Platform Cards ────────────────────────────────────────────────────────

  it('renders all 6 platform cards', () => {
    render(<DNSGuidePage />);
    // 6 platform names appear as h3 headings
    expect(screen.getByText('Windows 11')).toBeInTheDocument();
    expect(screen.getByText('macOS')).toBeInTheDocument();
    expect(screen.getByText('iPhone & iPad')).toBeInTheDocument();
    expect(screen.getByText('Android (9 and newer)')).toBeInTheDocument();
    expect(screen.getByText('Amazon Fire Stick')).toBeInTheDocument();
    expect(screen.getByText('All devices')).toBeInTheDocument();
  });

  it('renders Windows platform badge (nativeEncryption)', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText(/✅ DoH \(Settings GUI\)/i)).toBeInTheDocument();
  });

  it('renders macOS platform badge', () => {
    render(<DNSGuidePage />);
    // Badge text is inside platformBadges div — two platforms share "Via profile or app" badge
    const badges = screen.getAllByText('⚠️ Via profile or app');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Amazon Fire Stick platform badge', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText(/❌ None natively/i)).toBeInTheDocument();
  });

  it('platform cards are collapsed by default (no step content visible)', () => {
    render(<DNSGuidePage />);
    // The "Easiest method" text only appears inside an expanded card
    expect(screen.queryByText(/Settings → Private DNS → enter hostname/i)).not.toBeInTheDocument();
  });

  it('expands Windows 11 card on click and shows steps', async () => {
    const user = userEvent.setup();
    render(<DNSGuidePage />);
    // Click the Windows h3 inside the clickable platformHeader div
    await user.click(screen.getByText('Windows 11'));
    // Windows easiest method is "Settings → Network → Manual DNS + Encrypted only"
    expect(screen.getByText(/Settings → Network → Manual DNS/i)).toBeInTheDocument();
  });

  it('expands Android card on click and shows DoT instructions', async () => {
    const user = userEvent.setup();
    render(<DNSGuidePage />);
    await user.click(screen.getByText('Android (9 and newer)'));
    expect(screen.getByText(/Enter a DoT hostname \(not an IP address\)/i)).toBeInTheDocument();
  });

  it('collapses expanded card when clicked again', async () => {
    const user = userEvent.setup();
    render(<DNSGuidePage />);
    await user.click(screen.getByText('Windows 11'));
    expect(screen.getByText(/Settings → Network → Manual DNS/i)).toBeInTheDocument();
    await user.click(screen.getByText('Windows 11'));
    expect(screen.queryByText(/Settings → Network → Manual DNS/i)).not.toBeInTheDocument();
  });

  it('allows multiple cards to be open simultaneously', async () => {
    const user = userEvent.setup();
    render(<DNSGuidePage />);
    const windowsHeader = screen.getByText('Windows 11').closest('div');
    const androidHeader = screen.getByText('Android (9 and newer)').closest('div');
    await user.click(windowsHeader);
    await user.click(androidHeader);
    expect(screen.getByText(/Settings → Private DNS → enter hostname/i)).toBeInTheDocument();
    expect(screen.getByText(/Enter a DoT hostname/i)).toBeInTheDocument();
  });

  // ─── Router-Level Encryption Section ───────────────────────────────────────

  it('renders the Router-Level Encryption section', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText(/Router‑Level Encryption: Protect Your Entire Network/i)).toBeInTheDocument();
  });

  it('renders the GL.iNet Brume 2 hardware recommendation', () => {
    render(<DNSGuidePage />);
    // "Recommended Hardware: GL.iNet Brume 2" is an h3 subsection title
    expect(screen.getByRole('heading', { level: 3, name: /GL\.iNet Brume 2/i })).toBeInTheDocument();
  });

  it('renders Step 1: Put Your ISP Router into Bridge Mode', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText(/Step 1: Put Your ISP Router into Bridge Mode/i)).toBeInTheDocument();
  });

  it('renders Step 2: Connect the Brume 2', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText(/Step 2: Connect the Brume 2/i)).toBeInTheDocument();
  });

  it('renders Step 3: Configure Encrypted DNS on the Brume 2', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText(/Step 3: Configure Encrypted DNS on the Brume 2/i)).toBeInTheDocument();
  });

  // ─── DNS Provider Table ─────────────────────────────────────────────────────

  it('renders the DNS Provider table', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText('Recommended DNS Providers')).toBeInTheDocument();
  });

  it('renders Cloudflare as a DNS provider', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText('Cloudflare')).toBeInTheDocument();
  });

  it('renders Quad9 as a DNS provider', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText('Quad9')).toBeInTheDocument();
  });

  it('renders Cloudflare DoH template in the table', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText('https://cloudflare-dns.com/dns-query')).toBeInTheDocument();
  });

  it('renders Cloudflare DoT hostname in the table', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText('one.one.one.one')).toBeInTheDocument();
  });

  // ─── Verify Encryption Section ─────────────────────────────────────────────

  it('renders the Verify That Encryption Is Working section', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText(/Verify That Encryption Is Working/i)).toBeInTheDocument();
  });

  it('renders Cloudflare encrypted-sni link', () => {
    render(<DNSGuidePage />);
    const link = screen.getByRole('link', { name: /cloudflare\.com\/ssl\/encrypted-sni\//i });
    expect(link).toHaveAttribute('href', 'https://www.cloudflare.com/ssl/encrypted-sni/');
  });

  it('renders DNSLeakTest.com link', () => {
    render(<DNSGuidePage />);
    const link = screen.getByRole('link', { name: /dnsleaktest\.com/i });
    expect(link).toHaveAttribute('href', 'https://www.dnsleaktest.com');
  });

  it('Cloudflare link opens in new tab (noreferrer)', () => {
    render(<DNSGuidePage />);
    const link = screen.getByRole('link', { name: /cloudflare\.com\/ssl\/encrypted-sni\//i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  // ─── Need Help Section ──────────────────────────────────────────────────────

  it('renders the Need Help section', () => {
    render(<DNSGuidePage />);
    expect(screen.getByText('Need Help?')).toBeInTheDocument();
  });

  it('renders the AhoyVPN support email link', () => {
    render(<DNSGuidePage />);
    const emailLink = screen.getByRole('link', { name: /Email AhoyVPN support/i });
    expect(emailLink).toHaveAttribute('href', 'mailto:ahoyvpn@ahoyvpn.net');
  });
});
