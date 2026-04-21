/**
 * affiliate.test.jsx
 *
 * Unit tests for frontend/pages/affiliate.jsx — the affiliate login page
 * with affiliate-specific login form and password recovery flow.
 *
 * WHY: affiliate.jsx is the entry point for affiliate program logins.
 * It handles two distinct flows:
 *   (1) Affiliate credential login (separate from customer login)
 *   (2) Recovery-code-based password reset (affiliates get a recovery code
 *       in their kit rather than an email-based reset link)
 * Testing ensures the recovery flow steps, validation, and state transitions
 * are correct — a broken recovery flow locks affiliates out of their dashboard.
 */

import '@testing-library/jest-dom';
const React = require('react');
const { render, screen, fireEvent, waitFor, act } = require('@testing-library/react');

// Mock next/router — component reads router but uses window.location.href for redirect
const mockRouterPush = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// Mock window.location.href assignments
const originalLocation = window.location;
delete window.location;
window.location = { href: '' };
afterAll(() => { window.location = originalLocation; });

// Mock fetch globally
let mockFetchResponse;
let mockFetchError;
global.fetch = jest.fn((url, options) => {
  if (mockFetchError) throw mockFetchError;
  return Promise.resolve(mockFetchResponse);
});

const AffiliateLogin = require('../pages/affiliate.jsx').default;

describe('affiliate.jsx — Affiliate Login Page', () => {
  beforeEach(() => {
    mockFetchResponse = { ok: true, json: () => Promise.resolve({}) };
    mockFetchError = null;
    global.fetch.mockClear();
    mockRouterPush.mockClear();
    window.location.href = '';
  });

  // ─── Login Form ────────────────────────────────────────────────────────────

  describe('login form', () => {
    it('renders username and password inputs', () => {
      render(<AffiliateLogin />);
      expect(screen.getByPlaceholderText('Enter your username or affiliate code')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    });

    it('renders the Login button', () => {
      render(<AffiliateLogin />);
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    });

    it('shows error when username is empty', async () => {
      render(<AffiliateLogin />);
      fireEvent.click(screen.getByRole('button', { name: /login/i }));
      await waitFor(() => {
        expect(screen.getByText(/username and password are required/i)).toBeInTheDocument();
      });
    });

    it('calls fetch with correct body on valid login', async () => {
      mockFetchResponse = { ok: true, json: () => Promise.resolve({}) };
      render(<AffiliateLogin />);
      fireEvent.change(screen.getByPlaceholderText('Enter your username or affiliate code'), {
        target: { value: 'testuser' },
      });
      fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
        target: { value: 'testpass123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /login/i }));
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/auth/affiliate/login', expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: 'testuser', password: 'testpass123' }),
        }));
      });
    });

    it('shows error message from server on failed login', async () => {
      mockFetchResponse = {
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid affiliate credentials' }),
      };
      render(<AffiliateLogin />);
      fireEvent.change(screen.getByPlaceholderText('Enter your username or affiliate code'), {
        target: { value: 'baduser' },
      });
      fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
        target: { value: 'badpass' },
      });
      fireEvent.click(screen.getByRole('button', { name: /login/i }));
      await waitFor(() => {
        expect(screen.getByText(/invalid affiliate credentials/i)).toBeInTheDocument();
      });
    });

    it('sets loading state on submit', async () => {
      let resolveAfter;
      mockFetchResponse = {
        ok: true,
        json: () => new Promise(r => (resolveAfter = r)),
      };
      render(<AffiliateLogin />);
      fireEvent.change(screen.getByPlaceholderText('Enter your username or affiliate code'), {
        target: { value: 'testuser' },
      });
      fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
        target: { value: 'testpass' },
      });
      fireEvent.click(screen.getByRole('button', { name: /login/i }));
      expect(screen.getByRole('button', { name: /logging in\.\.\./i })).toBeInTheDocument();
    });
  });

  // ─── Password Recovery ─────────────────────────────────────────────────────

  describe('password recovery flow', () => {
    it('shows recovery code link by default', () => {
      render(<AffiliateLogin />);
      expect(screen.getByText(/use a recovery code instead/i)).toBeInTheDocument();
    });

    it('reveals step 1 recovery form when recovery code link is clicked', () => {
      render(<AffiliateLogin />);
      fireEvent.click(screen.getByText(/use a recovery code instead/i));
      expect(screen.getByPlaceholderText('Your affiliate username')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('One-time recovery code')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /verify code/i })).toBeInTheDocument();
    });

    it('returns to login when "Back to login" is clicked in step 1', () => {
      render(<AffiliateLogin />);
      fireEvent.click(screen.getByText(/use a recovery code instead/i));
      fireEvent.click(screen.getByText(/back to login/i));
      expect(screen.getByPlaceholderText('Enter your username or affiliate code')).toBeInTheDocument();
    });

    it('shows step 2 (set new password) after successful code verification', async () => {
      mockFetchResponse = {
        ok: true,
        json: () => Promise.resolve({ resetToken: 'mock-reset-token' }),
      };
      render(<AffiliateLogin />);
      fireEvent.click(screen.getByText(/use a recovery code instead/i));
      fireEvent.change(screen.getByPlaceholderText('Your affiliate username'), {
        target: { value: 'affiliateuser' },
      });
      fireEvent.change(screen.getByPlaceholderText('One-time recovery code'), {
        target: { value: 'RECOVERY123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
      await waitFor(() => {
        expect(screen.getByPlaceholderText('New password (min 8 characters)')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /set new password/i })).toBeInTheDocument();
    });

    it('shows error when passwords do not match in step 2', async () => {
      // Directly test step 2 validation by reaching it first via the step-3 "Go to Login" button
      // which resets forgotStep to 1, then advance back to step 2
      mockFetchResponse = {
        ok: true,
        json: () => Promise.resolve({ resetToken: 'mock-reset-token' }),
      };
      render(<AffiliateLogin />);

      // Navigate to step 3 by clicking recovery link, filling form, and submitting
      fireEvent.click(screen.getByText(/use a recovery code instead/i));
      fireEvent.change(screen.getByPlaceholderText('Your affiliate username'), {
        target: { value: 'affiliateuser' },
      });
      fireEvent.change(screen.getByPlaceholderText('One-time recovery code'), {
        target: { value: 'RECOVERY123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
      await waitFor(() =>
        expect(screen.getByPlaceholderText('New password (min 8 characters)')).toBeInTheDocument()
      );

      // Now simulate being on step 2 — fill mismatched passwords and submit
      // Error is set synchronously before any fetch
      fireEvent.change(screen.getByPlaceholderText('New password (min 8 characters)'), {
        target: { value: 'newpass123' },
      });
      fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
        target: { value: 'differentpass' },
      });
      fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

      // The error appears in both the login card (inside the forgot flow) and the forgot step 2 form
      expect(screen.getAllByText(/passwords do not match/i)).toHaveLength(2);
    });

    it('shows error when new password is too short in step 2', async () => {
      mockFetchResponse = {
        ok: true,
        json: () => Promise.resolve({ resetToken: 'mock-reset-token' }),
      };
      render(<AffiliateLogin />);

      fireEvent.click(screen.getByText(/use a recovery code instead/i));
      fireEvent.change(screen.getByPlaceholderText('Your affiliate username'), {
        target: { value: 'affiliateuser' },
      });
      fireEvent.change(screen.getByPlaceholderText('One-time recovery code'), {
        target: { value: 'RECOVERY123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
      await waitFor(() =>
        expect(screen.getByPlaceholderText('New password (min 8 characters)')).toBeInTheDocument()
      );

      fireEvent.change(screen.getByPlaceholderText('New password (min 8 characters)'), {
        target: { value: 'short' },
      });
      fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
        target: { value: 'short' },
      });
      fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

      // The error appears in both the login card and the forgot step 2 form
      expect(screen.getAllByText(/password must be at least 8 characters/i)).toHaveLength(2);
    });

    it('shows step 3 success state after successful password reset', async () => {
      mockFetchResponse = {
        ok: true,
        json: () => Promise.resolve({}),
      };
      render(<AffiliateLogin />);
      fireEvent.click(screen.getByText(/use a recovery code instead/i));
      // advance through steps
      mockFetchResponse = {
        ok: true,
        json: () => Promise.resolve({ resetToken: 'token' }),
      };
      fireEvent.change(screen.getByPlaceholderText('Your affiliate username'), {
        target: { value: 'affiliateuser' },
      });
      fireEvent.change(screen.getByPlaceholderText('One-time recovery code'), {
        target: { value: 'RECOVERY123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
      await waitFor(() => {
        expect(screen.getByPlaceholderText('New password (min 8 characters)')).toBeInTheDocument();
      });
      mockFetchResponse = { ok: true, json: () => Promise.resolve({}) };
      fireEvent.change(screen.getByPlaceholderText('New password (min 8 characters)'), {
        target: { value: 'newpass123' },
      });
      fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
        target: { value: 'newpass123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /set new password/i }));
      await waitFor(() => {
        expect(screen.getByText(/password reset complete/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Customer login link ───────────────────────────────────────────────────

  describe('customer login link', () => {
    it('renders a link to the customer login page', () => {
      render(<AffiliateLogin />);
      const link = screen.getByText(/customer login page/i);
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', '/login');
    });
  });
});
