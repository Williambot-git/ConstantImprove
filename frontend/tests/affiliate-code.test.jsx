/**
 * affiliate-code.test.jsx
 *
 * Unit tests for frontend/pages/affiliate/[code].jsx — the affiliate redirect
 * page that reads an affiliate code from the URL, sets a cookie, and redirects
 * to the homepage.
 *
 * WHY: This is a security-critical entry point for the affiliate funnel. If the
 * cookie-setting logic breaks, affiliates can't earn commissions on referred
 * users. The page also handles a 500ms delay UX pattern that needs verification.
 *
 * Test coverage:
 *   - Renders loading state with spinner animation
 *   - Calls checkAndSetAffiliateFromUrl when code is present
 *   - Redirects to / after 500ms when code is present
 *   - Skips effect when code is absent (no redirect)
 *   - Shows proper heading and subtitle text
 *   - Skeleton: shows "Setting up affiliate tracking..." message
 */

import '@testing-library/jest-dom';
const React = require('react');
const { render, screen } = require('@testing-library/react');

// --- Mock next/router ---
let mockPush = jest.fn();
let mockCode = 'TESTAFFILIATE';

jest.mock('next/router', () => ({
  useRouter: () => ({
    query: { code: mockCode },
    push: mockPush,
  }),
}));

// --- Mock cookies lib ---
let checkAndSetAffiliateFromUrlCalled = false;

jest.mock('../lib/cookies', () => ({
  checkAndSetAffiliateFromUrl: jest.fn(() => {
    checkAndSetAffiliateFromUrlCalled = true;
    return mockCode;
  }),
}));

// --- Mock setTimeout for the redirect delay ---
// We need to advance timers to trigger the router.push call
let originalSetTimeout = global.setTimeout;
let pendingTimers = [];

beforeEach(() => {
  mockPush = jest.fn();
  checkAndSetAffiliateFromUrlCalled = false;
  pendingTimers = [];
  // Intercept setTimeout to capture timer IDs
  global.setTimeout = jest.fn((fn, delay) => {
    const id = originalSetTimeout(fn, delay);
    pendingTimers.push({ id, delay, fn });
    return id;
  });
});

afterEach(() => {
  global.setTimeout = originalSetTimeout;
  jest.restoreAllMocks();
});

// --- Import component AFTER mocks are set up ---
let AffiliateRedirect;

beforeAll(async () => {
  const mod = await import('../pages/affiliate/[code].jsx');
  AffiliateRedirect = mod.default;
});

describe('affiliate/[code].jsx — affiliate redirect page', () => {
  describe('Rendering', () => {
    it('renders the affiliate redirect page heading', () => {
      render(<AffiliateRedirect />);
      expect(screen.getByText(/ahoy vpn affiliate redirect/i)).toBeInTheDocument();
    });

    it('renders the subtitle message', () => {
      render(<AffiliateRedirect />);
      expect(screen.getByText(/setting up affiliate tracking/i)).toBeInTheDocument();
    });

    it('renders a spinner element', () => {
      render(<AffiliateRedirect />);
      // The spinner is a div with border and border-radius (CSS animation)
      // We look for an element that is a div child of the main container
      const container = screen.getByText(/ahoy vpn affiliate redirect/i).parentElement;
      expect(container.querySelector('div')).not.toBeNull();
    });
  });

  describe('Affiliate code handling', () => {
    it('calls checkAndSetAffiliateFromUrl when code is present', () => {
      render(<AffiliateRedirect />);
      expect(checkAndSetAffiliateFromUrlCalled).toBe(true);
    });
  });

  describe('Redirect behavior', () => {
    it('does NOT redirect immediately (redirect is delayed by 500ms)', () => {
      render(<AffiliateRedirect />);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('schedules a redirect to / after 500ms when code is present', async () => {
      render(<AffiliateRedirect />);

      // Find the setTimeout call with 500ms delay
      expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 500);

      // Get the pending timer callback
      const timerEntry = pendingTimers.find(t => t.delay === 500);
      expect(timerEntry).toBeDefined();

      // Fire the timer
      await timerEntry.fn();

      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  describe('Edge cases', () => {
    it('skips affiliate cookie logic when code is not present', () => {
      // Override mockCode for this test
      const originalCode = mockCode;
      mockCode = undefined;

      // Need to re-import to pick up new mock value
      // Since mocks are set up at top, we just test that the current code-less render
      // doesn't call checkAndSetAffiliateFromUrl with a valid code
      const { rerender } = render(<AffiliateRedirect />);
      expect(checkAndSetAffiliateFromUrlCalled).toBe(false);

      mockCode = originalCode;
    });

    it('still renders the page structure when code is missing', () => {
      mockCode = undefined;
      const { rerender } = render(<AffiliateRedirect />);
      // Page still renders even without a code
      expect(screen.getByText(/ahoy vpn affiliate redirect/i)).toBeInTheDocument();
      mockCode = 'TESTAFFILIATE'; // restore
    });
  });
});
