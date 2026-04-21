/**
 * AhoyVPN Frontend — Payment Success Page Unit Tests
 * ==================================================
 * Tests the static payment-success page: heading, Card content,
 * Downloads/Account links, and overall rendering.
 *
 * WHY: payment-success.jsx is a critical post-payment landing page. If the
 * links break, customers don't know how to download the VPN client. Full
 * coverage ensures the success page guides users to next steps.
 */

import '@testing-library/jest-dom';
const React = require('react');
const { render, screen } = require('@testing-library/react');

const PaymentSuccess = require('../pages/payment-success.jsx').default;

describe('payment-success.jsx — Payment Success Page', () => {
  // ─── Page Heading ─────────────────────────────────────────────────────────────

  describe('page heading', () => {
    it('renders the main h1 heading', () => {
      render(<PaymentSuccess />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Payment Successful');
    });
  });

  // ─── Success Card Content ────────────────────────────────────────────────────

  describe('success card content', () => {
    it('renders the payment confirmation message', () => {
      render(<PaymentSuccess />);
      expect(screen.getByText(/payment has been received/i)).toBeInTheDocument();
    });

    it('mentions payment confirmation processing', () => {
      render(<PaymentSuccess />);
      expect(screen.getByText(/account will become active as soon as the payment confirmation is processed/i)).toBeInTheDocument();
    });

    it('renders the next steps heading', () => {
      render(<PaymentSuccess />);
      expect(screen.getByText('Next steps:')).toBeInTheDocument();
    });
  });

  // ─── Next Steps List ─────────────────────────────────────────────────────────

  describe('next steps list', () => {
    it('renders step 1 — visit downloads page', () => {
      render(<PaymentSuccess />);
      // "Downloads" appears in the page text — check the ordered list items
      const listItems = screen.getAllByRole('listitem');
      // Step 1: Visit the Downloads page
      expect(listItems[0]).toHaveTextContent(/downloads/i);
    });

    it('renders step 2 — download the client', () => {
      render(<PaymentSuccess />);
      expect(screen.getByText(/download the ahoy vpn client for your device/i)).toBeInTheDocument();
    });

    it('renders step 3 — sign in', () => {
      render(<PaymentSuccess />);
      expect(screen.getByText(/sign in using the same account number and password/i)).toBeInTheDocument();
    });

    it('renders dashboard reference', () => {
      render(<PaymentSuccess />);
      expect(screen.getByText(/subscription status on the/i)).toBeInTheDocument();
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    });
  });

  // ─── Links ───────────────────────────────────────────────────────────────────

  describe('navigation links', () => {
    it('renders downloads link pointing to /downloads', () => {
      render(<PaymentSuccess />);
      // The "Downloads" link appears inside the next steps list item
      const downloadsLinks = screen.getAllByRole('link', { name: /downloads/i });
      expect(downloadsLinks[0]).toHaveAttribute('href', '/downloads');
    });

    it('renders dashboard link pointing to /dashboard', () => {
      render(<PaymentSuccess />);
      const dashboardLinks = screen.getAllByRole('link', { name: /dashboard/i });
      expect(dashboardLinks[0]).toHaveAttribute('href', '/dashboard');
    });
  });
});
