/**
 * AhoyVPN Frontend — Affiliate Agreement Page Unit Tests
 * ======================================================
 * Tests the affiliate agreement page: all 9 sections rendered correctly,
 * commission table, links, email address, and section headings.
 *
 * WHY: affiliate-agreement.jsx is a legal/marketing page that defines the
 * affiliate program terms. Testing ensures the commission table, email links,
 * and section structure are intact. If the commission rates ever change,
 * these tests will catch broken table data.
 */

import '@testing-library/jest-dom';
const React = require('react');
const { render, screen } = require('@testing-library/react');

const AffiliateAgreement = require('../pages/affiliate-agreement.jsx').default;

describe('affiliate-agreement.jsx — Affiliate Agreement Page', () => {
  // ─── Page Header ─────────────────────────────────────────────────────────────

  describe('page header', () => {
    it('renders the main h1 heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AHOY VPN Affiliate Agreement');
    });

    it('renders the last updated date', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByText('Last updated: 04/04/26')).toBeInTheDocument();
    });
  });

  // ─── Section 1: Joining ─────────────────────────────────────────────────────

  describe('section 1 — Joining', () => {
    it('renders section 1 heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 2, name: '1. Joining is simple' })).toBeInTheDocument();
    });
  });

  // ─── Section 2: Your Job ────────────────────────────────────────────────────

  describe('section 2 — Your job', () => {
    it('renders section 2 heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 2, name: '2. Your job (and what not to do)' })).toBeInTheDocument();
    });

    it('renders prohibited activities list', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByText('Send spam (emails, comments, DMs, forums)')).toBeInTheDocument();
      expect(screen.getByText('Write fake reviews or lie about the service')).toBeInTheDocument();
      expect(screen.getByText('Pay people to sign up (cashback, rewards, etc.)')).toBeInTheDocument();
    });
  });

  // ─── Section 3: How You Make Money ─────────────────────────────────────────

  describe('section 3 — How you make money', () => {
    it('renders section 3 heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 2, name: '3. How you make money (recurring commissions)' })).toBeInTheDocument();
    });

    it('renders the recurring commission description', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByText(/you also get a commission every time that customer renews/i)).toBeInTheDocument();
    });

    it('renders cookie duration', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByText('Cookie lasts: 30 days.')).toBeInTheDocument();
    });
  });

  // ─── Section 4: Commission Rates ────────────────────────────────────────────

  describe('section 4 — Commission rates', () => {
    it('renders section 4 heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 2, name: '4. Commission rates (10% of every payment)' })).toBeInTheDocument();
    });

    it('renders the commission table with all plan rows', () => {
      render(<AffiliateAgreement />);
      // Table headings
      expect(screen.getByText('Plan')).toBeInTheDocument();
      expect(screen.getByText('Price')).toBeInTheDocument();
      expect(screen.getByText('Your cut per payment')).toBeInTheDocument();
      // Monthly row
      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.getByText('$5.99')).toBeInTheDocument();
      expect(screen.getByText('$0.60')).toBeInTheDocument();
      // Quarterly row
      expect(screen.getByText('Quarterly')).toBeInTheDocument();
      expect(screen.getByText('$16.99')).toBeInTheDocument();
      expect(screen.getByText('$1.70')).toBeInTheDocument();
      // Semi-Annual row
      expect(screen.getByText('Semi-Annual')).toBeInTheDocument();
      expect(screen.getByText('$31.99')).toBeInTheDocument();
      expect(screen.getByText('$3.20')).toBeInTheDocument();
      // Annual row
      expect(screen.getByText('Annual')).toBeInTheDocument();
      expect(screen.getByText('$59.99')).toBeInTheDocument();
      expect(screen.getByText('$6.00')).toBeInTheDocument();
    });

    it('renders commission calculation examples', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByText(/example – monthly customer/i)).toBeInTheDocument();
      expect(screen.getByText(/example – annual customer/i)).toBeInTheDocument();
    });
  });

  // ─── Section 5: Getting Paid ───────────────────────────────────────────────

  describe('section 5 — Getting paid', () => {
    it('renders section 5 heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 2, name: '5. Getting paid' })).toBeInTheDocument();
    });

    it('renders the minimum payout amount', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByText('Minimum payout: $50 (saves us both from tiny fees)')).toBeInTheDocument();
    });

    it('renders payout method (CashApp)', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByText(/we pay via: cashapp/i)).toBeInTheDocument();
    });
  });

  // ─── Section 6: Telegram ───────────────────────────────────────────────────

  describe('section 6 — Telegram', () => {
    it('renders section 6 heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 2, name: '6. Stay in the loop (Telegram)' })).toBeInTheDocument();
    });

    it('renders the AhoyVPN support email as a mailto link', () => {
      render(<AffiliateAgreement />);
      // Find mailto links — accessible name comes from aria-label or text content
      const emailLinks = screen.getAllByRole('link');
      const mailtoLinks = emailLinks.filter(l => l.getAttribute('href') === 'mailto:ahoyvpn@ahoyvpn.net');
      expect(mailtoLinks.length).toBeGreaterThan(0);
      expect(mailtoLinks[0]).toHaveAttribute('href', 'mailto:ahoyvpn@ahoyvpn.net');
    });
  });

  // ─── Section 7: Leaving ────────────────────────────────────────────────────

  describe('section 7 — Leaving', () => {
    it('renders section 7 heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 2, name: '7. Leaving or being removed' })).toBeInTheDocument();
    });
  });

  // ─── Section 8: Changes ─────────────────────────────────────────────────────

  describe('section 8 — Changes', () => {
    it('renders section 8 heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 2, name: '8. Changes to this agreement' })).toBeInTheDocument();
    });
  });

  // ─── Section 9: US Law ─────────────────────────────────────────────────────

  describe('section 9 — US Law', () => {
    it('renders section 9 heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 2, name: '9. US Law applies' })).toBeInTheDocument();
    });
  });

  // ─── Ready to Start ────────────────────────────────────────────────────────

  describe('ready to start section', () => {
    it('renders the ready to start heading', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByRole('heading', { level: 2, name: 'Ready to start?' })).toBeInTheDocument();
    });

    it('renders the affiliate dashboard benefit', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByText(/your affiliate dashboard/i)).toBeInTheDocument();
    });

    it('renders the Telegram invite benefit', () => {
      render(<AffiliateAgreement />);
      expect(screen.getByText(/invite to the telegram channel/i)).toBeInTheDocument();
    });

    it('renders closing message', () => {
      render(<AffiliateAgreement />);
      // Text uses Unicode right-single-quote U+2019 (') not ASCII apostrophe
      expect(screen.getByText(/\u2019s grow together/)).toBeInTheDocument();
    });
  });
});
