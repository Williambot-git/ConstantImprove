/**
 * Head Component Unit Tests
 * ==========================
 * Tests for the shared Head component — a thin wrapper around Next.js Head
 * that provides SEO metadata from lib/seo.js.
 *
 * IMPORTANT: @testing-library/jest-dom matchers must be imported per file.
 */
const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');

// Mock next/head — renders its children directly so we can inspect the output
jest.mock('next/head', () => {
  return function MockHead({ children }) {
    // In jsdom, this just renders children so RTL can query them
    return <>{children}</>;
  };
});

// Mock lib/seo — controls what getPageMeta and defaultMeta return
// We spy on the actual module so tests can override the return value per-case
jest.mock('../../lib/seo');

const { getPageMeta, defaultMeta } = require('../../lib/seo');
const Head = require('../../components/Head').default;

describe('Head Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Renders correct title tag
  // -------------------------------------------------------------------------
  describe('Title tag', () => {
    it('uses page title from seo metadata when page prop is provided', () => {
      getPageMeta.mockReturnValue({
        title: 'Checkout - AHOY VPN',
        description: 'Complete your purchase',
        keywords: 'checkout, purchase'
      });

      render(<Head page="checkout" />);

      // <title> is a special element that get.querySelector('title') finds
      const titleEl = document.querySelector('title');
      expect(titleEl).toBeInTheDocument();
      expect(titleEl.textContent).toBe('Checkout - AHOY VPN');
    });

    it('ignores title prop when page prop is also provided (page metadata wins)', () => {
      // Head component uses page metadata when page is provided, ignoring title/description props.
      // This is by design — the page key drives the SEO metadata, manual overrides only work alone.
      getPageMeta.mockReturnValue({
        title: 'Checkout - AHOY VPN',
        description: 'Complete your purchase'
      });

      render(<Head page="checkout" title="Custom Title" />);

      const titleEl = document.querySelector('title');
      expect(titleEl.textContent).toBe('Checkout - AHOY VPN');
    });

    it('uses override title when no page prop is given', () => {
      getPageMeta.mockReturnValue({});

      render(<Head title="Override Only" />);

      const titleEl = document.querySelector('title');
      expect(titleEl.textContent).toBe('Override Only');
    });

    it('falls back to defaultMeta.title when page has no entry', () => {
      getPageMeta.mockReturnValue({});
      defaultMeta.title = 'AHOY VPN Default';

      render(<Head />);

      const titleEl = document.querySelector('title');
      expect(titleEl.textContent).toBe('AHOY VPN Default');
    });
  });

  // -------------------------------------------------------------------------
  // Renders correct description meta tag
  // -------------------------------------------------------------------------
  describe('Description meta tag', () => {
    it('uses page description from seo metadata', () => {
      getPageMeta.mockReturnValue({
        title: 'Checkout',
        description: 'Complete your purchase with AHOY VPN'
      });

      render(<Head page="checkout" />);

      const descMeta = document.querySelector('meta[name="description"]');
      expect(descMeta).toBeInTheDocument();
      expect(descMeta.getAttribute('content')).toBe('Complete your purchase with AHOY VPN');
    });

    it('uses override description prop when provided', () => {
      getPageMeta.mockReturnValue({
        description: 'From seo metadata'
      });

      render(<Head description="Override description" />);

      const descMeta = document.querySelector('meta[name="description"]');
      expect(descMeta.getAttribute('content')).toBe('Override description');
    });

    it('falls back to defaultMeta.description when page has no entry', () => {
      getPageMeta.mockReturnValue({});
      defaultMeta.description = 'Default description text';

      render(<Head />);

      const descMeta = document.querySelector('meta[name="description"]');
      expect(descMeta.getAttribute('content')).toBe('Default description text');
    });
  });

  // -------------------------------------------------------------------------
  // Keywords meta tag — only rendered when present in page metadata
  // -------------------------------------------------------------------------
  describe('Keywords meta tag', () => {
    it('renders keywords meta tag when page metadata includes keywords', () => {
      getPageMeta.mockReturnValue({
        title: 'FAQ',
        description: 'FAQ page',
        keywords: 'faq, support, help'
      });

      render(<Head page="faq" />);

      const keywordsMeta = document.querySelector('meta[name="keywords"]');
      expect(keywordsMeta).toBeInTheDocument();
      expect(keywordsMeta.getAttribute('content')).toBe('faq, support, help');
    });

    it('does not render keywords meta tag when page has no keywords', () => {
      getPageMeta.mockReturnValue({
        title: 'Home',
        description: 'Home page'
        // no keywords
      });

      render(<Head page="home" />);

      expect(document.querySelector('meta[name="keywords"]')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Open Graph meta tags
  // -------------------------------------------------------------------------
  describe('Open Graph meta tags', () => {
    beforeEach(() => {
      defaultMeta.url = 'https://ahoyvpn.net';
      defaultMeta.image = 'https://ahoyvpn.net/og-image.png';
    });

    it('renders og:title with the resolved title', () => {
      getPageMeta.mockReturnValue({ title: 'Checkout', description: 'Buy now' });

      render(<Head page="checkout" />);

      const ogTitle = document.querySelector('meta[property="og:title"]');
      expect(ogTitle).toBeInTheDocument();
      expect(ogTitle.getAttribute('content')).toBe('Checkout');
    });

    it('renders og:description with the resolved description', () => {
      getPageMeta.mockReturnValue({ title: 'Home', description: 'Secure your connection' });

      render(<Head page="home" />);

      const ogDesc = document.querySelector('meta[property="og:description"]');
      expect(ogDesc).toBeInTheDocument();
      expect(ogDesc.getAttribute('content')).toBe('Secure your connection');
    });

    it('renders og:url from defaultMeta.url', () => {
      getPageMeta.mockReturnValue({ title: 'Home', description: 'desc' });

      render(<Head page="home" />);

      const ogUrl = document.querySelector('meta[property="og:url"]');
      expect(ogUrl).toBeInTheDocument();
      expect(ogUrl.getAttribute('content')).toBe('https://ahoyvpn.net');
    });

    it('renders og:image from defaultMeta.image', () => {
      getPageMeta.mockReturnValue({ title: 'Home', description: 'desc' });

      render(<Head page="home" />);

      const ogImage = document.querySelector('meta[property="og:image"]');
      expect(ogImage).toBeInTheDocument();
      expect(ogImage.getAttribute('content')).toBe('https://ahoyvpn.net/og-image.png');
    });
  });

  // -------------------------------------------------------------------------
  // Twitter Card meta tags
  // -------------------------------------------------------------------------
  describe('Twitter Card meta tags', () => {
    beforeEach(() => {
      defaultMeta.image = 'https://ahoyvpn.net/og-image.png';
    });

    it('renders twitter:title with the resolved title', () => {
      getPageMeta.mockReturnValue({ title: 'Affiliate', description: 'Earn money' });

      render(<Head page="affiliate" />);

      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      expect(twitterTitle).toBeInTheDocument();
      expect(twitterTitle.getAttribute('content')).toBe('Affiliate');
    });

    it('renders twitter:description with the resolved description', () => {
      getPageMeta.mockReturnValue({ title: 'FAQ', description: 'Got questions?' });

      render(<Head page="faq" />);

      const twitterDesc = document.querySelector('meta[name="twitter:description"]');
      expect(twitterDesc).toBeInTheDocument();
      expect(twitterDesc.getAttribute('content')).toBe('Got questions?');
    });

    it('renders twitter:image from defaultMeta.image', () => {
      getPageMeta.mockReturnValue({ title: 'Home', description: 'Home page' });

      render(<Head page="home" />);

      const twitterImage = document.querySelector('meta[name="twitter:image"]');
      expect(twitterImage).toBeInTheDocument();
      expect(twitterImage.getAttribute('content')).toBe('https://ahoyvpn.net/og-image.png');
    });
  });

  // -------------------------------------------------------------------------
  // Canonical link tag
  // -------------------------------------------------------------------------
  describe('Canonical link tag', () => {
    it('renders canonical link with defaultMeta.url', () => {
      defaultMeta.url = 'https://ahoyvpn.net';
      getPageMeta.mockReturnValue({ title: 'Privacy', description: 'Privacy policy' });

      render(<Head page="privacy" />);

      const canonical = document.querySelector('link[rel="canonical"]');
      expect(canonical).toBeInTheDocument();
      expect(canonical.getAttribute('href')).toBe('https://ahoyvpn.net');
    });
  });

  // -------------------------------------------------------------------------
  // Children passthrough
  // -------------------------------------------------------------------------
  describe('Children passthrough', () => {
    it('renders children inside NextHead when provided', () => {
      getPageMeta.mockReturnValue({});

      render(
        <Head>
          <link rel="stylesheet" href="/custom.css" />
        </Head>
      );

      // Children should be rendered (our mock just passes them through)
      const linkEl = document.querySelector('link[href="/custom.css"]');
      expect(linkEl).toBeInTheDocument();
    });
  });
});
