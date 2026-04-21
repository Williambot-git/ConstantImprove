/**
 * AhoyVPN Frontend — Register Page Unit Tests
 * ============================================
 * Tests the customer registration page: form rendering, validation, API calls,
 * loading states, error display, account number display, and navigation.
 *
 * WHY: register.jsx is the account creation entry point. If validation or the
 * API wiring breaks, users can't sign up. Full coverage prevents signup funnel
 * failures from silently blocking new customer acquisition.
 *
 * NOTES:
 * - Uses fireEvent (not userEvent) — established pattern in this codebase (see login.test.jsx).
 * - Uses getByPlaceholderText for password fields — the inputs have no id/for attributes
 *   so getByLabelText cannot find them programmatically.
 * - mockPush is module-level so both the jest.mock factory and the test can reference it.
 */

import '@testing-library/jest-dom';
const React = require('react');
const { render, screen, fireEvent, waitFor } = require('@testing-library/react');

// Module-level mockPush so we can assert on it in tests after jest.clearAllMocks().
// Declared before jest.mock so the factory can close over it (simulated here via jest.fn()).
const mockPush = jest.fn();

// Mock next/router — push is called after successful registration to redirect to login
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: mockPush,
    pathname: '/register',
  }),
}));

// Mock api/client — register is the API call made on form submit
jest.mock('../api/client', () => ({
  __esModule: true,
  default: {
    register: jest.fn(),
  },
}));

// Mock clipboard API — Copy button calls navigator.clipboard.writeText
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: jest.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

// Mock localStorage — component calls localStorage.setItem on success
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

const Register = require('../pages/register.jsx').default;
const api = require('../api/client').default;

describe('register.jsx — Registration Page', () => {
  beforeEach(() => {
    // Reset all mocks before each test — prevents pollution between tests.
    jest.clearAllMocks();
    mockPush.mockClear();
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
  });

  // ========================================================================
  // Rendering
  // ========================================================================

  describe('Rendering', () => {
    it('renders the registration form with password and confirm password fields', () => {
      render(<Register />);
      // Inputs use placeholder text, not associated <label for="..."> — query by placeholder
      expect(screen.getByPlaceholderText(/enter your password/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/confirm your password/i)).toBeInTheDocument();
    });

    it('renders the Create Account button', () => {
      render(<Register />);
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('renders the explanation card with signup process description', () => {
      render(<Register />);
      // The explanation card starts with "Signup Process:" in bold
      expect(screen.getByText(/signup process:/i)).toBeInTheDocument();
    });

    it('renders the password requirements note', () => {
      render(<Register />);
      // Page shows "Password must be at least 12 characters long and contain both letters and numbers."
      expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
    });

    it('renders the sign-in link pointing to /login', () => {
      render(<Register />);
      const link = screen.getByRole('link', { name: /sign in/i });
      expect(link).toHaveAttribute('href', '/login');
    });
  });

  // ========================================================================
  // Validation
  // ========================================================================

  describe('Validation', () => {
    it('shows error when password field is empty on submit', async () => {
      render(<Register />);

      // Find the form element and submit it directly — most reliable for triggering React onSubmit
      const form = document.querySelector('form');
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/both password fields are required/i)).toBeInTheDocument();
      });
    });

    it('shows error when passwords do not match', () => {
      render(<Register />);
      const passwordInput = screen.getByPlaceholderText(/enter your password/i);
      const confirmInput = screen.getByPlaceholderText(/confirm your password/i);

      fireEvent.change(passwordInput, { target: { value: 'Password123' } });
      fireEvent.change(confirmInput, { target: { value: 'DifferentPass123' } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    it('does not call API when passwords do not match', () => {
      render(<Register />);
      const passwordInput = screen.getByPlaceholderText(/enter your password/i);
      const confirmInput = screen.getByPlaceholderText(/confirm your password/i);

      fireEvent.change(passwordInput, { target: { value: 'Password123' } });
      fireEvent.change(confirmInput, { target: { value: 'WrongPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      // API should never be called when validation fails first
      expect(api.register).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // API call — success with account number
  // ========================================================================

  describe('API call — success with account number', () => {
    const validPassword = 'ValidPassword123';

    it('calls api.register on valid submit', async () => {
      api.register.mockResolvedValueOnce({ data: { user: { accountNumber: '12345678' } } });
      render(<Register />);

      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: validPassword } });
      fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: validPassword } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      // Component calls api.register(password, confirmPassword) — positional string args
      await waitFor(() => {
        expect(api.register).toHaveBeenCalledWith(validPassword, validPassword);
      });
    });

    it('shows success message with account number on success', async () => {
      api.register.mockResolvedValueOnce({ data: { user: { accountNumber: '99887766' } } });
      render(<Register />);

      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: validPassword } });
      fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: validPassword } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      // Account number appears in both the success message and the account number display
      // — use getAllByText to handle multiple matches without error
      await waitFor(() => {
        expect(screen.getAllByText(/99887766/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('saves account number to localStorage on success', async () => {
      api.register.mockResolvedValueOnce({ data: { user: { accountNumber: '11223344' } } });
      render(<Register />);

      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: validPassword } });
      fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: validPassword } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      // Component stores under 'lastAccountNumber' key
      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith('lastAccountNumber', '11223344');
      });
    });

    it('shows Continue to Login button after successful registration', async () => {
      api.register.mockResolvedValueOnce({ data: { user: { accountNumber: '12345678' } } });
      render(<Register />);

      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: validPassword } });
      fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: validPassword } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue to login/i })).toBeInTheDocument();
      });
    });

    it('navigates to /login when Continue to Login is clicked', async () => {
      api.register.mockResolvedValueOnce({ data: { user: { accountNumber: '12345678' } } });
      render(<Register />);

      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: validPassword } });
      fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: validPassword } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue to login/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /continue to login/i }));
      // mockPush is the same function reference closed over by the jest.mock factory
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  // ========================================================================
  // API call — success without account number
  // ========================================================================

  describe('API call — success without account number', () => {
    it('shows generic success message when API returns no account number', async () => {
      api.register.mockResolvedValueOnce({ data: {} });
      render(<Register />);

      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: 'ValidPassword123' } });
      fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: 'ValidPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      // Success message when no account number: "Registration successful. Please log in..."
      await waitFor(() => {
        expect(screen.getByText(/please log in and verify your account number/i)).toBeInTheDocument();
      });
    });
  });

  // ========================================================================
  // API call — error
  // ========================================================================

  describe('API call — error', () => {
    it('shows error message on registration failure', async () => {
      api.register.mockRejectedValueOnce(new Error('Network error'));
      render(<Register />);

      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: 'ValidPassword123' } });
      fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: 'ValidPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      // Component uses generic fallback: "Registration failed. Please try again."
      // (err.response.data.message is undefined for plain Error so fallback is used)
      await waitFor(() => {
        expect(screen.getByText(/registration failed\. please try again\./i)).toBeInTheDocument();
      });
    });

    it('shows error message from server response', async () => {
      api.register.mockRejectedValueOnce({ response: { data: { message: 'Password too weak' } } });
      render(<Register />);

      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: 'ValidPassword123' } });
      fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: 'ValidPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText(/password too weak/i)).toBeInTheDocument();
      });
    });

    it('re-enables form inputs after error', async () => {
      api.register.mockRejectedValueOnce(new Error('Server error'));
      render(<Register />);

      const passwordInput = screen.getByPlaceholderText(/enter your password/i);
      const confirmInput = screen.getByPlaceholderText(/confirm your password/i);
      const button = screen.getByRole('button', { name: /create account/i });

      fireEvent.change(passwordInput, { target: { value: 'ValidPassword123' } });
      fireEvent.change(confirmInput, { target: { value: 'ValidPassword123' } });
      fireEvent.click(button);

      await waitFor(() => {
        // After error, inputs should be re-enabled (not disabled)
        expect(passwordInput).not.toBeDisabled();
        expect(confirmInput).not.toBeDisabled();
        expect(button).not.toBeDisabled();
      });
    });
  });

  // ========================================================================
  // Copy button
  // ========================================================================

  describe('copy button', () => {
    it('copies account number to clipboard when Copy button is clicked', async () => {
      api.register.mockResolvedValueOnce({ data: { user: { accountNumber: '12345678' } } });
      render(<Register />);

      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: 'ValidPassword123' } });
      fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: 'ValidPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /copy/i }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('12345678');
    });
  });

  // ========================================================================
  // Loading state
  // ========================================================================

  describe('loading state', () => {
    it('disables the Create Account button while submitting', async () => {
      // Use mockImplementation with a Promise that we resolve after checking button state.
      // This lets us observe the disabled state mid-flight.
      let resolveRegister;
      api.register.mockImplementation(
        () => new Promise((resolve) => { resolveRegister = resolve; })
      );
      render(<Register />);

      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: 'ValidPassword123' } });
      fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: 'ValidPassword123' } });

      const button = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(button);

      // Immediately after click (before promise resolves), button should be disabled
      expect(button).toBeDisabled();

      // Resolve to clean up and let the test finish
      resolveRegister({ data: { user: { accountNumber: '12345678' } } });
      await waitFor(() => expect(button).not.toBeDisabled());
    });
  });
});
