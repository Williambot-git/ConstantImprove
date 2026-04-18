/**
 * AhoyVPN Frontend — index.jsx (Landing Page) Unit Tests
 * =======================================================
 * Tests the static marketing landing page: hero, features, plans, how-it-works, CTA banner.
 * The page is data-driven with hardcoded FEATURES, PLANS, STEPS arrays.
 * Uses text-based queries since the page uses inline styles and has no data-testid attributes.
 */
import '@testing-library/jest-dom';
const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event');

const Index = require('../pages/index.jsx').default;

describe('index.jsx — Landing Page', () => {
  // ---- Hero Section ----
  describe('Hero section', () => {
    it('renders the main h1 headline', () => {
      render(<Index />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/your internet/i);
    });

    it('renders hero eyebrow text', () => {
      render(<Index />);
      expect(screen.getByText(/privacy-first vpn/i)).toBeInTheDocument();
    });

    it('renders hero subtitle with pricing', () => {
      render(<Index />);
      expect(screen.getByText(/military-grade encryption/i)).toBeInTheDocument();
    });

    it('renders first "Get Started" CTA linking to /register (hero)', () => {
      render(<Index />);
      // There are 2 "Get Started" links — hero (first) and CTA banner (second)
      const links = screen.getAllByRole('link', { name: /get started/i });
      expect(links[0]).toHaveAttribute('href', '/register');
    });

    it('renders "How it works" CTA linking to /faq', () => {
      render(<Index />);
      expect(screen.getByRole('link', { name: /how it works/i })).toHaveAttribute('href', '/faq');
    });
  });

  // ---- Features Section ----
  describe('Features section', () => {
    it('renders "Built for privacy" section heading', () => {
      render(<Index />);
      expect(screen.getByRole('heading', { level: 2, name: /built for privacy/i })).toBeInTheDocument();
    });

    it('renders the Zero Logs feature', () => {
      render(<Index />);
      expect(screen.getByText('Zero Logs')).toBeInTheDocument();
      expect(screen.getByText(/never store your browsing activity/i)).toBeInTheDocument();
    });

    it('renders the Numeric Authentication feature', () => {
      render(<Index />);
      expect(screen.getByText('Numeric Authentication')).toBeInTheDocument();
      expect(screen.getByText(/no email required, no personal data collected/i)).toBeInTheDocument();
    });

    it('renders the 10 Simultaneous Connections feature', () => {
      render(<Index />);
      expect(screen.getByText('10 Simultaneous Connections')).toBeInTheDocument();
    });

    it('renders the Recovery Kits feature', () => {
      render(<Index />);
      expect(screen.getByText('Recovery Kits')).toBeInTheDocument();
      expect(screen.getByText(/self-custody account recovery/i)).toBeInTheDocument();
    });
  });

  // ---- Pricing Section ----
  describe('Pricing section', () => {
    it('renders "Simple pricing" section heading', () => {
      render(<Index />);
      expect(screen.getByRole('heading', { level: 2, name: /simple pricing/i })).toBeInTheDocument();
    });

    it('renders Monthly plan with correct price and period', () => {
      render(<Index />);
      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.getByText('$5.99')).toBeInTheDocument();
      expect(screen.getByText('/month')).toBeInTheDocument();
    });

    it('renders Quarterly plan with "Best value" badge', () => {
      render(<Index />);
      expect(screen.getByText('Quarterly')).toBeInTheDocument();
      expect(screen.getByText('$16.99')).toBeInTheDocument();
      expect(screen.getByText('/quarter')).toBeInTheDocument();
      expect(screen.getByText('Best value')).toBeInTheDocument();
    });

    it('renders both "Crypto only" badges (Semi-Annual and Annual)', () => {
      render(<Index />);
      const badges = screen.getAllByText('Crypto only');
      expect(badges).toHaveLength(2);
    });

    it('renders pricing note about card vs crypto payments', () => {
      render(<Index />);
      expect(screen.getByText(/card payments available for monthly and quarterly plans/i)).toBeInTheDocument();
    });
  });

  // ---- How It Works Section ----
  describe('How It Works section', () => {
    it('renders "Up and running in minutes" section heading', () => {
      render(<Index />);
      expect(screen.getByRole('heading', { level: 2, name: /up and running in minutes/i })).toBeInTheDocument();
    });

    it('renders step 01: Register', () => {
      render(<Index />);
      expect(screen.getByText('01')).toBeInTheDocument();
      expect(screen.getByText('Register')).toBeInTheDocument();
      expect(screen.getByText(/create an account with a numeric username/i)).toBeInTheDocument();
    });

    it('renders step 02: Subscribe', () => {
      render(<Index />);
      expect(screen.getByText('02')).toBeInTheDocument();
      expect(screen.getByText('Subscribe')).toBeInTheDocument();
      expect(screen.getByText(/choose a plan and pay securely/i)).toBeInTheDocument();
    });

    it('renders step 03: Connect', () => {
      render(<Index />);
      expect(screen.getByText('03')).toBeInTheDocument();
      expect(screen.getByText('Connect')).toBeInTheDocument();
      expect(screen.getByText(/download the client and connect/i)).toBeInTheDocument();
    });
  });

  // ---- CTA Banner ----
  describe('CTA Banner', () => {
    it('renders "Ready to take back your privacy?" heading', () => {
      render(<Index />);
      expect(screen.getByText(/ready to take back your privacy/i)).toBeInTheDocument();
    });

    it('renders CTA banner with Get Started button', () => {
      render(<Index />);
      // The CTA banner has a "Get Started" button (second occurrence — first is in hero)
      const buttons = screen.getAllByRole('link', { name: /get started/i });
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });
});
