/**
 * ahoyman.jsx (Partner Portal Login) — Unit Tests
 * =================================================
 * Tests the ahoyman login page (/ahoyman).
 *
 * WHY THIS TEST:
 * - ahoyman.jsx is the entry point for ahoyman (affiliate manager) login
 * - No prior test coverage existed
 * - Tests: form rendering, validation, API call, localStorage token, redirect
 *
 * NOTES ON FORM STRUCTURE:
 * - FormGroup renders <label>Username</label> as plain text wrapper — NO htmlFor
 * - Input renders <input> WITHOUT an id attribute — no label-input association
 * - Therefore getByLabelText does NOT work; use getByPlaceholderText instead
 */

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('../lib/sanitize', () => ({
  sanitizeText: jest.fn((text) => (text || '').trim()),
}));

import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import AhoyManLogin from '../pages/ahoyman';

describe('ahoyman.jsx', () => {
  // Set up before each test: clear localStorage and reset mocks
  beforeEach(() => {
    jest.clearAllMocks();
    global.localStorage.clear();
    global.fetch = undefined;
  });

  // Tear down after each test: restore real timers and clear mocks
  // WHY: jest.runAllTimers() in redirect test leaves fake timers active, which
  // causes subsequent fetch-based tests to hang forever (timers block promise resolution).
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    global.fetch = undefined;
  });

  // Helper: get username and password inputs via placeholder (label has no htmlFor, input has no id)
  const getUsernameInput = () => screen.getByPlaceholderText(/Enter username/i);
  const getPasswordInput = () => screen.getByPlaceholderText(/Enter password/i);

  describe('form rendering', () => {
    test('renders login form with username and password fields', () => {
      render(<AhoyManLogin />);
      expect(getUsernameInput()).toBeInTheDocument();
      expect(getPasswordInput()).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    test('renders "Partner Portal" heading and subtitle', () => {
      render(<AhoyManLogin />);
      expect(screen.getByText('Partner Portal')).toBeInTheDocument();
      expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    });

    test('shows "Need access? Contact your administrator." info card', () => {
      render(<AhoyManLogin />);
      expect(screen.getByText(/Need access\? Contact your administrator\./i)).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    test('shows error on empty username and password submission', async () => {
      render(<AhoyManLogin />);
      await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));
      await waitFor(() => {
        expect(screen.getByText(/Username and password are required/i)).toBeInTheDocument();
      });
    });

    test('shows error on empty password only (username filled)', async () => {
      render(<AhoyManLogin />);
      await userEvent.type(getUsernameInput(), 'testuser');
      await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));
      await waitFor(() => {
        expect(screen.getByText(/Username and password are required/i)).toBeInTheDocument();
      });
    });

    test('shows error on empty username only (password filled)', async () => {
      render(<AhoyManLogin />);
      await userEvent.type(getPasswordInput(), 'password123');
      await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));
      await waitFor(() => {
        expect(screen.getByText(/Username and password are required/i)).toBeInTheDocument();
      });
    });
  });

  describe('login submission', () => {
    test('calls /api/auth/ahoyman/login with sanitized username on valid submit', async () => {
      // Import sanitize mock reference after mocks are set up
      const sanitize = require('../lib/sanitize').sanitizeText;

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { token: 'mock-token-123' } }),
      });
      global.fetch = mockFetch;

      render(<AhoyManLogin />);

      await userEvent.type(getUsernameInput(), '  admin_user  ');
      await userEvent.type(getPasswordInput(), 'password123');
      await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));

      // Verify sanitize was called with the raw username
      await waitFor(() => {
        expect(sanitize).toHaveBeenCalledWith('  admin_user  ');
      });

      // Verify fetch was called with sanitized username
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/auth/ahoyman/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            username: 'admin_user', // sanitized (trimmed)
            password: 'password123',
          }),
        });
      });
    });

    test('stores adminToken in localStorage on successful login', async () => {
      // Use Storage.prototype — jsdom's localStorage delegates to prototype methods
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { token: 'mock-token-xyz' } }),
      });
      global.fetch = mockFetch;

      render(<AhoyManLogin />);

      await userEvent.type(getUsernameInput(), 'admin');
      await userEvent.type(getPasswordInput(), 'password123');
      await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));

      await waitFor(() => {
        expect(setItemSpy).toHaveBeenCalledWith('adminToken', 'mock-token-xyz');
      });

      setItemSpy.mockRestore();
    });

    test('shows success message on successful login (setTimeout redirect is browser-only)', async () => {
      // The component calls setSuccess('Login successful! Redirecting...') synchronously after
      // fetch resolves. The subsequent window.location.href redirect is in a setTimeout(1000)
      // which jsdom cannot execute (throws "navigation not implemented").
      // We verify the success message appears — that's the testable behavior.
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { token: 'mock-token' } }),
      });
      global.fetch = mockFetch;

      render(<AhoyManLogin />);

      await userEvent.type(getUsernameInput(), 'admin');
      await userEvent.type(getPasswordInput(), 'password123');
      await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));

      // Success message appears synchronously after the act()-wrapped userEvent click resolves
      await waitFor(() => {
        expect(screen.getByText(/Login successful! Redirecting\.\.\./i)).toBeInTheDocument();
      });

      // The fetch was called correctly (auth endpoint)
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/ahoyman/login', expect.objectContaining({
        method: 'POST',
      }));
    });

    test('shows error message on failed login (401)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Invalid username or password' }),
      });
      global.fetch = mockFetch;

      render(<AhoyManLogin />);

      await userEvent.type(getUsernameInput(), 'admin');
      await userEvent.type(getPasswordInput(), 'wrongpassword');
      await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));

      await waitFor(() => {
        expect(screen.getByText(/Invalid username or password/i)).toBeInTheDocument();
      });
    });

    test('shows generic error on API failure', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      render(<AhoyManLogin />);

      await userEvent.type(getUsernameInput(), 'admin');
      await userEvent.type(getPasswordInput(), 'password123');
      await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));

      await waitFor(() => {
        // Component shows err.message || 'Invalid username or password' — shows 'Network error'
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    test('button shows "Signing in..." and is disabled while loading', async () => {
      const mockFetch = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ data: { token: 'mock-token' } }),
        }), 100))
      );
      global.fetch = mockFetch;

      render(<AhoyManLogin />);

      await userEvent.type(getUsernameInput(), 'admin');
      await userEvent.type(getPasswordInput(), 'password123');
      await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));

      // Button should immediately show "Signing in..." and be disabled
      const btn = screen.getByRole('button', { name: /signing in\.\.\./i });
      expect(btn).toBeDisabled();

      // Wait for the fetch to resolve and button to re-enable
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /signing in\.\.\./i })).not.toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });
});
