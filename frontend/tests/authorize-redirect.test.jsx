/**
 * authorize-redirect.test.jsx
 *
 * Unit tests for authorize-redirect.jsx — AuthorizeNet relay redirect page.
 * Tests: loading state, token validation, form creation and submission, formUrl resolution.
 *
 * WHY: authorize-redirect.jsx is a critical payment flow step that posts a token
 * to AuthorizeNet's relay endpoint. If it breaks, customers see a blank page instead
 * of completing payment. Full coverage prevents relay failures from silently breaking
 * the checkout funnel.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// --- Mock next/router ---
let mockIsReady = true;
let mockQuery = {};

jest.mock('next/router', () => ({
  useRouter: () => ({
    isReady: mockIsReady,
    query: mockQuery,
  }),
}));

// --- Mock document.createElement / form.submit ---
const appendedForms = [];
let formSubmitCalled = false;

const resetDOM = () => {
  formSubmitCalled = false;
  appendedForms.length = 0;
};

beforeEach(() => {
  resetDOM();
  mockIsReady = true;
  mockQuery = {};
  // Intercept document.body.appendChild to capture the created form
  const origAppendChild = document.body.appendChild.bind(document.body);
  document.body.appendChild = jest.fn((el) => {
    if (el.tagName === 'FORM') appendedForms.push(el);
    return origAppendChild(el);
  });
  // Intercept form.submit
  HTMLFormElement.prototype.submit = jest.fn(() => {
    formSubmitCalled = true;
  });
});

afterEach(() => {
  document.body.appendChild = document.body.appendChild.bind(document.body);
  jest.restoreAllMocks();
});

// --- Import component AFTER mocks are set ---
// We need to import dynamically so mocks are in place
let AuthorizeRedirect;
let React;

beforeAll(async () => {
  const mod = await import('../pages/authorize-redirect.jsx');
  React = mod.default;
  AuthorizeRedirect = mod.default;
});

describe('authorize-redirect.jsx', () => {
  describe('Loading state', () => {
    it('shows preparing message when router is not ready', () => {
      mockIsReady = false;
      mockQuery = {};
      render(<AuthorizeRedirect />);
      expect(screen.getByText(/preparing secure checkout/i)).toBeInTheDocument();
    });

    it('shows preparing message when router is not ready even with empty query', () => {
      mockIsReady = false;
      mockQuery = {};
      const { container } = render(<AuthorizeRedirect />);
      expect(container.textContent).toMatch(/preparing secure checkout/i);
    });
  });

  describe('Token validation', () => {
    it('shows error message when token is missing', () => {
      mockIsReady = true;
      mockQuery = {};
      render(<AuthorizeRedirect />);
      expect(screen.getByText(/missing payment token/i)).toBeInTheDocument();
    });

    it('shows error message when token is explicitly null', () => {
      mockIsReady = true;
      mockQuery = { token: null };
      render(<AuthorizeRedirect />);
      expect(screen.getByText(/missing payment token/i)).toBeInTheDocument();
    });

    it('shows error message when token is an empty string', () => {
      mockIsReady = true;
      mockQuery = { token: '' };
      render(<AuthorizeRedirect />);
      expect(screen.getByText(/missing payment token/i)).toBeInTheDocument();
    });

    it('shows redirecting message when token is present and router is ready', () => {
      mockIsReady = true;
      mockQuery = { token: 'valid_token_abc123' };
      render(<AuthorizeRedirect />);
      expect(screen.getByText(/redirecting to secure payment/i)).toBeInTheDocument();
    });
  });

  describe('Form creation and submission', () => {
    it('creates and appends a form to the DOM when token is present', () => {
      mockIsReady = true;
      mockQuery = { token: 'valid_token_abc123' };
      render(<AuthorizeRedirect />);

      // Trigger the useEffect (useEffect runs after render in React)
      // The useEffect depends on router.isReady and token being set.
      // Since we render with mockIsReady=true, useEffect should run immediately.
      // We need to wait for the effect to fire by advancing microtasks.
      return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
        expect(document.body.appendChild).toHaveBeenCalled();
        const form = appendedForms[0];
        expect(form).toBeDefined();
        expect(form.tagName).toBe('FORM');
      });
    });

    it('sets form method to POST', async () => {
      mockIsReady = true;
      mockQuery = { token: 'valid_token_abc123' };
      render(<AuthorizeRedirect />);

      await new Promise(resolve => setTimeout(resolve, 0));

      const form = appendedForms[0];
      // form.method is lowercase HTML attribute value
      expect(form.method).toBe('post');
    });

    it('sets form action to the formUrl', async () => {
      mockIsReady = true;
      mockQuery = { token: 'valid_token_abc123', formUrl: 'https://test.authorize.net/pay' };
      render(<AuthorizeRedirect />);

      await new Promise(resolve => setTimeout(resolve, 0));

      const form = appendedForms[0];
      expect(form.action).toBe('https://test.authorize.net/pay');
    });

    it('uses default AuthorizeNet URL when formUrl is not provided', async () => {
      mockIsReady = true;
      mockQuery = { token: 'valid_token_abc123' };
      render(<AuthorizeRedirect />);

      await new Promise(resolve => setTimeout(resolve, 0));

      const form = appendedForms[0];
      expect(form.action).toBe('https://accept.authorize.net/payment/payment');
    });

    it('adds a hidden token input to the form', async () => {
      mockIsReady = true;
      mockQuery = { token: 'my_secret_token' };
      render(<AuthorizeRedirect />);

      await new Promise(resolve => setTimeout(resolve, 0));

      const form = appendedForms[0];
      const tokenInput = form.querySelector('input[name="token"]');
      expect(tokenInput).not.toBeNull();
      expect(tokenInput.type).toBe('hidden');
      expect(tokenInput.value).toBe('my_secret_token');
    });

    it('submits the form after creation', async () => {
      mockIsReady = true;
      mockQuery = { token: 'valid_token_abc123' };
      render(<AuthorizeRedirect />);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(formSubmitCalled).toBe(true);
    });

    it('handles array token in query (takes first element)', async () => {
      mockIsReady = true;
      mockQuery = { token: ['array_token_first', 'second'] };
      render(<AuthorizeRedirect />);

      await new Promise(resolve => setTimeout(resolve, 0));

      const form = appendedForms[0];
      const tokenInput = form.querySelector('input[name="token"]');
      expect(tokenInput.value).toBe('array_token_first');
    });

    it('handles array formUrl in query (takes first element)', async () => {
      mockIsReady = true;
      mockQuery = { token: 'valid_token', formUrl: ['https://first.url.com', 'https://second.url.com'] };
      render(<AuthorizeRedirect />);

      await new Promise(resolve => setTimeout(resolve, 0));

      const form = appendedForms[0];
      // form.action normalizes URL — trailing slash may be added by browser URL normalization
      expect(form.action).toMatch(/^https:\/\/first\.url\.com\/?$/);
    });
  });
});
