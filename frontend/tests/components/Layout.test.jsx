/**
 * AhoyVPN Frontend — Layout Component Tests
 * =========================================
 * Tests for the shared Layout component (header, footer, floating support button).
 *
 * IMPORTANT: @testing-library/jest-dom matchers (toBeInTheDocument, toHaveAttribute,
 * toHaveTextContent, etc.) must be imported in each test file — they are NOT globally
 * available by default. This is a common gotcha with Jest + RTL.
 *
 * TESTING APPROACH:
 * - Layout wraps children in a header/footer structure
 * - It uses AuthContext to conditionally show navigation links
 * - We test rendering with different auth states (logged out, customer, affiliate, admin)
 * - We verify navigation links are present and correctly href'd
 * - We verify the floating support button links to mailto
 *
 * NOTES ON NEXT.JS LINK:
 * - Next.js <Link> renders an <a> tag inside itself
 * - Our mock returns a simple <a> tag, so the rendered output is <a><a>text</a></a>
 * - For href tests we use .closest('a') to get the OUTER-most <a>
 * - For text queries that have duplicates, we use getAllByText and target [0] (header)
 */
const React = require('react');
const { render, screen } = require('@testing-library/react');
// @testing-library/jest-dom provides toBeInTheDocument, toHaveAttribute, etc.
// These matchers are NOT automatically global — must be imported per-file
require('@testing-library/jest-dom');

// Mock AuthContext before importing Layout
// Layout imports { AuthContext } from '../pages/_app' — we need to intercept that import
// Note: React must be required inside the factory (jest.mock factories can't reference outer `React`)
jest.mock('../../pages/_app', () => {
  const React = require('react');
  return {
    AuthContext: React.createContext(null),
  };
});

const Layout = require('../../components/Layout').default;

describe('Layout Component', () => {
  /**
   * Helper: render Layout with a given auth state.
   * Provides a minimal AuthContext value that matches what _app.jsx supplies.
   * Note: React must be required inside to avoid jest.mock factory scoping rules.
   */
  function renderWithAuth(authValue) {
    const React = require('react');
    const { AuthContext } = jest.requireMock('../../pages/_app');
    return render(
      React.createElement(
        AuthContext.Provider,
        { value: authValue },
        React.createElement(
          Layout,
          null,
          React.createElement('div', { 'data-testid': 'page-content' }, 'Test Page Content')
        )
      )
    );
  }

  // -------------------------------------------------------------------------
  // Logged Out State
  // -------------------------------------------------------------------------
  describe('Logged Out — Header Navigation', () => {
    beforeEach(() => {
      renderWithAuth({ isLoggedIn: false });
    });

    it('shows Home link that points to /', () => {
      // Use getAllByRole('link') to find <a> elements, then check href
      const links = screen.getAllByRole('link');
      const homeLink = links.find(el => el.textContent === 'Home');
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('shows FAQ link that points to /faq', () => {
      const links = screen.getAllByRole('link');
      const faqLink = links.find(el => el.textContent === 'FAQ');
      expect(faqLink).toHaveAttribute('href', '/faq');
    });

    it('shows Downloads link that points to /downloads', () => {
      const links = screen.getAllByRole('link');
      const downloadsLink = links.find(el => el.textContent === 'Downloads');
      expect(downloadsLink).toHaveAttribute('href', '/downloads');
    });

    it('shows Privacy link that points to /privacy', () => {
      const links = screen.getAllByRole('link');
      const privacyLink = links.find(el => el.textContent === 'Privacy');
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });

    it('shows Terms link that points to /tos', () => {
      const links = screen.getAllByRole('link');
      const termsLink = links.find(el => el.textContent === 'Terms');
      expect(termsLink).toHaveAttribute('href', '/tos');
    });

    it('shows Login link that points to /login', () => {
      const links = screen.getAllByRole('link');
      const loginLink = links.find(el => el.textContent === 'Login');
      expect(loginLink).toHaveAttribute('href', '/login');
    });

    it('shows Get Started CTA button', () => {
      const ctaButton = screen.getAllByText('Get Started')[0];
      expect(ctaButton).toBeInTheDocument();
    });

    it('does NOT show Dashboard link when logged out', () => {
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });

    it('does NOT show Logout button when logged out', () => {
      expect(screen.queryByText('Logout')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Customer Logged In
  // -------------------------------------------------------------------------
  describe('Customer — Role-Based Navigation', () => {
    it('shows Dashboard link for customers', () => {
      renderWithAuth({ isLoggedIn: true, role: 'customer' });
      const links = screen.getAllByRole('link');
      const dashboardLink = links.find(el => el.textContent === 'Dashboard');
      expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    });

    it('shows Logout button for customers', () => {
      renderWithAuth({ isLoggedIn: true, role: 'customer' });
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    it('does NOT show Affiliate link for customers', () => {
      renderWithAuth({ isLoggedIn: true, role: 'customer' });
      expect(screen.queryByText('Affiliate')).not.toBeInTheDocument();
    });

    it('does NOT show Admin link for customers', () => {
      renderWithAuth({ isLoggedIn: true, role: 'customer' });
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Affiliate Logged In
  // -------------------------------------------------------------------------
  describe('Affiliate — Role-Based Navigation', () => {
    it('shows Affiliate link for affiliates', () => {
      renderWithAuth({ isLoggedIn: true, role: 'affiliate' });
      const links = screen.getAllByRole('link');
      const affiliateLink = links.find(el => el.textContent === 'Affiliate');
      expect(affiliateLink).toHaveAttribute('href', '/affiliate');
    });

    it('does NOT show Dashboard link for affiliates', () => {
      renderWithAuth({ isLoggedIn: true, role: 'affiliate' });
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });

    it('does NOT show Admin link for affiliates', () => {
      renderWithAuth({ isLoggedIn: true, role: 'affiliate' });
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Admin Logged In
  // -------------------------------------------------------------------------
  describe('Admin — Role-Based Navigation', () => {
    it('shows Admin link for admins', () => {
      renderWithAuth({ isLoggedIn: true, role: 'admin' });
      const links = screen.getAllByRole('link');
      const adminLink = links.find(el => el.textContent === 'Admin');
      expect(adminLink).toHaveAttribute('href', '/admin');
    });

    it('does NOT show Dashboard link for admins', () => {
      renderWithAuth({ isLoggedIn: true, role: 'admin' });
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });

    it('does NOT show Affiliate link for admins', () => {
      renderWithAuth({ isLoggedIn: true, role: 'admin' });
      // Note: Admin can see Affiliate link in nav but we check the role flag works
      // The admin role should NOT show the affiliate nav item
      expect(screen.queryByText('Affiliate')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Floating Support Button
  // -------------------------------------------------------------------------
  describe('Floating Support Button', () => {
    it('shows floating Contact Support button', () => {
      renderWithAuth({ isLoggedIn: false });
      // The floating button is the LAST Contact Support link (footer is earlier in DOM)
      const allSupport = screen.getAllByText('Contact Support');
      const floatingButton = allSupport[allSupport.length - 1];
      expect(floatingButton).toBeInTheDocument();
    });

    it('floating Contact Support is a mailto link to ahoyvpn@ahoyvpn.net', () => {
      renderWithAuth({ isLoggedIn: false });
      const allSupport = screen.getAllByText('Contact Support');
      const floatingButton = allSupport[allSupport.length - 1];
      expect(floatingButton.closest('a')).toHaveAttribute('href', 'mailto:ahoyvpn@ahoyvpn.net');
    });
  });

  // -------------------------------------------------------------------------
  // Footer
  // -------------------------------------------------------------------------
  describe('Footer', () => {
    beforeEach(() => {
      renderWithAuth({ isLoggedIn: false });
    });

    it('shows footer with AHOY VPN branding (footer heading, not logo)', () => {
      // Footer heading is an <h4>, header logo is in an <a>
      const footerHeading = document.querySelector('footer h4');
      expect(footerHeading).toHaveTextContent('AHOY VPN');
    });

    it('shows Terms of Service link in footer pointing to /tos', () => {
      const termsLink = document.querySelector('footer a[href="/tos"]');
      expect(termsLink).toHaveTextContent('Terms of Service');
    });

    it('shows Privacy Policy link in footer pointing to /privacy', () => {
      const privacyLink = document.querySelector('footer a[href="/privacy"]');
      expect(privacyLink).toHaveTextContent('Privacy Policy');
    });

    it('shows FAQ link in footer pointing to /faq', () => {
      // Footer <a> elements inside <nav> or footer section
      const footerFaqLink = document.querySelector('footer a[href="/faq"]');
      expect(footerFaqLink).toBeInTheDocument();
      expect(footerFaqLink).toHaveTextContent('FAQ');
    });

    it('shows footer support email link as mailto', () => {
      // Footer "Contact Support" is earlier in DOM than floating button
      const allSupport = screen.getAllByText('Contact Support');
      const footerSupport = allSupport[0];
      // The element IS the <a> from our mock, so toHaveAttribute directly
      expect(footerSupport).toHaveAttribute('href', 'mailto:ahoyvpn@ahoyvpn.net');
    });

    it('shows copyright notice', () => {
      expect(screen.getByText('© 2026 AHOY VPN. All rights reserved.')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Main Content Area
  // -------------------------------------------------------------------------
  describe('Main Content Area', () => {
    it('renders children inside the main element', () => {
      renderWithAuth({ isLoggedIn: false });
      expect(screen.getByTestId('page-content')).toBeInTheDocument();
      expect(screen.getByTestId('page-content')).toHaveTextContent('Test Page Content');
    });
  });

  // -------------------------------------------------------------------------
  // Logo
  // -------------------------------------------------------------------------
  describe('Logo', () => {
    it('renders logo with AHOY VPN text inside header', () => {
      renderWithAuth({ isLoggedIn: false });
      // The header logo <a> contains "AHOY VPN" text
      const logoLink = document.querySelector('header .ahoy-logoLink');
      expect(logoLink).toHaveTextContent('AHOY VPN');
    });

    it('logo links back to home page (href=/)', () => {
      renderWithAuth({ isLoggedIn: false });
      // The outer <a> in the header logo wrapper has href="/"
      // The header structure is: <a href="/"><a class="ahoy-logoLink">...AHOY VPN...</a></a>
      const outerLogoAnchor = document.querySelector('header a[href="/"]');
      expect(outerLogoAnchor).toBeInTheDocument();
      // The inner logo text element is inside the outer anchor
      expect(outerLogoAnchor).toHaveTextContent('AHOY VPN');
    });
  });
});
