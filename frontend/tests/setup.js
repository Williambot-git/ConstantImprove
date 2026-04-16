/**
 * AhoyVPN Frontend — Jest Test Setup
 * ==================================
 * This file runs before any test files are loaded.
 *
 * WHAT THIS SETUP DOES:
 * 1. Sets NODE_ENV to 'test' — some libraries (like Next.js) behave differently in test mode
 * 2. Mocks the Next.js router/hooks so page navigation tests work without a real router
 * 3. Suppresses console noise during tests — keeps test output clean
 * 4. Suppresses Next.js hydration warnings that clutter output during component testing
 *
 * WHY EACH MOCK:
 * - jest.mock('next/navigation') — Layout uses useRouter() in _app.jsx indirectly via
 *   ProtectedRoute components. Tests that render Layout need a mock router or they fail.
 * - jest.mock('next/image') — next/image requires actual image files; in tests we just
 *   verify the component is being used correctly (width/height props), not actual rendering.
 * - jest.mock('next/link') — next/link is the <Link> component; we test it indirectly.
 *
 * CAVEATS:
 * - If a component UNDER test uses useRouter(), the mock below provides it.
 * - If a component UNDER test uses next/image, the mock renders an <img> tag.
 * - Component tests that need to test actual link/navigation behavior should
 *   import from 'next/link' and 'next/navigation' directly in their test files.
 */

/**
 * Set test environment before anything else loads.
 * Some libraries read NODE_ENV at import time (e.g., Next.js).
 */
process.env.NODE_ENV = 'test';

/**
 * Mock Next.js navigation router.
 * Layout/ProtectedRoute don't use useRouter directly, but some page components do.
 * Providing a mock here prevents "useRouter() can only be used in a Client Component"
 * errors when rendering components that import pages.
 */
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
    pathname: '/',
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Mock Next.js Image component.
 * next/image tries to optimize/load images at render time — not available in jsdom.
 * Mock renders a simple <img> with the src, width, height, and alt props passed through.
 * This lets us verify that components are passing correct props without network access.
 */
jest.mock('next/image', () => {
  const React = require('react');
  return function MockNextImage({ src, alt, width, height, ...props }) {
    return React.createElement('img', {
      src: typeof src === 'string' ? src : '/placeholder.png',
      alt: alt || '',
      width: width,
      height: height,
      ...props,
    });
  };
});

/**
 * Mock Next.js Link component.
 * We render it as a simple <a> tag in tests (simplifies rendering without router).
 * Tests that verify actual navigation behavior should import Link and check its href.
 */
jest.mock('next/link', () => {
  const React = require('react');
  return function MockNextLink({ children, href, ...props }) {
    return React.createElement('a', { href: href || '#', ...props }, children);
  };
});

/**
 * Suppress console.log/error noise from application code during tests.
 * Application console.log statements (e.g., API error logging) would otherwise
 * flood test output and make it hard to read real test results.
 *
 * HOW TO TEMPORARILY ENABLE for debugging:
 * Remove the .mockImplementation lines below and run tests with --verbose.
 * Or in a specific test: global.console = { ...originalConsole, log: console.log };
 */
global.console = {
  ...console,
  // Keep console.warn (sometimes useful) but silence log and error
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  // Keep debug if needed
  debug: jest.fn(),
};

/**
 * Suppress Next.js hydration mismatch warnings that occur because jsdom
 * doesn't perfectly replicate browser DOM behavior.
 * These warnings are expected in jsdom environment and don't indicate real bugs.
 */
const originalError = console.error.bind(console);
console.error = (...args) => {
  // Silence Next.js hydration warnings in test output
  // These are expected when rendering React components in jsdom (not a real browser)
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('hydration') ||
      args[0].includes('did not match') ||
      args[0].includes('Warning: An error occurred'))
  ) {
    return;
  }
  originalError(...args);
};
