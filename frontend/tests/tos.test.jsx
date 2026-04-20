/**
 * AhoyVPN Frontend — Terms of Service Page Unit Tests
 * ====================================================
 * Tests the Terms of Service page: all 9 sections rendered with correct titles
 * (no duplicate numbering), Section component behavior, email contact link.
 *
 * BUG FIX TESTED: Section numbers 6–8 were all mislabeled as "6" due to a
 * copy-paste error. "Affiliates" was "6", "Limitation of Liability" was also "6",
 * "Changes to Terms" was "7", "Contact Us" was "8". Fixed to 6, 7, 8, 9.
 */

import '@testing-library/jest-dom';
const React = require('react');
const { render, screen } = require('@testing-library/react');

const TermsOfService = require('../pages/tos.jsx').default;

describe('tos.jsx — Terms of Service Page', () => {
  // ─── Page Header ─────────────────────────────────────────────────────────────

  describe('page header', () => {
    it('renders the main h1 heading', () => {
      render(<TermsOfService />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Terms of Service');
    });

    it('renders the last updated date', () => {
      render(<TermsOfService />);
      expect(screen.getByText('Last updated: March 13, 2026')).toBeInTheDocument();
    });
  });

  // ─── Section 1: Acceptance of Terms ─────────────────────────────────────────

  describe('section 1 — Acceptance of Terms', () => {
    it('renders the section heading', () => {
      render(<TermsOfService />);
      expect(screen.getByRole('heading', { level: 3, name: '1. Acceptance of Terms' })).toBeInTheDocument();
    });

    it('renders the acceptance binding text', () => {
      render(<TermsOfService />);
      expect(screen.getByText(/accept and agree to be bound by the terms/i)).toBeInTheDocument();
    });
  });

  // ─── Section 2: Service Description ───────────────────────────────────────

  describe('section 2 — Service Description', () => {
    it('renders the section heading', () => {
      render(<TermsOfService />);
      expect(screen.getByRole('heading', { level: 3, name: '2. Service Description' })).toBeInTheDocument();
    });

    it('describes VPN encryption and IP masking', () => {
      render(<TermsOfService />);
      expect(screen.getByText(/encrypts your internet traffic/i)).toBeInTheDocument();
      expect(screen.getByText(/mask your IP address and location/i)).toBeInTheDocument();
    });
  });

  // ─── Section 3: User Responsibilities ───────────────────────────────────────

  describe('section 3 — User Responsibilities', () => {
    it('renders the section heading', () => {
      render(<TermsOfService />);
      expect(screen.getByRole('heading', { level: 3, name: '3. User Responsibilities' })).toBeInTheDocument();
    });

    it('lists all 6 user responsibility items', () => {
      render(<TermsOfService />);
      expect(screen.getByText(/maintaining the confidentiality.*numeric username and password/i)).toBeInTheDocument();
      expect(screen.getByText(/responsible for all activities.*occur under your account/i)).toBeInTheDocument();
      expect(screen.getByText(/not to use AHOY VPN for illegal activities/i)).toBeInTheDocument();
      expect(screen.getByText(/not to use AHOY VPN to harm, harass, or interfere/i)).toBeInTheDocument();
      expect(screen.getByText(/not to attempt to gain unauthorized access/i)).toBeInTheDocument();
      expect(screen.getByText(/not to share credentials.*with anyone else/i)).toBeInTheDocument();
    });
  });

  // ─── Section 4: Account Termination ────────────────────────────────────────

  describe('section 4 — Account Termination', () => {
    it('renders the section heading', () => {
      render(<TermsOfService />);
      expect(screen.getByRole('heading', { level: 3, name: '4. Account Termination' })).toBeInTheDocument();
    });

    it('describes right to terminate and forfeiture', () => {
      render(<TermsOfService />);
      expect(screen.getByText(/terminate any account.*violates these terms/i)).toBeInTheDocument();
      expect(screen.getByText(/forfeit any remaining subscription balance/i)).toBeInTheDocument();
    });
  });

  // ─── Section 5: Payment Terms ───────────────────────────────────────────────

  describe('section 5 — Payment Terms', () => {
    it('renders the section heading', () => {
      render(<TermsOfService />);
      expect(screen.getByRole('heading', { level: 3, name: '5. Payment Terms' })).toBeInTheDocument();
    });

    it('lists payment terms including no-refund policy', () => {
      render(<TermsOfService />);
      expect(screen.getByText(/redirected to their site to pay/i)).toBeInTheDocument();
      expect(screen.getByText(/Subscriptions renew automatically/i)).toBeInTheDocument();
      expect(screen.getByText(/All purchases are final/i)).toBeInTheDocument();
      expect(screen.getByText(/No refunds are to be issued/i)).toBeInTheDocument();
    });
  });

  // ─── Section 6: Affiliate Program & Cookies ─────────────────────────────────
  // NOTE: This was correctly numbered as "6" in the original file.

  describe('section 6 — Affiliate Program & Cookies', () => {
    it('renders the section heading', () => {
      render(<TermsOfService />);
      expect(screen.getByRole('heading', { level: 3, name: '6. Affiliate Program & Cookies' })).toBeInTheDocument();
    });

    it('describes the 30-day cookie expiration', () => {
      render(<TermsOfService />);
      expect(screen.getByText(/cookies to track affiliate referrals.*30-day/i)).toBeInTheDocument();
    });

    it('lists affiliate program rules', () => {
      render(<TermsOfService />);
      expect(screen.getByText(/Clicking an affiliate link sets a cookie/i)).toBeInTheDocument();
      expect(screen.getByText(/Affiliate earnings are calculated/i)).toBeInTheDocument();
      expect(screen.getByText(/clear cookies anytime through your browser/i)).toBeInTheDocument();
    });
  });

  // ─── Section 7: Limitation of Liability ─────────────────────────────────────
  // BUG FIX VERIFIED: This was mislabeled "6" before (duplicate with Affiliate Program).
  // Fixed to "7" as part of the sequential numbering fix.

  describe('section 7 — Limitation of Liability', () => {
    it('renders the section heading', () => {
      render(<TermsOfService />);
      expect(screen.getByRole('heading', { level: 3, name: '7. Limitation of Liability' })).toBeInTheDocument();
    });

    it('renders the AS IS disclaimer', () => {
      render(<TermsOfService />);
      expect(screen.getByText(/provided "AS IS".*without warranties.*express or implied/s)).toBeInTheDocument();
    });

    it('states no liability for damages', () => {
      render(<TermsOfService />);
      expect(screen.getByText(/no event shall AHOY VPN be liable.*damages/i)).toBeInTheDocument();
    });
  });

  // ─── Section 8: Changes to Terms ────────────────────────────────────────────
  // BUG FIX VERIFIED: This was mislabeled "7" before. Fixed to "8".

  describe('section 8 — Changes to Terms', () => {
    it('renders the section heading', () => {
      render(<TermsOfService />);
      expect(screen.getByRole('heading', { level: 3, name: '8. Changes to Terms' })).toBeInTheDocument();
    });

    it('describes the right to modify and effective date', () => {
      render(<TermsOfService />);
      const card = screen.getByRole('heading', { level: 3, name: '8. Changes to Terms' }).parentElement;
      // Use regex to match — handles any invisible unicode / whitespace variations
      // 'reserves' (with s) is correct in tos.jsx: "AHOY VPN reserves the right..."
      expect(card.textContent).toMatch(/reserves? the right to modify/i);
      expect(card.textContent).toMatch(/effective immediately/i);
    });
  });

  // ─── Section 9: Contact Us ───────────────────────────────────────────────────
  // BUG FIX VERIFIED: This was mislabeled "8" before. Fixed to "9".

  describe('section 9 — Contact Us', () => {
    it('renders the section heading', () => {
      render(<TermsOfService />);
      expect(screen.getByRole('heading', { level: 3, name: '9. Contact Us' })).toBeInTheDocument();
    });

    it('renders the contact email', () => {
      render(<TermsOfService />);
      // tos.jsx renders email as plain text in a <p> (not a mailto anchor)
      const card = screen.getByRole('heading', { level: 3, name: '9. Contact Us' }).parentElement;
      expect(card.textContent).toContain('ahoyvpn@ahoyvpn.net');
    });
  });

  // ─── Section Numbering Integrity ────────────────────────────────────────────
  // Ensures all 9 sections are present with unique sequential numbers.
  // This catches any future copy-paste duplication of section numbers.

  describe('section numbering integrity — no duplicate titles', () => {
    beforeEach(() => {
      render(<TermsOfService />);
    });

    it('has no duplicate h3 section headings', () => {
      const headings = screen.getAllByRole('heading', { level: 3 });
      const titles = headings.map(h => h.textContent);
      const uniqueTitles = new Set(titles);
      expect(uniqueTitles.size).toBe(titles.length);
    });

    it('renders all 9 section headings', () => {
      // tos.jsx uses h3 for section titles (via Card component) — there is no h2
      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings).toHaveLength(9);
    });

    it('section numbers are strictly sequential 1–9 with no gaps', () => {
      const headings = screen.getAllByRole('heading', { level: 3 });
      const sectionNumbers = headings.map(h => {
        const match = h.textContent.match(/^(\d+)\./);
        return match ? parseInt(match[1]) : null;
      });
      const numbers = sectionNumbers.filter(n => n !== null);
      expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });
});
