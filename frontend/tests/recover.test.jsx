/**
 * AhoyVPN Frontend — Recover Page Unit Tests
 * ===========================================
 * Tests the account recovery flow: 3-step wizard (enter-kit → set-password → success).
 *
 * WHY: recover.jsx is the account recovery entry point. It handles password reset via
 * recovery kit, which is a security-critical flow. If validation or the API wiring breaks,
 * users locked out of their account cannot regain access. Full coverage ensures:
 *   - All 3 form steps render correctly
 *   - Client-side validation prevents empty/mismatched password submissions
 *   - API errors surface user-friendly messages instead of silent failures
 *   - Success step shows the new recovery kit and functional Copy/Download buttons
 *
 * NOTES:
 * - Uses fireEvent (not userEvent) — established pattern in this codebase (see login.test.jsx).
 * - Uses getByPlaceholderText for form fields — inputs have no id/for attributes so
 *   getByLabelText cannot find them programmatically.
 * - navigator.clipboard is mocked via Object.defineProperty (same pattern as register.test.jsx).
 * - Component uses multi-step state machine: step is one of 'enter-kit' | 'set-password' | 'success'.
 */

import '@testing-library/jest-dom';
const React = require('react');
const { render, screen, fireEvent, waitFor } = require('@testing-library/react');

const mockPush = jest.fn();

// Mock next/router — used to redirect to /login after successful recovery
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: mockPush,
    pathname: '/recover',
  }),
}));

// Mock api/client — recover() is the API call made on set-password submit
jest.mock('../api/client', () => ({
  __esModule: true,
  default: {
    recover: jest.fn(),
  },
}));

// Mock clipboard API — success step Copy button calls navigator.clipboard.writeText
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: jest.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

// Mock window.alert — handleVerifyKit and handleSetPassword call window.alert on errors
// during SSR (jsdom environment, window is defined)
global.alert = jest.fn();

const Recover = require('../pages/recover.jsx').default;
const api = require('../api/client').default;

describe('recover.jsx — Account Recovery Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    global.alert.mockClear();
  });

  // ========================================================================
  // Step 1: enter-kit — Rendering
  // ========================================================================

  describe('enter-kit step — rendering', () => {
    it('renders the page title', () => {
      render(<Recover />);
      expect(screen.getByText('Account Recovery')).toBeInTheDocument();
    });

    it('renders the enter-kit form card', () => {
      render(<Recover />);
      expect(screen.getByText('Enter Your Recovery Kit')).toBeInTheDocument();
      expect(screen.getByText(/lost your password/i)).toBeInTheDocument();
    });

    it('renders user ID input and recovery kit textarea', () => {
      render(<Recover />);
      expect(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/paste your recovery kit/i)).toBeInTheDocument();
    });

    it('renders Verify Kit submit button', () => {
      render(<Recover />);
      expect(screen.getByRole('button', { name: /verify kit/i })).toBeInTheDocument();
    });

    it('renders Back to Login link', () => {
      render(<Recover />);
      expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute('href', '/login');
    });
  });

  // ========================================================================
  // Step 1: enter-kit — Client-Side Validation
  // ========================================================================

  describe('enter-kit step — validation', () => {
    it('shows error when user ID is empty on submit', () => {
      render(<Recover />);
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));
      expect(screen.getByText('User ID is required')).toBeInTheDocument();
    });

    it('shows error when recovery kit is empty on submit', () => {
      render(<Recover />);
      // Fill userId but leave kit empty
      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));
      expect(screen.getByText('Recovery kit is required')).toBeInTheDocument();
    });

    it('advances to set-password step when both fields are filled', () => {
      render(<Recover />);
      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/paste your recovery kit/i), {
        target: { value: 'ABCD-EFGH-1234-5678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));

      // Should now show the set-password step
      expect(screen.getByText('Set New Password')).toBeInTheDocument();
      expect(screen.getByText(/recovery kit has been verified/i)).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Step 2: set-password — Rendering
  // ========================================================================

  describe('set-password step — rendering', () => {
    it('renders password and confirm password inputs', () => {
      render(<Recover />);
      // Trigger enter-kit → set-password transition
      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/paste your recovery kit/i), {
        target: { value: 'ABCD-EFGH-1234-5678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));

      expect(screen.getByPlaceholderText(/enter a new numeric password/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/confirm your new password/i)).toBeInTheDocument();
    });

    it('renders Set Password submit button', () => {
      render(<Recover />);
      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/paste your recovery kit/i), {
        target: { value: 'ABCD-EFGH-1234-5678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));

      expect(screen.getByRole('button', { name: /set password/i })).toBeInTheDocument();
    });

    it('renders Back button to return to enter-kit step', () => {
      render(<Recover />);
      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/paste your recovery kit/i), {
        target: { value: 'ABCD-EFGH-1234-5678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));

      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Step 2: set-password — Validation
  // ========================================================================

  describe('set-password step — validation', () => {
    beforeEach(() => {
      render(<Recover />);
      // Navigate to set-password step
      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/paste your recovery kit/i), {
        target: { value: 'ABCD-EFGH-1234-5678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));
    });

    it('shows error when password is empty', () => {
      fireEvent.change(screen.getByPlaceholderText(/enter a new numeric password/i), {
        target: { value: '' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm your new password/i), {
        target: { value: '123456' },
      });
      fireEvent.click(screen.getByRole('button', { name: /set password/i }));
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });

    it('shows error when password is less than 6 characters', () => {
      fireEvent.change(screen.getByPlaceholderText(/enter a new numeric password/i), {
        target: { value: '12345' }, // only 5 chars
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm your new password/i), {
        target: { value: '12345' },
      });
      fireEvent.click(screen.getByRole('button', { name: /set password/i }));
      expect(screen.getByText('Password must be at least 6 digits')).toBeInTheDocument();
    });

    it('shows error when passwords do not match', () => {
      fireEvent.change(screen.getByPlaceholderText(/enter a new numeric password/i), {
        target: { value: '123456' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm your new password/i), {
        target: { value: '654321' }, // different
      });
      fireEvent.click(screen.getByRole('button', { name: /set password/i }));
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Step 2: set-password — API Interaction
  // ========================================================================

  describe('set-password step — API', () => {
    beforeEach(() => {
      render(<Recover />);
      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/paste your recovery kit/i), {
        target: { value: 'ABCD-EFGH-1234-5678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));
    });

    it('calls api.recover with sanitized userId, kit, and newPassword', async () => {
      fireEvent.change(screen.getByPlaceholderText(/enter a new numeric password/i), {
        target: { value: '987654' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm your new password/i), {
        target: { value: '987654' },
      });

      // Mock API success response returning a new recovery kit
      api.recover.mockResolvedValueOnce({
        data: {
          data: { recoveryKit: 'NEWK-IT01-AAAA-BBBB' },
        },
      });

      fireEvent.click(screen.getByRole('button', { name: /set password/i }));

      await waitFor(() => {
        expect(api.recover).toHaveBeenCalledWith('12345678', 'ABCD-EFGH-1234-5678', '987654');
      });
    });

    it('shows error message on API failure', async () => {
      fireEvent.change(screen.getByPlaceholderText(/enter a new numeric password/i), {
        target: { value: '987654' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm your new password/i), {
        target: { value: '987654' },
      });

      // Mock API rejection with a server-error structure that includes response.data
      const serverError = new Error('Network error');
      serverError.response = { data: { message: 'Invalid recovery kit' } };
      api.recover.mockRejectedValueOnce(serverError);

      fireEvent.click(screen.getByRole('button', { name: /set password/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid recovery kit/i)).toBeInTheDocument();
      });
    });

    it('shows server error message when API returns 400 response', async () => {
      fireEvent.change(screen.getByPlaceholderText(/enter a new numeric password/i), {
        target: { value: '987654' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm your new password/i), {
        target: { value: '987654' },
      });

      const serverError = new Error('Server error');
      serverError.response = { data: { message: 'Recovery kit has already been used.' } };
      api.recover.mockRejectedValueOnce(serverError);

      fireEvent.click(screen.getByRole('button', { name: /set password/i }));

      await waitFor(() => {
        expect(screen.getByText('Recovery kit has already been used.')).toBeInTheDocument();
      });
    });
  });

  // ========================================================================
  // Step 3: success — Rendering
  // ========================================================================

  describe('success step — rendering', () => {
    it('renders the success card with the new recovery kit', async () => {
      render(<Recover />);

      // Navigate to success step
      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/paste your recovery kit/i), {
        target: { value: 'ABCD-EFGH-1234-5678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));

      fireEvent.change(screen.getByPlaceholderText(/enter a new numeric password/i), {
        target: { value: '987654' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm your new password/i), {
        target: { value: '987654' },
      });

      api.recover.mockResolvedValueOnce({
        data: {
          data: { recoveryKit: 'NEWK-IT01-AAAA-BBBB' },
        },
      });

      fireEvent.click(screen.getByRole('button', { name: /set password/i }));

      await waitFor(() => {
        // Success card has data-testid="success-card"
        expect(screen.getByTestId('success-card')).toBeInTheDocument();
        expect(screen.getByText(/account recovered successfully/i)).toBeInTheDocument();
        expect(screen.getByText('NEWK-IT01-AAAA-BBBB')).toBeInTheDocument();
      });
    });

    it('renders Copy and Download buttons', async () => {
      render(<Recover />);

      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/paste your recovery kit/i), {
        target: { value: 'ABCD-EFGH-1234-5678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));

      fireEvent.change(screen.getByPlaceholderText(/enter a new numeric password/i), {
        target: { value: '987654' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm your new password/i), {
        target: { value: '987654' },
      });

      api.recover.mockResolvedValueOnce({
        data: { data: { recoveryKit: 'NEWK-IT01-AAAA-BBBB' } },
      });

      fireEvent.click(screen.getByRole('button', { name: /set password/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
      });
    });

    it('renders Go to Login button linking to /login', async () => {
      render(<Recover />);

      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/paste your recovery kit/i), {
        target: { value: 'ABCD-EFGH-1234-5678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));

      fireEvent.change(screen.getByPlaceholderText(/enter a new numeric password/i), {
        target: { value: '987654' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm your new password/i), {
        target: { value: '987654' },
      });

      api.recover.mockResolvedValueOnce({
        data: { data: { recoveryKit: 'NEWK-IT01-AAAA-BBBB' } },
      });

      fireEvent.click(screen.getByRole('button', { name: /set password/i }));

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /go to login/i })).toHaveAttribute('href', '/login');
      });
    });

    it('Copy button writes new recovery kit to clipboard', async () => {
      render(<Recover />);

      fireEvent.change(screen.getByPlaceholderText(/e\.g\.,?\s*12345678/i), {
        target: { value: '12345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/paste your recovery kit/i), {
        target: { value: 'ABCD-EFGH-1234-5678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify kit/i }));

      fireEvent.change(screen.getByPlaceholderText(/enter a new numeric password/i), {
        target: { value: '987654' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm your new password/i), {
        target: { value: '987654' },
      });

      api.recover.mockResolvedValueOnce({
        data: { data: { recoveryKit: 'NEWK-IT01-AAAA-BBBB' } },
      });

      fireEvent.click(screen.getByRole('button', { name: /set password/i }));

      await waitFor(() => {
        expect(screen.getByTestId('success-card')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /copy/i }));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('NEWK-IT01-AAAA-BBBB');
      });
    });
  });
});
